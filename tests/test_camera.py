"""The camera: snapshots and the live stream through BamBuddy's camera
proxy, with a camera token fetched from BamBuddy."""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import timedelta
from http import HTTPStatus
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import aiohttp

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.camera import DATA_COMPONENT
import pytest
from homeassistant.components.camera import async_get_image
from homeassistant.const import STATE_UNAVAILABLE, EntityCategory
from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import entity_registry as er
from homeassistant.exceptions import HomeAssistantError
from pytest_homeassistant_custom_component.common import MockConfigEntry, mock_restore_cache
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.bambuddy import camera as camera_module
from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyAuthError, BamBuddyClient, BamBuddyConnectionError

from tests.conftest import (
    A1_MINI,
    P1S,
    STREAM_TOKEN,
    URL,
    X1C,
    X1E,
    entity_id,
    load_fixture,
    make_entry,
    next_refresh,
    no_entity,
    printer_serial,
    printer_uid,
    set_up,
    setup_integration,
    state_at,
    state_of,
)


async def _camera(hass: HomeAssistant, entry: MockConfigEntry) -> str:
    await setup_integration(hass, entry)
    return entity_id(hass, "camera", printer_uid(entry, "camera"))


async def test_a_snapshot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))

    image = await async_get_image(hass, camera)

    assert image.content == b"jpeg"
    bambuddy_api.get_snapshot.assert_awaited_once_with(X1C, STREAM_TOKEN)


