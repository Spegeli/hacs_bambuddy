"""BamBuddy API client."""
from __future__ import annotations

import aiohttp
import asyncio
from typing import Any


class BamBuddyApiError(Exception):
    """BamBuddy API error."""


class BamBuddyAuthError(BamBuddyApiError):
    """BamBuddy authentication error."""


class BamBuddyClient:
    """BamBuddy REST API client."""

    def __init__(self, host: str, port: int, api_key: str, session: aiohttp.ClientSession) -> None:
        self._base_url = f"http://{host}:{port}/api/v1"
        self._api_key = api_key
        self._session = session

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "X-API-Key": self._api_key,
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self._base_url}{path}"
        try:
            async with self._session.request(
                method, url, headers=self._headers, timeout=aiohttp.ClientTimeout(total=10), **kwargs
            ) as resp:
                if resp.status == 401:
                    raise BamBuddyAuthError("Invalid API key")
                if resp.status == 403:
                    raise BamBuddyAuthError("Insufficient permissions")
                if resp.status >= 400:
                    raise BamBuddyApiError(f"API error {resp.status}")
                return await resp.json()
        except aiohttp.ClientConnectorError as err:
            raise BamBuddyApiError(f"Cannot connect to BamBuddy: {err}") from err
        except asyncio.TimeoutError as err:
            raise BamBuddyApiError("Connection timeout") from err

    # System
    async def get_health(self) -> dict:
        return await self._request("GET", "/health")

    async def get_system_info(self) -> dict:
        return await self._request("GET", "/system/info")

    # Printers
    async def get_printers(self) -> list[dict]:
        return await self._request("GET", "/printers")

    async def get_printer(self, printer_id: int) -> dict:
        return await self._request("GET", f"/printers/{printer_id}")

    async def get_printer_status(self, printer_id: int) -> dict:
        return await self._request("GET", f"/printers/{printer_id}/status")

    async def set_print_speed(self, printer_id: int, mode: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/print-speed?mode={mode}")

    async def clear_hms_errors(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/hms/clear")

    async def clear_plate(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/clear-plate")

    async def refresh_printer_status(self, printer_id: int) -> dict:
        return await self._request("POST", f"/printers/{printer_id}/refresh-status")

    # Statistics
    async def get_statistics(self) -> dict:
        return await self._request("GET", "/statistics")

    # Queue
    async def get_queue(self) -> list[dict]:
        return await self._request("GET", "/queue")
