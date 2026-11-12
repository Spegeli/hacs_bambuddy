"""Names: devices after BamBuddy's names and AMS labels, the notice when a
name given in Home Assistant goes back, the log's names, new entity IDs."""
from __future__ import annotations

from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import issue_registry as ir

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyConnectionError,
)
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import find_device, missing_issue, names_issue

from tests.conftest import (
    A1_MINI,
    H2D,
    H3C,
    P1S,
    X1C,
    ams_device,
    ams_uid,
    entity_id,
    instance_uid,
    make_entry,
    next_refresh,
    past_polls,
    past_the_minute,
    plug_identifier_of,
    printer_device,
    printer_device_id,
    printer_entry,
    printer_info,
    printer_key,
    printer_name,
    printer_serial,
    printer_uid,
    printers_but,
    set_up,
    setup_integration,
    with_h3c,
)
from tests.helpers import as_model, call_action, details_are, devices_by_identifier, reload_entry, renamed_in_bambuddy, with_plugs


async def test_a_name_given_in_home_assistant_is_explained(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The name goes back to BamBuddy's; Repairs says why,
    once, so it does not look like a fault."""
    entry = await set_up(hass, X1C)
    printer = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    dr.async_get(hass).async_update_device(printer.id, name_by_user="My printer")

    await past_the_minute(hass, freezer)

    issue = ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C)))
    assert issue is not None
    assert issue.translation_placeholders == {"given": "My printer", "name": printer_name(X1C)}
    assert dr.async_get(hass).async_get(printer.id).name_by_user is None  # type: ignore[union-attr]


async def test_each_renamed_printer_is_explained(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Two printers renamed in Home Assistant: a notice for each, not only the last."""
    entry = await set_up(hass, X1C, P1S)
    devices = devices_by_identifier(hass, entry)
    for printer, name in ((X1C, "Desk printer"), (P1S, "Big printer")):
        dr.async_get(hass).async_update_device(devices[printer_device(entry, printer)].id, name_by_user=name)

    await past_the_minute(hass, freezer)

    given = {
        printer: ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(printer)))
        for printer in (X1C, P1S)
    }
    assert {printer: issue.translation_placeholders["given"] for printer, issue in given.items() if issue} == {
        X1C: "Desk printer",
        P1S: "Big printer",
    }


