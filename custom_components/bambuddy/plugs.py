"""BamBuddy's smart plugs as the integration sees them: a plug BamBuddy
links to a printer, what kind it is, and what it last reported."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .const import DOMAIN

# BamBuddy's plug types, as the device's model.
PLUG_TYPES = {"tasmota": "Tasmota", "homeassistant": "Home Assistant", "mqtt": "MQTT", "rest": "REST"}

# The figures of a plug's energy report the integration shows.
ENERGY_FIELDS = ("power", "today", "total")

type PlugKind = Literal["switch", "script", "monitor"]


def plug_identifier(entry_id: str, plug_id: int) -> tuple[str, str]:
    """A plug device's identifier, by BamBuddy's number: a plug has no
    serial; a restored BamBuddy database numbers them anew."""
    return (DOMAIN, f"{entry_id}_plug_{plug_id}")


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


@dataclass(frozen=True)
class Plug:
    """A plug from BamBuddy's list, with the status last read of it (None
    before the first read, and when the read failed)."""

    info: dict[str, Any]
    status: dict[str, Any] | None = None

    @property
    def id(self) -> int:
        return int(self.info["id"])

    @property
    def name(self) -> str:
        return str(self.info.get("name") or f"Plug {self.id}").strip()

    @property
    def printer_id(self) -> int | None:
        printer = self.info.get("printer_id")
        return printer if isinstance(printer, int) else None

    @property
    def plug_type(self) -> str:
        return str(self.info.get("plug_type") or "tasmota")

    @property
    def kind(self) -> PlugKind:
        """A switch; a Home Assistant script, which only runs; or an MQTT
        plug, which BamBuddy only watches."""
        if self.plug_type == "mqtt":
            return "monitor"
        if self.plug_type == "homeassistant" and str(self.info.get("ha_entity_id") or "").startswith("script."):
            return "script"
        return "switch"

    @property
    def powers_printer(self) -> bool:
        """BamBuddy's "powers the printer": off, BamBuddy marks the printer
        offline. True when BamBuddy does not say (its default)."""
        return self.info.get("controls_printer_power") is not False

    @property
    def on_card(self) -> bool:
        """BamBuddy's "show on the printer card"."""
        return self.info.get("show_on_printer_card") is not False

    @property
    def bambuddy_auto_off(self) -> bool:
        """BamBuddy itself switches the plug off after a print: its auto off,
        with its automation enabled (a script never)."""
        return bool(self.info.get("auto_off")) and self.info.get("enabled") is not False and self.kind != "script"

    @property
    def reachable(self) -> bool:
        return bool(self.status and self.status.get("reachable"))

    @property
    def state(self) -> bool | None:
        """On or off as the plug reports it; None when it does not say (a
        REST plug without a status URL) or cannot be reached."""
        if not self.reachable or self.status is None:
            return None
        state = str(self.status.get("state") or "").upper()
        return True if state == "ON" else False if state == "OFF" else None

    def figure(self, field: str) -> float | None:
        """One of the energy report's figures: power in W, today and total in
        kWh; None when the plug reports none or cannot be reached."""
        if not self.reachable or self.status is None:
            return None
        return _number((self.status.get("energy") or {}).get(field))


def printer_plug(plugs: list[Plug]) -> Plug | None:
    """The plug that powers the printer: the first switchable one BamBuddy
    marks so."""
    return next((plug for plug in plugs if plug.kind == "switch" and plug.powers_printer), None)


def sort_plugs(plugs: list[Plug]) -> list[Plug]:
    """A printer's plugs: the one that powers it first, then by name."""
    main = printer_plug(plugs)
    return sorted(plugs, key=lambda plug: (plug is not main, plug.name.casefold(), plug.id))


def plug_device_name(printer_name: str, plug: Plug) -> str:
    """After its printer's BamBuddy name, so it sorts right under the
    printer (as its AMS units do), and what it is in brackets, as the
    printer's and the AMS units' models: a plug called "Exhaust fan" is a
    plug (his word)."""
    return f"{printer_name} {plug.name} (Smart Plug)"
