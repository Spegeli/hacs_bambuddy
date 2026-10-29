"""BamBuddy's smart plugs as the integration sees them: a plug BamBuddy
links to a printer, what kind it is, and what it last reported."""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Literal

# BamBuddy's plug types, as the device's model.
PLUG_TYPES = {"tasmota": "Tasmota", "homeassistant": "Home Assistant", "mqtt": "MQTT", "rest": "REST"}

# The figures of a plug's energy report the integration shows.
ENERGY_FIELDS = ("power", "today", "total")

type PlugKind = Literal["switch", "script", "monitor"]


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
    def model(self) -> str:
        """What the plug's device is a model of: its type, as BamBuddy names it."""
        return PLUG_TYPES.get(self.plug_type, self.plug_type)

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
        offline. True when BamBuddy does not say (its default) -- never for
        a script: it runs, it powers nothing (BamBuddy's own choice of the
        printer's plug leaves scripts out)."""
        return self.kind != "script" and self.info.get("controls_printer_power") is not False

    @property
    def reports_power(self) -> bool:
        """Configured with somewhere to read watts (BamBuddy's
        `_reports_power`): a Tasmota always."""
        if self.plug_type == "homeassistant":
            return bool(self.info.get("ha_power_entity"))
        if self.plug_type == "mqtt":
            return bool(self.info.get("mqtt_power_topic") or self.info.get("mqtt_topic"))
        if self.plug_type == "rest":
            return bool(self.info.get("rest_power_path"))
        return True

    @property
    def main_rank(self) -> tuple[bool, bool, bool, bool, int]:
        """Best first, as BamBuddy picks a printer's own plug among those that
        power it (`_main_plug_rank`, #2830): one that switches, enabled,
        shown on the printer card, reporting power, then the lowest number."""
        return (self.kind != "switch", self.info.get("enabled") is False, not self.on_card, not self.reports_power, self.id)

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


def plug_device_name(printer_name: str, plug: Plug) -> str:
    """After its printer's BamBuddy name, so it sorts right under the
    printer (as its AMS units do), and what it is in brackets, as the
    printer's and the AMS units' models: a plug called "Exhaust fan" is a
    plug."""
    return f"{printer_name} {plug.name} (Smart Plug)"


def main_of(plugs: Iterable[Plug], printer_id: int | None) -> int | None:
    """The printer's own plug among `plugs`: BamBuddy's choice among the
    plugs that power it (`Plug.main_rank`); None where none does."""
    best = min((plug for plug in plugs if plug.printer_id == printer_id and plug.powers_printer), key=lambda plug: plug.main_rank, default=None)
    return best.id if best else None
