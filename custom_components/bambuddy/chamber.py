"""The chamber's three locks side by side: ventilating, a chamber target and
the airduct's mode each wait on what the others do, what was just sent
counted as done (`ChamberSent`)."""
from __future__ import annotations

from .entity import refuse
from .models import ChamberSent, PrinterData, chamber_heats, chamber_target_set, ventilating


def may_ventilate(data: PrinterData, name: str, sent: ChamberSent) -> None:
    """Ventilating needs cooling mode, which a print or a filament change
    keeps as they set it, and goes not with a heated chamber."""
    mode = sent.get("airduct", data.airduct)
    if data.job_running:
        if mode == "heating":
            raise refuse("ventilation_heating_print", printer=name)
        if mode == "laser":
            raise refuse("not_now", printer=name)
    elif chamber_heats(data, sent):
        if data.has_chamber_heater():
            raise refuse("chamber_heating")
        raise refuse("keep_warm_on")
    if data.changing_filament and mode != "cooling":
        raise refuse("filament_change", printer=name)


def may_heat_chamber(data: PrinterData, name: str, sent: ChamberSent) -> None:
    """A chamber target waits while the chamber is ventilated, and goes not
    into a print or a filament change in cooling mode (Bambu Studio: "Chamber
    temperature cannot be changed in cooling mode while printing")."""
    cooling = sent.get("airduct", data.airduct) == "cooling"
    if data.job_running:
        if cooling:
            raise refuse("chamber_cooling_print", printer=name)
    elif data.changing_filament:
        if cooling:
            raise refuse("filament_change", printer=name)
    elif ventilating(data, sent):
        raise refuse("ventilation_on")


def airduct_check(data: PrinterData, mode: str, sent: ChamberSent) -> None:
    """Cooling beside a heating chamber is a state Bambu describes nowhere:
    the chamber goes off first. Heating (on the P2S: keeping the chamber
    warm) waits while the chamber is ventilated."""
    # The chamber heater has a target: the printer keeps the airduct on heating
    # (Bambu: "When the chamber is heated, the system will automatically switch
    # to the heating mode").
    if mode == "cooling" and chamber_target_set(data, sent):
        raise refuse("chamber_heating")
    if mode == "heating" and ventilating(data, sent):
        raise refuse("ventilation_on")
