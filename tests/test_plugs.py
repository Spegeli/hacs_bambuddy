"""BamBuddy's smart plugs: which ones the entry shows, how often it reads
them, and what a plug that does not answer, or a key that may not read
them, leads to."""
from __future__ import annotations

from datetime import UTC, datetime
import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator
import pytest

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyConnectionError,
    BamBuddyError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import BamBuddyPlugCoordinator, find_device
from custom_components.bambuddy.diagnostics import async_get_config_entry_diagnostics, async_get_device_diagnostics
from custom_components.bambuddy import plug_identity
from custom_components.bambuddy.plugs import Plug

from tests.conftest import (
    A1_MINI,
    H2D,
    TEST_SECRET,
    P1S,
    X1C,
    entity_id,
    load_fixture,
    make_entry,
    next_refresh,
    plug_digest,
    plug_identifier_of,
    plug_unique_id,
    printer_entry,
    printer_serial,
    set_up,
    setup_integration,
    state_at,
)
from tests.test_init import _remove_device


def with_plugs(api: SimpleNamespace) -> None:
    """BamBuddy with the plugs of tests/fixtures/smart_plugs.json."""
    api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")


def plugs_of(hass: HomeAssistant, entry_id: str) -> BamBuddyPlugCoordinator:
    entry = hass.config_entries.async_get_entry(entry_id)
    assert entry is not None
    return entry.runtime_data.plugs


async def test_only_the_plugs_of_printers_set_up_here(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A plug BamBuddy links to no printer, or to one not set up here,
    stays out."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, A1_MINI, P1S, H2D)

    assert sorted(plugs_of(hass, entry.entry_id).data) == [3, 4, 5, 6, 7, 8]


async def test_the_list_once_a_minute_each_status_every_15_seconds(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The list comes from BamBuddy's database; each status is a request to
    the plug itself."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    # A coordinator polls while something listens: the entities, the card.
    entry.async_on_unload(plugs_of(hass, entry.entry_id).async_add_listener(lambda: None))
    assert bambuddy_api.get_smart_plugs.await_count == 1
    assert bambuddy_api.get_plug_status.await_count == 2

    await next_refresh(hass, freezer, 16)
    assert bambuddy_api.get_smart_plugs.await_count == 1
    assert bambuddy_api.get_plug_status.await_count == 4

    await next_refresh(hass, freezer, 46)
    assert bambuddy_api.get_smart_plugs.await_count == 2


async def test_a_refused_plug_list_asks_for_no_new_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy refuses its plug list although the key has every scope: the
    plugs wait, the printers go on, no reauthentication."""
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyPermissionError(403, "API key does not have 'can_read_status' permission")
    entry = await set_up(hass, X1C)

    assert not plugs_of(hass, entry.entry_id).last_update_success
    assert entry.state is ConfigEntryState.LOADED
    assert not hass.config_entries.flow.async_progress_by_handler("bambuddy")


async def test_a_failing_plug_list_leaves_the_printers_alone(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyConnectionError("GET /smart-plugs/: ClientConnectorError")
    entry = await set_up(hass, X1C)

    assert entry.state is ConfigEntryState.LOADED
    assert not plugs_of(hass, entry.entry_id).last_update_success


async def test_a_plug_that_does_not_answer_is_unknown(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Its status unknown; the printer's other plug goes on."""
    with_plugs(bambuddy_api)
    statuses = bambuddy_api.plug_statuses

    async def status(plug_id: int, patient: bool = True) -> dict[str, object]:
        if plug_id == 3:
            raise BamBuddyConnectionError("GET /smart-plugs/3/status: TimeoutError")
        return dict(statuses[str(plug_id)])

    bambuddy_api.get_plug_status.side_effect = status
    entry = await set_up(hass, X1C)
    plugs = plugs_of(hass, entry.entry_id).data

    assert plugs[3].status is None
    assert plugs[4].state is True


async def test_plug_devices_stay_while_listed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A plug BamBuddy still links keeps its device at setup; one it no
    longer has loses it. While the list cannot be read, every plug keeps
    its device."""
    with_plugs(bambuddy_api)
    entry = make_entry(hass, X1C)
    devices = dr.async_get(hass)
    kept = plug_identity.device_identifier(entry.entry_id, plug_identity.identities(TEST_SECRET, [_info(3)], {})[3])
    gone = (DOMAIN, f"{entry.entry_id}_plug_42_0")
    for identifier in (kept, gone):
        devices.async_get_or_create(config_entry_id=entry.entry_id, identifiers={identifier})
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyConnectionError("GET /smart-plugs/: ClientConnectorError")
    await setup_integration(hass, entry)
    assert find_device(hass, entry.entry_id, gone) is not None

    bambuddy_api.get_smart_plugs.side_effect = None
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert find_device(hass, entry.entry_id, kept) is not None
    assert find_device(hass, entry.entry_id, gone) is None


def _info(plug_id: int) -> dict[str, object]:
    return next(dict(plug) for plug in load_fixture("smart_plugs.json") if plug["id"] == plug_id)


async def test_a_plugs_entities_are_named_by_what_it_switches(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entity IDs carry six characters of what the plug switches -- not
    BamBuddy's number, which another server or a new plug may give again."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    digest = plug_digest("tasmota", str(_info(3)["ip_address"]).strip().lower())

    assert entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power")) == f"switch.bambuddy_smart_plug_{digest}"
    assert entity_id(hass, "sensor", plug_unique_id(hass, entry.entry_id, 3, "power")) == f"sensor.bambuddy_smart_plug_{digest}_power"


async def test_a_plugs_device_is_its_bambuddy_record(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The device is BamBuddy's plug: its number and when BamBuddy created it."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    created = int(datetime(2026, 9, 1, 10, tzinfo=UTC).timestamp())

    assert find_device(hass, entry.entry_id, (DOMAIN, f"{entry.entry_id}_plug_3_{created}")) is not None


async def test_two_plugs_on_one_source_get_2(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A power strip feeding two printers, one BamBuddy plug each: the same
    device, so the second plug's IDs end in _2."""
    plugs = load_fixture("smart_plugs.json")
    shared = next(plug for plug in plugs if plug["id"] == 3)["ip_address"]
    bambuddy_api.get_smart_plugs.return_value = [{**plug, "ip_address": shared} if plug["id"] == 8 else plug for plug in plugs]
    entry = await set_up(hass, X1C, A1_MINI)
    digest = plug_digest("tasmota", str(shared).strip().lower())

    assert entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power")) == f"switch.bambuddy_smart_plug_{digest}"
    assert entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 8, "power")) == f"switch.bambuddy_smart_plug_{digest}_2"


