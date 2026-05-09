"""BamBuddy API client."""
from __future__ import annotations

import logging
import aiohttp
import asyncio
from typing import Any

_LOGGER = logging.getLogger(__name__)


class BamBuddyApiError(Exception):
    """BamBuddy API error."""


class BamBuddyAuthError(BamBuddyApiError):
    """BamBuddy authentication error."""


class BamBuddyClient:
    """BamBuddy REST API client."""

    def __init__(self, host: str, port: int, api_key: str, session: aiohttp.ClientSession) -> None:
        self._base_url = f"http://{host}:{port}/api/v1"
        self._health_url = f"http://{host}:{port}/health"
        self._api_key = api_key
        self._session = session
        _LOGGER.debug("BamBuddyClient initialized with base URL: %s", self._base_url)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "X-API-Key": self._api_key,
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self._base_url}{path}"
        _LOGGER.debug("API request: %s %s", method, url)
        try:
            async with self._session.request(
                method, url, headers=self._headers, timeout=aiohttp.ClientTimeout(total=10), **kwargs
            ) as resp:
                _LOGGER.debug("API response: %s %s → HTTP %s", method, url, resp.status)
                if resp.status == 401:
                    raise BamBuddyAuthError("Invalid API key")
                if resp.status == 403:
                    raise BamBuddyAuthError("Insufficient permissions")
                if resp.status >= 400:
                    body = await resp.text()
                    _LOGGER.error("API error %s for %s %s — body: %s", resp.status, method, url, body[:500])
                    raise BamBuddyApiError(f"API error {resp.status}")
                return await resp.json()
        except aiohttp.ClientConnectorError as err:
            _LOGGER.error("Cannot connect to BamBuddy at %s: %s", url, err)
            raise BamBuddyApiError(f"Cannot connect to BamBuddy: {err}") from err
        except asyncio.TimeoutError as err:
            _LOGGER.error("Timeout connecting to BamBuddy at %s", url)
            raise BamBuddyApiError("Connection timeout") from err

    # Health — lives at /health, not /api/v1/health
    async def get_health(self) -> dict:
        url = self._health_url
        _LOGGER.debug("API request: GET %s", url)
        try:
            async with self._session.get(
                url, timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                _LOGGER.debug("API response: GET %s → HTTP %s", url, resp.status)
                if resp.status >= 400:
                    body = await resp.text()
                    _LOGGER.error("Health check error %s — body: %s", resp.status, body[:500])
                    raise BamBuddyApiError(f"API error {resp.status}")
                return await resp.json()
        except aiohttp.ClientConnectorError as err:
            raise BamBuddyApiError(f"Cannot connect to BamBuddy: {err}") from err
        except asyncio.TimeoutError as err:
            raise BamBuddyApiError("Connection timeout") from err

    # System
    async def get_system_info(self) -> dict:
        return await self._request("GET", "/system/info")

    # Printers
    async def get_printers(self) -> list[dict]:
        return await self._request("GET", "/printers/")

    async def get_printer(self, printer_id: int) -> dict:
        return await self._request("GET", f"/printers/{printer_id}")

    async def get_printer_status(self, printer_id: int) -> dict:
        return await self._request("GET", f"/printers/{printer_id}/status")

    async def set_print_speed(self, printer_id: int, mode: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/print-speed", params={"mode": mode})

    async def clear_hms_errors(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/hms/clear")

    async def clear_plate(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/clear-plate")

    async def refresh_printer_status(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/refresh-status")

    async def pause_print(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/print/pause")

    async def resume_print(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/print/resume")

    async def stop_print(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/print/stop")

    # Statistics — correct endpoint is /archives/stats
    async def get_statistics(self) -> dict:
        return await self._request("GET", "/archives/stats")

    # Chamber light
    async def set_chamber_light(self, printer_id: int, on: bool) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/chamber-light", params={"on": on})

    # Camera
    async def get_stream_token(self) -> str:
        result = await self._request("POST", "/printers/camera/stream-token")
        _LOGGER.debug("Stream token response: %s", result)
        token = result.get("token") or result.get("access_token") or result.get("stream_token") or ""
        return token

    def snapshot_url(self, printer_id: int, token: str) -> str:
        return f"{self._base_url}/printers/{printer_id}/camera/snapshot?token={token}"

    def stream_url(self, printer_id: int, token: str, fps: int = 5) -> str:
        return f"{self._base_url}/printers/{printer_id}/camera/stream?token={token}&fps={fps}"

    # Queue
    async def get_queue(self) -> list[dict]:
        return await self._request("GET", "/queue/")