async def test_the_log_names_a_printer_as_bambuddy_does(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """A failed read names the printer as the user knows it, not by
    BamBuddy's number, which Home Assistant shows nowhere -- and a printer
    renamed in BamBuddy by its new name."""
    entry = await set_up(hass, X1C)
    reads = bambuddy_api.get_status.side_effect
    bambuddy_api.get_status.side_effect = BamBuddyConnectionError("GET /printers/1/status: ConnectionTimeoutError")

    await next_refresh(hass, freezer)

    assert "Error fetching bambuddy Workshop data" in caplog.text
    assert "bambuddy printer 1" not in caplog.text
    bambuddy_api.get_status.side_effect = reads
    renamed_in_bambuddy(bambuddy_api, X1C, "Lab")
    await next_refresh(hass, freezer)
    assert entry.runtime_data.printers[X1C].name == "bambuddy Lab"


async def test_the_device_name_follows_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's name is the one: renamed there, the device follows within a
    minute -- and a name given in Home Assistant goes back to it."""
    entry = await set_up(hass, X1C)
    registry = dr.async_get(hass)
    printer = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    registry.async_update_device(printer.id, name_by_user="My printer")
    # Only its details say so: the status keeps the old name.
    details_are(bambuddy_api, {**printer_info(X1C), "name": "Lab"})

    await past_the_minute(hass, freezer)

    devices = devices_by_identifier(hass, entry)
    printer = devices[printer_device(entry, X1C)]
    assert (printer.name, printer.name_by_user) == ("Lab (X1C / 00M00A000000001)", None)
    assert devices[ams_device(entry, X1C, 0)].name == "Lab AMS A (AMS / 00600A3B0000001)"


async def test_the_h3c_s_ams_3h(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """One AMS 3H per H3C: named without a letter, its entity IDs after its
    model and serial, its humidity and temperature measured."""
    with_h3c(bambuddy_api)

    entry = await set_up(hass, H3C)

    device = devices_by_identifier(hass, entry)[ams_device(entry, H3C, 32)]
    assert (device.name, device.model) == ("Lab AMS 3H (0A3H0A000000006)", "AMS 3H")
    assert entity_id(hass, "sensor", ams_uid(entry, 32, "slot_9", H3C)) == "sensor.ams_3h_0a3h0a000000006_slot_9"
    assert entity_id(hass, "sensor", ams_uid(entry, 32, "humidity", H3C)) == "sensor.ams_3h_0a3h0a000000006_humidity"
    assert entity_id(hass, "sensor", ams_uid(entry, 32, "temperature", H3C)) == "sensor.ams_3h_0a3h0a000000006_temperature"


async def test_an_ams_unit_is_named_after_its_bambuddy_label_from_the_setup_on(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """A unit named in BamBuddy: its name in place of its place, at once."""
    bambuddy_api.get_ams_labels.return_value = {0: "Silk"}

    entry = await set_up(hass, X1C)

    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop Silk (AMS / 00600A3B0000001)"
    bambuddy_api.get_ams_labels.assert_awaited_with(X1C)


async def test_an_ams_name_follows_a_label_changed_or_removed_in_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Read once a minute with the printer's name: a new name follows, a
    removed one gives the place back."""
    bambuddy_api.get_ams_labels.return_value = {0: "Silk"}
    entry = await set_up(hass, X1C)

    bambuddy_api.get_ams_labels.return_value = {0: "Matte"}
    await past_the_minute(hass, freezer)
    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop Matte (AMS / 00600A3B0000001)"

    bambuddy_api.get_ams_labels.return_value = {}
    await past_the_minute(hass, freezer)
    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop AMS A (AMS / 00600A3B0000001)"


async def test_an_ams_unit_keeps_its_name_while_its_labels_are_not_read(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Until a read of the labels succeeds, a known unit keeps the name it
    has -- a restart while BamBuddy does not answer them renames nothing.
    A new unit is named by its place."""
    bambuddy_api.get_ams_labels.side_effect = BamBuddyConnectionError("down")
    entry = await set_up(hass, X1C)
    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop AMS A (AMS / 00600A3B0000001)"

    bambuddy_api.get_ams_labels.side_effect = None
    bambuddy_api.get_ams_labels.return_value = {0: "Silk"}
    await past_the_minute(hass, freezer)
    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop Silk (AMS / 00600A3B0000001)"

    bambuddy_api.get_ams_labels.side_effect = BamBuddyConnectionError("down")
    await reload_entry(hass, entry.entry_id, wait_background_tasks=True)
    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop Silk (AMS / 00600A3B0000001)"
    await past_the_minute(hass, freezer)
    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop Silk (AMS / 00600A3B0000001)"


async def test_the_ams_names_stay_when_a_later_labels_read_fails(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A failed read keeps the labels read last."""
    bambuddy_api.get_ams_labels.return_value = {0: "Silk"}
    entry = await set_up(hass, X1C)
    bambuddy_api.get_ams_labels.side_effect = BamBuddyApiError(500, "Internal error")

    await past_the_minute(hass, freezer)

    assert bambuddy_api.get_ams_labels.await_count >= 2
    assert devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)].name == "Workshop Silk (AMS / 00600A3B0000001)"


