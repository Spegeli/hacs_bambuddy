"""Ventilating the chamber: the fan entity „Lüftung“ sets the airduct to
cooling and runs the fans that bring the air through, per family -- the H2
series' exhaust fan, the X2D's right auxiliary and exhaust fans, the P2S's
auxiliary fan and, with the kit, its exhaust fan -- and what does not go
together with heating the chamber locks the other."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError

from custom_components.bambuddy import fan as fan_module
from tests.conftest import X1C, as_model, entity_id, printer_uid, set_up, state_at

_FANS = ("cooling_fan_speed", "big_fan1_speed", "big_fan2_speed", "heatbreak_fan_speed")
_HEATER = {"H2D": True, "H2S": True, "H2C": True, "H2D Pro": True, "X2D": True, "P2S": False}


@pytest.fixture(autouse=True)
def short_waits(monkeypatch: pytest.MonkeyPatch) -> None:
    """The wait for the airduct's report, in hundredths."""
    monkeypatch.setattr(fan_module, "VENT_MODE_POLL", 0.01)
    monkeypatch.setattr(fan_module, "VENT_MODE_WAIT", 0.05)


def vent_state(bambuddy_api: SimpleNamespace, model: str, **status: Any) -> dict[str, Any]:
    """The X1C's place as `model`, idle, in cooling, every fan off, the
    chamber off; then the case's own values."""
    as_model(bambuddy_api, model)
    state = bambuddy_api.statuses[X1C]
    state.update({field: 0 for field in _FANS})
    state.update(
        {
            "state": "IDLE",
            "airduct_mode": 0,
            "ams_status_main": 0,
            "supports_chamber_heater": _HEATER[model],
            "left_aux_fan_speed": 0 if model == "X2D" else None,
            "exhaust_fan_present": False,
        }
    )
    state["temperatures"] = {**(state.get("temperatures") or {}), "chamber_target": 0}
    if "chamber_target" in status:
        state["temperatures"]["chamber_target"] = status.pop("chamber_target")
    state.update(status)
    return state


async def _ventilation(hass: HomeAssistant) -> str:
    entry = await set_up(hass, X1C)
    return entity_id(hass, "fan", printer_uid(entry, "ventilation"))


async def _call(hass: HomeAssistant, service: str, entity: str, **data: Any) -> None:
    await hass.services.async_call("fan", service, {"entity_id": entity, **data}, blocking=True)


@pytest.mark.parametrize(
    ("model", "status", "fans", "sent"),
    [
        ("H2D", {}, ["exhaust"], ["chamber"]),
        ("H2S", {}, ["exhaust"], ["chamber"]),
        ("X2D", {}, ["right_aux", "exhaust"], ["aux2", "chamber"]),
        ("P2S", {}, ["aux"], ["aux"]),
        ("P2S", {"exhaust_fan_present": True}, ["aux", "exhaust"], ["aux", "chamber"]),
    ],
)
async def test_each_family_ventilates_with_its_fans(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, model: str, status: dict[str, Any], fans: list[str], sent: list[str]
) -> None:
    vent_state(bambuddy_api, model, **status)
    entity = await _ventilation(hass)

    assert state_at(hass, entity).attributes["fans"] == fans
    await _call(hass, "turn_on", entity)

    assert [call.args for call in bambuddy_api.set_fan_speed.await_args_list] == [(X1C, fan, 60) for fan in sent]
    bambuddy_api.set_airduct_mode.assert_not_awaited()


