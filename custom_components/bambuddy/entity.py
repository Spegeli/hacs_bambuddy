"""Shared mixin for BamBuddy printer entities."""
from __future__ import annotations

from typing import Any, cast

from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN
from .coordinator import BamBuddyPrinterCoordinator


class BamBuddyPrinterEntityMixin:
    """Provides a shared device_info property for all printer entity classes."""

    # Set by CoordinatorEntity in every class that uses it but the buttons,
    # which read their coordinator through _coordinator_data() instead.
    coordinator: BamBuddyPrinterCoordinator
    _printer_data: dict[str, Any]
    _entry_id: str
    _instance_url: str

    def _coordinator_data(self) -> dict[str, Any]:
        return self.coordinator.data or {}

    @property
    def device_info(self) -> DeviceInfo:
        data = self._coordinator_data()
        printer_info = data.get("printer", {})
        status_info = data.get("status", {})
        printer_id = self._printer_data["printer_id"]
        info = DeviceInfo(
            identifiers={(DOMAIN, f"{self._entry_id}_printer_{printer_id}")},
            name=self._printer_data["printer_name"],
            manufacturer="BamBuddy",
            model=f"BamBuddy Printer ({printer_info['model']})" if printer_info.get("model") else "BamBuddy Printer",
            serial_number=printer_info.get("serial_number"),
            sw_version=status_info.get("firmware_version"),
            configuration_url=self._instance_url,
        )
        # The instance's device as the printer's hub, by its identifiers:
        # the one way Home Assistant 2025.5, the floor, offers. From 2026.8
        # on the key is deprecated in favour of `via_device_id` -- removed in
        # 2027.8 -- and DeviceInfo no longer types it.
        return cast(DeviceInfo, {**info, "via_device": (DOMAIN, self._entry_id)})