async def test_the_lower_number_keeps_the_plain_id(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy lists its plugs by name: plug 8 ("Desk plug") before plug 3.
    The second by number gets the _2, not the second by name."""
    plugs = load_fixture("smart_plugs.json")
    shared = next(plug for plug in plugs if plug["id"] == 3)["ip_address"]
    by_name = sorted(({**plug, "ip_address": shared} if plug["id"] == 8 else plug for plug in plugs), key=lambda plug: str(plug["name"]))
    bambuddy_api.get_smart_plugs.return_value = by_name
    entry = await set_up(hass, X1C, A1_MINI)
    digest = plug_digest("tasmota", str(shared).strip().lower())

    assert entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power")) == f"switch.bambuddy_smart_plug_{digest}"
    assert entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 8, "power")) == f"switch.bambuddy_smart_plug_{digest}_2"


async def test_the_same_plug_in_two_entries(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The same Tasmota in two BamBuddy entries: the same digest, Home
    Assistant's _2 for the second, a device in each."""
    with_plugs(bambuddy_api)
    first = await set_up(hass, X1C)
    second = MockConfigEntry(
        domain=DOMAIN,
        title="BamBuddy (other.local)",
        data={"url": "http://other.local:8000", "api_key": "bb_other_key", "verify_ssl": True},
        options={"printers": [printer_entry(X1C)]},
        unique_id="http://other.local:8000",
        version=2,
        minor_version=2,
    )
    second.add_to_hass(hass)
    await setup_integration(hass, second)
    digest = plug_digest("tasmota", str(_info(3)["ip_address"]).strip().lower())

    assert entity_id(hass, "switch", plug_unique_id(hass, first.entry_id, 3, "power")) == f"switch.bambuddy_smart_plug_{digest}"
    assert entity_id(hass, "switch", plug_unique_id(hass, second.entry_id, 3, "power")) == f"switch.bambuddy_smart_plug_{digest}_2"
    assert plug_identifier_of(hass, first.entry_id, 3) != plug_identifier_of(hass, second.entry_id, 3)
    assert find_device(hass, second.entry_id, plug_identifier_of(hass, second.entry_id, 3)) is not None


@pytest.mark.parametrize(
    ("info", "kind"),
    [
        ({"plug_type": "tasmota"}, "switch"),
        ({"plug_type": "rest"}, "switch"),
        ({"plug_type": "homeassistant", "ha_entity_id": "switch.printer"}, "switch"),
        ({"plug_type": "homeassistant", "ha_entity_id": "script.printer_light"}, "script"),
        ({"plug_type": "mqtt"}, "monitor"),
    ],
)
def test_a_plugs_kind(info: dict[str, str], kind: str) -> None:
    assert Plug({"id": 1, **info}).kind == kind


def test_what_a_plug_reports() -> None:
    """Figures only from a plug that answered; on, off or not known."""
    reachable = Plug({"id": 1}, {"state": "ON", "reachable": True, "energy": {"power": 182.4, "today": None}})
    assert (reachable.state, reachable.figure("power"), reachable.figure("today")) == (True, 182.4, None)
    gone = Plug({"id": 1}, {"state": "ON", "reachable": False, "energy": {"power": 182.4}})
    assert (gone.state, gone.figure("power")) == (None, None)
    # A REST plug without a status URL says nothing of its state.
    assert Plug({"id": 1}, {"state": None, "reachable": True, "energy": None}).state is None


def test_bambuddys_own_auto_off() -> None:
    """Only with BamBuddy's automation enabled, and never for a script."""
    assert Plug({"id": 1, "auto_off": True}).bambuddy_auto_off
    assert not Plug({"id": 1, "auto_off": True, "enabled": False}).bambuddy_auto_off
    assert not Plug({"id": 1, "auto_off": True, "plug_type": "homeassistant", "ha_entity_id": "script.x"}).bambuddy_auto_off


# --- The entities of a plug ---------------------------------------------------


def _entity_id(hass: HomeAssistant, domain: str, entry_id: str, plug_id: int, key: str) -> str | None:
    unique_id = plugs_of(hass, entry_id).entity_unique_id(plug_id, key)
    return er.async_get(hass).async_get_entity_id(domain, DOMAIN, unique_id) if unique_id else None


def _digest(plug_id: int) -> str:
    """The six characters a fixture plug's entity IDs carry."""
    info = _info(plug_id)
    return plug_digest(str(info["plug_type"]), plug_identity.source_candidates(info)[0])


async def test_each_plug_gets_what_it_can_do(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A switch where BamBuddy can switch, a button for a script, a state
    for a plug BamBuddy only watches."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, A1_MINI, P1S, H2D)
    switches = [plug_id for plug_id in (3, 4, 5, 6, 7, 8) if _entity_id(hass, "switch", entry.entry_id, plug_id, "power")]

    assert switches == [3, 4, 5, 8]
    assert _entity_id(hass, "button", entry.entry_id, 6, "run")
    assert _entity_id(hass, "binary_sensor", entry.entry_id, 7, "power")
    assert not _entity_id(hass, "binary_sensor", entry.entry_id, 3, "power")


async def test_power_and_energy_only_where_a_plug_reports_them(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A plug without metering gets no sensor: no "0 W" for nothing."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, A1_MINI, P1S, H2D)
    sensors = {
        key: [plug_id for plug_id in (3, 4, 5, 6, 7, 8) if _entity_id(hass, "sensor", entry.entry_id, plug_id, key)]
        for key in ("power", "energy_today", "energy_total")
    }

    assert sensors == {"power": [3, 4, 7], "energy_today": [3, 7], "energy_total": [3]}
    power = hass.states.get(str(_entity_id(hass, "sensor", entry.entry_id, 3, "power")))
    assert power is not None
    assert (power.state, power.attributes["unit_of_measurement"]) == ("182.4", "W")
    total = hass.states.get(str(_entity_id(hass, "sensor", entry.entry_id, 3, "energy_total")))
    assert total is not None
    assert (total.state, total.attributes["state_class"]) == ("315.8", "total_increasing")


async def test_a_figure_reported_later_gets_its_sensor(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    assert not _entity_id(hass, "sensor", entry.entry_id, 4, "energy_total")

    bambuddy_api.plug_statuses["4"]["energy"]["total"] = 3.2
    await next_refresh(hass, freezer, 16)

    assert _entity_id(hass, "sensor", entry.entry_id, 4, "energy_total")


async def test_a_plugs_device_sits_under_its_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Named after the printer's BamBuddy name, so it sorts under it, and
    "(Smart Plug)": a plug named "Exhaust fan" is a plug. Its
    entity IDs by what it switches, which stays when it is renamed or
    moved to another printer."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, 3))
    printer = next(
        found
        for found in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
        if found.serial_number == printer_serial(X1C)
    )

    assert device is not None
    assert (device.name, device.model, device.via_device_id) == ("Workshop Tasmota – FA3F19 (Smart Plug)", "Tasmota", printer.id)
    # The plug's own switch is named as its device; its power sensor keeps the key.
    assert _entity_id(hass, "switch", entry.entry_id, 3, "power") == f"switch.bambuddy_smart_plug_{_digest(3)}"
    assert _entity_id(hass, "sensor", entry.entry_id, 3, "power") == f"sensor.bambuddy_smart_plug_{_digest(3)}_power"
    assert _entity_id(hass, "sensor", entry.entry_id, 3, "energy_today") == f"sensor.bambuddy_smart_plug_{_digest(3)}_energy_today"


def _ranked(*infos: dict[str, object]) -> int:
    """The id of the plug BamBuddy picks as a printer's own among these."""
    plugs = [Plug({"printer_id": 1, "plug_type": "tasmota", **info}) for info in infos]
    return min(plugs, key=lambda plug: plug.main_rank).id


def test_bambuddys_choice_of_a_printers_own_plug() -> None:
    """BamBuddy's ranking (#2830): one that switches, enabled, shown on the printer card, reporting power,
    then the lowest number -- never the first by name."""
    assert _ranked({"id": 1, "plug_type": "mqtt", "mqtt_topic": "meter"}, {"id": 2, "plug_type": "rest"}) == 2
    assert _ranked({"id": 1, "enabled": False}, {"id": 2}) == 2
    assert _ranked({"id": 1, "show_on_printer_card": False}, {"id": 2}) == 2
    assert _ranked({"id": 1, "plug_type": "rest"}, {"id": 2, "plug_type": "rest", "rest_power_path": "$.power"}) == 2
    assert _ranked({"id": 1, "plug_type": "homeassistant", "ha_entity_id": "switch.x"}, {"id": 2, "plug_type": "homeassistant", "ha_entity_id": "switch.y", "ha_power_entity": "sensor.y"}) == 2
    assert _ranked({"id": 2}, {"id": 1}) == 1


async def test_the_printers_own_plug_is_marked(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Two plugs power the X1C (BamBuddy's default for a new plug): the card is told which is its own."""
    bambuddy_api.get_smart_plugs.return_value = [
        {**plug, "controls_printer_power": True} if plug["id"] == 4 else plug for plug in load_fixture("smart_plugs.json")
    ]
    entry = await set_up(hass, X1C)

    marks = {}
    for plug_id in (3, 4):
        state = hass.states.get(str(_entity_id(hass, "switch", entry.entry_id, plug_id, "power")))
        assert state is not None
        marks[plug_id] = state.attributes["printer_main"]
    assert marks == {3: True, 4: False}


async def test_a_script_powers_no_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy marks every new plug "powers the printer", a script too (plug 6, the H2D's): a script only
    runs -- the card must not take it for the printer's plug, with any key."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, H2D)
    run = hass.states.get(str(_entity_id(hass, "button", entry.entry_id, 6, "run")))
    assert run is not None
    assert run.attributes["powers_printer"] is False


async def test_a_plugs_device_model_follows_its_type(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Changed in BamBuddy from Tasmota to a REST bridge: still a switch (no reload), and its device says so."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = [
        {**plug, "plug_type": "rest"} if plug["id"] == 3 else plug for plug in load_fixture("smart_plugs.json")
    ]
    await next_refresh(hass, freezer, 61)

    device = find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, 3))
    assert device is not None
    assert device.model == "REST"


async def test_a_plug_is_switched_and_read_again(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Off is never refused (the plug is an emergency stop);
    the plug and its printer -- now offline in BamBuddy -- are read again."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    entity_id = str(_entity_id(hass, "switch", entry.entry_id, 3, "power"))
    statuses, printer_reads = bambuddy_api.get_plug_status.await_count, bambuddy_api.get_status.await_count

    await hass.services.async_call("switch", "turn_off", {"entity_id": entity_id}, blocking=True)
    bambuddy_api.control_plug.assert_awaited_once_with(3, False)
    await next_refresh(hass, freezer, 3)

    assert bambuddy_api.get_plug_status.await_count > statuses
    assert bambuddy_api.get_status.await_count > printer_reads


async def test_a_switched_plug_shows_its_new_state_at_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy marks the printer offline the moment its plug goes off: the
    plug's state follows at once, not with the read two seconds later --
    else the card shows a printer starting, or offline with power."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    entity_id = str(_entity_id(hass, "switch", entry.entry_id, 3, "power"))

    await hass.services.async_call("switch", "turn_off", {"entity_id": entity_id}, blocking=True)
    off = hass.states.get(entity_id)
    assert off is not None and (off.state, off.attributes["on_since"]) == ("off", None)
    assert state_at(hass, str(_entity_id(hass, "sensor", entry.entry_id, 3, "power"))).state == "0.0"

    await hass.services.async_call("switch", "turn_on", {"entity_id": entity_id}, blocking=True)
    on = hass.states.get(entity_id)
    assert on is not None and on.state == "on" and on.attributes["on_since"] is not None

    # The read after it tells what the plug says.
    bambuddy_api.plug_statuses["3"]["state"] = "OFF"
    await next_refresh(hass, freezer, 3)
    assert state_at(hass, entity_id).state == "off"


async def test_an_unreachable_plug_keeps_what_it_is(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Unavailable, an entity loses its attributes -- but not what the plug
    is: the card keeps it in its place, a hidden one hidden."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, A1_MINI)
    gone = hass.states.get(str(_entity_id(hass, "switch", entry.entry_id, 8, "power")))

    assert gone is not None and gone.state == "unavailable"
    assert {key: gone.attributes.get(key) for key in ("powers_printer", "on_printer_card", "bambuddy_auto_off", "plug_type")} == {
        "powers_printer": True,
        "on_printer_card": True,
        "bambuddy_auto_off": False,
        "plug_type": "tasmota",
    }
    # Not "assumed": it is not there at all.
    assert "assumed_state" not in gone.attributes


async def test_a_script_runs(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, H2D)

    await hass.services.async_call(
        "button", "press", {"entity_id": str(_entity_id(hass, "button", entry.entry_id, 6, "run"))}, blocking=True
    )

    bambuddy_api.control_plug.assert_awaited_once_with(6, True)


async def test_a_plug_that_does_not_answer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Unavailable while BamBuddy cannot reach it; a switch it cannot pass
    on says so."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, A1_MINI)
    gone = hass.states.get(str(_entity_id(hass, "switch", entry.entry_id, 8, "power")))
    assert gone is not None and gone.state == "unavailable"

    bambuddy_api.control_plug.side_effect = BamBuddyApiError(503, "Failed to communicate with device")
    with pytest.raises(HomeAssistantError) as caught:
        await hass.services.async_call(
            "switch", "turn_on", {"entity_id": str(_entity_id(hass, "switch", entry.entry_id, 3, "power"))}, blocking=True
        )
    assert caught.value.translation_key == "plug_not_answering"


async def test_an_unknown_state_is_assumed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A REST plug without a status URL: on and off both offered."""
    with_plugs(bambuddy_api)
    bambuddy_api.plug_statuses["4"]["state"] = None
    entry = await set_up(hass, X1C)
    state = hass.states.get(str(_entity_id(hass, "switch", entry.entry_id, 4, "power")))

    assert state is not None
    assert (state.state, state.attributes.get("assumed_state")) == ("unknown", True)


async def test_what_the_card_reads_of_a_plug(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, P1S)
    printer = hass.states.get(str(_entity_id(hass, "switch", entry.entry_id, 3, "power")))
    accessory = hass.states.get(str(_entity_id(hass, "switch", entry.entry_id, 4, "power")))
    garage = hass.states.get(str(_entity_id(hass, "switch", entry.entry_id, 5, "power")))
    assert printer is not None and accessory is not None and garage is not None

    assert {key: printer.attributes[key] for key in ("powers_printer", "on_printer_card", "bambuddy_auto_off", "plug_type")} == {
        "powers_printer": True,
        "on_printer_card": True,
        "bambuddy_auto_off": False,
        "plug_type": "tasmota",
    }
    assert accessory.attributes["powers_printer"] is False
    assert garage.attributes["bambuddy_auto_off"] is True


# --- Diagnostics, a key that may not switch, deleting a plug's device -----------


async def test_no_plug_secret_reaches_the_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's plug list carries a Tasmota login, REST URLs and headers
    with tokens, addresses and Home Assistant entity IDs in plain text."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, P1S)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)
    dumped = json.dumps(diagnostics)

    for secret in ("tasmota-secret", "rest-secret", "rest-header-secret", "192.168.1.50", "192.168.1.60", "switch.garage_printer"):
        assert secret not in dumped, secret
    plug = diagnostics["plugs"]["3"]
    assert (plug["info"]["plug_type"], plug["info"]["printer_id"], plug["status"]["energy"]["power"]) == ("tasmota", 1, 182.4)
    assert plug["auto_off"] == {"armed": False, "every_print": False, "threshold": 50.0, "phase": "idle", "waiting_for": None}


async def test_a_plugs_device_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, 4))
    assert device is not None

    diagnostics = await async_get_device_diagnostics(hass, entry, device)

    assert diagnostics["info"]["name"] == "Shelly – Abluftfilter"
    assert "rest-secret" not in json.dumps(diagnostics)


async def test_a_key_that_may_no_longer_read_plugs_deletes_none(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A refused list is no empty one -- the devices stay."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    kept = plug_identifier_of(hass, entry.entry_id, 3)
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyPermissionError(403, "API key owner does not have 'smart_plugs:read' permission")

    await next_refresh(hass, freezer, 61)
    await hass.async_block_till_done()

    assert find_device(hass, entry.entry_id, kept) is not None


async def test_a_plugs_device_cannot_be_deleted_while_bambuddy_links_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """It would come back with the next read of the list."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, 3))
    assert device is not None

    response = await _remove_device(hass, hass_ws_client, entry, device)
    assert not response["success"]
    assert "still links" in response["error"]["message"]


@pytest.mark.parametrize("change", ["deleted", "unlinked"])
async def test_a_plug_bambuddy_deletes_or_unlinks_goes_within_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, change: str
) -> None:
    """A plug deleted in BamBuddy keeps nothing here -- as one no
    longer linked to a printer set up here: its device and entities go."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    gone = plug_identifier_of(hass, entry.entry_id, 3)
    switch = plug_unique_id(hass, entry.entry_id, 3, "power")
    assert find_device(hass, entry.entry_id, gone) is not None

    listed = load_fixture("smart_plugs.json")
    bambuddy_api.get_smart_plugs.return_value = (
        [plug for plug in listed if plug["id"] != 3]
        if change == "deleted"
        else [{**plug, "printer_id": None} if plug["id"] == 3 else plug for plug in listed]
    )
    await next_refresh(hass, freezer, 61)
    await hass.async_block_till_done()

    assert find_device(hass, entry.entry_id, gone) is None
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, switch) is None
    # The printer's other plug stays.
    assert find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, 4)) is not None


def _timed_out() -> BamBuddyConnectionError:
    err = BamBuddyConnectionError("POST /smart-plugs/3/control: TimeoutError")
    err.__cause__ = TimeoutError()
    return err


@pytest.mark.parametrize(
    ("failure", "key"),
    [
        # The key has every scope (the check says so): BamBuddy's own refusal.
        (BamBuddyPermissionError(403, "API key owner does not have 'smart_plugs:control' permission"), "bambuddy_refused"),
        (BamBuddyConnectionError("POST /smart-plugs/3/control: ClientConnectorError"), "cannot_connect"),
        (_timed_out(), "no_answer"),
        (BamBuddyApiError(400, "MQTT plugs are monitor-only."), "plug_command_failed"),
    ],
)
async def test_why_a_plug_did_not_switch(hass: HomeAssistant, bambuddy_api: SimpleNamespace, failure: BamBuddyError, key: str) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.control_plug.side_effect = failure

    with pytest.raises(HomeAssistantError) as caught:
        await hass.services.async_call(
            "switch", "turn_off", {"entity_id": str(_entity_id(hass, "switch", entry.entry_id, 3, "power"))}, blocking=True
        )

    assert caught.value.translation_key == key


async def test_home_assistants_start_waits_little_for_a_plug(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy asks each plug itself: at the start 5 s each, later 30."""
    with_plugs(bambuddy_api)
    await set_up(hass, X1C)
    assert {call.kwargs["patient"] for call in bambuddy_api.get_plug_status.await_args_list} == {False}

    await next_refresh(hass, freezer, 16)
    assert bambuddy_api.get_plug_status.await_args_list[-1].kwargs["patient"] is True


async def test_a_plug_switched_on_says_since_when(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Off to on, as the integration saw it: the card counts the start."""
    with_plugs(bambuddy_api)
    bambuddy_api.plug_statuses["3"]["state"] = "OFF"
    entry = await set_up(hass, X1C)
    entity_id = str(_entity_id(hass, "switch", entry.entry_id, 3, "power"))
    assert state_at(hass, entity_id).attributes["on_since"] is None

    bambuddy_api.plug_statuses["3"]["state"] = "ON"
    await next_refresh(hass, freezer, 16)

    assert state_at(hass, entity_id).attributes["on_since"] is not None


async def test_a_plug_moved_to_another_printer_reloads_the_entry(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its device, its card and its switch-off after the print follow."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, H2D)
    listed = bambuddy_api.get_printers.await_count

    bambuddy_api.get_smart_plugs.return_value = [
        {**plug, "printer_id": H2D} if plug["id"] == 3 else plug for plug in load_fixture("smart_plugs.json")
    ]
    await next_refresh(hass, freezer, 61)
    await hass.async_block_till_done()

    assert bambuddy_api.get_printers.await_count > listed
    device = find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, 3))
    printer = find_device(hass, entry.entry_id, ("bambuddy", f"{entry.entry_id}_printer_{printer_serial(H2D)}"))
    assert device is not None and printer is not None and device.via_device_id == printer.id
    assert device.name == f"{printer.name.split(' (')[0]} Tasmota – FA3F19 (Smart Plug)"  # type: ignore[union-attr]
    # Its entity IDs say nothing of the printer: they stay right.
    assert _entity_id(hass, "switch", entry.entry_id, 3, "power") == f"switch.bambuddy_smart_plug_{_digest(3)}"


async def test_the_diagnostics_show_only_known_plug_fields(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A field a later BamBuddy adds -- a login, a key -- is redacted too."""
    bambuddy_api.get_smart_plugs.return_value = [
        {**plug, "auth_key": "later-secret"} for plug in load_fixture("smart_plugs.json")
    ]
    entry = await set_up(hass, X1C)

    dumped = json.dumps(await async_get_config_entry_diagnostics(hass, entry))

    assert "later-secret" not in dumped


async def test_a_plugs_diagnostics_show_its_identity_only(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """How the plug is known -- never what it switches, its key or the secret."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    identity = plugs_of(hass, entry.entry_id).identity(3)
    assert identity is not None

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)
    dumped = json.dumps(diagnostics)

    plug = diagnostics["plugs"]["3"]
    assert plug["info"]["created_at"] == "2026-09-01T10:00:00"
    assert plug["identity"] == {"digest": identity.digest, "record_known": True, "known_by": "source", "rank": 0}
    # A REST plug is known by its BamBuddy record: by design, not for a failure.
    assert diagnostics["plugs"]["4"]["identity"]["known_by"] == "record"
    assert str(_info(3)["ip_address"]) not in dumped
    assert identity.key[:16] not in dumped
    assert TEST_SECRET.hex() not in dumped


def test_an_accessory_is_never_the_printers_own_plug() -> None:
    """Only a plug that powers the printer can be its own: an accessory
    that switches does not outrank a meter that powers it."""
    meter = Plug({"id": 2, "printer_id": 1, "plug_type": "mqtt", "mqtt_topic": "meter", "controls_printer_power": True})
    fan = Plug({"id": 1, "printer_id": 1, "plug_type": "tasmota", "controls_printer_power": False})
    plugs = SimpleNamespace(data={1: fan, 2: meter})
    assert BamBuddyPlugCoordinator.main_plug(plugs, 1) == 2  # type: ignore[arg-type]


def test_an_mqtt_plug_on_its_own_topic_reports_power() -> None:
    """BamBuddy's `_reports_power`: for an MQTT plug its own topic counts."""
    assert Plug({"id": 1, "plug_type": "mqtt", "mqtt_topic": "meter"}).reports_power is True


async def test_the_plug_list_is_read_within_a_minute(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """A plug's status read may take a few seconds (an unreachable plug: 5),
    so the reads come a little more than 15 seconds apart: the list is read
    again at the third of them, not at the fourth -- an unlinked plug goes
    within a minute, as the texts say."""
    with_plugs(bambuddy_api)
    await set_up(hass, X1C)
    reads = bambuddy_api.get_smart_plugs.await_count

    for _ in range(3):
        await next_refresh(hass, freezer, 19)

    assert bambuddy_api.get_smart_plugs.await_count == reads + 1


async def test_a_watched_plugs_state_is_named_as_its_device(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """An MQTT plug BamBuddy only watches has a binary sensor in place of the
    switch: named as its device too, without the key."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, H2D)

    assert _entity_id(hass, "binary_sensor", entry.entry_id, 7, "power") == f"binary_sensor.bambuddy_smart_plug_{_digest(7)}"


# --- Following BamBuddy: what a plug switches, and its record ------------------


def _listed(**changes: dict[str, Any]) -> list[dict[str, Any]]:
    """BamBuddy's plug list, some plugs changed (by number as text)."""
    return [{**plug, **changes.get(str(plug["id"]), {})} for plug in load_fixture("smart_plugs.json")]


async def _reloads_after_a_minute(hass: HomeAssistant, freezer: FrozenDateTimeFactory, minutes: int = 1) -> int:
    """How often the entry was asked to reload while the plug list was read again."""
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(minutes):
            await next_refresh(hass, freezer, 61)
            await hass.async_block_till_done()
    return reload.call_count


async def test_a_source_change_reloads(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Another Tasmota for plug 3 in BamBuddy: another device to switch."""
    with_plugs(bambuddy_api)
    await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": "192.0.2.199"}})

    assert await _reloads_after_a_minute(hass, freezer) == 1


async def test_a_swap_reloads_once(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    with_plugs(bambuddy_api)
    await set_up(hass, X1C, A1_MINI)
    three, eight = _info(3)["ip_address"], _info(8)["ip_address"]
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": eight}, "8": {"ip_address": three}})

    assert await _reloads_after_a_minute(hass, freezer) == 1


async def test_a_plug_created_again_with_its_number_reloads(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Deleted and created again in BamBuddy, which gave it the same number."""
    with_plugs(bambuddy_api)
    await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"created_at": "2026-10-20T09:00:00"}})

    assert await _reloads_after_a_minute(hass, freezer) == 1


async def test_a_rename_reloads_nothing(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"name": "Renamed"}})

    assert await _reloads_after_a_minute(hass, freezer) == 0
    device = find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, 3))
    assert device is not None and device.name is not None and device.name.endswith(" Renamed (Smart Plug)")


async def test_an_answer_without_created_at_reloads_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A BamBuddy that no longer sends when it created a plug changes no plug."""
    with_plugs(bambuddy_api)
    await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = [
        {key: value for key, value in plug.items() if key != "created_at"} for plug in load_fixture("smart_plugs.json")
    ]

    assert await _reloads_after_a_minute(hass, freezer) == 0


async def test_rest_urls_hidden_change_nothing(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """BamBuddy 1.3.0 hides a REST plug's URLs from API keys: the plug stays."""
    with_plugs(bambuddy_api)
    await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"4": {"rest_on_url": None, "rest_off_url": None}})

    assert await _reloads_after_a_minute(hass, freezer) == 0


async def test_a_lower_plug_linked_later_takes_rank_0(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """Plug 3 linked to the printer later, on the Tasmota plug 8 already
    switches: the lower number comes first -- one reload, no unique ID
    twice, and plug 8's IDs end in _2 from then on."""
    shared = _info(8)["ip_address"]
    plug_3 = {"ip_address": shared, "controls_printer_power": False}
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"8": {"printer_id": X1C}, "3": {**plug_3, "printer_id": None}})
    entry = await set_up(hass, X1C)
    digest = plug_digest("tasmota", str(shared).strip().lower())
    assert _entity_id(hass, "switch", entry.entry_id, 8, "power") == f"switch.bambuddy_smart_plug_{digest}"

    bambuddy_api.get_smart_plugs.return_value = _listed(**{"8": {"printer_id": X1C}, "3": {**plug_3, "printer_id": X1C}})
    with patch.object(hass.config_entries, "async_schedule_reload", wraps=hass.config_entries.async_schedule_reload) as reload:
        await next_refresh(hass, freezer, 61)
        await hass.async_block_till_done()

    assert reload.call_count == 1
    assert "does not generate unique IDs" not in caplog.text
    assert _entity_id(hass, "switch", entry.entry_id, 3, "power") == f"switch.bambuddy_smart_plug_{digest}"
    assert _entity_id(hass, "switch", entry.entry_id, 8, "power") == f"switch.bambuddy_smart_plug_{digest}_2"


async def test_a_read_that_reloads_adds_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """Until the reload comes, no plug gets new entities: the new plug's
    would take a unique ID another still holds."""
    shared = _info(8)["ip_address"]
    plug_3 = {"ip_address": shared, "controls_printer_power": False}
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"8": {"printer_id": X1C}, "3": {**plug_3, "printer_id": None}})
    entry = await set_up(hass, X1C)

    bambuddy_api.get_smart_plugs.return_value = _listed(**{"8": {"printer_id": X1C}, "3": {**plug_3, "printer_id": X1C}})
    assert await _reloads_after_a_minute(hass, freezer) == 1

    assert "does not generate unique IDs" not in caplog.text