async def test_no_ventilation_without_an_airduct(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    assert hass.states.async_entity_ids("fan") and not [e for e in hass.states.async_entity_ids("fan") if e.endswith("_ventilation")]
    assert printer_uid(entry, "ventilation")


async def test_ventilation_switches_to_cooling_first(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Heating mode does not let the H2's exhaust fan be set: cooling first,
    the fans once the printer reports it."""
    status = vent_state(bambuddy_api, "H2D", airduct_mode=1)
    entry = await set_up(hass, X1C)
    entity = entity_id(hass, "fan", printer_uid(entry, "ventilation"))
    order: list[str] = []

    async def airduct(printer_id: int, mode: str) -> None:
        order.append(f"airduct {mode}")
        status["airduct_mode"] = 0

    async def fan(printer_id: int, which: str, speed: int) -> None:
        # What the integration had read from BamBuddy when it sent the fan.
        seen = entry.runtime_data.printers[X1C].data.status["airduct_mode"]
        order.append(f"fan {which} {speed} seen as {seen}")

    bambuddy_api.set_airduct_mode.side_effect = airduct
    bambuddy_api.set_fan_speed.side_effect = fan
    await _call(hass, "turn_on", entity)

    assert order == ["airduct cooling", "fan chamber 60 seen as 0"]


async def test_ventilation_sends_the_fans_when_cooling_is_not_reported_in_time(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    vent_state(bambuddy_api, "H2D", airduct_mode=1)
    entity = await _ventilation(hass)
    order: list[str] = []
    reads = bambuddy_api.get_status.side_effect

    def read(printer_id: int) -> object:
        order.append("read")
        return reads(printer_id)

    async def airduct(printer_id: int, mode: str) -> None:
        order.append("airduct")

    async def fan(printer_id: int, which: str, speed: int) -> None:
        order.append("fan")

    bambuddy_api.get_status.side_effect = read
    bambuddy_api.set_airduct_mode.side_effect = airduct
    bambuddy_api.set_fan_speed.side_effect = fan
    await _call(hass, "turn_on", entity)

    # It read the status while it waited, then sent the fans all the same.
    between = order[order.index("airduct") + 1 : order.index("fan")]
    assert len(between) >= 2 and set(between) == {"read"}
    bambuddy_api.set_airduct_mode.assert_awaited_once_with(X1C, "cooling")
    bambuddy_api.set_fan_speed.assert_awaited_once_with(X1C, "chamber", 60)


async def test_an_x2d_ventilates_with_the_exhaust_fan_until_its_right_fan_is_reported(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy refuses fan 10 until the printer's first full airduct report."""
    vent_state(bambuddy_api, "X2D", left_aux_fan_speed=None)
    entity = await _ventilation(hass)

    assert state_at(hass, entity).attributes["fans"] == ["exhaust"]
    await _call(hass, "turn_on", entity)
    bambuddy_api.set_fan_speed.assert_awaited_once_with(X1C, "chamber", 60)


@pytest.mark.parametrize(
    ("model", "status", "shown"),
    [
        ("H2D", {"big_fan2_speed": 47}, ("on", 50)),
        ("H2D", {"big_fan2_speed": 47, "airduct_mode": 1}, ("off", 0)),
        ("H2D", {}, ("off", 0)),
        ("X2D", {"left_aux_fan_speed": 3}, ("off", 0)),
        ("X2D", {"left_aux_fan_speed": 30, "big_fan2_speed": 53}, ("on", 50)),
    ],
)
async def test_ventilation_state_follows_the_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, model: str, status: dict[str, Any], shown: tuple[str, int]
) -> None:
    vent_state(bambuddy_api, model, **status)
    entity = await _ventilation(hass)

    state = state_at(hass, entity)
    assert (state.state, state.attributes["percentage"], state.attributes["percentage_step"]) == (*shown, 10.0)


@pytest.mark.parametrize(("service", "data", "sent"), [("set_percentage", {"percentage": 47}, 50), ("set_percentage", {"percentage": 4}, 0), ("turn_on", {"percentage": 0}, 0)])
async def test_ventilation_rounds_what_it_is_given(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, service: str, data: dict[str, Any], sent: int
) -> None:
    vent_state(bambuddy_api, "X2D")
    entity = await _ventilation(hass)

    await _call(hass, service, entity, **data)

    assert [call.args for call in bambuddy_api.set_fan_speed.await_args_list] == [(X1C, "aux2", sent), (X1C, "chamber", sent)]


@pytest.mark.parametrize("status", [{"big_fan2_speed": 60}, {"state": "RUNNING", "big_fan2_speed": 30}])
async def test_turning_ventilation_off_stops_its_fans(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, status: dict[str, Any]
) -> None:
    """Off is always there in cooling mode: in a print too."""
    vent_state(bambuddy_api, "H2D", **status)
    entity = await _ventilation(hass)

    await _call(hass, "turn_off", entity)

    bambuddy_api.set_fan_speed.assert_awaited_once_with(X1C, "chamber", 0)
    bambuddy_api.set_airduct_mode.assert_not_awaited()


@pytest.mark.parametrize(
    ("model", "status"),
    [
        # The X2D's right fan filters the chamber in heating mode, the P2S's fan
        # circulates its air through the filter, the H2's exhaust fan draws off
        # the laser's fumes in laser mode.
        ("X2D", {"state": "RUNNING", "airduct_mode": 1, "left_aux_fan_speed": 40}),
        ("P2S", {"airduct_mode": 1, "big_fan1_speed": 60}),
        ("H2D", {"state": "RUNNING", "airduct_mode": 2, "big_fan2_speed": 80}),
        # A mode BamBuddy did not report: nothing is known to be ventilating.
        ("H2D", {"airduct_mode": None, "big_fan2_speed": 60}),
    ],
)
async def test_turning_ventilation_off_leaves_the_fans_of_another_mode(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, model: str, status: dict[str, Any]
) -> None:
    """Outside cooling mode the ventilation is off already, and its fans do
    other work: off sends nothing, and goes through."""
    vent_state(bambuddy_api, model, **status)
    entity = await _ventilation(hass)

    await _call(hass, "turn_off", entity)

    bambuddy_api.set_fan_speed.assert_not_awaited()
    bambuddy_api.set_airduct_mode.assert_not_awaited()


@pytest.mark.parametrize(
    ("model", "status", "refusal"),
    [
        ("H2D", {"chamber_target": 50, "airduct_mode": 1}, "chamber_heating"),
        ("P2S", {"airduct_mode": 1}, "keep_warm_on"),
        ("H2D", {"state": "RUNNING", "airduct_mode": 1}, "ventilation_heating_print"),
        ("H2D", {"state": "PAUSE", "airduct_mode": 1}, "ventilation_heating_print"),
        ("H2D", {"state": "RUNNING", "airduct_mode": 2}, "not_now"),
        ("H2D", {"airduct_mode": 1, "ams_status_main": 1}, "filament_change"),
    ],
)
async def test_ventilation_waits_where_it_does_not_go(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, model: str, status: dict[str, Any], refusal: str
) -> None:
    vent_state(bambuddy_api, model, **status)
    entity = await _ventilation(hass)

    with pytest.raises(ServiceValidationError) as raised:
        await _call(hass, "turn_on", entity)

    assert raised.value.translation_key == refusal
    bambuddy_api.set_fan_speed.assert_not_awaited()
    bambuddy_api.set_airduct_mode.assert_not_awaited()


@pytest.mark.parametrize(
    ("status", "mode_call"),
    [
        # A cooling print: the speed only.
        ({"state": "RUNNING"}, False),
        # The laser mode without a job: cooling, then the fans.
        ({"airduct_mode": 2}, True),
        # A filament change in cooling: no mode change needed.
        ({"ams_status_main": 1}, False),
    ],
)
async def test_ventilation_goes_where_it_may(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, status: dict[str, Any], mode_call: bool
) -> None:
    vent_state(bambuddy_api, "H2D", **status)
    entity = await _ventilation(hass)

    await _call(hass, "set_percentage", entity, percentage=30)

    bambuddy_api.set_fan_speed.assert_awaited_once_with(X1C, "chamber", 30)
    assert bambuddy_api.set_airduct_mode.await_count == int(mode_call)


async def _chamber(hass: HomeAssistant) -> str:
    entry = await set_up(hass, X1C)
    return entity_id(hass, "number", printer_uid(entry, "chamber_target"))


async def _set_chamber(hass: HomeAssistant, entity: str, value: float) -> None:
    await hass.services.async_call("number", "set_value", {"entity_id": entity, "value": value}, blocking=True)


def _record(bambuddy_api: SimpleNamespace) -> list[str]:
    """The order of the airduct and chamber commands."""
    order: list[str] = []

    async def airduct(printer_id: int, mode: str) -> None:
        order.append(f"airduct {mode}")

    async def chamber(printer_id: int, target: int) -> None:
        order.append(f"chamber {target}")

    bambuddy_api.set_airduct_mode.side_effect = airduct
    bambuddy_api.set_chamber_temperature.side_effect = chamber
    return order


@pytest.mark.parametrize(
    ("status", "value", "sent"),
    [
        ({}, 40, ["airduct heating", "chamber 40"]),
        ({"airduct_mode": 1}, 40, ["chamber 40"]),
        ({}, 0, ["chamber 0"]),
        # A print in heating mode, and the laser mode in a job: the mode stays.
        ({"state": "RUNNING", "airduct_mode": 1}, 50, ["chamber 50"]),
        ({"state": "RUNNING", "airduct_mode": 2}, 50, ["chamber 50"]),
        # A filament change in heating mode: the target alone.
        ({"airduct_mode": 1, "ams_status_main": 1}, 40, ["chamber 40"]),
    ],
)
async def test_a_chamber_target_sets_the_airduct_to_heating_first(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, status: dict[str, Any], value: int, sent: list[str]
) -> None:
    """As Bambu's start G-code: heating mode, then the target."""
    vent_state(bambuddy_api, "H2D", **status)
    entity = await _chamber(hass)
    order = _record(bambuddy_api)

    await _set_chamber(hass, entity, value)

    assert order == sent


@pytest.mark.parametrize(
    ("status", "refusal"),
    [
        ({"big_fan2_speed": 60}, "ventilation_on"),
        ({"state": "RUNNING"}, "chamber_cooling_print"),
        ({"state": "RUNNING", "big_fan2_speed": 30}, "chamber_cooling_print"),
        ({"ams_status_main": 1}, "filament_change"),
    ],
)
async def test_a_chamber_target_waits_where_it_does_not_go(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, status: dict[str, Any], refusal: str
) -> None:
    """While the chamber is ventilated, and in a print or a filament change in
    cooling mode (Bambu Studio: no chamber temperature in cooling mode while
    printing). 0 always goes."""
    vent_state(bambuddy_api, "H2D", **status)
    entity = await _chamber(hass)
    order = _record(bambuddy_api)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_chamber(hass, entity, 40)
    assert raised.value.translation_key == refusal
    assert order == []

    await _set_chamber(hass, entity, 0)
    assert order == ["chamber 0"]


async def _airduct(hass: HomeAssistant) -> str:
    entry = await set_up(hass, X1C)
    return entity_id(hass, "select", printer_uid(entry, "airduct_mode"))


async def test_keep_warm_waits_on_the_ventilation(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The P2S keeps its chamber warm in heating mode: not while it is ventilated."""
    vent_state(bambuddy_api, "P2S", big_fan1_speed=60)
    entity = await _airduct(hass)

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call("select", "select_option", {"entity_id": entity, "option": "heating"}, blocking=True)

    assert raised.value.translation_key == "ventilation_on"
    bambuddy_api.set_airduct_mode.assert_not_awaited()


async def test_keep_warm_goes_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Keeping warm is the airduct on heating; off is cooling, though the
    ventilation counts keeping warm as a heated chamber."""
    vent_state(bambuddy_api, "P2S", airduct_mode=1)
    entity = await _airduct(hass)

    await hass.services.async_call("select", "select_option", {"entity_id": entity, "option": "cooling"}, blocking=True)

    bambuddy_api.set_airduct_mode.assert_awaited_once_with(X1C, "cooling")
