"""BamBuddy's camera: each printer's camera through BamBuddy's camera proxy,
as a live MJPEG stream and as snapshots."""
from __future__ import annotations

import asyncio
from collections.abc import Callable
import contextlib
from datetime import datetime, timedelta
from http import HTTPStatus
import logging
import time
from typing import Any, cast

import aiohttp
from aiohttp import web
from aiohttp.hdrs import CONTENT_TYPE

from homeassistant.components.camera import Camera
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_aiohttp_proxy_stream
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .api import BamBuddyAuthError, BamBuddyError
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity
from .models import CAMERA_MIN_FPS, camera_is_external, camera_max_fps

_LOGGER = logging.getLogger(__name__)

PARALLEL_UPDATES = 0

# BamBuddy's camera tokens last 60 minutes.
_TOKEN_LIFETIME = timedelta(minutes=55)
# A stream at a new rate: how long it waits for this camera's streams to
# end, and how often and how far apart it asks BamBuddy to end its camera
# connection -- BamBuddy notices a viewer gone at its next frame.
_OWN_STREAMS_WAIT = 2.0
_STOP_TRIES = 4
_STOP_PAUSE = 0.5
# What arrives: frames a second over this many seconds and at least this
# many frames (the A1's chamber image sends one every two seconds or so); a
# change smaller than the other -- or than half a rate below 4 -- is none.
_RATE_WINDOW = 3.0
_RATE_FRAMES = 4
_RATE_CHANGE = 2
_clock: Callable[[], float] = time.monotonic


class _FrameCounter:
    """The reader Home Assistant's proxy reads BamBuddy's stream through: it
    passes the bytes on and counts the frames, the parts of the multipart
    stream. A boundary split between two reads counts once."""

    def __init__(self, content: aiohttp.StreamReader, boundary: bytes, counted: Callable[[int], None]) -> None:
        self._content = content
        self._marker = b"--" + boundary
        self._tail = b""
        self._counted = counted

    async def read(self, n: int = -1) -> bytes:
        data = await self._content.read(n)
        seen = self._tail + data
        if frames := seen.count(self._marker):
            self._counted(frames)
        # Too short to hold a whole boundary: none is counted twice.
        self._tail = seen[-(len(self._marker) - 1) :]
        return data


class _RateMeter:
    """Frames a second, over a few seconds of one stream."""

    def __init__(self) -> None:
        self._start: float | None = None
        self._frames = 0
        self._rate: float | None = None

    def count(self, frames: int, now: float) -> float | None:
        """A new rate, once one is measured and when it changed: whole frames
        from 1 on, tenths below -- never 0 while frames arrive."""
        if self._start is None:
            # The first frame starts the count.
            self._start = now
            return None
        self._frames += frames
        elapsed = now - self._start
        if elapsed < _RATE_WINDOW or self._frames < _RATE_FRAMES:
            return None
        measured = self._frames / elapsed
        self._start, self._frames = now, 0
        rate: float = round(measured, 1)
        rate = round(measured) if rate >= 1 else max(rate, 0.1)
        if self._rate is not None and abs(rate - self._rate) < min(_RATE_CHANGE, self._rate / 2):
            return None
        self._rate = rate
        return rate


def _boundary(content_type: str) -> bytes:
    for part in content_type.split(";"):
        name, _, value = part.strip().partition("=")
        if name.lower() == "boundary" and value:
            return value.strip('"').encode()
    return b"frame"


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities(BamBuddyCamera(coordinator) for coordinator in entry.runtime_data.printers.values())


