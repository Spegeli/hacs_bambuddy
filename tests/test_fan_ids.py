"""The X2D's auxiliary fans: fan 2 is its left one, fan 10 its right one
(Bambu Studio's N6.json), while 2.0.0-beta.2 called them auxiliary and left
auxiliary. The setup gives the IDs the integration made the names' form:
fan 10 first, then fan 2 into the ID it left -- never an ID the user chose,
never another model's."""
from __future__ import annotations

from types import SimpleNamespace

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.bambuddy.const import DOMAIN
from tests.conftest import X1C, as_model, make_entry, printer_serial, printer_uid, setup_integration


def _object_id(model: str, key: str) -> str:
    return f"{model.lower()}_{printer_serial(X1C).lower()}_{key}"


def _given(hass: HomeAssistant, entry_id: str, key: str, object_id: str) -> str:
    """An entity as an earlier version registered it."""
    entity = er.async_get(hass).async_get_or_create(
        "fan", DOMAIN, f"{entry_id}_p{printer_serial(X1C)}_{key}", config_entry=hass.config_entries.async_get_entry(entry_id), suggested_object_id=object_id
    )
    return entity.entity_id


def _at(hass: HomeAssistant, entry_id: str, key: str) -> str | None:
    return er.async_get(hass).async_get_entity_id("fan", DOMAIN, f"{entry_id}_p{printer_serial(X1C)}_{key}")


def _x2d(bambuddy_api: SimpleNamespace, model: str = "X2D") -> None:
    as_model(bambuddy_api, model)
    bambuddy_api.statuses[X1C]["left_aux_fan_speed"] = 0


async def test_the_x2d_fan_ids_move_to_their_sides(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    _x2d(bambuddy_api)
    entry = make_entry(hass, X1C)
    _given(hass, entry.entry_id, "left_aux_fan", _object_id("X2D", "left_auxiliary_fan"))
    _given(hass, entry.entry_id, "aux_fan", _object_id("X2D", "auxiliary_fan"))

    await setup_integration(hass, entry)

    assert _at(hass, entry.entry_id, "left_aux_fan") == f"fan.{_object_id('X2D', 'right_auxiliary_fan')}"
    assert _at(hass, entry.entry_id, "aux_fan") == f"fan.{_object_id('X2D', 'left_auxiliary_fan')}"
    assert hass.states.get(f"fan.{_object_id('X2D', 'right_auxiliary_fan')}") is not None


async def test_ids_with_home_assistants_suffix_move_too(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    _x2d(bambuddy_api)
    entry = make_entry(hass, X1C)
    _given(hass, entry.entry_id, "left_aux_fan", _object_id("X2D", "left_auxiliary_fan_2"))
    _given(hass, entry.entry_id, "aux_fan", _object_id("X2D", "auxiliary_fan_2"))

    await setup_integration(hass, entry)

    assert _at(hass, entry.entry_id, "left_aux_fan") == f"fan.{_object_id('X2D', 'right_auxiliary_fan')}"
    assert _at(hass, entry.entry_id, "aux_fan") == f"fan.{_object_id('X2D', 'left_auxiliary_fan')}"


async def test_a_new_install_is_left_alone(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Fan 2 at the left ID already is no old fan 10."""
    _x2d(bambuddy_api)
    entry = make_entry(hass, X1C)
    left = _given(hass, entry.entry_id, "aux_fan", _object_id("X2D", "left_auxiliary_fan"))
    right = _given(hass, entry.entry_id, "left_aux_fan", _object_id("X2D", "right_auxiliary_fan"))

    await setup_integration(hass, entry)

    assert (_at(hass, entry.entry_id, "aux_fan"), _at(hass, entry.entry_id, "left_aux_fan")) == (left, right)


async def test_user_chosen_fan_ids_and_the_p2s_stay(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    _x2d(bambuddy_api)
    entry = make_entry(hass, X1C)
    chosen = _given(hass, entry.entry_id, "left_aux_fan", "workshop_left")
    _given(hass, entry.entry_id, "aux_fan", _object_id("X2D", "auxiliary_fan"))

    await setup_integration(hass, entry)

    assert _at(hass, entry.entry_id, "left_aux_fan") == chosen
    # Its old place is not free: the user's fan 10 keeps the name it was given, fan 2 takes the next.
    assert _at(hass, entry.entry_id, "aux_fan") == f"fan.{_object_id('X2D', 'left_auxiliary_fan')}"


async def test_a_p2s_keeps_its_fan_ids(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The P2S's fan 10 is its left one: nothing moves."""
    _x2d(bambuddy_api, "P2S")
    entry = make_entry(hass, X1C)
    left = _given(hass, entry.entry_id, "left_aux_fan", _object_id("P2S", "left_auxiliary_fan"))
    aux = _given(hass, entry.entry_id, "aux_fan", _object_id("P2S", "auxiliary_fan"))

    await setup_integration(hass, entry)

    assert (_at(hass, entry.entry_id, "left_aux_fan"), _at(hass, entry.entry_id, "aux_fan")) == (left, aux)


async def test_the_swap_survives_restored_states(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """After Home Assistant started, every registered entity has a restored
    state; Home Assistant 2025.5 keeps it when the entity is renamed, and the
    ID fan 10 leaves would read as taken."""
    _x2d(bambuddy_api)
    entry = make_entry(hass, X1C)
    old_right = _given(hass, entry.entry_id, "left_aux_fan", _object_id("X2D", "left_auxiliary_fan"))
    old_left = _given(hass, entry.entry_id, "aux_fan", _object_id("X2D", "auxiliary_fan"))
    for entity in (old_right, old_left):
        hass.states.async_set(entity, "unavailable", {"restored": True})

    await setup_integration(hass, entry)

    assert _at(hass, entry.entry_id, "aux_fan") == f"fan.{_object_id('X2D', 'left_auxiliary_fan')}"
    assert _at(hass, entry.entry_id, "left_aux_fan") == f"fan.{_object_id('X2D', 'right_auxiliary_fan')}"


async def test_a_second_setup_changes_nothing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    _x2d(bambuddy_api)
    entry = make_entry(hass, X1C)
    _given(hass, entry.entry_id, "left_aux_fan", _object_id("X2D", "left_auxiliary_fan"))
    _given(hass, entry.entry_id, "aux_fan", _object_id("X2D", "auxiliary_fan"))
    await setup_integration(hass, entry)
    before = (_at(hass, entry.entry_id, "aux_fan"), _at(hass, entry.entry_id, "left_aux_fan"))

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert (_at(hass, entry.entry_id, "aux_fan"), _at(hass, entry.entry_id, "left_aux_fan")) == before
    assert printer_uid(entry, "aux_fan").endswith("_aux_fan")
