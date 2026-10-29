"""The long-term statistics of a smart plug's entities that went. Home
Assistant keeps statistics for ever; a plug's entity ID belongs to what it
switches, so a plug swapped, created again in BamBuddy or found again after
a switch back takes its ID -- and its history -- back. An entity ID no
entity has taken for `PLUG_STATISTICS_KEEP` loses its statistics; its
recorded states are the recorder's (its own days)."""
from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.recorder import get_instance
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, PLUG_STATISTICS_KEEP

STORE_KEY = f"{DOMAIN}.plug_history"
STORE_VERSION = 1
# hass.data[DOMAIN]: the store and its contents once loaded in this run.
_DATA = "plug_history"
_LOCK = "plug_history_lock"

# {"vanished": {entity ID: when it was first seen without an entity}}
type _History = dict[str, dict[str, str]]


async def _loaded(hass: HomeAssistant) -> tuple[Store[_History], _History]:
    domain: dict[str, Any] = hass.data.setdefault(DOMAIN, {})
    if _LOCK not in domain:
        domain[_LOCK] = asyncio.Lock()
    lock: asyncio.Lock = domain[_LOCK]
    async with lock:
        if _DATA not in domain:
            store: Store[_History] = Store(hass, STORE_VERSION, STORE_KEY)
            domain[_DATA] = (store, await store.async_load() or {})
    loaded: tuple[Store[_History], _History] = domain[_DATA]
    return loaded


async def async_vanished(hass: HomeAssistant, entity_ids: Iterable[str]) -> None:
    """Entity IDs a setup removed: from now -- the first time counts."""
    store, data = await _loaded(hass)
    vanished = data.setdefault("vanished", {})
    now = dt_util.utcnow().isoformat()
    new = [entity_id for entity_id in entity_ids if entity_id not in vanished]
    if new:
        vanished.update(dict.fromkeys(new, now))
        await store.async_save(data)


async def async_purge(hass: HomeAssistant) -> list[str]:
    """An ID in use again leaves the list; one unused for long enough loses
    its statistics. The IDs that went."""
    store, data = await _loaded(hass)
    vanished = data.setdefault("vanished", {})
    if not vanished:
        return []
    registry = er.async_get(hass)
    now = dt_util.utcnow()
    in_use = [entity_id for entity_id in vanished if registry.async_get(entity_id) is not None or hass.states.get(entity_id) is not None]
    due = [
        entity_id
        for entity_id, since in vanished.items()
        if entity_id not in in_use and ((moment := dt_util.parse_datetime(since)) is None or now - moment >= PLUG_STATISTICS_KEEP)
    ]
    if not in_use and not due:
        return []
    for entity_id in (*in_use, *due):
        del vanished[entity_id]
    if due and "recorder" in hass.config.components:
        get_instance(hass).async_clear_statistics(due)
    await store.async_save(data)
    return due
