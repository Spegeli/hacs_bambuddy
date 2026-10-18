"""The sensors: BamBuddy's figures, each printer's status, the AMS units."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from custom_components.bambuddy.api import BamBuddyApiError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    X1C,
    X1E,
    ams_uid,
    entity_id,
    instance_uid,
    load_fixture,
    make_entry,
    next_refresh,
    no_entity,
    printer_key,
    printer_uid,
    set_up,
    setup_integration,
    state_of,
)


@pytest.mark.parametrize(
    ("key", "state"),
    [
        ("total_prints", "812"),
        ("successful_prints", "741"),
        ("failed_prints", "52"),
        ("cancelled_prints", "19"),
        ("printers_connected", "2"),
        ("printers_total", "3"),
        ("disk_percent_used", "36.0"),
    ],
)
async def test_the_instance_figures(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, key: str, state: str
) -> None:
    entry = await set_up(hass, X1C)

    assert state_of(hass, "sensor", instance_uid(entry, key)).state == state


@pytest.mark.parametrize(
    "key",
    ["total_prints", "successful_prints", "failed_prints", "cancelled_prints", "total_print_time", "total_filament_used"],
)
async def test_the_instance_totals_may_go_down(hass: HomeAssistant, bambuddy_api: SimpleNamespace, key: str) -> None:
    """BamBuddy lowers its totals when archives are purged with their
    statistics or its print log is cleared: a total, not a meter that
    only grows -- Home Assistant would count a drop as a reset."""
    entry = await set_up(hass, X1C)

    assert state_of(hass, "sensor", instance_uid(entry, key)).attributes["state_class"] == "total"


async def test_the_instance_figures_with_units(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Hours, grams, and the free disk space in gigabytes from BamBuddy's bytes."""
    entry = make_entry(hass, X1C)
    stats = load_fixture("archives_stats.json")
    system = load_fixture("system_info.json")
    await setup_integration(hass, entry)

    print_time = state_of(hass, "sensor", instance_uid(entry, "total_print_time"))
    assert (float(print_time.state), print_time.attributes["unit_of_measurement"]) == (
        stats["total_print_time_hours"],
        "h",
    )
    filament = state_of(hass, "sensor", instance_uid(entry, "total_filament_used"))
    assert (float(filament.state), filament.attributes["unit_of_measurement"]) == (stats["total_filament_grams"], "g")
    disk = state_of(hass, "sensor", instance_uid(entry, "disk_free"))
    assert disk.attributes["unit_of_measurement"] == "GB"
    assert float(disk.state) == pytest.approx(system["storage"]["disk_free_bytes"] / 1e9, abs=0.01)


@pytest.mark.parametrize(
    ("key", "state"),
    [
        ("status", "printing"),
        ("stage", "printing"),
        ("progress", "45.0"),
        ("remaining_time", "37"),
        ("current_layer", "112"),
        ("total_layers", "250"),
        ("current_print", "Benchy"),
        ("nozzle_temp", "220.0"),
        ("bed_temp", "60.0"),
        ("chamber_temp", "38.0"),
        ("heatbreak_fan_speed", "100"),
        ("hms_status", "0"),
        ("active_filament", "PETG HF"),
        ("external_spool", "empty"),
        ("nozzle_type", "hardened_steel"),
        ("nozzle_diameter", "0.4"),
        ("wifi_signal", "-48"),
    ],
)
async def test_the_printing_x1c(hass: HomeAssistant, bambuddy_api: SimpleNamespace, key: str, state: str) -> None:
    entry = await set_up(hass, X1C)

    assert state_of(hass, "sensor", printer_uid(entry, key)).state == state


