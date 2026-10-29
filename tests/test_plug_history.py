"""The long-term statistics of a smart plug's entities that went: deleted
once the entity ID has been unused for 10 days -- a plug swapped, created
again or switched back in the meantime keeps its history. States stay with
Home Assistant's recorder."""
from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.history import get_significant_states
from homeassistant.components.recorder.models import StatisticMeanType
from homeassistant.components.recorder.models.statistics import StatisticMetaData
from homeassistant.components.recorder.statistics import async_import_statistics, get_metadata
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

from custom_components.bambuddy import plug_history
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import A1_MINI, X1C, entity_id, load_fixture, plug_unique_id, printer_entry, set_up, setup_integration
from tests.test_plugs import _info, _listed

GONE = "sensor.bambuddy_smart_plug_abcdef_energy_total"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(recorder_mock: Any, enable_custom_integrations: None) -> None:
    """The recorder before Home Assistant (the conftest's fixture asks for Home Assistant first)."""


@pytest.fixture
def recorder_config() -> dict[str, Any]:
    return {"commit_interval": 0}


def _meta(statistic_id: str) -> StatisticMetaData:
    meta: dict[str, Any] = {
        "source": "recorder",
        "statistic_id": statistic_id,
        "unit_of_measurement": "kWh",
        "has_sum": True,
        "mean_type": StatisticMeanType.NONE,
        "name": None,
    }
    if "unit_class" in StatisticMetaData.__annotations__:
        meta["unit_class"] = "energy"
    return meta  # type: ignore[return-value]


async def _with_statistic(hass: HomeAssistant, *statistic_ids: str) -> None:
    start = dt_util.utcnow().replace(minute=0, second=0, microsecond=0) - timedelta(hours=2)
    for statistic_id in statistic_ids:
        async_import_statistics(hass, _meta(statistic_id), [{"start": start, "state": 1.0, "sum": 1.0}])
    await async_wait_recording_done(hass)


async def _statistics(hass: HomeAssistant, *statistic_ids: str) -> set[str]:
    await async_wait_recording_done(hass)
    found = await get_instance(hass).async_add_executor_job(lambda: get_metadata(hass, statistic_ids=set(statistic_ids)))
    return set(found)


async def _states(hass: HomeAssistant, entity: str) -> list[str]:
    start = dt_util.utcnow() - timedelta(days=30)
    found = await get_instance(hass).async_add_executor_job(get_significant_states, hass, start, None, [entity])
    return [state.state for state in found.get(entity, [])]


def _vanished(hass_storage: dict[str, Any]) -> set[str]:
    return set((hass_storage.get("bambuddy.plug_history") or {}).get("data", {}).get("vanished", {}))


async def _reload(hass: HomeAssistant, entry_id: str) -> None:
    assert await hass.config_entries.async_reload(entry_id)
    await hass.async_block_till_done()


def _switch(hass: HomeAssistant, entry_id: str, plug_id: int) -> str:
    return entity_id(hass, "switch", plug_unique_id(hass, entry_id, plug_id, "power"))


# --- The store -------------------------------------------------------------------------


async def test_an_id_in_use_again_is_kept(hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]) -> None:
    await _with_statistic(hass, GONE)
    await plug_history.async_vanished(hass, [GONE])
    er.async_get(hass).async_get_or_create("sensor", "test", "back", suggested_object_id=GONE.split(".")[1])
    freezer.tick(timedelta(days=11))

    assert await plug_history.async_purge(hass) == []
    assert await _statistics(hass, GONE) == {GONE}
    assert GONE not in _vanished(hass_storage)