async def test_a_name_given_to_a_labelled_ams_unit_goes_back(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Named in BamBuddy or not, the unit's name comes from there: a name
    given in Home Assistant goes back, and Repairs says why."""
    bambuddy_api.get_ams_labels.return_value = {0: "Silk"}
    entry = await set_up(hass, X1C)
    unit = devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)]
    dr.async_get(hass).async_update_device(unit.id, name_by_user="Spool box")

    await past_the_minute(hass, freezer)

    unit = devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)]
    assert (unit.name, unit.name_by_user) == ("Workshop Silk (AMS / 00600A3B0000001)", None)
    issue = ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C)))
    assert issue is not None
    assert issue.translation_placeholders["given"] == "Spool box"


async def test_a_name_changed_in_bambuddy_follows_at_the_next_refresh(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The status names the printer: a new name there reads its details and
    renames its devices at once, not at the next minute."""
    entry = await set_up(hass, X1C)
    await past_the_minute(hass, freezer)
    renamed_in_bambuddy(bambuddy_api, X1C, "Lab")
    minute_reads = bambuddy_api.get_ams_labels.await_count

    await next_refresh(hass, freezer)

    assert bambuddy_api.get_ams_labels.await_count == minute_reads
    devices = devices_by_identifier(hass, entry)
    assert devices[printer_device(entry, X1C)].name == "Lab (X1C / 00M00A000000001)"
    assert devices[ams_device(entry, X1C, 0)].name == "Lab AMS A (AMS / 00600A3B0000001)"


async def test_an_ams_lite_without_a_serial_gets_the_printers_serial_and_its_letter(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy drops the AMS Lite's serial (maziggy/bambuddy#3348): the
    printer's serial and the place's letter stand in."""
    entry = await set_up(hass, A1_MINI)

    assert entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI)) == (
        "sensor.ams_lite_0309da000000002_a_slot_1"
    )


async def test_the_a2l_s_ams_lite_has_no_letter(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The A2L's AMS Lite, BamBuddy's unit 6, has no place letter."""
    as_model(bambuddy_api, "A2L", A1_MINI)
    bambuddy_api.statuses[A1_MINI]["ams"][0]["id"] = 6
    entry = await set_up(hass, A1_MINI)

    assert entity_id(hass, "sensor", ams_uid(entry, 6, "slot_1", A1_MINI)) == (
        "sensor.ams_lite_0309da000000002_slot_1"
    )


async def test_the_stored_name_follows_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry keeps each printer's current name: a printer missing later
    is named as it was last seen."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(entry, options={"printers": [{**printer_entry(X1C), "printer_name": "old"}]})

    await setup_integration(hass, entry)

    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_the_names_notice_goes_with_its_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Removed with Configure: its notice about a name goes too."""
    entry = await set_up(hass, X1C, P1S)
    workshop = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    dr.async_get(hass).async_update_device(workshop.id, name_by_user="My printer")
    await past_the_minute(hass, freezer)
    assert ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C))) is not None

    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(P1S)]})
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C))) is None


async def test_the_names_notice_goes_with_its_entry(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    dr.async_get(hass).async_update_device(printer_device_id(hass, entry), name_by_user="Mine")
    await past_the_minute(hass, freezer)
    issue_id = names_issue(entry.entry_id, printer_key(X1C))
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None

    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is None


async def test_a_stored_printers_names_notice_survives_a_reload(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Still stored: its notice about a name stays until Home Assistant restarts, a reload keeps it."""
    entry = await set_up(hass, X1C, P1S)
    workshop = devices_by_identifier(hass, entry)[printer_device(entry, X1C)]
    dr.async_get(hass).async_update_device(workshop.id, name_by_user="My printer")
    await past_the_minute(hass, freezer)
    issue_id = names_issue(entry.entry_id, printer_key(X1C))
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None

    await reload_entry(hass, entry.entry_id)

    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None


async def test_a_missing_printer_is_named_the_same_everywhere(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Renamed in BamBuddy since the last start (the device followed), then gone: the stored name
    follows its device's, so the repair, its dialog and an action's refusal say what its title says."""
    entry = await set_up(hass, X1C, A1_MINI)
    device = devices_by_identifier(hass, entry)[printer_device(entry, A1_MINI)]
    dr.async_get(hass).async_update_device(device.id, name="Kitchen (A1 Mini / 0309DA000000002)")
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    await reload_entry(hass, entry.entry_id)

    issue = ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI)))
    assert issue is not None
    assert issue.translation_placeholders == {"printer": "Kitchen (A1 Mini / 0309DA000000002)"}
    stored = next(p for p in entry.options["printers"] if p["serial_number"] == printer_serial(A1_MINI))
    assert stored["printer_name"] == "Kitchen (A1 Mini / 0309DA000000002)"
    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "home_axes", device_id=device.id)
    assert raised.value.translation_placeholders == {"printer": "Kitchen (A1 Mini / 0309DA000000002)"}


async def test_plug_and_bambuddy_devices_keep_a_name_given_in_home_assistant(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Only the printers and their AMS units follow BamBuddy's names."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    registry = dr.async_get(hass)
    devices = [find_device(hass, entry.entry_id, identifier) for identifier in (plug_identifier_of(hass, entry.entry_id, 3), (DOMAIN, entry.entry_id))]
    for device in devices:
        assert device is not None
        registry.async_update_device(device.id, name_by_user="Mine")

    await past_the_minute(hass, freezer)

    assert [registry.async_get(device.id).name_by_user for device in devices] == ["Mine", "Mine"]  # type: ignore[union-attr]


async def test_the_name_notice_names_every_device_reset(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printer and its AMS unit renamed in Home Assistant: one notice for
    the printer, naming both names that were reset."""
    entry = await set_up(hass, X1C)
    devices = devices_by_identifier(hass, entry)
    registry = dr.async_get(hass)
    registry.async_update_device(devices[printer_device(entry, X1C)].id, name_by_user="My printer")
    registry.async_update_device(devices[ams_device(entry, X1C, 0)].id, name_by_user="My AMS")

    await past_the_minute(hass, freezer)

    issue = ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C)))
    assert issue is not None
    assert issue.translation_placeholders == {"given": "My printer\n- My AMS", "name": printer_name(X1C)}


