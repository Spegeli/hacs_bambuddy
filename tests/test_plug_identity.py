"""How a smart plug is known: its BamBuddy record and what it switches."""
from __future__ import annotations

from datetime import UTC, datetime
import time

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.bambuddy import plug_identity
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.plug_identity import Known

from .conftest import TEST_SECRET

EPOCH = int(datetime(2026, 9, 1, 10, tzinfo=UTC).timestamp())
LATER = "2026-10-01T08:30:00"


def _tasmota(plug_id: int, ip: str, created: str | None = "2026-09-01T10:00:00") -> dict[str, object]:
    info: dict[str, object] = {"id": plug_id, "plug_type": "tasmota", "ip_address": ip}
    if created is not None:
        info["created_at"] = created
    return info


def _rest(plug_id: int, created: str | None = "2026-09-01T10:00:00", url: str | None = "http://192.0.2.9/relay/0") -> dict[str, object]:
    info: dict[str, object] = {"id": plug_id, "plug_type": "rest", "rest_on_url": url}
    if created is not None:
        info["created_at"] = created
    return info


def _internal(plug_type: str, source: str) -> str:
    return plug_identity.source_key(TEST_SECRET, plug_type, source)[:16]


# --- The source -----------------------------------------------------------------


def test_a_tasmota_ip_is_normalised() -> None:
    assert plug_identity.source_candidates({"plug_type": "tasmota", "ip_address": " 192.168.001.010 "}) == ["192.168.1.10"]
    assert plug_identity.source_candidates({"plug_type": "tasmota", "ip_address": " Host.Local "}) == ["host.local"]


def test_an_ha_entity_is_lowercased() -> None:
    assert plug_identity.source_candidates({"plug_type": "homeassistant", "ha_entity_id": " Switch.Drucker "}) == ["switch.drucker"]


def test_mqtt_topics_keep_their_case_in_order() -> None:
    """Each topic with the path BamBuddy reads in it: the legacy topic with the power path."""
    info = {
        "plug_type": "mqtt",
        "mqtt_power_topic": "A/B",
        "mqtt_power_path": " power_l1 ",
        "mqtt_topic": "x",
        "mqtt_energy_topic": "E",
        "mqtt_state_topic": "S",
        "mqtt_state_path": "State",
    }
    assert plug_identity.source_candidates(info) == ["A/B\npower_l1", "x\npower_l1", "E\n", "S\nState"]
    assert plug_identity.source_candidates({"plug_type": "mqtt", "mqtt_state_topic": " S "}) == ["S\n"]


def test_two_channels_on_one_topic_are_two_devices() -> None:
    """A two-gang meter on one topic, BamBuddy reading each channel by its path."""
    meter = {"plug_type": "mqtt", "created_at": "2026-09-01T10:00:00", "mqtt_power_topic": "zigbee2mqtt/meter"}
    found = plug_identity.identities(
        TEST_SECRET, [{**meter, "id": 7, "mqtt_power_path": "power_l1"}, {**meter, "id": 8, "mqtt_power_path": "power_l2"}], {}
    )
    assert found[7].digest != found[8].digest
    assert (found[7].rank, found[8].rank) == (0, 0)


def test_a_rest_plug_has_no_source() -> None:
    assert plug_identity.source_candidates({"plug_type": "rest", "rest_on_url": "http://h/relay/0"}) == []


# --- created_at -----------------------------------------------------------------


def test_created_at_is_read_as_utc() -> None:
    assert plug_identity.created_epoch("2026-09-01T10:00:00") == EPOCH
    assert plug_identity.created_epoch("2026-09-01T10:00:00.900") == EPOCH
    assert plug_identity.created_epoch("2026-09-01T12:00:00+02:00") == EPOCH
    assert plug_identity.created_epoch(None) is None
    assert plug_identity.created_epoch("x") is None


async def test_created_at_ignores_every_time_zone(hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch) -> None:
    await hass.config.async_set_time_zone("Pacific/Auckland")
    monkeypatch.setenv("TZ", "Pacific/Auckland")
    try:
        time.tzset()
        assert plug_identity.created_epoch("2026-09-01T10:00:00") == EPOCH
    finally:
        monkeypatch.undo()
        time.tzset()


# --- Keys and ranks ---------------------------------------------------------------


def test_the_same_source_gives_the_same_key_in_any_entry() -> None:
    found = plug_identity.identities(TEST_SECRET, [_tasmota(8, "192.0.2.50", LATER), _tasmota(3, "192.0.2.50")], {})
    assert found[3].internal == found[8].internal == _internal("tasmota", "192.0.2.50")
    assert (found[3].rank, found[8].rank) == (0, 1)


def test_another_source_another_key() -> None:
    found = plug_identity.identities(TEST_SECRET, [_tasmota(3, "192.0.2.50"), _tasmota(8, "192.0.2.51")], {})
    assert found[3].digest != found[8].digest
    assert (found[3].rank, found[8].rank) == (0, 0)


def test_a_rest_plug_is_known_by_its_record() -> None:
    with_url = plug_identity.identities(TEST_SECRET, [_rest(4)], {})[4]
    without_url = plug_identity.identities(TEST_SECRET, [_rest(4, url=None)], {})[4]
    again = plug_identity.identities(TEST_SECRET, [_rest(4, created=LATER)], {})[4]
    assert with_url.internal == without_url.internal
    assert again.internal != with_url.internal
    known = {4: Known("rest", EPOCH, frozenset({with_url.internal}))}
    # Another server's plug 4: its own record, nothing of the old one's.
    assert plug_identity.identities(TEST_SECRET, [_rest(4, created=LATER)], known)[4].internal == again.internal
    # The answer without created_at: the known record.
    assert plug_identity.identities(TEST_SECRET, [_rest(4, created=None)], known)[4].internal == with_url.internal