async def test_statistics_go_after_10_days(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Only the statistics: the recorded states are the recorder's."""
    hass.states.async_set(GONE, "3.2")
    await _with_statistic(hass, GONE)
    hass.states.async_remove(GONE)
    await plug_history.async_vanished(hass, [GONE])

    freezer.tick(timedelta(days=9))
    assert await plug_history.async_purge(hass) == []
    assert await _statistics(hass, GONE) == {GONE}

    freezer.tick(timedelta(days=2))
    assert await plug_history.async_purge(hass) == [GONE]
    assert await _statistics(hass, GONE) == set()
    # The recorded state stays (the recorder writes the removal as one more row).
    assert "3.2" in await _states(hass, GONE)


async def test_the_first_time_counts(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Noted again later: the 10 days still run from the first time."""
    await _with_statistic(hass, GONE)
    await plug_history.async_vanished(hass, [GONE])
    freezer.tick(timedelta(days=6))
    await plug_history.async_vanished(hass, [GONE])
    freezer.tick(timedelta(days=5))

    assert await plug_history.async_purge(hass) == [GONE]


# --- Through the setup -------------------------------------------------------------------


async def test_the_setup_notes_what_it_removed(hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_storage: dict[str, Any]) -> None:
    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    entry = await set_up(hass, X1C)
    old = _switch(hass, entry.entry_id, 3)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": "192.0.2.199"}})

    await _reload(hass, entry.entry_id)

    assert old in _vanished(hass_storage)
    assert _switch(hass, entry.entry_id, 3) not in _vanished(hass_storage)


async def test_the_setup_purges_once_a_day(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    from pytest_homeassistant_custom_component.common import async_fire_time_changed

    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    await set_up(hass, X1C)
    await _with_statistic(hass, GONE)
    await plug_history.async_vanished(hass, [GONE])

    for _ in range(11):
        freezer.tick(timedelta(days=1))
        async_fire_time_changed(hass)
        await hass.async_block_till_done()

    assert await _statistics(hass, GONE) == set()


# --- The scenarios: whose history stays ---------------------------------------------------


async def test_a_swap_with_a_read_between_keeps_both_histories(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """Plug 8 edited first, read, then plug 3: both Tasmotas keep their
    entity IDs and statistics; only the passing `_2` goes."""
    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    entry = await set_up(hass, X1C, A1_MINI)
    a, b = _switch(hass, entry.entry_id, 3), _switch(hass, entry.entry_id, 8)
    ip_a, ip_b = _info(3)["ip_address"], _info(8)["ip_address"]

    bambuddy_api.get_smart_plugs.return_value = _listed(**{"8": {"ip_address": ip_a}})
    await _reload(hass, entry.entry_id)
    passing = _switch(hass, entry.entry_id, 8)
    assert passing == f"{a}_2"
    await _with_statistic(hass, a, b, passing)

    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": ip_b}, "8": {"ip_address": ip_a}})
    await _reload(hass, entry.entry_id)

    assert (_switch(hass, entry.entry_id, 3), _switch(hass, entry.entry_id, 8)) == (b, a)
    assert passing in _vanished(hass_storage) and not {a, b} & _vanished(hass_storage)
    freezer.tick(timedelta(days=11))
    await plug_history.async_purge(hass)
    assert await _statistics(hass, a, b, passing) == {a, b}


async def test_a_rotation_with_reads_between_keeps_every_history(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """Three Tasmotas rotated one edit per read: every one keeps its ID and statistics."""
    bambuddy_api.plug_statuses["11"] = dict(bambuddy_api.plug_statuses["3"])
    eleven = {**_info(3), "id": 11, "name": "Third", "ip_address": "192.0.2.211", "controls_printer_power": False}
    ips = {3: _info(3)["ip_address"], 8: _info(8)["ip_address"], 11: eleven["ip_address"]}

    def listed(**sources: object) -> list[dict[str, Any]]:
        return [*_listed(**{"3": {"ip_address": sources.get("3", ips[3])}, "8": {"ip_address": sources.get("8", ips[8])}}), {**eleven, "ip_address": sources.get("11", ips[11])}]

    bambuddy_api.get_smart_plugs.return_value = listed()
    entry = await set_up(hass, X1C, A1_MINI)
    a, b, c = (_switch(hass, entry.entry_id, plug) for plug in (3, 8, 11))
    await _with_statistic(hass, a, b, c)

    bambuddy_api.get_smart_plugs.return_value = listed(**{"3": ips[8]})
    await _reload(hass, entry.entry_id)
    bambuddy_api.get_smart_plugs.return_value = listed(**{"3": ips[8], "8": ips[11]})
    await _reload(hass, entry.entry_id)
    bambuddy_api.get_smart_plugs.return_value = listed(**{"3": ips[8], "8": ips[11], "11": ips[3]})
    await _reload(hass, entry.entry_id)

    assert [_switch(hass, entry.entry_id, plug) for plug in (3, 8, 11)] == [b, c, a]
    assert not {a, b, c} & _vanished(hass_storage)
    freezer.tick(timedelta(days=11))
    await plug_history.async_purge(hass)
    assert await _statistics(hass, a, b, c) == {a, b, c}


async def test_a_plug_back_after_a_read_keeps_its_history(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """Deleted in BamBuddy, read, created again on the same Tasmota."""
    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    entry = await set_up(hass, X1C)
    a = _switch(hass, entry.entry_id, 3)
    await _with_statistic(hass, a)

    bambuddy_api.get_smart_plugs.return_value = [plug for plug in load_fixture("smart_plugs.json") if plug["id"] != 3]
    await _reload(hass, entry.entry_id)
    assert a in _vanished(hass_storage)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"created_at": "2026-10-20T09:00:00"}})
    await _reload(hass, entry.entry_id)

    assert _switch(hass, entry.entry_id, 3) == a
    assert a not in _vanished(hass_storage)
    freezer.tick(timedelta(days=11))
    await plug_history.async_purge(hass)
    assert await _statistics(hass, a) == {a}


async def test_two_entries_swapping_sources_keep_their_histories(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """Two BamBuddy entries swap their Tasmotas, one reload after the
    other: the first keeps `_2` (no tidy-up across entries), the ID the
    second took back keeps its statistics, the one nobody uses goes."""
    ip_x, ip_y = _info(3)["ip_address"], "192.0.2.150"
    bambuddy_api.get_smart_plugs.return_value = _listed()
    first = await set_up(hass, X1C)
    x = _switch(hass, first.entry_id, 3)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": ip_y}})
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
    y = _switch(hass, second.entry_id, 3)
    await _with_statistic(hass, x, y)

    await _reload(hass, first.entry_id)
    assert _switch(hass, first.entry_id, 3) == f"{y}_2"
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": ip_x}})
    await _reload(hass, second.entry_id)

    assert _switch(hass, second.entry_id, 3) == x
    assert y in _vanished(hass_storage) and x not in _vanished(hass_storage)
    freezer.tick(timedelta(days=11))
    await plug_history.async_purge(hass)
    assert await _statistics(hass, x, y) == {x}


async def test_switching_back_keeps_the_history(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """Reconfigure to another BamBuddy and back within 10 days: the first
    server's plug comes back with its history; the other's goes later."""
    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    entry = await set_up(hass, X1C)
    a = _switch(hass, entry.entry_id, 3)
    await _with_statistic(hass, a)

    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": "192.0.2.250", "created_at": "2026-10-20T09:00:00"}})
    await _reload(hass, entry.entry_id)
    other = _switch(hass, entry.entry_id, 3)
    await _with_statistic(hass, other)
    freezer.tick(timedelta(days=3))
    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    await _reload(hass, entry.entry_id)

    assert _switch(hass, entry.entry_id, 3) == a
    assert other in _vanished(hass_storage) and a not in _vanished(hass_storage)
    freezer.tick(timedelta(days=11))
    await plug_history.async_purge(hass)
    assert await _statistics(hass, a, other) == {a}
