"""A printer's model as BamBuddy reports it: found later, corrected, and
the parts it reports after the setup (chamber, fan kit)."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from custom_components.bambuddy.api import (
    BamBuddyConnectionError,
)
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    A1_MINI,
    H2D,
    X1C,
    ams_uid,
    as_model,
    load_fixture,
    make_entry,
    next_refresh,
    no_entity,
    past_polls,
    past_the_minute,
    printer_device,
    printer_entry,
    printer_info,
    printer_name,
    printer_serial,
    printer_uid,
    set_up,
    setup_integration,
    state_of,
)
from tests.helpers import details_are, devices_by_identifier, entity_ids, listed_with, reload_entry


# What an X1C has and a printer without a model lacks: its detections, fans and SD card.
_WITH_THE_MODEL = (("switch", "ai_monitoring"), ("fan", "aux_fan"), ("fan", "chamber_fan"), ("binary_sensor", "sdcard"))
# What an X1C has and an A1 lacks.
_X1C_ONLY = (("binary_sensor", "door"), ("fan", "aux_fan"), ("fan", "chamber_fan"))


async def test_a_model_bambuddy_detects_later(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Added in BamBuddy by hand without a model, a printer has none until
    someone enters it there: asked again once a minute. Once BamBuddy has
    it, the entry reloads -- the name, the device and the model's entities
    follow. Until then only what every printer has: no fans or SD card an
    A1 might lack."""
    printers = load_fixture("printers.json")
    x1c = next(printer for printer in printers if printer["id"] == X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    details_are(bambuddy_api, {**x1c, "model": None})
    entry = await set_up(hass, X1C)
    registry = er.async_get(hass)
    device = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    assert (device.name, device.model) == ("Workshop (00M00A000000001)", None)
    # The X1 series' detections, its auxiliary and chamber fans and SD card come with the model.
    for domain, key in _WITH_THE_MODEL:
        assert no_entity(hass, domain, printer_uid(entry, key)), key

    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.get_printer.return_value = x1c
    await past_the_minute(hass, freezer)
    await hass.async_block_till_done()

    device = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    assert (device.name, device.model) == (printer_name(X1C), "X1C")
    for domain, key in _WITH_THE_MODEL:
        assert registry.async_get_entity_id(domain, DOMAIN, printer_uid(entry, key)) is not None, key
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_bambuddys_details_are_read_once_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """With the runtime counter, not at setup -- it has just read the list --
    and not on every refresh: the address may change, and the number must
    still be this printer's. A known model does not reload anything."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_printer.assert_not_awaited()
    x1c = printer_info(X1C)
    details_are(bambuddy_api, {**x1c, "ip_address": "192.168.1.77"})

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await past_polls(hass, freezer, 12)

    assert bambuddy_api.get_printer.await_count == bambuddy_api.get_runtime.await_count - 1 >= 2
    reload.assert_not_called()
    assert state_of(hass, "sensor", printer_uid(entry, "ip_address")).state == "192.168.1.77"


async def test_another_printer_under_the_number_is_not_this_one(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """SQLite gives a new printer the number of a deleted newest one, and a
    restored database numbers anew: BamBuddy's printer 1 is now the A1 Mini.
    The X1C's entities neither show it nor send it a command; the entry
    reloads, and finds the X1C again by its serial, or reports it missing."""
    entry = await set_up(hass, X1C)
    a1_mini = printer_info(A1_MINI)
    details_are(bambuddy_api, {**a1_mini, "id": X1C})
    bambuddy_api.statuses[X1C] = load_fixture("status_a1mini.json")

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await past_the_minute(hass, freezer)
        # Nothing reaches the other printer before the reload.
        device = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
        with pytest.raises(ServiceValidationError, match="another printer"):
            await hass.services.async_call(DOMAIN, "home_axes", {"device_id": device.id}, blocking=True)
        await past_polls(hass, freezer, 3)

    reload.assert_called_once_with(entry.entry_id)
    bambuddy_api.home_axes.assert_not_awaited()
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == STATE_UNAVAILABLE
    device = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    assert device.name == printer_name(X1C)


async def test_a_printer_bambuddy_had_not_reached_yet_completes_itself(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy restarted while the H2D was off, then Home Assistant set the
    entry up: BamBuddy had nothing but its defaults for it -- no chamber, no
    AMS backup. Once the printer reports, the entry reloads once and the
    printer gets what it has."""
    never = load_fixture("status_never.json")
    never["id"] = H2D
    bambuddy_api.statuses[H2D] = never
    entry = await set_up(hass, H2D)
    registry = er.async_get(hass)
    keys = (("sensor", "chamber_temp"), ("number", "chamber_target"), ("switch", "ams_filament_backup"))
    assert all(no_entity(hass, domain, printer_uid(entry, key, H2D)) for domain, key in keys)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await past_polls(hass, freezer, 3)
        reload.assert_not_called()
        bambuddy_api.statuses[H2D] = load_fixture("status_h2d.json")
        await past_polls(hass, freezer, 3)
    reload.assert_called_once_with(entry.entry_id)

    await reload_entry(hass, entry.entry_id)
    assert all(registry.async_get_entity_id(domain, DOMAIN, printer_uid(entry, key, H2D)) for domain, key in keys)


async def test_asking_for_the_model_may_fail(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy refuses the question: the printer goes on without a model and
    is asked again a minute later."""
    x1c = printer_info(X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    bambuddy_api.get_printer.side_effect = BamBuddyConnectionError("refused")
    entry = await set_up(hass, X1C)

    await past_polls(hass, freezer, 12)

    assert entry.state is ConfigEntryState.LOADED
    assert devices_by_identifier(hass, entry)[printer_device(entry, X1C)].model is None
    # Once a minute, with the runtime counter -- not at setup, which has just
    # read the list, and not on every refresh.
    assert bambuddy_api.get_printer.await_count == bambuddy_api.get_runtime.await_count - 1 >= 2


async def test_a_model_found_reloads_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The model is kept at once: until the reload runs, the next minute's
    answer reloads nothing again."""
    x1c = printer_info(X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    details_are(bambuddy_api, x1c)
    entry = make_entry(hass, X1C)
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)
        await past_polls(hass, freezer, 12)

    reload.assert_called_once_with(entry.entry_id)
    assert bambuddy_api.get_printer.await_count == 2


async def test_two_printers_get_their_models(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    printers = load_fixture("printers.json")
    chosen = [printer for printer in printers if printer["id"] in (X1C, A1_MINI)]
    bambuddy_api.get_printers.return_value = [{**printer, "model": None} for printer in chosen]
    bambuddy_api.get_printer.side_effect = lambda printer_id: {
        **next(p for p in chosen if p["id"] == printer_id), "model": None
    }
    entry = await set_up(hass, X1C, A1_MINI)

    bambuddy_api.get_printers.return_value = chosen
    bambuddy_api.get_printer.side_effect = lambda printer_id: next(p for p in chosen if p["id"] == printer_id)
    await past_the_minute(hass, freezer)
    await hass.async_block_till_done()

    devices = devices_by_identifier(hass, entry)
    assert entry.state is ConfigEntryState.LOADED
    assert (devices[printer_device(entry, X1C)].model, devices[printer_device(entry, A1_MINI)].model) == ("X1C", "A1 Mini")
    # Both models in the same minute: one reload, not one per printer.
    assert bambuddy_api.get_printers.await_count == 2


async def test_one_reload_for_several_printers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Two printers find their model before the reload runs: the entry
    reloads once."""
    chosen = [printer for printer in load_fixture("printers.json") if printer["id"] in (X1C, A1_MINI)]
    bambuddy_api.get_printers.return_value = [{**printer, "model": None} for printer in chosen]
    bambuddy_api.get_printer.side_effect = lambda printer_id: next(p for p in chosen if p["id"] == printer_id)
    entry = make_entry(hass, X1C, A1_MINI)
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)
        await past_the_minute(hass, freezer)

    assert bambuddy_api.get_printer.await_count == 2
    reload.assert_called_once_with(entry.entry_id)


async def test_a_printer_stored_under_its_code_shows_its_model(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy may store the model code (BL-P002): the device page and its name say "X1"."""
    as_model(bambuddy_api, "BL-P002", X1C)
    entry = await set_up(hass, X1C)

    device = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    assert (device.model, device.name) == ("X1", "Workshop (X1 / 00M00A000000001)")


async def test_a_model_changed_in_bambuddy_reloads(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The model corrected in BamBuddy (X1C to X1E): the device, its name and the model's entities follow
    with one reload, as with a model that comes later."""
    entry = await set_up(hass, X1C)
    x1c = printer_info(X1C)
    details_are(bambuddy_api, {**x1c, "model": "X1E"})

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await past_the_minute(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)


async def test_the_same_model_in_another_spelling_reloads_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    x1c = printer_info(X1C)
    details_are(bambuddy_api, {**x1c, "model": " x1c "})

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await past_the_minute(hass, freezer)

    reload.assert_not_called()
    assert entry.state is ConfigEntryState.LOADED


@pytest.mark.parametrize("part", ["temperature", "heater"])
async def test_a_chamber_bambuddy_reports_after_setup_reloads_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, part: str
) -> None:
    """BamBuddy 1.2.5.7 reports no chamber temperature or heater for the H2D Pro (it compares
    "H2D PRO" with "H2DPRO"); 1.3 does (maziggy/bambuddy#3335). Updated while the entry runs -- or a
    printer that had not reported at setup --, the entities come with one reload, without the user."""
    as_model(bambuddy_api, "H2D Pro", H2D)
    status = bambuddy_api.statuses[H2D]
    status["temperatures"].update({"chamber": None, "chamber_target": None})
    status["supports_chamber_heater"] = False
    entry = await set_up(hass, H2D)
    if part == "temperature":
        status["temperatures"]["chamber"] = 31.0
    else:
        status["supports_chamber_heater"] = True

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await past_polls(hass, freezer, 3)

    reload.assert_called_once_with(entry.entry_id)


async def test_the_reload_for_a_late_chamber_builds_its_entities(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """After BamBuddy's update the H2D Pro's chamber temperature and target are there by themselves."""
    as_model(bambuddy_api, "H2D Pro", H2D)
    status = bambuddy_api.statuses[H2D]
    status["temperatures"].update({"chamber": None, "chamber_target": None})
    status["supports_chamber_heater"] = False
    entry = await set_up(hass, H2D)
    assert no_entity(hass, "sensor", printer_uid(entry, "chamber_temp", H2D))
    status["temperatures"].update({"chamber": 31.0, "chamber_target": 0.0})
    status["supports_chamber_heater"] = True

    await next_refresh(hass, freezer)
    await hass.async_block_till_done()

    assert state_of(hass, "sensor", printer_uid(entry, "chamber_temp", H2D)).state == "31.0"
    state_of(hass, "number", printer_uid(entry, "chamber_target", H2D))


async def test_a_chamber_that_comes_and_goes_reloads_at_most_three_times_a_run(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A chamber temperature that every setup misses and every read after it brings (a BamBuddy that
    reports it late, again and again): three reloads in a run, then the entry stays as it is."""
    status = bambuddy_api.statuses[H2D]
    status["temperatures"]["chamber"] = None
    entry = await set_up(hass, H2D)
    reloads = 0
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(4):
            status["temperatures"]["chamber"] = 31.0
            await past_polls(hass, freezer, 2)
            reloads = reload.call_count
            status["temperatures"]["chamber"] = None
            await reload_entry(hass, entry.entry_id)

    assert reloads == 3


@pytest.mark.parametrize("field", ["exhaust_fan_present", "left_aux_fan_speed"])
async def test_a_fan_kit_bambuddy_reports_after_setup_reloads_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, field: str
) -> None:
    """BamBuddy learns of the P2S's exhaust fan kit or left auxiliary fan from the printer's first full
    airduct report, a moment after it connects: set up before that, the fan comes with one reload."""
    as_model(bambuddy_api, "P2S", X1C)
    bambuddy_api.statuses[X1C].update({"exhaust_fan_present": False, "left_aux_fan_speed": None})
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C][field] = True if field == "exhaust_fan_present" else 0

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await past_polls(hass, freezer, 3)

    reload.assert_called_once_with(entry.entry_id)


async def test_a_corrected_model_takes_its_entities_along(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Corrected in BamBuddy from an X1C to an A1: after the reload the
    X1C's door and fans are gone from the registry; what an A1 has stays,
    the AMS units' entities and the firmware update too."""
    entry = await set_up(hass, X1C)
    assert not no_entity(hass, "binary_sensor", printer_uid(entry, "door"))
    listed_with(bambuddy_api, X1C, model="A1")

    await reload_entry(hass, entry.entry_id)

    for platform, key in _X1C_ONLY:
        assert no_entity(hass, platform, printer_uid(entry, key)), key
    assert not no_entity(hass, "sensor", printer_uid(entry, "status"))
    assert not no_entity(hass, "update", printer_uid(entry, "firmware"))
    assert not no_entity(hass, "sensor", ams_uid(entry, 0, "humidity"))
    assert devices_by_identifier(hass, entry)[printer_device(entry, X1C)].model == "A1"


async def test_a_corrected_model_met_blank_waits_for_the_printers_report(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy reconnects a printer whose model was corrected in its edit
    dialog: the reload may meet it blank. Then nothing goes and the device
    keeps its model; the setup after the printer's report (its reload) takes
    the change."""
    entry = await set_up(hass, X1C)
    before = entity_ids(hass, entry)
    listed_with(bambuddy_api, X1C, model="A1")
    connected = bambuddy_api.statuses[X1C]
    bambuddy_api.statuses[X1C] = {**load_fixture("status_never.json"), "id": X1C, "name": connected["name"]}

    await reload_entry(hass, entry.entry_id)

    # Only the camera's frame rate goes: it follows BamBuddy's printer
    # information (an A1's camera gives 5 frames a second), not a report.
    assert sorted(set(before) - set(entity_ids(hass, entry))) == [printer_uid(entry, "camera_fps")]
    assert devices_by_identifier(hass, entry)[printer_device(entry, X1C)].model == "X1C"
    bambuddy_api.statuses[X1C] = connected
    await next_refresh(hass, freezer)
    await hass.async_block_till_done()
    await next_refresh(hass, freezer)
    for platform, key in _X1C_ONLY:
        assert no_entity(hass, platform, printer_uid(entry, key)), key
    assert devices_by_identifier(hass, entry)[printer_device(entry, X1C)].model == "A1"


async def test_a_failed_setup_after_a_corrected_model_takes_it_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The X1C corrected to an A1; at the reload the A1 mini's first read
    times out. The device keeps its model, so the next try takes the change."""
    entry = await set_up(hass, X1C, A1_MINI)
    listed_with(bambuddy_api, X1C, model="A1")
    reads = bambuddy_api.get_status.side_effect
    failed: list[int] = []

    def the_a1_minis_first_read_fails(printer_id: int) -> Any:
        if printer_id == A1_MINI and not failed:
            failed.append(printer_id)
            raise BamBuddyConnectionError("GET /printers/2/status: TimeoutError")
        return reads(printer_id)

    bambuddy_api.get_status.side_effect = the_a1_minis_first_read_fails
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert failed
    await reload_entry(hass, entry.entry_id)

    assert entry.state is ConfigEntryState.LOADED
    for platform, key in _X1C_ONLY:
        assert no_entity(hass, platform, printer_uid(entry, key)), key


async def test_a_fan_kit_reported_after_the_reload_keeps_its_fan(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """An H2D with its left auxiliary fan corrected to an H2D Pro: the reload
    meets BamBuddy right after its reconnect, the kit not reported yet --
    the fan stays, with its ID."""
    bambuddy_api.statuses[H2D]["left_aux_fan_speed"] = 40
    entry = await set_up(hass, H2D)
    fan = printer_uid(entry, "left_aux_fan", H2D)
    before = er.async_get(hass).async_get_entity_id("fan", DOMAIN, fan)
    assert before
    listed_with(bambuddy_api, H2D, model="H2D Pro")
    bambuddy_api.statuses[H2D]["left_aux_fan_speed"] = None

    await reload_entry(hass, entry.entry_id)

    assert er.async_get(hass).async_get_entity_id("fan", DOMAIN, fan) == before


@pytest.mark.parametrize(("stored", "model"), [("BamBuddy Printer (X1C)", "X1C"), ("BamBuddy Printer", "")])
async def test_a_1x_device_is_no_model_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace, stored: str, model: str) -> None:
    """After the upgrade from 1.x the device still has 1.x's model --
    "BamBuddy Printer (X1C)", or "BamBuddy Printer" without one: the same
    model in 1.x's words, so the 1.x entities 2.0 keeps (a model-less
    printer's SD card) stay."""
    listed_with(bambuddy_api, X1C, model=model)
    entry = make_entry(hass, X1C)
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, printer_device(entry, X1C))}, model=stored, serial_number=printer_serial(X1C)
    )
    er.async_get(hass).async_get_or_create("binary_sensor", DOMAIN, printer_uid(entry, "sdcard"), config_entry=entry, suggested_object_id="workshop_sd_card")

    await setup_integration(hass, entry)

    assert not entry.runtime_data.printers[X1C].model_changed
    assert not no_entity(hass, "binary_sensor", printer_uid(entry, "sdcard"))


async def test_a_blank_printer_keeps_its_entities_without_a_model_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy restarted while the printer is off: its status is blank at
    the reload, and it keeps everything it had (its chamber temperature)."""
    entry = await set_up(hass, X1C)
    before = entity_ids(hass, entry)
    bambuddy_api.statuses[X1C] = {**load_fixture("status_never.json"), "id": X1C, "name": "Workshop"}

    await reload_entry(hass, entry.entry_id)

    assert sorted(set(before) - set(entity_ids(hass, entry))) == []


async def test_a_model_that_comes_is_no_model_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A printer BamBuddy had no model for gets one: that only adds."""
    listed_with(bambuddy_api, X1C, model="")
    entry = await set_up(hass, X1C)
    listed_with(bambuddy_api, X1C, model="X1C")

    await reload_entry(hass, entry.entry_id)

    assert not entry.runtime_data.printers[X1C].model_changed


async def test_a_printer_without_a_model_says_printer_in_its_entity_ids(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy has no model for it: `printer` stands in for the model, so
    no entity ID begins with a digit (templates' dot access needs a letter)."""
    listed_with(bambuddy_api, X1C, model=None)
    entry = await set_up(hass, X1C)

    assert er.async_get(hass).async_get_entity_id("sensor", DOMAIN, printer_uid(entry, "status")) == "sensor.printer_00m00a000000001_print_status"


async def test_an_ams_unit_still_without_its_serial_keeps_its_entities(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Corrected to an X1E: at the reload BamBuddy reports the AMS unit
    without its serial yet (it comes a moment after the connection), so its
    entities come later -- they stay."""
    entry = await set_up(hass, X1C)
    before = {uid for uid in entity_ids(hass, entry) if "_ams" in uid.removeprefix(entry.entry_id)}
    assert before
    listed_with(bambuddy_api, X1C, model="X1E")
    status = bambuddy_api.statuses[X1C]
    status["firmware_version"] = None
    for unit in status["ams"]:
        unit["serial_number"] = ""

    await reload_entry(hass, entry.entry_id)

    assert sorted(before - set(entity_ids(hass, entry))) == []
