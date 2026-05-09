"""Shared mixin for BamBuddy printer entities."""
from __future__ import annotations

from homeassistant.helpers.entity import DeviceInfo

from .const import DOMAIN


class BamBuddyPrinterEntityMixin:
    """Provides a shared device_info property for all printer entity classes."""

    _printer_data: dict
    _entry_id: str
    _instance_url: str

    def _coordinator_data(self) -> dict:
        return self.coordinator.data or {}  # type: ignore[attr-defined]

    @property
    def device_info(self) -> DeviceInfo:
        data = self._coordinator_data()
        printer_info = data.get("printer", {})
        status_info = data.get("status", {})
        printer_id = self._printer_data["printer_id"]
        return DeviceInfo(
            identifiers={(DOMAIN, f"{self._entry_id}_printer_{printer_id}")},
            name=self._printer_data["printer_name"],
            manufacturer="BamBuddy",
            model=f"BamBuddy Printer ({printer_info['model']})" if printer_info.get("model") else "BamBuddy Printer",
            serial_number=printer_info.get("serial_number"),
            sw_version=status_info.get("firmware_version"),
            configuration_url=self._instance_url,
            via_device=(DOMAIN, self._entry_id),
        )
