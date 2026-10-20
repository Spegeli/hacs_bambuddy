"""BamBuddy's REST API: the reads and the printer controls the integration
uses, under the base URL the user gave (scheme, host, port and the path of
a reverse proxy, without /api/v1)."""
from __future__ import annotations

from collections.abc import Awaitable
import logging
from typing import Any, NamedTuple
from urllib.parse import urlsplit, urlunsplit

import aiohttp

_LOGGER = logging.getLogger(__name__)

# Five seconds to connect: a connection that never opens is no slow answer.
_TIMEOUT = aiohttp.ClientTimeout(total=10, connect=5)
# BamBuddy waits up to 15 s for a fresh camera frame.
_SNAPSHOT_TIMEOUT = aiohttp.ClientTimeout(total=20, connect=5)
# For its system information BamBuddy walks through its whole archive.
_SYSTEM_TIMEOUT = aiohttp.ClientTimeout(total=30, connect=5)
# The first cover of a job can need an FTP download from the printer.
_COVER_TIMEOUT = aiohttp.ClientTimeout(total=30, connect=5)
# Without a copy in its archive BamBuddy downloads the whole job first.
_OBJECTS_TIMEOUT = aiohttp.ClientTimeout(total=60, connect=5)
# The update checks: BamBuddy asks GitHub (with 10 s of its own) and Bambu
# Lab's pages for each printer model, live.
_UPDATE_TIMEOUT = aiohttp.ClientTimeout(total=60, connect=5)
# The connection check probes the printer's ports and waits up to ten
# seconds for a report: some 26 s at worst.
_DIAGNOSTIC_TIMEOUT = aiohttp.ClientTimeout(total=40, connect=5)
# A plug's status: BamBuddy asks the plug itself -- a Home Assistant plug
# with energy sensors in several calls of up to ten seconds each.
_PLUG_TIMEOUT = aiohttp.ClientTimeout(total=30, connect=5)
# BamBuddy asks the printer for its K profiles live: three tries of 5 s.
_KPROFILES_TIMEOUT = aiohttp.ClientTimeout(total=25, connect=5)
_PLUG_QUICK = aiohttp.ClientTimeout(total=5, connect=5)
_API_PATH = "/api/v1"
# A gateway's answers: a proxy without BamBuddy behind it.
_GATEWAY = (502, 503, 504)
# BamBuddy's permission for the printer controls.
_CONTROL_PERMISSION = "printers:control"
# And for marking maintenance done (the key's "Manage Maintenance").
_MAINTENANCE_PERMISSION = "maintenance:update"
# And for switching smart plugs ("Control Printer" too, unless the key's
# owner may not).
_PLUGS_PERMISSION = "smart_plugs:control"


class Permissions(NamedTuple):
    """What the key may do beyond reading."""

    control: bool
    maintenance: bool
    plugs: bool


class AddressWithLoginError(ValueError):
    """The address carries a user name or password: BamBuddy takes the API
    key, and the address is the entry's identity -- no secret in it."""


def normalise_url(url: str) -> str:
    """The one form of a BamBuddy address, whatever the user typed: http://
    added when no scheme is given, scheme and host in lower case, the
    scheme's default port, a trailing slash and a copied /api/v1 removed.
    Raises ValueError for anything that is no http(s) address,
    AddressWithLoginError for one with a login."""
    text = url.strip()
    if not text:
        raise ValueError("empty URL")
    if "://" not in text:
        text = f"http://{text}"
    parts = urlsplit(text)
    scheme = parts.scheme.lower()
    host = parts.hostname
    if scheme not in ("http", "https") or not host or any(char.isspace() for char in host):
        raise ValueError(f"not an http(s) address: {url!r}")
    if parts.username is not None or parts.password is not None:
        raise AddressWithLoginError("an address with a login")
    port = parts.port  # raises ValueError for a port that is no number
    netloc = f"[{host}]" if ":" in host else host
    if port is not None and port != {"http": 80, "https": 443}[scheme]:
        netloc = f"{netloc}:{port}"
    path = parts.path.rstrip("/")
    if path.endswith(_API_PATH):
        path = path[: -len(_API_PATH)].rstrip("/")
    return urlunsplit((scheme, netloc, path, "", ""))


class BamBuddyError(Exception):
    """Any failure talking to BamBuddy."""


class BamBuddyConnectionError(BamBuddyError):
    """BamBuddy could not be reached, or did not answer in time."""