async def test_the_end_time(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Now plus the remaining minutes, to the minute."""
    freezer.move_to(datetime(2026, 10, 16, 12, 0, 40, tzinfo=timezone.utc))
    entry = await set_up(hass, X1C)

    assert state_of(hass, "sensor", printer_uid(entry, "end_time")).state == "2026-10-16T12:37:00+00:00"


async def test_no_end_time_while_idle(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    assert state_of(hass, "sensor", printer_uid(entry, "end_time", A1_MINI)).state == STATE_UNKNOWN
    assert state_of(hass, "sensor", printer_uid(entry, "status", A1_MINI)).state == "idle"
    assert state_of(hass, "sensor", printer_uid(entry, "stage", A1_MINI)).state == "idle"
    assert state_of(hass, "sensor", printer_uid(entry, "current_print", A1_MINI)).state == STATE_UNKNOWN


async def test_the_names_are_translated(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The device's name, then the entity's own."""
    entry = await set_up(hass, X1C)

    state = state_of(hass, "sensor", printer_uid(entry, "nozzle_temp"))
    assert state.attributes["friendly_name"] == "Workshop (X1C / 00M00A000000001) Nozzle temperature"


async def test_two_nozzles_are_left_and_right(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's `nozzle` is the left one of a two-nozzle printer,
    `nozzle_2` the right one; `nozzles[0]` the right one."""
    entry = await set_up(hass, H2D)
    status = bambuddy_api.statuses[H2D]

    left = state_of(hass, "sensor", printer_uid(entry, "nozzle_temp", H2D))
    right = state_of(hass, "sensor", printer_uid(entry, "nozzle_2_temp", H2D))
    assert left.attributes["friendly_name"].endswith("Left nozzle temperature")
    assert right.attributes["friendly_name"].endswith("Right nozzle temperature")
    assert (float(left.state), float(right.state)) == (
        status["temperatures"]["nozzle"],
        status["temperatures"]["nozzle_2"],
    )
    # Known as the temperatures are: "nozzle" the left one, "nozzle_2" the
    # right one (BamBuddy's own list has them the other way round).
    left_type = state_of(hass, "sensor", printer_uid(entry, "nozzle_type", H2D))
    right_type = state_of(hass, "sensor", printer_uid(entry, "nozzle_2_type", H2D))
    assert left_type.attributes["friendly_name"].endswith("Left nozzle type")
    assert (left_type.state, right_type.state) == ("hardened_steel_high_flow", "hardened_steel")
    assert state_of(hass, "sensor", printer_uid(entry, "nozzle_2_diameter", H2D)).attributes["friendly_name"].endswith(
        "Right nozzle diameter"
    )
    assert state_of(hass, "sensor", printer_uid(entry, "external_spool_2", H2D)).attributes["friendly_name"].endswith(
        "Right external spool"
    )


async def test_a_printer_without_chamber_sensor_has_no_chamber_temperature(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    entry = await set_up(hass, A1_MINI)

    assert no_entity(hass, "sensor", printer_uid(entry, "chamber_temp", A1_MINI))


async def test_the_hms_errors(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The count, and each error with the code Bambu Lab's wiki uses, its
    severity and BamBuddy's text (PR #6's decision)."""
    entry = await set_up(hass, P1S)

    state = state_of(hass, "sensor", printer_uid(entry, "hms_status", P1S))
    assert state.state == "2"
    assert state.attributes["errors"] == [
        {
            "code": "0700_2000_0002_0012",
            "severity": "warning",
            "description": "The filament of AMS slot 2 has run out.",
            "actions": ["RESUME_PRINTING"],
        },
        {"code": "0300_0100_0003_0001", "severity": "notice", "description": None, "actions": []},
    ]
    assert state_of(hass, "sensor", printer_uid(entry, "stage", P1S)).state == "paused_by_user"


async def test_the_ams_slots(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    first = state_of(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI))
    assert first.state == "PLA Matte"
    assert first.attributes["friendly_name"] == "Desk AMS A (AMS Lite / 03C00A000000004) Slot 1"
    assert {key: first.attributes[key] for key in ("slot", "color", "type", "remaining", "active", "empty", "tray_id")} == {
        "slot": 1,
        "color": "#F4EE2A",
        "type": "PLA",
        "remaining": 72,
        "active": False,
        "empty": False,
        "tray_id": 0,
    }
    # A spool without an RFID estimate.
    assert state_of(hass, "sensor", ams_uid(entry, 0, "slot_2", A1_MINI)).attributes["remaining"] is None
    assert state_of(hass, "sensor", ams_uid(entry, 0, "slot_4", A1_MINI)).state == "empty"


async def test_the_active_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    assert state_of(hass, "sensor", ams_uid(entry, 0, "slot_2")).attributes["active"] is True
    active = state_of(hass, "sensor", printer_uid(entry, "active_filament"))
    assert (active.attributes["slot"], active.attributes["tray_id"]) == (2, 1)


async def test_the_ams_climate(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)
    units = {unit["id"]: unit for unit in bambuddy_api.statuses[H2D]["ams"]}

    for unit_id, unit in units.items():
        assert float(state_of(hass, "sensor", ams_uid(entry, unit_id, "humidity", H2D)).state) == unit["humidity"]
        assert float(state_of(hass, "sensor", ams_uid(entry, unit_id, "temperature", H2D)).state) == unit["temp"]
    drying = state_of(hass, "sensor", ams_uid(entry, 128, "drying_remaining_time", H2D))
    assert drying.state == str(units[128]["dry_time"])


async def test_a_wired_printer_s_wifi_signal_is_off_at_first(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """On a cable from the start: no signal to show, nothing unavailable on
    its device page."""
    entry = await set_up(hass, H2D)

    wifi = er.async_get(hass).async_get(entity_id(hass, "sensor", printer_uid(entry, "wifi_signal", H2D)))
    assert wifi is not None and wifi.disabled_by is er.RegistryEntryDisabler.INTEGRATION


async def test_an_ams_unit_deleted_comes_back_when_plugged_in_again(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Unplugged, its device may be deleted; plugged in again, it is new."""
    entry = await set_up(hass, X1C)
    units = bambuddy_api.statuses[X1C]["ams"]
    unit = units.pop(0)
    await next_refresh(hass, freezer)
    devices = dr.async_get(hass)
    devices.async_remove_device(next(d for d in dr.async_entries_for_config_entry(devices, entry.entry_id) if d.serial_number == unit["serial_number"]).id)
    await hass.async_block_till_done()

    units.append(unit)
    await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", ams_uid(entry, 0, "slot_1")).state == "PLA Basic"


async def test_a_new_ams_unit_appears_without_a_reload(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    second = {**bambuddy_api.statuses[X1C]["ams"][0], "id": 1, "serial_number": "00600A3B0000002"}
    bambuddy_api.statuses[X1C]["ams"].append(second)

    await next_refresh(hass, freezer)

    # Known by its own serial number.
    assert state_of(hass, "sensor", f"{entry.entry_id}_p{printer_key(X1C)}_ams00600A3B0000002_slot_1").state == "PLA Basic"


async def test_an_offline_printer_shows_no_stale_values(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy keeps the last values of a printer it lost -- a print may
    still read as running. Only the print status tells: offline."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")

    await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "offline"
    assert state_of(hass, "sensor", printer_uid(entry, "progress")).state == STATE_UNAVAILABLE
    assert state_of(hass, "sensor", ams_uid(entry, 0, "slot_1")).state == STATE_UNAVAILABLE
    assert state_of(hass, "binary_sensor", printer_uid(entry, "connected")).state == "off"


async def test_a_printer_bambuddy_never_reached_sets_up(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Its status comes with nulls and defaults: nothing to show but that
    it is offline."""
    entry = await set_up(hass, X1E)

    assert state_of(hass, "sensor", printer_uid(entry, "status", X1E)).state == "offline"
    assert state_of(hass, "sensor", printer_uid(entry, "nozzle_temp", X1E)).state == STATE_UNAVAILABLE


async def test_unknown_state_and_stage_are_unknown(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A state or stage a newer BamBuddy brings shows as unknown, never as
    an error."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C].update({"state": "CALIBRATING", "stg_cur": 99, "stg_cur_name": "Something new"})

    await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == STATE_UNKNOWN
    assert state_of(hass, "sensor", printer_uid(entry, "stage")).state == STATE_UNKNOWN


async def test_rarely_needed_sensors_start_disabled(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    registry = er.async_get(hass)

    entity = registry.async_get(registry.async_get_entity_id("sensor", DOMAIN, printer_uid(entry, "printable_objects_count")) or "")
    assert entity is not None and entity.disabled_by is er.RegistryEntryDisabler.INTEGRATION
    # The dashboard card's printer information shows and copies it.
    assert state_of(hass, "sensor", printer_uid(entry, "ip_address")).state == "192.0.2.11"


async def test_a_p1s_has_no_chamber_temperature_and_no_door(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """A P1S without a chamber: neither chamber temperature nor door."""
    entry = await set_up(hass, P1S)

    assert no_entity(hass, "sensor", printer_uid(entry, "chamber_temp", P1S))
    assert no_entity(hass, "binary_sensor", printer_uid(entry, "door", P1S))


async def test_the_layers_stay_out_of_the_activity_log(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The logbook leaves out sensors with a state class: one entry per
    layer would bury everything else."""
    entry = await set_up(hass, X1C)

    for key in ("current_layer", "total_layers"):
        assert state_of(hass, "sensor", printer_uid(entry, key)).attributes["state_class"] == "measurement", key


async def test_an_ams_unit_gets_what_its_type_allows_once_it_is_known(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy may report an AMS 2 Pro a moment before its type (the
    printer's answer about its units comes after the list): its drying
    time comes with the type, as its drying sensor does."""
    status = bambuddy_api.statuses[H2D]
    status["ams"][0]["module_type"] = ""
    entry = await set_up(hass, H2D)
    registry = er.async_get(hass)
    assert no_entity(hass, "sensor", ams_uid(entry, 0, "drying_remaining_time", H2D))

    status["ams"][0]["module_type"] = "n3f"
    await next_refresh(hass, freezer)

    assert registry.async_get_entity_id("binary_sensor", DOMAIN, ams_uid(entry, 0, "drying", H2D)) is not None
    assert registry.async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 0, "drying_remaining_time", H2D)) is not None
    # Each once: the next poll adds nothing again.
    count = len(er.async_entries_for_config_entry(registry, entry.entry_id))
    await next_refresh(hass, freezer)
    assert len(er.async_entries_for_config_entry(registry, entry.entry_id)) == count


@pytest.mark.parametrize(("screen_only", "remote"), [(True, False), (False, True)])
async def test_drying_shows_also_where_it_starts_only_at_the_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, screen_only: bool, remote: bool
) -> None:
    """A P1S dries an AMS 2 Pro from its own screen only: the unit reports
    its drying all the same. Whether Home Assistant may start it stands on
    the drying sensor."""
    status = bambuddy_api.statuses[P1S]
    status["ams"][0]["module_type"] = "n3f"
    status["supports_drying"] = not screen_only
    status["drying_screen_only"] = screen_only
    entry = await set_up(hass, P1S)

    assert state_of(hass, "sensor", ams_uid(entry, 0, "drying_remaining_time", P1S)) is not None
    drying = state_of(hass, "binary_sensor", ams_uid(entry, 0, "drying", P1S))
    assert drying.attributes["remote_start"] is remote


async def test_drying_says_its_temperature(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """While a unit dries: the temperature it dries at (BamBuddy's
    dry_target_temp); none while it does not."""
    entry = await set_up(hass, H2D)

    assert state_of(hass, "binary_sensor", ams_uid(entry, 128, "drying", H2D)).attributes["target_temperature"] == 65
    assert state_of(hass, "binary_sensor", ams_uid(entry, 0, "drying", H2D)).attributes["target_temperature"] is None


async def test_a_classic_ams_cannot_dry(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Only the AMS 2 Pro and the AMS HT have a heater, whatever the
    printer's firmware allows."""
    entry = await set_up(hass, X1C)

    assert no_entity(hass, "sensor", ams_uid(entry, 0, "drying_remaining_time"))
    assert no_entity(hass, "binary_sensor", ams_uid(entry, 0, "drying"))


async def test_two_external_spools_by_their_ids(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """254 is the left holder, 255 the right one -- whatever order BamBuddy
    lists them in."""
    entry = await set_up(hass, H2D)
    spools = bambuddy_api.statuses[H2D]["vt_tray"]
    spools.reverse()
    for spool in spools:
        spool.update({"tray_type": "PETG" if spool["id"] == 254 else "TPU", "tray_sub_brands": "", "exists": True})

    await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", printer_uid(entry, "external_spool", H2D)).state == "PETG"
    assert state_of(hass, "sensor", printer_uid(entry, "external_spool_2", H2D)).state == "TPU"


async def test_an_ams_without_a_humidity_yet_gets_the_sensor(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy reports the humidity once the AMS sent it; the sensor waits
    for it instead of never existing."""
    bambuddy_api.statuses[X1C]["ams"][0].update({"humidity": None, "temp": None})
    entry = await set_up(hass, X1C)

    assert state_of(hass, "sensor", ams_uid(entry, 0, "humidity")).state == STATE_UNKNOWN
    assert state_of(hass, "sensor", ams_uid(entry, 0, "temperature")).state == STATE_UNKNOWN


async def test_the_end_time_holds_still_between_estimates(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """It moves only when the printer's estimate does: polls on both sides
    of a minute boundary would flip it back and forth."""
    freezer.move_to(datetime(2026, 10, 16, 12, 0, 50, tzinfo=timezone.utc))
    entry = await set_up(hass, X1C)

    await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", printer_uid(entry, "end_time")).state == "2026-10-16T12:37:00+00:00"


async def test_a_pause_drops_the_held_end_time(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The estimate stands still while the print is paused; the end does not."""
    freezer.move_to(datetime(2026, 10, 16, 12, 0, 50, tzinfo=timezone.utc))
    entry = await set_up(hass, X1C)
    end_time = printer_uid(entry, "end_time")

    bambuddy_api.statuses[X1C]["state"] = "PAUSE"
    await next_refresh(hass, freezer)
    assert state_of(hass, "sensor", end_time).state == STATE_UNKNOWN

    bambuddy_api.statuses[X1C]["state"] = "RUNNING"
    await next_refresh(hass, freezer)
    assert state_of(hass, "sensor", end_time).state == "2026-10-16T12:38:00+00:00"


async def test_no_end_time_while_paused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A paused print ends whenever it is resumed."""
    entry = await set_up(hass, P1S)

    assert state_of(hass, "sensor", printer_uid(entry, "end_time", P1S)).state == STATE_UNKNOWN


async def test_no_wifi_signal_on_a_cable(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """BamBuddy reports -90 dBm for a printer on Ethernet."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C].update({"wired_network": True, "wifi_signal": -90})

    await next_refresh(hass, freezer)

    # Unavailable, not unknown: there is no signal to wait for.
    assert state_of(hass, "sensor", printer_uid(entry, "wifi_signal")).state == STATE_UNAVAILABLE


@pytest.mark.parametrize(
    ("main", "sub", "state"),
    [(0, 0, "idle"), (1, 2, "heating"), (1, 3, "feeding"), (1, 7, "purging"), (1, 5, "changing_filament"), (2, 0, "reading_rfid")],
)
async def test_the_ams_status(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, main: int, sub: int, state: str
) -> None:
    """What a filament change is doing right now."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C].update({"ams_status_main": main, "ams_status_sub": sub})

    await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", printer_uid(entry, "ams_status")).state == state


async def test_a_slot_tells_its_drying_recommendation(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    tray = bambuddy_api.statuses[X1C]["ams"][0]["tray"][0]

    attributes = state_of(hass, "sensor", ams_uid(entry, 0, "slot_1")).attributes
    assert (attributes["drying_temp"], attributes["drying_time"]) == (tray["drying_temp"], tray["drying_time"])


async def test_a_two_nozzle_printers_slot_tells_its_nozzle(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """His word: which nozzle an AMS unit feeds (BamBuddy's ams_extruder_map:
    0 right, 1 left) -- only where a printer has two."""
    entry = await set_up(hass, H2D, X1C)

    assert state_of(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D)).attributes["nozzle"] == "right"
    assert state_of(hass, "sensor", ams_uid(entry, 128, "slot_1", H2D)).attributes["nozzle"] == "left"
    assert "nozzle" not in state_of(hass, "sensor", ams_uid(entry, 0, "slot_1")).attributes


async def test_a_unit_on_the_filament_track_switch_names_no_nozzle(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy leaves a unit that reaches both nozzles out of its map: it
    must not be called left or right (review I1)."""
    bambuddy_api.statuses[H2D]["ams_extruder_map"] = {"128": 1}
    entry = await set_up(hass, H2D)

    assert "nozzle" not in state_of(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D)).attributes
    assert state_of(hass, "sensor", ams_uid(entry, 128, "slot_1", H2D)).attributes["nozzle"] == "left"


async def test_the_print_hours(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """BamBuddy counts the hours the printer prints (plus an offset set in
    BamBuddy) -- read once a minute, not with every status."""
    entry = await set_up(hass, X1C)
    hours = printer_uid(entry, "print_hours")

    state = state_of(hass, "sensor", hours)
    assert (state.state, state.attributes["unit_of_measurement"]) == ("559.5", "h")

    bambuddy_api.get_runtime.return_value = {"total_hours": 560.0}
    await next_refresh(hass, freezer)
    assert state_of(hass, "sensor", hours).state == "559.5"
    assert bambuddy_api.get_runtime.await_count == 1

    for _ in range(5):
        await next_refresh(hass, freezer)
    assert state_of(hass, "sensor", hours).state == "560.0"


async def test_print_hours_bambuddy_cannot_give(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The counter is an extra: without it the status goes on, the hours
    keep their last value."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_runtime.side_effect = BamBuddyApiError(404, "Not Found")

    for _ in range(6):
        await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", printer_uid(entry, "print_hours")).state == "559.5"
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_the_status_tells_bambuddys_name(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The name the printer has in BamBuddy, for the dashboard card's title
    (the device name adds model and serial number)."""
    entry = await set_up(hass, X1C)

    assert state_of(hass, "sensor", printer_uid(entry, "status")).attributes["bambuddy_name"] == "Workshop"
