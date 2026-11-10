"""The chamber's locks on what was just sent: the printer's report follows
seconds later, and until then what BamBuddy took counts."""
from __future__ import annotations

from typing import Any

from homeassistant.exceptions import ServiceValidationError
import pytest

from custom_components.bambuddy.chamber import airduct_check, may_heat_chamber, may_ventilate
from custom_components.bambuddy.models import SENT_HOLD, ChamberSent, PrinterData

COOLING, HEATING, LASER = 0, 1, 2
IDLE = {"connected": True, "state": "IDLE", "ams_status_main": 0}
PRINTING = {**IDLE, "state": "RUNNING"}
CHANGING = {**IDLE, "ams_status_main": 1}


def _data(status: dict[str, Any], airduct: int) -> PrinterData:
    return PrinterData(info={"model": "H2D"}, status={**status, "airduct_mode": airduct, "supports_chamber_heater": True})


def _sent(**values: Any) -> ChamberSent:
    sent = ChamberSent(lambda: 0.0)
    sent.note(**values)
    return sent


def test_a_value_counts_for_the_hold_and_no_longer() -> None:
    clock = [0.0]
    sent = ChamberSent(lambda: clock[0])
    assert sent.get("target", 50) == 50

    sent.note(target=0)
    clock[0] = SENT_HOLD - 0.1
    assert sent.get("target", 50) == 0
    clock[0] = SENT_HOLD
    assert sent.get("target", 50) == 50


@pytest.mark.parametrize(
    ("status", "reported", "held", "refusal"),
    [
        (PRINTING, COOLING, "heating", "ventilation_heating_print"),
        (PRINTING, COOLING, "laser", "not_now"),
        (CHANGING, COOLING, "heating", "filament_change"),
    ],
)
def test_ventilation_waits_on_the_mode_just_sent(status: dict[str, Any], reported: int, held: str, refusal: str) -> None:
    with pytest.raises(ServiceValidationError) as raised:
        may_ventilate(_data(status, reported), "Lab", _sent(airduct=held))

    assert raised.value.translation_key == refusal
    assert raised.value.translation_placeholders == {"printer": "Lab"}


def test_ventilation_goes_on_the_mode_just_sent() -> None:
    may_ventilate(_data(PRINTING, HEATING), "Lab", _sent(airduct="cooling"))
    may_ventilate(_data(CHANGING, LASER), "Lab", _sent(airduct="cooling"))


@pytest.mark.parametrize(
    ("status", "refusal"),
    [(PRINTING, "chamber_cooling_print"), (CHANGING, "filament_change")],
)
def test_a_target_waits_on_the_cooling_just_sent(status: dict[str, Any], refusal: str) -> None:
    with pytest.raises(ServiceValidationError) as raised:
        may_heat_chamber(_data(status, HEATING), "Lab", _sent(airduct="cooling"))

    assert raised.value.translation_key == refusal
    assert raised.value.translation_placeholders == {"printer": "Lab"}


def test_a_target_goes_on_the_heating_just_sent() -> None:
    may_heat_chamber(_data(PRINTING, COOLING), "Lab", _sent(airduct="heating"))
    may_heat_chamber(_data(CHANGING, COOLING), "Lab", _sent(airduct="heating"))


def test_heating_mode_waits_on_a_ventilation_just_started() -> None:
    with pytest.raises(ServiceValidationError) as raised:
        airduct_check(_data(IDLE, COOLING), "heating", _sent(ventilating=True))

    assert raised.value.translation_key == "ventilation_on"
