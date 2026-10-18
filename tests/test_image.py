"""The cover of the current job: fetched once per job, kept after the job
ended, gone when idle."""
from __future__ import annotations

from http import HTTPStatus
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyConnectionError

from tests.conftest import A1_MINI, X1C, entity_id, next_refresh, printer_uid, set_up, state_of


async def test_the_cover_of_the_running_job(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    entry = await set_up(hass, X1C)
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
    entry = await set_up(hass, X1C)
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))
    client = await hass_client()
    await client.get(f"/api/image_proxy/{cover}")
    before = hass.states.get(cover).state  # type: ignore[union-attr]

    bambuddy_api.statuses[X1C]["subtask_name"] = "Wall bracket"
    await next_refresh(hass, freezer)
    await client.get(f"/api/image_proxy/{cover}")

    assert hass.states.get(cover).state != before  # type: ignore[union-attr]
    assert bambuddy_api.get_cover.await_count == 2


@pytest.mark.parametrize("ended", ["FINISH", "FAILED"])
async def test_the_cover_stays_after_the_job(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    hass_client: ClientSessionGenerator,
    freezer: FrozenDateTimeFactory,
    ended: str,
) -> None:
    """BamBuddy names a cover only while the job runs, but its cover route
    serves the job until the next one: the picture shows what is on the
    plate, without a second fetch."""
    entry = await set_up(hass, X1C)
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))
    client = await hass_client()
    await client.get(f"/api/image_proxy/{cover}")

    bambuddy_api.statuses[X1C].update({"state": ended, "cover_url": None})
    await next_refresh(hass, freezer)
    response = await client.get(f"/api/image_proxy/{cover}")

    assert response.status == HTTPStatus.OK
    bambuddy_api.get_cover.assert_awaited_once_with(X1C)

    bambuddy_api.statuses[X1C]["state"] = "IDLE"
    await next_refresh(hass, freezer)

    assert hass.states.get(cover).state == STATE_UNAVAILABLE  # type: ignore[union-attr]


async def test_a_finished_job_at_setup_has_its_cover(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """Home Assistant restarted after the print: BamBuddy still has its cover."""
    bambuddy_api.statuses[X1C].update({"state": "FINISH", "cover_url": None})
    entry = await set_up(hass, X1C)
    client = await hass_client()

    response = await client.get(f"/api/image_proxy/{entity_id(hass, 'image', printer_uid(entry, 'cover'))}")

    assert response.status == HTTPStatus.OK


async def test_no_cover_while_idle(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    # No picture to ask for: the frontend shows the icon, not an error.
    assert "entity_picture" not in state_of(hass, "image", printer_uid(entry, "cover", A1_MINI)).attributes

    assert hass.states.get(entity_id(hass, "image", printer_uid(entry, "cover", A1_MINI))).state == STATE_UNAVAILABLE  # type: ignore[union-attr]


async def test_a_cover_bambuddy_cannot_find(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """A job stored where BamBuddy cannot read it has no cover."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_cover.side_effect = BamBuddyApiError(404, "No thumbnail found in 3MF file")
    client = await hass_client()

    response = await client.get(f"/api/image_proxy/{entity_id(hass, 'image', printer_uid(entry, 'cover'))}")

    assert response.status != HTTPStatus.OK


async def test_a_missing_cover_is_not_asked_for_again(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """BamBuddy may download the job from the printer for each try: once
    per job is enough."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_cover.side_effect = BamBuddyApiError(404, "No thumbnail found in 3MF file")
    client = await hass_client()
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))

    await client.get(f"/api/image_proxy/{cover}")
    await client.get(f"/api/image_proxy/{cover}")

    bambuddy_api.get_cover.assert_awaited_once()


async def test_a_cover_that_failed_comes_later(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    hass_client: ClientSessionGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """A timeout is no answer: BamBuddy may need minutes to fetch the job
    from a busy printer. The cover is asked for again a minute later, then
    less often; in between, not at all."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_cover.side_effect = BamBuddyConnectionError("timeout")
    client = await hass_client()
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))

    assert (await client.get(f"/api/image_proxy/{cover}")).status != HTTPStatus.OK
    await client.get(f"/api/image_proxy/{cover}")
    assert bambuddy_api.get_cover.await_count == 1
    before = hass.states.get(cover).state  # type: ignore[union-attr]

    # A minute later the entity says it has a new picture: the frontend asks.
    for _ in range(6):
        await next_refresh(hass, freezer)
    assert hass.states.get(cover).state != before  # type: ignore[union-attr]
    assert (await client.get(f"/api/image_proxy/{cover}")).status != HTTPStatus.OK
    assert bambuddy_api.get_cover.await_count == 2

    # The next try waits two minutes; then BamBuddy has it.
    bambuddy_api.get_cover.side_effect = None
    for _ in range(6):
        await next_refresh(hass, freezer)
    await client.get(f"/api/image_proxy/{cover}")
    assert bambuddy_api.get_cover.await_count == 2
    for _ in range(6):
        await next_refresh(hass, freezer)
    response = await client.get(f"/api/image_proxy/{cover}")
    assert response.status == HTTPStatus.OK
    assert await response.read() == b"png"
    assert bambuddy_api.get_cover.await_count == 3


async def test_the_next_plate_of_the_same_project_brings_its_cover(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    hass_client: ClientSessionGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Plate 2 of a project carries plate 1's job name: a job that left
    FINISH is over for the picture, even when no poll saw the next one
    prepare."""
    bambuddy_api.get_cover.side_effect = [b"plate1", b"plate2"]
    entry = await set_up(hass, X1C)
    cover = entity_id(hass, "image", printer_uid(entry, "cover"))
    client = await hass_client()
    assert await (await client.get(f"/api/image_proxy/{cover}")).read() == b"plate1"

    bambuddy_api.statuses[X1C].update({"state": "FINISH", "cover_url": None})
    await next_refresh(hass, freezer)
    bambuddy_api.statuses[X1C].update(
        {"state": "RUNNING", "cover_url": "/api/v1/printers/1/cover", "gcode_file": "/data/Metadata/plate_2.gcode"}
    )
    await next_refresh(hass, freezer)

    assert await (await client.get(f"/api/image_proxy/{cover}")).read() == b"plate2"
    assert bambuddy_api.get_cover.await_count == 2