def test_a_type_change_takes_no_old_key() -> None:
    known = {3: Known("tasmota", EPOCH, frozenset({_internal("tasmota", "192.0.2.50")}))}
    found = plug_identity.identities(TEST_SECRET, [_rest(3)], known)[3]
    assert found.internal == plug_identity.record_key(TEST_SECRET, 3, EPOCH)[:16]
    # Now a Home Assistant plug whose entity the answer lacks: still not the Tasmota's key.
    lacking = {"id": 3, "plug_type": "homeassistant", "created_at": "2026-09-01T10:00:00"}
    assert plug_identity.identities(TEST_SECRET, [lacking], known)[3].internal == plug_identity.record_key(TEST_SECRET, 3, EPOCH)[:16]


def test_a_missing_part_keeps_what_was_known() -> None:
    old = _internal("tasmota", "192.0.2.50")
    known = {3: Known("tasmota", EPOCH + 60, frozenset({old}))}
    assert plug_identity.identities(TEST_SECRET, [_tasmota(3, "192.0.2.50", None)], known)[3].epoch == EPOCH + 60
    no_ip = plug_identity.identities(TEST_SECRET, [{"id": 3, "plug_type": "tasmota", "created_at": "2026-09-01T10:00:00"}], known)[3]
    assert (no_ip.internal, no_ip.known_by) == (old, "kept")
    elsewhere = plug_identity.identities(TEST_SECRET, [_tasmota(3, "192.0.2.77", LATER)], known)[3]
    assert elsewhere.internal == _internal("tasmota", "192.0.2.77")
    assert elsewhere.epoch == plug_identity.created_epoch(LATER)


def test_mqtt_keeps_its_topic_while_it_has_it() -> None:
    known = {7: Known("mqtt", EPOCH, frozenset({_internal("mqtt", "S\n")}))}
    grown = {"id": 7, "plug_type": "mqtt", "created_at": "2026-09-01T10:00:00", "mqtt_power_topic": "P", "mqtt_state_topic": "S"}
    assert plug_identity.identities(TEST_SECRET, [grown], known)[7].internal == _internal("mqtt", "S\n")
    moved = {**grown, "mqtt_state_topic": None}
    assert plug_identity.identities(TEST_SECRET, [moved], known)[7].internal == _internal("mqtt", "P\n")


def test_rank_counts_internals() -> None:
    known = {3: Known("tasmota", EPOCH, frozenset({_internal("tasmota", "192.0.2.50")}))}
    found = plug_identity.identities(
        TEST_SECRET, [{"id": 3, "plug_type": "tasmota", "created_at": "2026-09-01T10:00:00"}, _tasmota(8, "192.0.2.50")], known
    )
    assert (found[3].rank, found[8].rank) == (0, 1)


def test_the_identifiers_read_back() -> None:
    entry_id = "abc123"
    identity = plug_identity.identities(TEST_SECRET, [_tasmota(3, "192.0.2.50")], {})[3]
    device = plug_identity.device_identifier(entry_id, identity)
    assert device == (DOMAIN, f"{entry_id}_plug_3_{EPOCH}")
    assert plug_identity.parse_device_identifier(entry_id, device[1]) == (3, EPOCH)
    assert plug_identity.parse_device_identifier(entry_id, f"{entry_id}_plug_3") is None
    unique_id = plug_identity.entity_unique_id(entry_id, identity, "power")
    assert plug_identity.parse_unique_id(entry_id, unique_id) == (identity.internal, 0, "power")
    assert plug_identity.parse_unique_id(entry_id, f"{entry_id}_plug3_power") is None


async def test_what_the_registry_knows(hass: HomeAssistant) -> None:
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    identity = plug_identity.identities(TEST_SECRET, [_tasmota(3, "192.0.2.50")], {})[3]
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={plug_identity.device_identifier(entry.entry_id, identity)}, model="Tasmota"
    )
    er.async_get(hass).async_get_or_create(
        "switch", DOMAIN, plug_identity.entity_unique_id(entry.entry_id, identity, "power"), config_entry=entry, device_id=device.id
    )
    blank = plug_identity.identities(TEST_SECRET, [_tasmota(5, "192.0.2.51", None)], {})[5]
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={plug_identity.device_identifier(entry.entry_id, blank)}, model="Tasmota"
    )
    known = plug_identity.known_from_registry(hass, entry.entry_id)
    assert known[3] == Known("tasmota", EPOCH, frozenset({identity.internal}))
    # An epoch 0 the registry holds is unknown.
    assert known[5] == Known("tasmota", None, frozenset())


# --- The secret ---------------------------------------------------------------------


async def test_the_secret_is_made_once(hass: HomeAssistant, hass_storage: dict[str, object]) -> None:
    hass_storage.pop("bambuddy.plug_secret", None)
    first = await plug_identity.async_secret(hass)
    second = await plug_identity.async_secret(hass)
    assert first == second
    assert len(first) == 32 and first != bytes(32)
    stored = hass_storage["bambuddy.plug_secret"]["data"]["secret"]  # type: ignore[index]
    assert len(stored) == 64 and bytes.fromhex(stored) == first