def _new_plug(api: SimpleNamespace, **changes: Any) -> dict[str, Any]:
    """A plug BamBuddy links to the X1C later: an accessory on its own Tasmota."""
    api.plug_statuses["11"] = json.loads(json.dumps(api.plug_statuses["3"]))
    return {**_info(3), "id": 11, "name": "Later", "ip_address": "192.0.2.111", "controls_printer_power": False, **changes}


async def test_a_new_plug_is_added_without_a_reload(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = [*load_fixture("smart_plugs.json"), _new_plug(bambuddy_api)]

    assert await _reloads_after_a_minute(hass, freezer) == 0
    assert _entity_id(hass, "switch", entry.entry_id, 11, "power") is not None


async def test_a_plug_added_later_reloads_when_it_changes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    with_plugs(bambuddy_api)
    await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = [*load_fixture("smart_plugs.json"), _new_plug(bambuddy_api)]
    assert await _reloads_after_a_minute(hass, freezer) == 0

    bambuddy_api.get_smart_plugs.return_value = [*load_fixture("smart_plugs.json"), _new_plug(bambuddy_api, ip_address="192.0.2.112")]
    assert await _reloads_after_a_minute(hass, freezer) == 1


async def test_a_setup_without_the_list_reloads_once_it_is_read(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Nothing was built from a list the setup could not read: the first one
    that comes reloads the entry, which builds then."""
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyConnectionError("GET /smart-plugs/: ClientConnectorError")
    await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.side_effect = None
    with_plugs(bambuddy_api)

    assert await _reloads_after_a_minute(hass, freezer, 2) == 1
