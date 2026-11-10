"""The X2D's auxiliary fans by their side: fan 2 is its left one, fan 10
its right one (Bambu Studio's N6.json), and 2.0.0-beta.2 gave them the IDs
of an auxiliary and a left auxiliary fan. The setup renames the IDs the
integration made, before the platforms load (renaming a loaded entity would
make Home Assistant add it again): fan 10 first, into the right fan's ID,
then fan 2 into the one it left. An ID the user chose stays."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN
from .entity import printer_object_id
from .rekey import free_entity_id, is_our_form

if TYPE_CHECKING:
    from .coordinator import BamBuddyPrinterCoordinator

_LOGGER = logging.getLogger(__name__)

# Unique key, the ID it had, the ID it gets -- in this order.
_MOVES = (("left_aux_fan", "left_auxiliary_fan", "right_auxiliary_fan"), ("aux_fan", "auxiliary_fan", "left_auxiliary_fan"))


@callback
def async_rename_x2d_fans(
    hass: HomeAssistant, printers: dict[int, BamBuddyPrinterCoordinator]
) -> None:
    """Give every X2D's two auxiliary fans the IDs of their sides."""
    registry = er.async_get(hass)
    for coordinator in printers.values():
        if coordinator.data is None or not coordinator.data.swapped_aux_fans():
            continue
        for key, old, new in _MOVES:
            entity_id = registry.async_get_entity_id("fan", DOMAIN, coordinator.entity_unique_id(key))
            if entity_id is None or not _ours(entity_id, printer_object_id(coordinator, old)):
                continue
            wanted = f"fan.{printer_object_id(coordinator, new)}"
            # Home Assistant 2025.5 keeps a restored state when its entity is
            # renamed: the ID fan 10 left would read as taken.
            state = hass.states.get(wanted)
            if state is not None and state.attributes.get("restored") and registry.async_get(wanted) is None:
                hass.states.async_remove(wanted)
            try:
                target = free_entity_id(registry, "fan", printer_object_id(coordinator, new))
                registry.async_update_entity(entity_id, new_entity_id=target)
            except Exception as err:  # noqa: BLE001 -- whatever stops it, the setup goes on
                _LOGGER.warning("The fan %s of %s keeps its ID: %s", entity_id, coordinator.short_name, err)
                continue
            _LOGGER.info("The fan %s of %s is %s now", entity_id, coordinator.short_name, target)


def _ours(entity_id: str, form: str) -> bool:
    """The ID the integration gave, or that with Home Assistant's suffix."""
    return is_our_form(entity_id.removeprefix("fan."), form)
