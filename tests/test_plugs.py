"""BamBuddy's smart plugs: which ones the entry shows, how often it reads
them, and what a plug that does not answer, or a key that may not read
them, leads to."""
from __future__ import annotations

import json
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
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
from custom_components.bambuddy.plugs import Plug, plug_identifier

from tests.conftest import A1_MINI, H2D, P1S, X1C, load_fixture, make_entry, next_refresh, printer_serial, set_up, setup_integration, state_at
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


async def test_a_key_that_may_not_read_plugs_sees_none(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """No plugs, and no reauthentication: the key reads the printers."""
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyPermissionError(403, "API key does not have 'can_read_status' permission")
    entry = await set_up(hass, X1C)

    assert plugs_of(hass, entry.entry_id).data == {}
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


async def test_the_key_may_switch_plugs(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    assert entry.runtime_data.can_control_plugs

    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert not entry.runtime_data.can_control_plugs


async def test_plug_devices_stay_while_listed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A plug BamBuddy still links keeps its device at setup; one it no
    longer has loses it. While the list cannot be read, every plug keeps
    its device."""
    with_plugs(bambuddy_api)
    entry = make_entry(hass, X1C)
    devices = dr.async_get(hass)
    for plug_id in (3, 42):
        devices.async_get_or_create(config_entry_id=entry.entry_id, identifiers={plug_identifier(entry.entry_id, plug_id)})
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyConnectionError("GET /smart-plugs/: ClientConnectorError")
    await setup_integration(hass, entry)
    assert find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 42)) is not None

    bambuddy_api.get_smart_plugs.side_effect = None
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3)) is not None
    assert find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 42)) is None


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
    return er.async_get(hass).async_get_entity_id(domain, DOMAIN, f"{entry_id}_plug{plug_id}_{key}")


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
    entity IDs by BamBuddy's number of the plug, which stays when it is
    renamed or moved to another printer."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3))
    printer = next(
        found
        for found in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
        if found.serial_number == printer_serial(X1C)
    )

    assert device is not None
    assert (device.name, device.model, device.via_device_id) == ("Workshop Tasmota – FA3F19 (Smart Plug)", "Tasmota", printer.id)
    # The plug's own switch is named as its device; its power sensor keeps the key.
    assert _entity_id(hass, "switch", entry.entry_id, 3, "power") == "switch.bambuddy_smart_plug_3"
    assert _entity_id(hass, "sensor", entry.entry_id, 3, "power") == "sensor.bambuddy_smart_plug_3_power"
    assert _entity_id(hass, "sensor", entry.entry_id, 3, "energy_today") == "sensor.bambuddy_smart_plug_3_energy_today"


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


async def test_a_scripts_state_for_a_read_only_key_powers_no_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = await set_up(hass, H2D)
    state = hass.states.get(str(_entity_id(hass, "binary_sensor", entry.entry_id, 6, "power")))
    assert state is not None
    assert state.attributes["powers_printer"] is False


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

    device = find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3))
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


async def test_a_key_that_may_not_switch_plugs_sees_their_state(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = await set_up(hass, X1C, H2D)

    assert not _entity_id(hass, "switch", entry.entry_id, 3, "power")
    assert not _entity_id(hass, "button", entry.entry_id, 6, "run")
    on = hass.states.get(str(_entity_id(hass, "binary_sensor", entry.entry_id, 3, "power")))
    assert on is not None and on.state == "on"


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
    assert diagnostics["bambuddy"]["can_control_plugs"] is True


async def test_a_plugs_device_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 4))
    assert device is not None

    diagnostics = await async_get_device_diagnostics(hass, entry, device)

    assert diagnostics["info"]["name"] == "Shelly – Abluftfilter"
    assert "rest-secret" not in json.dumps(diagnostics)


async def test_a_key_that_may_no_longer_switch_plugs_loses_their_controls(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """They would stay as entities no longer provided; the state comes as a
    binary sensor instead."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    assert _entity_id(hass, "switch", entry.entry_id, 3, "auto_off")

    bambuddy_api.get_auth_me.return_value = {
        **load_fixture("auth_me_control.json"),
        "permissions": [p for p in load_fixture("auth_me_control.json")["permissions"] if p != "smart_plugs:control"],
    }
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    for domain, key in (("switch", "power"), ("switch", "auto_off"), ("switch", "auto_off_every_print"), ("number", "auto_off_temperature"), ("button", "auto_off_skip")):
        assert not _entity_id(hass, domain, entry.entry_id, 3, key), (domain, key)
    assert _entity_id(hass, "binary_sensor", entry.entry_id, 3, "power")
    # The printer's own controls stay: the key still controls printers.
    assert er.async_get(hass).async_get_entity_id("button", DOMAIN, f"{entry.entry_id}_p{printer_serial(X1C)}_pause")


async def test_a_key_that_may_no_longer_read_plugs_deletes_none(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A refused list is no empty one -- the devices stay."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyPermissionError(403, "API key owner does not have 'smart_plugs:read' permission")

    await next_refresh(hass, freezer, 61)
    await hass.async_block_till_done()

    assert find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3)) is not None


async def test_a_plugs_device_cannot_be_deleted_while_bambuddy_links_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """It would come back with the next read of the list."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3))
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
    assert find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3)) is not None

    listed = load_fixture("smart_plugs.json")
    bambuddy_api.get_smart_plugs.return_value = (
        [plug for plug in listed if plug["id"] != 3]
        if change == "deleted"
        else [{**plug, "printer_id": None} if plug["id"] == 3 else plug for plug in listed]
    )
    await next_refresh(hass, freezer, 61)
    await hass.async_block_till_done()

    assert find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3)) is None
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, f"{entry.entry_id}_plug3_power") is None
    # The printer's other plug stays.
    assert find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 4)) is not None


def _timed_out() -> BamBuddyConnectionError:
    err = BamBuddyConnectionError("POST /smart-plugs/3/control: TimeoutError")
    err.__cause__ = TimeoutError()
    return err


@pytest.mark.parametrize(
    ("failure", "key"),
    [
        (BamBuddyPermissionError(403, "API key owner does not have 'smart_plugs:control' permission"), "plug_control_not_permitted"),
        (BamBuddyAuthError(401, "Authentication required"), "auth_failed"),
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
    device = find_device(hass, entry.entry_id, plug_identifier(entry.entry_id, 3))
    printer = find_device(hass, entry.entry_id, ("bambuddy", f"{entry.entry_id}_printer_{printer_serial(H2D)}"))
    assert device is not None and printer is not None and device.via_device_id == printer.id
    assert device.name == f"{printer.name.split(' (')[0]} Tasmota – FA3F19 (Smart Plug)"  # type: ignore[union-attr]
    # Its entity IDs say nothing of the printer: they stay right.
    assert _entity_id(hass, "switch", entry.entry_id, 3, "power") == "switch.bambuddy_smart_plug_3"


async def test_a_key_that_may_switch_again_drops_the_states(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """They would stay as entities no longer provided; an MQTT plug's stays --
    never removed and created again, which on 2025.x loses its name, area
    and hidden state."""
    with_plugs(bambuddy_api)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = await set_up(hass, X1C, H2D)
    assert _entity_id(hass, "binary_sensor", entry.entry_id, 3, "power")
    mqtt = _entity_id(hass, "binary_sensor", entry.entry_id, 7, "power")
    removed: list[str] = []
    hass.bus.async_listen(
        er.EVENT_ENTITY_REGISTRY_UPDATED,
        lambda event: removed.append(event.data["entity_id"]) if event.data["action"] == "remove" else None,
    )

    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert not _entity_id(hass, "binary_sensor", entry.entry_id, 3, "power")
    assert _entity_id(hass, "switch", entry.entry_id, 3, "power")
    assert _entity_id(hass, "binary_sensor", entry.entry_id, 7, "power") == mqtt
    assert mqtt not in removed


async def test_the_diagnostics_show_only_known_plug_fields(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A field a later BamBuddy adds -- a login, a key -- is redacted too."""
    bambuddy_api.get_smart_plugs.return_value = [
        {**plug, "auth_key": "later-secret"} for plug in load_fixture("smart_plugs.json")
    ]
    entry = await set_up(hass, X1C)

    dumped = json.dumps(await async_get_config_entry_diagnostics(hass, entry))

    assert "later-secret" not in dumped


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

    assert _entity_id(hass, "binary_sensor", entry.entry_id, 7, "power") == "binary_sensor.bambuddy_smart_plug_7"
