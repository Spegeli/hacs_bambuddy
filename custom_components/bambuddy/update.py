"""BamBuddy's update entities: a new BamBuddy release and new firmware for
each printer. Shown only: BamBuddy installs neither on an API key's word."""
from __future__ import annotations

from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator, BamBuddyUpdateCoordinator, printer_identifier
from .entity import BamBuddyUpdatesEntity, suggest_entity_id, suggest_instance_entity_id

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    entities: list[UpdateEntity] = [BamBuddyUpdate(runtime.updates)]
    entities.extend(FirmwareUpdate(runtime.updates, printer) for printer in runtime.printers.values())
    async_add_entities(entities)


class BamBuddyUpdate(BamBuddyUpdatesEntity, UpdateEntity):
    """BamBuddy's own check against its GitHub releases."""

    _attr_translation_key = "bambuddy_update"
    _attr_supported_features = UpdateEntityFeature.RELEASE_NOTES

    def __init__(self, coordinator: BamBuddyUpdateCoordinator) -> None:
        entry_id = coordinator.config_entry.entry_id
        super().__init__(coordinator, f"{entry_id}_bambuddy_update", (DOMAIN, entry_id))
        suggest_instance_entity_id(self, "update")

    @property
    def _check(self) -> dict[str, Any]:
        return (self.coordinator.data or {}).get("bambuddy") or {}

    @property
    def installed_version(self) -> str | None:
        return self._check.get("current_version")

    @property
    def latest_version(self) -> str | None:
        """None while BamBuddy's own checks are off or GitHub refused it."""
        return self._check.get("latest_version")

    @property
    def release_url(self) -> str | None:
        return self._check.get("release_url")

    async def async_release_notes(self) -> str | None:
        notes = self._check.get("release_notes")
        return str(notes) if notes else None


class FirmwareUpdate(BamBuddyUpdatesEntity, UpdateEntity):
    """A printer's firmware as BamBuddy compares it with Bambu Lab's."""

    _attr_translation_key = "firmware"
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_supported_features = UpdateEntityFeature.RELEASE_NOTES

    def __init__(self, coordinator: BamBuddyUpdateCoordinator, printer: BamBuddyPrinterCoordinator) -> None:
        entry_id = coordinator.config_entry.entry_id
        super().__init__(
            coordinator,
            f"{entry_id}_p{printer.key}_firmware",
            printer_identifier(entry_id, printer.key),
        )
        self.printer = printer
        suggest_entity_id(self, printer, "firmware")

    @property
    def _check(self) -> dict[str, Any]:
        return ((self.coordinator.data or {}).get("firmware") or {}).get(self.printer.printer_id) or {}

    @property
    def installed_version(self) -> str | None:
        return self._check.get("current_version") or self.printer.data.status.get("firmware_version")

    @property
    def latest_version(self) -> str | None:
        return self._check.get("latest_version")

    async def async_release_notes(self) -> str | None:
        notes = self._check.get("release_notes")
        return str(notes) if notes else None