async def test_the_token_is_kept_and_renewed(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's tokens last an hour: one per 55 minutes."""
    camera = await _camera(hass, make_entry(hass, X1C))

    await async_get_image(hass, camera)
    freezer.tick(timedelta(minutes=54))
    await async_get_image(hass, camera)
    assert bambuddy_api.get_stream_token.await_count == 1

    freezer.tick(timedelta(minutes=2))
    await async_get_image(hass, camera)
    assert bambuddy_api.get_stream_token.await_count == 2


async def test_a_refused_token_is_renewed_at_once(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy restarted and forgot its tokens."""
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_snapshot.side_effect = [BamBuddyAuthError(401, "Valid camera stream token required"), b"jpeg"]

    image = await async_get_image(hass, camera)

    assert image.content == b"jpeg"
    assert bambuddy_api.get_stream_token.await_count == 2


async def test_no_picture_without_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_snapshot.side_effect = BamBuddyConnectionError("refused")

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, camera)


async def test_the_stream_is_proxied(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    aioclient_mock.get(
        f"{URL}/api/v1/printers/{X1C}/camera/stream?fps=30&token={STREAM_TOKEN}",
        content=b"--frame\r\nContent-Type: image/jpeg\r\n\r\njpeg\r\n",
        headers={"Content-Type": "multipart/x-mixed-replace;boundary=frame"},
    )
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.OK
    assert b"jpeg" in await response.read()


async def test_no_stream_without_a_token(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_stream_token.side_effect = BamBuddyConnectionError("refused")
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.BAD_GATEWAY


async def test_a_refused_stream_token_is_renewed(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
) -> None:
    """BamBuddy forgot the token (a restart, a restored database): the
    stream asks for a new one instead of failing for the rest of the hour."""
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_stream_token.side_effect = ["old-token", "new-token"]
    stream = f"{URL}/api/v1/printers/{X1C}/camera/stream"
    aioclient_mock.get(f"{stream}?fps=30&token=old-token", status=401, json={"detail": "Valid camera stream token required"})
    aioclient_mock.get(
        f"{stream}?fps=30&token=new-token",
        content=b"--frame\r\nContent-Type: image/jpeg\r\n\r\njpeg\r\n",
        headers={"Content-Type": "multipart/x-mixed-replace;boundary=frame"},
    )
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.OK
    assert b"jpeg" in await response.read()


async def test_a_stream_bambuddy_refuses_is_no_stream(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    aioclient_mock.get(f"{URL}/api/v1/printers/{X1C}/camera/stream", status=503, json={"detail": "busy"})
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.BAD_GATEWAY


async def test_a_failed_stream_keeps_its_token_out_of_the_log(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """aiohttp names the request's whole address in some errors (a redirect
    loop behind a proxy, a bad address), and the token is part of it."""
    camera = await _camera(hass, make_entry(hass, X1C))
    stream = f"{URL}/api/v1/printers/{X1C}/camera/stream?fps=30&token={STREAM_TOKEN}"
    aioclient_mock.get(stream, exc=aiohttp.InvalidURL(stream))
    client = await hass_client()
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy")

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.BAD_GATEWAY
    assert "No camera stream" in caplog.text
    assert STREAM_TOKEN not in caplog.text


async def test_no_picture_while_the_printer_is_offline(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The frontend would ask for a picture and get an error: it shows the
    icon instead."""
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    entry = await set_up(hass, X1C)

    state = state_of(hass, "camera", printer_uid(entry, "camera"))

    assert state.state == STATE_UNAVAILABLE
    assert "entity_picture" not in state.attributes


# --- The frame rate -------------------------------------------------------------

_FRAME = b"--frame\r\nContent-Type: image/jpeg\r\n\r\njpeg\r\n"
_MJPEG = {"Content-Type": "multipart/x-mixed-replace;boundary=frame"}
_EXTERNAL = {"external_camera_enabled": True, "external_camera_url": "http://camera.local/stream"}


def _with_info(bambuddy_api: SimpleNamespace, printer_id: int, **info: object) -> None:
    """BamBuddy lists the printer with these fields."""
    printers = load_fixture("printers.json")
    for printer in printers:
        if printer["id"] == printer_id:
            printer.update(info)
    bambuddy_api.get_printers.return_value = printers


def _stream(aioclient_mock: AiohttpClientMocker, printer_id: int, fps: int) -> None:
    aioclient_mock.get(
        f"{URL}/api/v1/printers/{printer_id}/camera/stream?fps={fps}&token={STREAM_TOKEN}", content=_FRAME, headers=_MJPEG
    )


async def _watch(hass_client: ClientSessionGenerator, camera: str) -> None:
    client = await hass_client()
    response = await client.get(f"/api/camera_proxy_stream/{camera}")
    assert response.status == HTTPStatus.OK
    assert b"jpeg" in await response.read()


async def _set_rate(hass: HomeAssistant, entry: MockConfigEntry, fps: int, printer_id: int = X1C) -> None:
    await hass.services.async_call(
        "number",
        "set_value",
        {"entity_id": entity_id(hass, "number", printer_uid(entry, "camera_fps", printer_id)), "value": fps},
        blocking=True,
    )


async def test_a_camera_that_can_do_more_streams_at_its_most(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, aioclient_mock: AiohttpClientMocker, hass_client: ClientSessionGenerator
) -> None:
    """A printer whose camera does more than 5 frames a second
    streams at its most unless the user chooses less; the A1 and P1 series
    stay at 5."""
    entry = await set_up(hass, X1C, A1_MINI)
    _stream(aioclient_mock, X1C, 30)
    _stream(aioclient_mock, A1_MINI, 5)

    await _watch(hass_client, entity_id(hass, "camera", printer_uid(entry, "camera")))
    await _watch(hass_client, entity_id(hass, "camera", printer_uid(entry, "camera", A1_MINI)))

    assert state_of(hass, "camera", printer_uid(entry, "camera")).attributes["frame_rate"] == 30
    assert state_of(hass, "camera", printer_uid(entry, "camera", A1_MINI)).attributes["frame_rate"] == 5
    bambuddy_api.stop_camera.assert_not_awaited()


async def test_the_frame_rate_setting(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """From 5 to the camera's most in steps of 5, a setting of
    Home Assistant's: the key needs no right to control, and it stays while
    the printer is offline. None for a camera that does only 5."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = await set_up(hass, X1C, A1_MINI, P1S, X1E)

    state = state_of(hass, "number", printer_uid(entry, "camera_fps"))
    assert state.state == "30"
    assert state.attributes["min"] == 5
    assert state.attributes["max"] == 30
    assert state.attributes["step"] == 5
    assert state.attributes["unit_of_measurement"] == "fps"
    # A box: the device page shows its figure (a slider row shows none).
    assert state.attributes["mode"] == "box"
    registry = er.async_get(hass)
    entity = registry.async_get(entity_id(hass, "number", printer_uid(entry, "camera_fps")))
    assert entity is not None
    assert entity.entity_category is EntityCategory.CONFIG
    assert entity.entity_id == f"number.x1c_{printer_serial(X1C).lower()}_camera_frame_rate"
    # The X1E has never been online.
    assert state_of(hass, "number", printer_uid(entry, "camera_fps", X1E)).state == "30"
    for printer_id in (A1_MINI, P1S):
        assert registry.async_get_entity_id("number", "bambuddy", printer_uid(entry, "camera_fps", printer_id)) is None


async def test_an_external_camera_goes_up_to_15(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy caps a camera it takes from elsewhere at 15: an A1 mini with
    one gets the setting too."""
    _with_info(bambuddy_api, A1_MINI, **_EXTERNAL)
    entry = await set_up(hass, A1_MINI)

    state = state_of(hass, "number", printer_uid(entry, "camera_fps", A1_MINI))
    assert (state.state, state.attributes["max"]) == ("15", 15)
    assert state_of(hass, "camera", printer_uid(entry, "camera", A1_MINI)).attributes["frame_rate"] == 15


async def test_a_new_frame_rate_reaches_the_next_stream(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, aioclient_mock: AiohttpClientMocker, hass_client: ClientSessionGenerator
) -> None:
    """BamBuddy keeps a camera connection 5 s after its last viewer left, at
    the rate it began with: a stream at a new rate asks it to end that one
    first."""
    entry = await set_up(hass, X1C)
    camera = entity_id(hass, "camera", printer_uid(entry, "camera"))
    _stream(aioclient_mock, X1C, 30)
    _stream(aioclient_mock, X1C, 15)
    await _watch(hass_client, camera)

    await _set_rate(hass, entry, 15)
    assert state_of(hass, "number", printer_uid(entry, "camera_fps")).state == "15"
    assert state_of(hass, "camera", printer_uid(entry, "camera")).attributes["frame_rate"] == 15
    await _watch(hass_client, camera)

    bambuddy_api.stop_camera.assert_awaited_once_with(X1C)
    assert [str(call[1]) for call in aioclient_mock.mock_calls] == [
        f"{URL}/api/v1/printers/{X1C}/camera/stream?fps=30&token={STREAM_TOKEN}",
        f"{URL}/api/v1/printers/{X1C}/camera/stream?fps=15&token={STREAM_TOKEN}",
    ]
    # The same rate again: nothing to end.
    await _watch(hass_client, camera)
    bambuddy_api.stop_camera.assert_awaited_once()


async def test_another_viewer_keeps_the_rate(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """While someone else still watches (BamBuddy's own page), BamBuddy
    keeps its connection: asked a few times, then the stream starts on it."""
    monkeypatch.setattr(camera_module, "_STOP_PAUSE", 0)
    bambuddy_api.stop_camera.return_value = False
    entry = await set_up(hass, X1C)
    camera = entity_id(hass, "camera", printer_uid(entry, "camera"))
    _stream(aioclient_mock, X1C, 30)
    _stream(aioclient_mock, X1C, 10)
    await _watch(hass_client, camera)

    await _set_rate(hass, entry, 10)
    await _watch(hass_client, camera)

    assert bambuddy_api.stop_camera.await_count == camera_module._STOP_TRIES


async def test_a_refused_stop_still_streams(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, aioclient_mock: AiohttpClientMocker, hass_client: ClientSessionGenerator
) -> None:
    """A proxy in front of BamBuddy may refuse the stop (405): the stream
    starts anyway, at the rate BamBuddy has."""
    bambuddy_api.stop_camera.side_effect = BamBuddyApiError(405, "Method Not Allowed")
    entry = await set_up(hass, X1C)
    camera = entity_id(hass, "camera", printer_uid(entry, "camera"))
    _stream(aioclient_mock, X1C, 30)
    _stream(aioclient_mock, X1C, 20)
    await _watch(hass_client, camera)

    await _set_rate(hass, entry, 20)
    await _watch(hass_client, camera)

    bambuddy_api.stop_camera.assert_awaited_once_with(X1C)


@pytest.mark.parametrize(("restored", "expected"), [("20", "20"), ("20.0", "20"), ("7", "30"), ("45", "30"), ("unknown", "30")])
async def test_the_frame_rate_is_kept_over_a_restart(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, restored: str, expected: str
) -> None:
    """A rate the camera can take comes back; anything else gives the most."""
    mock_restore_cache(hass, [State(f"number.x1c_{printer_serial(X1C).lower()}_camera_frame_rate", restored)])
    entry = await set_up(hass, X1C)

    assert state_of(hass, "number", printer_uid(entry, "camera_fps")).state == expected
    assert state_of(hass, "camera", printer_uid(entry, "camera")).attributes["frame_rate"] == int(expected)


async def test_a_kept_rate_above_a_new_limit(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """30 kept from before BamBuddy took an external camera for the X1C,
    which goes up to 15: 15."""
    mock_restore_cache(hass, [State(f"number.x1c_{printer_serial(X1C).lower()}_camera_frame_rate", "30")])
    _with_info(bambuddy_api, X1C, **_EXTERNAL)
    entry = await set_up(hass, X1C)

    assert state_of(hass, "number", printer_uid(entry, "camera_fps")).state == "15"
    assert state_of(hass, "camera", printer_uid(entry, "camera")).attributes["frame_rate"] == 15


async def test_a_key_that_may_not_control_keeps_the_frame_rate(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The controls leave the registry with a key that may not control;
    the frame rate is Home Assistant's own setting and stays, with what the
    user set for it."""
    entry = await set_up(hass, X1C)
    number = entity_id(hass, "number", printer_uid(entry, "camera_fps"))
    await _set_rate(hass, entry, 20)
    removed: list[str] = []
    hass.bus.async_listen(
        er.EVENT_ENTITY_REGISTRY_UPDATED,
        lambda event: removed.append(event.data["entity_id"]) if event.data["action"] == "remove" else None,
    )
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert number not in removed
    assert any(item.startswith("number.") for item in removed)  # a target temperature went
    assert state_of(hass, "number", printer_uid(entry, "camera_fps")).state == "20"


# --- What arrives --------------------------------------------------------------


async def test_the_frames_are_counted_as_they_pass() -> None:
    """Each part of BamBuddy's multipart stream is a frame; a boundary split
    between two reads counts once, and the bytes pass unchanged."""
    chunks = [b"--frame\r\nA", b"BC\r\n--fr", b"ame\r\nD\r\n--frame\r\n--frame", b""]
    counted: list[int] = []

    class Content:
        async def read(self, n: int = -1) -> bytes:
            return chunks.pop(0)

    counter = camera_module._FrameCounter(Content(), b"frame", counted.append)  # type: ignore[arg-type]
    data = [await counter.read(10) for _ in range(4)]

    assert b"".join(data) == b"--frame\r\nABC\r\n--frame\r\nD\r\n--frame\r\n--frame"
    assert sum(counted) == 4


@pytest.mark.parametrize(
    ("content_type", "boundary"),
    [
        ("multipart/x-mixed-replace; boundary=frame", b"frame"),
        ('multipart/x-mixed-replace;Boundary="cam42"', b"cam42"),
        ("multipart/x-mixed-replace", b"frame"),
    ],
)
def test_the_frames_boundary(content_type: str, boundary: bytes) -> None:
    """From the stream's content type; BamBuddy's own where it names none."""
    assert camera_module._boundary(content_type) == boundary


def test_the_rate_is_measured_over_a_few_seconds() -> None:
    """Frames a second over 3 s; a change smaller than 2 is no change."""
    meter = camera_module._RateMeter()
    assert meter.count(1, 0.0) is None  # the first frame starts the count
    assert meter.count(89, 2.99) is None
    assert meter.count(1, 3.0) == 30
    assert meter.count(88, 6.0) is None  # 29: still 30
    assert meter.count(24, 9.0) == 8


class _Upstream:
    """BamBuddy's stream, one frame a read at the rate it streams; the clock
    is the camera's."""

    status = 200
    headers = {"Content-Type": "multipart/x-mixed-replace;boundary=frame"}

    def __init__(self, frames: int, fps: float, clock: list[float], on_read: Callable[[], None]) -> None:
        self._frames, self._fps, self._clock, self._on_read = frames, fps, clock, on_read
        self.content = self

    async def read(self, n: int = -1) -> bytes:
        self._on_read()
        if not self._frames:
            return b""
        self._frames -= 1
        self._clock[0] += 1 / self._fps
        return b"--frame\r\nContent-Type: image/jpeg\r\n\r\njpeg\r\n"

    def release(self) -> None:
        pass


async def test_the_camera_says_what_arrives(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    hass_client: ClientSessionGenerator,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Someone else watched first (BamBuddy's own camera page asks for 8):
    BamBuddy streams at that rate, and the camera says so while the stream
    runs. The next stream asks BamBuddy to end that connection first."""
    clock = [0.0]
    monkeypatch.setattr(camera_module, "_clock", lambda: clock[0])
    entry = await set_up(hass, X1C)
    camera = entity_id(hass, "camera", printer_uid(entry, "camera"))
    seen: list[object] = []

    def on_read() -> None:
        seen.append(state_at(hass, camera).attributes.get("streamed_frame_rate"))

    upstream = _Upstream(48, 8, clock, on_read)
    with patch.object(BamBuddyClient, "open_stream", AsyncMock(return_value=upstream)):
        await _watch(hass_client, camera)
    assert 8 in seen
    # Over: nothing arrives.
    assert "streamed_frame_rate" not in state_of(hass, "camera", printer_uid(entry, "camera")).attributes
    bambuddy_api.stop_camera.assert_not_awaited()

    with patch.object(BamBuddyClient, "open_stream", AsyncMock(return_value=_Upstream(1, 30, clock, lambda: None))):
        await _watch(hass_client, camera)
    bambuddy_api.stop_camera.assert_awaited_once_with(X1C)


async def test_a_rate_bambuddy_kept_is_asked_for_again(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """BamBuddy kept its connection (someone else watched): the stream got
    BamBuddy's rate, not the new one. The next stream asks again, and once
    nobody else watches, the new rate comes."""
    monkeypatch.setattr(camera_module, "_STOP_PAUSE", 0)
    bambuddy_api.stop_camera.return_value = False
    entry = await set_up(hass, X1C)
    camera = entity_id(hass, "camera", printer_uid(entry, "camera"))
    _stream(aioclient_mock, X1C, 30)
    _stream(aioclient_mock, X1C, 15)
    await _watch(hass_client, camera)
    await _set_rate(hass, entry, 15)
    await _watch(hass_client, camera)
    assert bambuddy_api.stop_camera.await_count == camera_module._STOP_TRIES

    bambuddy_api.stop_camera.return_value = True
    await _watch(hass_client, camera)

    assert bambuddy_api.stop_camera.await_count == camera_module._STOP_TRIES + 1
    # Ended: the next stream at the same rate asks nothing.
    await _watch(hass_client, camera)
    assert bambuddy_api.stop_camera.await_count == camera_module._STOP_TRIES + 1


async def test_an_external_camera_is_never_stopped(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, aioclient_mock: AiohttpClientMocker, hass_client: ClientSessionGenerator
) -> None:
    """BamBuddy streams a camera it takes from elsewhere to each viewer on
    its own, at each one's rate -- and its stop would end every viewer's."""
    _with_info(bambuddy_api, X1C, **_EXTERNAL)
    entry = await set_up(hass, X1C)
    camera = entity_id(hass, "camera", printer_uid(entry, "camera"))
    _stream(aioclient_mock, X1C, 15)
    _stream(aioclient_mock, X1C, 10)
    await _watch(hass_client, camera)

    await _set_rate(hass, entry, 10)
    await _watch(hass_client, camera)

    bambuddy_api.stop_camera.assert_not_awaited()


async def test_a_stream_at_a_new_rate_waits_for_the_cameras_own(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Asked while this camera still streams, BamBuddy would keep its
    connection: the stop waits until the camera's own streams have ended."""
    entry = await set_up(hass, X1C)
    camera = hass.data[DATA_COMPONENT].get_entity(entity_id(hass, "camera", printer_uid(entry, "camera")))
    camera._streamed_fps = 30  # type: ignore[union-attr]
    camera._streams = 1  # type: ignore[union-attr]
    camera._no_streams.clear()  # type: ignore[union-attr]

    ending = hass.async_create_task(camera._end_other_rate(15))  # type: ignore[union-attr]
    await asyncio.sleep(0.05)
    bambuddy_api.stop_camera.assert_not_awaited()
    camera._streams = 0  # type: ignore[union-attr]
    camera._no_streams.set()  # type: ignore[union-attr]

    assert await ending is True
    bambuddy_api.stop_camera.assert_awaited_once_with(X1C)


async def test_an_external_camera_switched_on_later(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The minute's details bring an external camera BamBuddy now takes: the
    X1C's most is 15 at once; an A1 mini gains the setting, so the entry
    reloads to make it."""
    entry = await set_up(hass, X1C, A1_MINI)
    printers = {printer["id"]: printer for printer in load_fixture("printers.json")}
    bambuddy_api.get_printer.side_effect = lambda printer_id: {**printers[printer_id], **_EXTERNAL}

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(6):
            await next_refresh(hass, freezer)

    number = state_of(hass, "number", printer_uid(entry, "camera_fps"))
    assert (number.state, number.attributes["max"]) == ("15", 15)
    assert state_of(hass, "camera", printer_uid(entry, "camera")).attributes["frame_rate"] == 15
    reload.assert_called_once_with(entry.entry_id)


async def test_the_frame_rate_setting_goes_with_the_external_camera(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """An A1 mini whose camera BamBuddy takes from elsewhere has the setting;
    once the camera is taken away in BamBuddy, the reload leaves none behind."""
    _with_info(bambuddy_api, A1_MINI, **_EXTERNAL)
    entry = await set_up(hass, A1_MINI)
    assert not no_entity(hass, "number", printer_uid(entry, "camera_fps", A1_MINI))

    _with_info(bambuddy_api, A1_MINI, external_camera_enabled=False)
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert no_entity(hass, "number", printer_uid(entry, "camera_fps", A1_MINI))