async def test_the_name_notice_keeps_its_names_over_a_reload_and_follows_a_rename(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The names an earlier setup reset stay in the notice; a name reset
    twice is listed once; renamed in BamBuddy, the title follows."""
    entry = await set_up(hass, X1C)
    devices = devices_by_identifier(hass, entry)
    registry = dr.async_get(hass)
    issue_id = names_issue(entry.entry_id, printer_key(X1C))
    for _ in range(2):
        registry.async_update_device(devices[printer_device(entry, X1C)].id, name_by_user="My printer")
        await past_the_minute(hass, freezer)
    await reload_entry(hass, entry.entry_id)
    registry.async_update_device(devices[ams_device(entry, X1C, 0)].id, name_by_user="My AMS")
    await past_the_minute(hass, freezer)
    issue = ir.async_get(hass).async_get_issue(DOMAIN, issue_id)
    assert issue is not None
    assert issue.translation_placeholders["given"] == "My printer\n- My AMS"

    renamed_in_bambuddy(bambuddy_api, X1C, "Garage")
    await past_polls(hass, freezer, 7)
    issue = ir.async_get(hass).async_get_issue(DOMAIN, issue_id)
    assert issue is not None
    assert issue.translation_placeholders["name"] == devices_by_identifier(hass, entry)[printer_device(entry, X1C)].name


async def test_new_entity_ids_follow_model_and_serial(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Whatever the printer is called in BamBuddy, in any language: model,
    serial number and the entity's key."""
    hass.config.language = "de"
    entry = await set_up(hass, H2D)

    assert entity_id(hass, "sensor", printer_uid(entry, "status", H2D)) == (
        "sensor.h2d_0948ad000000004_print_status"
    )
    # An AMS unit's: what stays for it -- its own model and serial, no place.
    assert entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D)) == (
        "sensor.ams_2_pro_19c06a000000001_slot_1"
    )
    assert entity_id(hass, "sensor", ams_uid(entry, 128, "humidity", H2D)) == (
        "sensor.ams_ht_19f06a000000002_humidity"
    )
    assert entity_id(hass, "binary_sensor", ams_uid(entry, 128, "drying", H2D)) == (
        "binary_sensor.ams_ht_19f06a000000002_drying"
    )
    assert entity_id(hass, "sensor", ams_uid(entry, 128, "drying_remaining_time", H2D)) == (
        "sensor.ams_ht_19f06a000000002_drying_remaining_time"
    )
    assert entity_id(hass, "update", printer_uid(entry, "firmware", H2D)) == (
        "update.h2d_0948ad000000004_firmware"
    )
    # The instance's: BamBuddy and the key -- not its address, which may change.
    assert entity_id(hass, "sensor", instance_uid(entry, "total_prints")) == (
        "sensor.bambuddy_total_prints"
    )
    assert entity_id(hass, "binary_sensor", instance_uid(entry, "connected")) == (
        "binary_sensor.bambuddy_online"
    )
    assert entity_id(hass, "update", instance_uid(entry, "bambuddy_update")) == (
        "update.bambuddy_update"
    )
