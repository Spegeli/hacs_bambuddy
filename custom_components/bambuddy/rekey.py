"""AMS units that got their serial number: the setup moves each one from
its place to its serial, before the platforms load -- one device stays,
its entities keep their registry entries and history, and their stand-in
IDs (the printer's serial and the place's letter) are renamed to the
serial's. The running entry only holds such a unit and reloads
(`BamBuddyPrinterCoordinator.rekey_source`): renaming a loaded entity
would make Home Assistant add it again."""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .models import AMS_MODELS, ams_model, ams_object_id, ams_serial

if TYPE_CHECKING:
    from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator

_LOGGER = logging.getLogger(__name__)


@callback
def async_rekey_ams_units(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, printers: dict[int, BamBuddyPrinterCoordinator]
) -> dict[str, list[tuple[str, str]]]:
    """Move every AMS unit that now reports its serial to it; the renamed
    entity IDs (old, new) by printer key."""
    renamed: dict[str, list[tuple[str, str]]] = {}
    for coordinator in printers.values():
        if coordinator.data is None:
            continue
        for unit in coordinator.data.ams_units:
            device = coordinator.rekey_source(unit)
            if device is not None:
                pairs = _rekey(hass, coordinator, unit, device)
                if pairs:
                    renamed.setdefault(coordinator.key, []).extend(pairs)
    return renamed


def _rekey(
    hass: HomeAssistant, coordinator: BamBuddyPrinterCoordinator, unit: dict[str, Any], device: dr.DeviceEntry
) -> list[tuple[str, str]]:
    serial = ams_serial(unit) or ""
    place = int(unit.get("id", 0))
    registry = er.async_get(hass)
    old_prefix = coordinator.entity_unique_id(f"ams{place}_")
    new_prefix = coordinator.entity_unique_id(f"ams{serial}_")
    # Disabled entities and those this setup would not build move too.
    planned: list[tuple[er.RegistryEntry, str]] = []
    # A move that stopped part-way: entries under the serial already whose
    # ID still is the stand-in get it renamed now.
    moved: list[tuple[er.RegistryEntry, str]] = []
    for item in er.async_entries_for_config_entry(registry, coordinator.config_entry.entry_id):
        if item.unique_id.startswith(new_prefix):
            moved.append((item, item.unique_id.removeprefix(new_prefix)))
            continue
        if not item.unique_id.startswith(old_prefix):
            continue
        key = item.unique_id.removeprefix(old_prefix)
        if registry.async_get_entity_id(item.domain, item.platform, new_prefix + key) is not None:
            _LOGGER.warning(
                "The AMS unit %s of %s keeps its place: its entity %s exists under the serial number already",
                serial,
                coordinator.printer_name,
                key,
            )
            return []
        planned.append((item, key))
    model = ams_model(unit, coordinator.data)
    pairs: list[tuple[str, str]] = []
    try:
        for item, key in [*planned, *moved]:
            # Two calls: Home Assistant 2025.5 drops an entry whose new
            # unique ID clashes when the entity ID changes with it.
            if not item.unique_id.startswith(new_prefix):
                registry.async_update_entity(item.entity_id, new_unique_id=new_prefix + key)
            if _ours(item.entity_id, item.domain, coordinator.key, place, key):
                target = free_entity_id(registry, item.domain, ams_object_id(model, coordinator.key, place, serial, key))
                registry.async_update_entity(item.entity_id, new_entity_id=target)
                pairs.append((item.entity_id, target))
        # Last: stopped before it, the unit is still known by its place, and
        # the next setup finishes (the entities moved already carry the serial).
        dr.async_get(hass).async_update_device(
            device.id,
            new_identifiers=(device.identifiers - {coordinator.ams_identifier(str(place))}) | {coordinator.ams_identifier(serial)},
            serial_number=serial,
        )
    except Exception as err:  # noqa: BLE001 -- whatever stops it, the setup goes on
        _LOGGER.warning("Moving the AMS unit %s of %s to its serial number stopped: %s", serial, coordinator.printer_name, err)
    else:
        _LOGGER.info("The AMS unit %s of %s is known by its serial number now", serial, coordinator.printer_name)
    return pairs


def _ours(entity_id: str, domain: str, printer_key: str, place: int, key: str) -> bool:
    """Whether the integration gave this ID: the stand-in form, for any
    AMS model (the one the entity was built with may have been a guess),
    or that with Home Assistant's suffix."""
    object_id = entity_id.removeprefix(f"{domain}.")
    for model in AMS_MODELS:
        form = ams_object_id(model, printer_key, place, None, key)
        if object_id == form or re.fullmatch(rf"{re.escape(form)}_(?:[2-9]|[1-9]\d+)", object_id):
            return True
    return False


def free_entity_id(registry: er.EntityRegistry, domain: str, object_id: str) -> str:
    """The entity ID, or Home Assistant's next free one where it is taken."""
    available = getattr(registry, "async_get_available_entity_id", None)
    if available is not None:
        entity_id: str = available(domain, object_id)
        return entity_id
    # Home Assistant 2025.5, the floor: the older name (deprecated later).
    return registry.async_generate_entity_id(domain, object_id)
