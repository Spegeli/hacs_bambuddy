"""The entity IDs that followed an AMS unit's serial (`rekey.py`), and the
notice under Settings -> Repairs that lists them, one per printer. The
list lives in the integration's own store: the notice is not persistent
-- Home Assistant writes a persistent issue, placeholders and all, into
every diagnostics download, and these IDs carry serial numbers -- so every
setup raises it again until the user confirms it."""
from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .coordinator import renames_issue
from .storage import async_load_once

if TYPE_CHECKING:
    from .coordinator import BamBuddyConfigEntry

STORE_KEY = f"{DOMAIN}.ams_renames"
STORE_VERSION = 1
# hass.data[DOMAIN]: the store and its contents once loaded in this run.
_DATA = "ams_renames"
_LOCK = "ams_renames_lock"

type _Renames = dict[str, dict[str, list[list[str]]]]


async def _loaded(hass: HomeAssistant) -> tuple[Store[_Renames], _Renames]:
    async def load() -> tuple[Store[_Renames], _Renames]:
        store: Store[_Renames] = Store(hass, STORE_VERSION, STORE_KEY)
        return store, await store.async_load() or {}

    return await async_load_once(hass, _DATA, _LOCK, load)


async def async_add(hass: HomeAssistant, entry_id: str, printer_key: str, pairs: list[tuple[str, str]]) -> bool:
    """The pairs (old, new) a setup renamed; whether the printer's list grew."""
    store, data = await _loaded(hass)
    known = data.setdefault(entry_id, {}).setdefault(printer_key, [])
    new = [[old, renamed] for old, renamed in pairs if [old, renamed] not in known]
    if not new:
        return False
    known.extend(new)
    await store.async_save(data)
    return True


async def async_get(hass: HomeAssistant, entry_id: str, printer_key: str) -> list[tuple[str, str]]:
    _, data = await _loaded(hass)
    return [(old, new) for old, new in data.get(entry_id, {}).get(printer_key, [])]


async def async_clear(hass: HomeAssistant, entry_id: str, printer_key: str | None = None) -> None:
    """A printer's list (confirmed, or the printer removed), or the entry's."""
    store, data = await _loaded(hass)
    if printer_key is None:
        found = data.pop(entry_id, None) is not None
    else:
        found = data.get(entry_id, {}).pop(printer_key, None) is not None
        if entry_id in data and not data[entry_id]:
            del data[entry_id]
    if found:
        await store.async_save(data)



async def async_drop(hass: HomeAssistant, entry_id: str, entity_ids: set[str]) -> None:
    """Pairs that name an entity about to go (the "N/A" AMS device's): a
    printer's list left empty goes, and with it its notice."""
    if not entity_ids:
        return
    store, data = await _loaded(hass)
    lists = data.get(entry_id, {})
    changed = False
    for printer_key, pairs in list(lists.items()):
        kept = [pair for pair in pairs if not set(pair) & entity_ids]
        if len(kept) != len(pairs):
            changed = True
            if kept:
                lists[printer_key] = kept
            else:
                del lists[printer_key]
    if entry_id in data and not data[entry_id]:
        del data[entry_id]
    if changed:
        await store.async_save(data)

async def async_keep(hass: HomeAssistant, entry_id: str, printer_keys: set[str]) -> None:
    """Only the lists of printers the entry still has."""
    _, data = await _loaded(hass)
    for printer_key in set(data.get(entry_id, {})) - printer_keys:
        await async_clear(hass, entry_id, printer_key)


async def async_raise(hass: HomeAssistant, entry: BamBuddyConfigEntry, names: dict[str, str], recreate: set[str]) -> set[str]:
    """Each listed printer's notice, by `names` (printer key -> device
    name); a printer in `recreate` got new pairs and shows it again even
    after an "Ignore". The notices' issue IDs."""
    _, data = await _loaded(hass)
    raised: set[str] = set()
    for printer_key, pairs in data.get(entry.entry_id, {}).items():
        if not pairs or printer_key not in names:
            continue
        issue_id = renames_issue(entry.entry_id, printer_key)
        if printer_key in recreate:
            ir.async_delete_issue(hass, DOMAIN, issue_id)
        ir.async_create_issue(
            hass,
            DOMAIN,
            issue_id,
            is_fixable=True,
            is_persistent=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key="ams_ids_renamed",
            translation_placeholders={"name": names[printer_key]},
            data={"entry_id": entry.entry_id, "key": printer_key},
        )
        raised.add(issue_id)
    return raised