class BamBuddyApiError(BamBuddyError):
    """BamBuddy answered with an error; the text is its own where it sent one."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


class BamBuddyAuthError(BamBuddyApiError):
    """401: the key is wrong, expired or disabled."""


class BamBuddyPermissionError(BamBuddyApiError):
    """403: the key lacks the permission the request needs."""


class BamBuddyNotFoundError(BamBuddyApiError):
    """404: e.g. a printer BamBuddy no longer has."""


class BamBuddyNotJsonError(BamBuddyApiError):
    """An answer that is no JSON: BamBuddy's web page answers every path
    that is not its API -- an address copied with a page's path."""


_ERRORS: dict[int, type[BamBuddyApiError]] = {
    401: BamBuddyAuthError,
    403: BamBuddyPermissionError,
    404: BamBuddyNotFoundError,
}


async def _detail(response: aiohttp.ClientResponse) -> str:
    """BamBuddy's error text: FastAPI's {"detail": ...}, a list of
    validation errors joined, else the status."""
    try:
        body = await response.json(content_type=None)
    except ValueError:
        return f"HTTP {response.status}"
    detail = body.get("detail") if isinstance(body, dict) else None
    if isinstance(detail, list):
        return "; ".join(str(item.get("msg", item)) if isinstance(item, dict) else str(item) for item in detail)
    if isinstance(detail, dict):
        return str(detail.get("message", detail))
    return str(detail) if detail else f"HTTP {response.status}"


def _flag(value: bool) -> str:
    """A flag for a query, as text: aiohttp refuses a bool there."""
    return "true" if value else "false"


def timed_out(err: BaseException) -> bool:
    """Whether BamBuddy did not answer in time -- not a connection that
    never opened, which is no answer at all."""
    cause = err.__cause__
    return isinstance(cause, TimeoutError) and not isinstance(cause, aiohttp.ConnectionTimeoutError)


