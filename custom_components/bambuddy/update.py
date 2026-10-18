"""BamBuddy's update entities: a new BamBuddy release and new firmware for
each printer. Shown only: BamBuddy installs neither on an API key's word."""
from __future__ import annotations

from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator, BamBuddyUpdateCoordinator
from .entity import BamBuddyUpdatesEntity, suggest_entity_id, suggest_instance_entity_id

PARALLEL_UPDATES = 0


class _BamBuddyUpdate(BamBuddyUpdatesEntity, UpdateEntity):
    """What both checks report the same way: the latest version and its notes."""

    _attr_supported_features = UpdateEntityFeature.RELEASE_NOTES

    @property
    def _check(self) -> dict[str, Any]:
        raise NotImplementedError

    @property
    def latest_version(self) -> str | None:
        # None while BamBuddy's own checks are off or GitHub refused it.
        return self._check.get("latest_version")

    async def async_release_notes(self) -> str | None:
        notes = self._check.get("release_notes")
        return str(notes) if notes else None


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    entities: list[UpdateEntity] = [BamBuddyUpdate(runtime.updates)]
    entities.extend(FirmwareUpdate(runtime.updates, printer) for printer in runtime.printers.values())
    async_add_entities(entities)


class BamBuddyUpdate(_BamBuddyUpdate):
    """BamBuddy's own check against its GitHub releases."""

    _attr_translation_key = "bambuddy_update"

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
    def release_url(self) -> str | None:
        return self._check.get("release_url")


class FirmwareUpdate(_BamBuddyUpdate):
    """A printer's firmware as BamBuddy compares it with Bambu Lab's."""

    _attr_translation_key = "firmware"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator: BamBuddyUpdateCoordinator, printer: BamBuddyPrinterCoordinator) -> None:
        entry_id = coordinator.config_entry.entry_id
        super().__init__(
            coordinator,
            f"{entry_id}_p{printer.key}_firmware",
            printer.identifier,
        )
        self.printer = printer
        suggest_entity_id(self, printer, "firmware")

    @property
    def _check(self) -> dict[str, Any]:
        return ((self.coordinator.data or {}).get("firmware") or {}).get(self.printer.printer_id) or {}

    async def async_added_to_hass(self) -> None:
        """The printer reports a new firmware within a poll, BamBuddy's
        check hours later: the entity follows the printer too."""
        await super().async_added_to_hass()
        self.async_on_remove(self.printer.async_add_listener(self.async_write_ha_state))

    @property
    def installed_version(self) -> str | None:
        return self.printer.data.status.get("firmware_version") or self._check.get("current_version")
