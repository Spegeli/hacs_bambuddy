"""The cover of the current job: fetched once per job, gone when idle."""
from __future__ import annotations

from http import HTTPStatus
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.bambuddy.api import BamBuddyApiError

from tests.conftest import A1_MINI, X1C, entity_id, make_entry, next_refresh, printer_uid, setup_integration


async def test_the_cover_of_the_running_job(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))
    client = await hass_client()

    for _ in range(2):
        response = await client.get(f"/api/image_proxy/{cover}")
        assert response.status == HTTPStatus.OK
        assert await response.read() == b"png"

    # Once per job: BamBuddy may have to fetch the job from the printer.
    bambuddy_api.get_cover.assert_awaited_once_with(X1C)


async def test_a_new_job_brings_a_new_cover(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    hass_client: ClientSessionGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))
    client = await hass_client()
    await client.get(f"/api/image_proxy/{cover}")
    before = hass.states.get(cover).state  # type: ignore[union-attr]

    bambuddy_api.statuses[X1C]["subtask_name"] = "Wall bracket"
    await next_refresh(hass, freezer)
    await client.get(f"/api/image_proxy/{cover}")

    assert hass.states.get(cover).state != before  # type: ignore[union-attr]
    assert bambuddy_api.get_cover.await_count == 2


async def test_no_cover_while_idle(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

    assert hass.states.get(entity_id(hass, "image", printer_uid(entry, "cover", A1_MINI))).state == STATE_UNAVAILABLE  # type: ignore[union-attr]


async def test_a_cover_bambuddy_cannot_find(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """A job stored where BamBuddy cannot read it has no cover."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_cover.side_effect = BamBuddyApiError(404, "No thumbnail found in 3MF file")
    client = await hass_client()

    response = await client.get(f"/api/image_proxy/{entity_id(hass, 'image', printer_uid(entry, 'cover'))}")

    assert response.status != HTTPStatus.OK


async def test_a_missing_cover_is_not_asked_for_again(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """BamBuddy may download the job from the printer for each try: once
    per job is enough."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_cover.side_effect = BamBuddyApiError(404, "No thumbnail found in 3MF file")
    client = await hass_client()
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))

    await client.get(f"/api/image_proxy/{cover}")
    await client.get(f"/api/image_proxy/{cover}")

    bambuddy_api.get_cover.assert_awaited_once()