class BamBuddyClient:
    """BamBuddy's REST API with an API key."""

    def __init__(
        self, url: str, api_key: str, session: aiohttp.ClientSession, *, verify_ssl: bool = True
    ) -> None:
        self.url = url.rstrip("/")
        self._api = f"{self.url}{_API_PATH}"
        self._headers = {"X-API-Key": api_key}
        self._session = session
        self._ssl = verify_ssl

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str | int | float] | None = None,
        json: Any = None,
        key: bool = True,
        raw: bool = False,
        timeout: aiohttp.ClientTimeout = _TIMEOUT,
    ) -> Any:
        """One request; the path is logged, never the query: the camera
        token travels there."""
        try:
            async with self._session.request(
                method,
                f"{self._api}{path}",
                headers=self._headers if key else None,
                params=params,
                json=json,
                ssl=self._ssl,
                timeout=timeout,
            ) as response:
                _LOGGER.debug("%s %s: HTTP %s", method, path, response.status)
                if response.status >= 400:
                    detail = await _detail(response)
                    # A proxy in front of a BamBuddy that does not answer (it
                    # restarts): the proxy's page, no text of BamBuddy's -- a
                    # 404 too (Traefik: "404 page not found"); BamBuddy's own
                    # 404s always carry its JSON detail.
                    if response.status in (*_GATEWAY, 404) and detail == f"HTTP {response.status}":
                        raise BamBuddyConnectionError(f"{method} {path}: HTTP {response.status}")
                    error = _ERRORS.get(response.status, BamBuddyApiError)
                    raise error(response.status, detail)
                if raw:
                    return await response.read()
                try:
                    return await response.json(content_type=None)
                except ValueError as err:
                    raise BamBuddyNotJsonError(response.status, "The answer is not JSON") from err
        except (aiohttp.ClientError, TimeoutError) as err:
            raise BamBuddyConnectionError(f"{method} {path}: {type(err).__name__}") from err

    async def _object(self, path: str, *, key: bool = True, timeout: aiohttp.ClientTimeout = _TIMEOUT) -> dict[str, Any]:
        answer = await self._request("GET", path, key=key, timeout=timeout)
        if not isinstance(answer, dict):
            raise BamBuddyApiError(200, "Unexpected answer")
        return answer

    async def _list(self, path: str) -> list[dict[str, Any]]:
        answer = await self._request("GET", path)
        if not isinstance(answer, list):
            raise BamBuddyApiError(200, "Unexpected answer")
        return answer

    async def _command(self, path: str, **params: str | int | float) -> None:
        await self._request("POST", path, params=params or None)

    # Reads

    async def get_version(self) -> str:
        """BamBuddy's version, from a route that needs no key."""
        return str((await self._object("/updates/version", key=False)).get("version", ""))

    async def get_auth_status(self) -> dict[str, Any]:
        return await self._object("/auth/status", key=False)

    async def permissions(self) -> Permissions:
        """What the key may do: with BamBuddy's authentication off every
        request may, else the key's permissions decide."""
        if not (await self.get_auth_status()).get("auth_enabled"):
            return Permissions(control=True, maintenance=True, plugs=True)
        granted = (await self.get_auth_me()).get("permissions") or []
        return Permissions(
            control=_CONTROL_PERMISSION in granted,
            maintenance=_MAINTENANCE_PERMISSION in granted,
            plugs=_PLUGS_PERMISSION in granted,
        )

    async def get_auth_me(self) -> dict[str, Any]:
        """The key's real permissions."""
        return await self._object("/auth/me")

    async def get_system_info(self, *, patient: bool = True) -> dict[str, Any]:
        """For it BamBuddy walks through its whole archive: 30 s -- or 10
        where something waits for it (setup, a flow)."""
        return await self._object("/system/info", timeout=_SYSTEM_TIMEOUT if patient else _TIMEOUT)

    async def get_statistics(self, *, patient: bool = True) -> dict[str, Any]:
        """BamBuddy's statistics ask every smart plug for its energy, one
        after another: up to 30 s, 10 s where the setup waits for them."""
        return await self._object("/archives/stats", timeout=_SYSTEM_TIMEOUT if patient else _TIMEOUT)

    async def get_update_check(self) -> dict[str, Any]:
        return await self._object("/updates/check", timeout=_UPDATE_TIMEOUT)

    async def get_firmware_updates(self) -> dict[str, Any]:
        return await self._object("/firmware/updates", timeout=_UPDATE_TIMEOUT)

    async def get_printers(self) -> list[dict[str, Any]]:
        return await self._list("/printers/")

    async def get_printer(self, printer_id: int) -> dict[str, Any]:
        return await self._object(f"/printers/{printer_id}")

    async def get_status(self, printer_id: int) -> dict[str, Any]:
        return await self._object(f"/printers/{printer_id}/status")

    async def get_runtime(self, printer_id: int) -> dict[str, Any]:
        """BamBuddy's runtime counter of a printer: the hours it printed
        (`total_hours`, with the offset set in BamBuddy)."""
        return await self._object(f"/printers/{printer_id}/runtime-debug")

    async def get_maintenance(self, printer_id: int) -> dict[str, Any]:
        """The printer's maintenance tasks as BamBuddy keeps them. A read can
        write to BamBuddy's database: it adds missing default tasks."""
        return await self._object(f"/maintenance/printers/{printer_id}")

    async def get_diagnostic(self, printer_id: int) -> dict[str, Any]:
        """BamBuddy's connection check of the printer: it sends the printer
        no command."""
        return await self._object(f"/printers/{printer_id}/diagnostic", timeout=_DIAGNOSTIC_TIMEOUT)

    async def get_print_objects(self, printer_id: int) -> dict[str, Any]:
        """The running job's objects; BamBuddy may download the job from the
        printer first."""
        return await self._object(f"/printers/{printer_id}/print/objects", timeout=_OBJECTS_TIMEOUT)

    async def get_kprofiles(self, printer_id: int, nozzle_diameter: str) -> list[dict[str, Any]]:
        """The printer's own K (pressure advance) calibrations for a nozzle
        diameter; empty where the printer did not answer."""
        answer = await self._request(
            "GET", f"/printers/{printer_id}/kprofiles/", params={"nozzle_diameter": nozzle_diameter}, timeout=_KPROFILES_TIMEOUT
        )
        profiles = answer.get("profiles") if isinstance(answer, dict) else None
        return [profile for profile in profiles if isinstance(profile, dict)] if isinstance(profiles, list) else []

    async def get_smart_plugs(self) -> list[dict[str, Any]]:
        """BamBuddy's smart plugs, from its database. The answer holds a
        plug's address and login: never logged."""
        return await self._list("/smart-plugs/")

    async def get_plug_status(self, plug_id: int, *, patient: bool = True) -> dict[str, Any]:
        """A plug's state, reachability and energy figures: BamBuddy asks the
        plug itself -- 30 s, or 5 where Home Assistant's start waits for it."""
        return await self._object(f"/smart-plugs/{plug_id}/status", timeout=_PLUG_TIMEOUT if patient else _PLUG_QUICK)

    async def get_cover(self, printer_id: int) -> bytes:
        """The current job's cover, with the key."""
        cover: bytes = await self._request("GET", f"/printers/{printer_id}/cover", raw=True, timeout=_COVER_TIMEOUT)
        return cover

    # Camera

    async def get_stream_token(self) -> str:
        """A camera token, valid for 60 minutes."""
        answer = await self._request("POST", "/printers/camera/stream-token")
        return str(answer.get("token", "")) if isinstance(answer, dict) else ""

    def stream_url(self, printer_id: int, token: str, fps: int) -> str:
        return f"{self._api}/printers/{printer_id}/camera/stream?fps={fps}&token={token}"

    def open_stream(self, printer_id: int, token: str, fps: int) -> Awaitable[aiohttp.ClientResponse]:
        """The MJPEG stream's request, for Home Assistant's proxy: no total
        timeout, the stream runs as long as someone watches."""
        return self._session.get(
            self.stream_url(printer_id, token, fps),
            ssl=self._ssl,
            timeout=aiohttp.ClientTimeout(total=None, connect=5),
        )

    async def stop_camera(self, printer_id: int) -> bool:
        """Ends BamBuddy's connection to the printer's camera, which it keeps
        5 s after the last viewer left, at the rate the first one asked.
        False when BamBuddy kept it: someone still watches."""
        answer = await self._request("POST", f"/printers/{printer_id}/camera/stop")
        return not (isinstance(answer, dict) and answer.get("skipped"))

    async def get_snapshot(self, printer_id: int, token: str) -> bytes:
        snapshot: bytes = await self._request(
            "GET",
            f"/printers/{printer_id}/camera/snapshot",
            params={"token": token},
            key=False,
            raw=True,
            timeout=_SNAPSHOT_TIMEOUT,
        )
        return snapshot

    # Printer controls: BamBuddy publishes each to the printer and answers
    # before the printer has acted.

    async def pause(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/print/pause")

    async def resume(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/print/resume")

    async def stop(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/print/stop")

    async def set_print_speed(self, printer_id: int, mode: int) -> None:
        await self._command(f"/printers/{printer_id}/print-speed", mode=mode)

    async def set_chamber_light(self, printer_id: int, on: bool) -> None:
        await self._command(f"/printers/{printer_id}/chamber-light", on=_flag(on))

    async def set_nozzle_temperature(self, printer_id: int, target: int, nozzle: int) -> None:
        """`nozzle` 0 is the only or the right nozzle, 1 the left one."""
        await self._command(f"/printers/{printer_id}/temperature/nozzle", target=target, nozzle=nozzle)

    async def set_bed_temperature(self, printer_id: int, target: int) -> None:
        await self._command(f"/printers/{printer_id}/temperature/bed", target=target)

    async def set_chamber_temperature(self, printer_id: int, target: int) -> None:
        await self._command(f"/printers/{printer_id}/temperature/chamber", target=target)

    async def set_fan_speed(self, printer_id: int, fan: str, speed: int) -> None:
        """`fan`: part, aux, aux2 or chamber; `speed` 0-100 %."""
        await self._command(f"/printers/{printer_id}/fan-speed", fan=fan, speed=speed)

    async def set_airduct_mode(self, printer_id: int, mode: str) -> None:
        await self._command(f"/printers/{printer_id}/airduct-mode", mode=mode)

    async def jog_xy(self, printer_id: int, x: float, y: float) -> None:
        await self._command(f"/printers/{printer_id}/xy-jog", x=x, y=y)

    async def jog_z(self, printer_id: int, distance: float) -> None:
        """A positive distance moves the bed away from the nozzle, on every model."""
        await self._command(f"/printers/{printer_id}/bed-jog", distance=distance)

    async def jog_extruder(self, printer_id: int, distance: float) -> None:
        await self._command(f"/printers/{printer_id}/extruder-jog", distance=distance)

    async def home_axes(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/home-axes", axes="all")

    async def execute_hms_action(self, printer_id: int, code: str, action: str, job_id: str | None) -> None:
        """Answers an HMS message as on the printer's screen: its full code,
        the answer, the job it belongs to (BamBuddy waits for the printer)."""
        await self._request(
            "POST", f"/printers/{printer_id}/hms/execute-action", json={"print_error": code, "action": action, "job_id": job_id}
        )

    async def clear_hms(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/hms/clear")

    async def clear_plate(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/clear-plate")

    async def refresh_status(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/refresh-status")

    async def load_filament(self, printer_id: int, tray_id: int) -> None:
        await self._command(f"/printers/{printer_id}/ams/load", tray_id=tray_id)

    async def unload_filament(self, printer_id: int) -> None:
        await self._command(f"/printers/{printer_id}/ams/unload")

    async def start_drying(self, printer_id: int, ams_id: int, temperature: int, duration: int) -> None:
        await self._command(
            f"/printers/{printer_id}/drying/start", ams_id=ams_id, temp=temperature, duration=duration
        )

    async def stop_drying(self, printer_id: int, ams_id: int) -> None:
        await self._command(f"/printers/{printer_id}/drying/stop", ams_id=ams_id)

    async def select_extruder(self, printer_id: int, extruder: int) -> None:
        """Two-nozzle printers: extruder 0 is the right nozzle, 1 the left one."""
        await self._command(f"/printers/{printer_id}/select-extruder", extruder=extruder)

    async def skip_objects(self, printer_id: int, objects: list[int]) -> None:
        """For good: the printer leaves these objects out of the rest of the job."""
        await self._request("POST", f"/printers/{printer_id}/print/skip-objects", json=objects)

    async def configure_slot(
        self,
        printer_id: int,
        ams_id: int,
        slot: int,
        *,
        tray_type: str,
        name: str,
        color: str,
        temp_min: int,
        temp_max: int,
        tray_info_idx: str = "",
        cali_idx: int = -1,
        nozzle_diameter: str = "0.4",
        kprofile_filament_id: str | None = None,
        kprofile_setting_id: str | None = None,
        k_value: float | None = None,
    ) -> None:
        """The filament of a slot (AMS 255: the external spools, 0 left or
        the only one, 1 right), as BamBuddy's Configure dialog sends it. An
        empty `tray_info_idx` keeps the slot's preset when the material
        stays, else BamBuddy takes the material's generic one. A K profile
        (`cali_idx` of the printer's table) goes with its filament: BamBuddy
        files the slot under it, so the printer keeps the selection."""
        k_profile = {
            name: value
            for name, value in (
                ("kprofile_filament_id", kprofile_filament_id),
                ("kprofile_setting_id", kprofile_setting_id),
                ("k_value", k_value),
            )
            if value is not None
        }
        await self._command(
            f"/printers/{printer_id}/slots/{ams_id}/{slot}/configure",
            tray_info_idx=tray_info_idx,
            tray_type=tray_type,
            tray_sub_brands=name,
            tray_color=color,
            nozzle_temp_min=temp_min,
            nozzle_temp_max=temp_max,
            cali_idx=cali_idx,
            nozzle_diameter=nozzle_diameter,
            **k_profile,
        )

    async def reset_slot(self, printer_id: int, ams_id: int, slot: int) -> None:
        """The slot's material and colour cleared, as the printer's Reset
        (AMS 255: the external spools, 0 left or the only one, 1 right)."""
        await self._command(f"/printers/{printer_id}/ams/{ams_id}/tray/{slot}/reset")

    async def refresh_rfid(self, printer_id: int, ams_id: int, slot: int) -> None:
        """The AMS reads the spool's chip again (refused while any filament
        is loaded)."""
        await self._command(f"/printers/{printer_id}/ams/{ams_id}/slot/{slot}/refresh")

    async def set_print_option(self, printer_id: int, module: str, enabled: bool) -> None:
        """An AI detector on or off. "never_halt" makes BamBuddy leave the
        sensitivity out of the command: the printer keeps its own."""
        await self._command(
            f"/printers/{printer_id}/print-options",
            module_name=module,
            enabled=_flag(enabled),
            sensitivity="never_halt",
        )

    async def perform_maintenance(self, task_id: int) -> None:
        """Marks a maintenance task done: its count starts over."""
        await self._request("POST", f"/maintenance/items/{task_id}/perform", json={"notes": None})

    async def set_ams_backup(self, printer_id: int, enabled: bool) -> None:
        await self._command(f"/printers/{printer_id}/ams-backup", enabled=_flag(enabled))

    async def control_plug(self, plug_id: int, on: bool) -> None:
        """A plug on or off, by name: BamBuddy's toggle skips what it does
        on and off (a printer marked offline, its scripts run). Off cuts the
        power -- BamBuddy checks no print."""
        await self._request(
            "POST", f"/smart-plugs/{plug_id}/control", json={"action": "on" if on else "off"}, timeout=_PLUG_TIMEOUT
        )