class BamBuddyCamera(BamBuddyPrinterEntity, Camera):
    """The stream runs while someone watches; the camera reads "idle" in
    between. BamBuddy takes a camera token, never the key, in the URL: the
    token is kept for 55 minutes and renewed when BamBuddy refuses it -- a
    restart or a restored database forgets tokens."""

    _attr_translation_key = "camera"
    # It changes while a stream runs: kept out of the recorder.
    _unrecorded_attributes = frozenset({"streamed_frame_rate"})

    @property
    def entity_picture(self) -> str | None:  # type: ignore[override]
        """None while unavailable: the frontend would ask for a picture and
        get an error; it shows the icon instead."""
        return super().entity_picture if self.available else None

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        BamBuddyPrinterEntity.__init__(self, coordinator, "camera")
        Camera.__init__(self)
        self._token: str | None = None
        self._token_until: datetime | None = None
        # The streams this camera sends now; the rate BamBuddy last began
        # its connection at for it; whether BamBuddy may stream another (it
        # kept a connection, or what arrives says so); what arrives.
        self._streams = 0
        self._no_streams = asyncio.Event()
        self._no_streams.set()
        self._streamed_fps: int | None = None
        self._rate_unsure = False
        self._arriving: float | None = None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """The frames a second a stream asks for, and while one runs, the
        frames a second that arrive (the card shows them)."""
        return {
            "frame_rate": self.coordinator.frame_rate,
            **({"streamed_frame_rate": self._arriving} if self._arriving is not None else {}),
        }

    async def _get_token(self, *, renew: bool = False) -> str:
        now = dt_util.utcnow()
        if renew or self._token is None or self._token_until is None or now >= self._token_until:
            self._token = await self.coordinator.client.get_stream_token()
            self._token_until = now + _TOKEN_LIFETIME
        return self._token

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        client, printer_id = self.coordinator.client, self.coordinator.printer_id
        try:
            try:
                return await client.get_snapshot(printer_id, await self._get_token())
            except BamBuddyAuthError:
                return await client.get_snapshot(printer_id, await self._get_token(renew=True))
        except BamBuddyError as err:
            _LOGGER.debug("No camera picture from %s: %s", self.coordinator.printer_name, err)
            return None

    async def _open_stream(self, fps: int, *, renew: bool = False) -> aiohttp.ClientResponse:
        token = await self._get_token(renew=renew)
        return await self.coordinator.client.open_stream(self.coordinator.printer_id, token, fps)

    async def _end_other_rate(self, fps: int) -> bool:
        """BamBuddy shares one connection to a camera among its viewers, at
        the rate the first asked, and keeps it 5 s after the last left: a
        stream at another rate -- or where BamBuddy may stream another --
        asks it to end that one, once this camera's own streams have ended.
        While someone else still watches (BamBuddy's own page), it keeps it.
        Whether the stream gets this rate. A camera BamBuddy takes from
        elsewhere has no shared connection, and its stop would end every
        viewer's stream."""
        if camera_is_external(self.coordinator.info):
            return True
        if not self._rate_unsure and self._streamed_fps in (None, fps):
            return True
        with contextlib.suppress(TimeoutError):
            async with asyncio.timeout(_OWN_STREAMS_WAIT):
                await self._no_streams.wait()
        client, printer_id = self.coordinator.client, self.coordinator.printer_id
        for attempt in range(_STOP_TRIES):
            if attempt:
                await asyncio.sleep(_STOP_PAUSE)
            try:
                if await client.stop_camera(printer_id):
                    return True
            except BamBuddyError as err:
                _LOGGER.debug("BamBuddy did not end the camera connection of %s: %s", self.coordinator.printer_name, err)
                return False
        _LOGGER.debug("Someone else watches %s: the stream gets BamBuddy's rate", self.coordinator.printer_name)
        return False

    def _counted(self, meter: _RateMeter, frames: int, fps: int) -> None:
        rate = meter.count(frames, _clock())
        if rate is None:
            return
        # Not what was asked: the next stream asks BamBuddy to begin anew. A
        # chamber image comes as fast as the printer sends it, whatever is
        # asked.
        if abs(rate - fps) > _RATE_CHANGE and camera_max_fps(self.coordinator.info) > CAMERA_MIN_FPS:
            self._rate_unsure = True
        if rate != self._arriving:
            self._arriving = rate
            self.async_write_ha_state()

    async def handle_async_mjpeg_stream(self, request: web.Request) -> web.StreamResponse | None:
        fps = self.coordinator.frame_rate
        try:
            ended = await self._end_other_rate(fps)
            upstream = await self._open_stream(fps)
            if upstream.status == HTTPStatus.UNAUTHORIZED:
                upstream.release()
                upstream = await self._open_stream(fps, renew=True)
        except BamBuddyError as err:
            _LOGGER.debug("No camera stream from %s: %s", self.coordinator.printer_name, err)
            return None
        except (aiohttp.ClientError, TimeoutError) as err:
            # Only the kind: some aiohttp errors name the address, and the
            # token is part of it.
            _LOGGER.debug("No camera stream from %s: %s", self.coordinator.printer_name, type(err).__name__)
            return None
        if upstream.status >= HTTPStatus.BAD_REQUEST:
            _LOGGER.debug("No camera stream from %s: HTTP %s", self.coordinator.printer_name, upstream.status)
            upstream.release()
            return None
        # Where BamBuddy kept its connection, the rate it began at stays: the
        # next stream asks again.
        if ended:
            self._streamed_fps, self._rate_unsure = fps, False
        self._streams += 1
        self._no_streams.clear()
        content_type = upstream.headers.get(CONTENT_TYPE, "multipart/x-mixed-replace;boundary=frame")
        meter = _RateMeter()
        counter = _FrameCounter(upstream.content, _boundary(content_type), lambda frames: self._counted(meter, frames, fps))
        try:
            return await async_aiohttp_proxy_stream(self.hass, request, cast(aiohttp.StreamReader, counter), content_type)
        finally:
            upstream.release()
            self._streams -= 1
            if not self._streams:
                self._no_streams.set()
                if self._arriving is not None:
                    self._arriving = None
                    self.async_write_ha_state()
