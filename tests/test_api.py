"""The API client against an HTTP mock: the request each method sends, and
what becomes of BamBuddy's answer."""
from __future__ import annotations

import logging
from typing import Any
from unittest.mock import AsyncMock, patch

import aiohttp
import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyBadAnswerError,
    BamBuddyClient,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
    AddressWithLoginError,
    normalise_url,
)

from tests.conftest import API_KEY, STREAM_TOKEN, URL, load_fixture

API = f"{URL}/api/v1"


def _client(hass: HomeAssistant, **kwargs: Any) -> BamBuddyClient:
    return BamBuddyClient(URL, API_KEY, async_get_clientsession(hass), **kwargs)


@pytest.mark.parametrize(
    ("typed", "normalised"),
    [
        ("192.0.2.5:8000", "http://192.0.2.5:8000"),
        ("http://bambuddy.local:8000/", "http://bambuddy.local:8000"),
        ("https://bb.example.com/api/v1/", "https://bb.example.com"),
        ("https://bb.example.com/api/v1", "https://bb.example.com"),
        ("HTTP://BamBuddy.Local:8000", "http://bambuddy.local:8000"),
        ("https://example.com/bambuddy/", "https://example.com/bambuddy"),
        ("  http://192.0.2.5:8000  ", "http://192.0.2.5:8000"),
        ("bambuddy.local", "http://bambuddy.local"),
        ("http://bambuddy.local:80/", "http://bambuddy.local"),
        ("https://bb.example.com:443", "https://bb.example.com"),
        ("https://bb.example.com:80", "https://bb.example.com:80"),
        ("http://[FD00::5]:8000/", "http://[fd00::5]:8000"),
        ("[fd00::5]:8000", "http://[fd00::5]:8000"),
    ],
)
def test_normalise_url(typed: str, normalised: str) -> None:
    """One form for whatever a user types: the scheme added when missing,
    scheme and host in lower case, the scheme's own port, the trailing
    slash and an /api/v1 the user copied from BamBuddy's docs removed, a
    reverse-proxy path kept -- one server, one entry."""
    assert normalise_url(typed) == normalised


@pytest.mark.parametrize("typed", ["http://admin:secret@bambuddy.local:8000", "https://admin@bb.example.com"])
def test_normalise_url_refuses_a_login(typed: str) -> None:
    """BamBuddy takes the API key; the address is the entry's identity and
    shows in its title: no password in it."""
    with pytest.raises(AddressWithLoginError):
        normalise_url(typed)


@pytest.mark.parametrize("typed", ["", "   ", "ftp://bambuddy.local", "http://", "http://bad host:8000"])
def test_normalise_url_refuses_what_is_no_address(typed: str) -> None:
    with pytest.raises(ValueError):
        normalise_url(typed)


async def test_the_version_is_read_without_the_key(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """BamBuddy names its version and whether its authentication is on on
    public routes: the setup reads them before it knows whether the key is
    good."""
    aioclient_mock.get(f"{API}/updates/version", json={"version": "1.2.5.7", "repo": "maziggy/bambuddy"})

    aioclient_mock.get(f"{API}/auth/status", json={"auth_enabled": True, "requires_setup": False})

    client = _client(hass)
    assert await client.get_version() == "1.2.5.7"
    assert await client.get_auth_status() == {"auth_enabled": True, "requires_setup": False}

    for _, _, _, headers in aioclient_mock.mock_calls:
        assert "X-API-Key" not in (headers or {})


@pytest.mark.parametrize(
    ("call", "args", "verb", "url"),
    [
        ("get_auth_me", (), "GET", f"{API}/auth/me"),
        ("get_system_info", (), "GET", f"{API}/system/info"),
        ("get_statistics", (), "GET", f"{API}/archives/stats"),
        ("get_update_check", (), "GET", f"{API}/updates/check"),
        ("get_firmware_updates", (), "GET", f"{API}/firmware/updates"),
        ("get_printers", (), "GET", f"{API}/printers/"),
        ("get_printer", (1,), "GET", f"{API}/printers/1"),
        ("get_status", (1,), "GET", f"{API}/printers/1/status"),
        ("get_maintenance", (1,), "GET", f"{API}/maintenance/printers/1"),
        ("get_diagnostic", (1,), "GET", f"{API}/printers/1/diagnostic"),
    ],
)
async def test_each_read_reaches_its_path_with_the_key(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    call: str,
    args: tuple[int, ...],
    verb: str,
    url: str,
) -> None:
    """BamBuddy's routes, and the key its scoped API keys are checked by."""
    answer: Any = [{"answer": call}] if call == "get_printers" else {"answer": call}
    aioclient_mock.request(verb, url, json=answer)

    assert await getattr(_client(hass), call)(*args) == answer

    [(method, called, _, headers)] = aioclient_mock.mock_calls
    assert (method, str(called)) == (verb, url)
    assert headers["X-API-Key"] == API_KEY


async def test_an_hms_answer_goes_as_json(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy's execute-action takes a JSON body: the fault's full code,
    the action, the job it belongs to."""
    url = f"{API}/printers/1/hms/execute-action"
    aioclient_mock.post(url, json={"success": True, "message": "HMS action executed"})

    await _client(hass).execute_hms_action(1, "0700200000020012", "RESUME_PRINTING", "498765432")

    [(method, called, body, _)] = aioclient_mock.mock_calls
    assert (method, str(called), body) == (
        "POST",
        url,
        {"print_error": "0700200000020012", "action": "RESUME_PRINTING", "job_id": "498765432"},
    )


@pytest.mark.parametrize(
    ("call", "args", "url"),
    [
        ("pause", (1,), f"{API}/printers/1/print/pause"),
        ("resume", (1,), f"{API}/printers/1/print/resume"),
        ("stop", (1,), f"{API}/printers/1/print/stop"),
        ("set_print_speed", (1, 3), f"{API}/printers/1/print-speed?mode=3"),
        ("set_chamber_light", (1, True), f"{API}/printers/1/chamber-light?on=true"),
        ("set_chamber_light", (1, False), f"{API}/printers/1/chamber-light?on=false"),
        ("set_nozzle_temperature", (1, 220, 1), f"{API}/printers/1/temperature/nozzle?target=220&nozzle=1"),
        ("set_bed_temperature", (1, 60), f"{API}/printers/1/temperature/bed?target=60"),
        ("set_chamber_temperature", (1, 45), f"{API}/printers/1/temperature/chamber?target=45"),
        ("set_fan_speed", (1, "aux", 40), f"{API}/printers/1/fan-speed?fan=aux&speed=40"),
        ("set_airduct_mode", (1, "heating"), f"{API}/printers/1/airduct-mode?mode=heating"),
        ("jog_xy", (1, 10.0, -1.0), f"{API}/printers/1/xy-jog?x=10.0&y=-1.0"),
        ("jog_z", (1, -5.0), f"{API}/printers/1/bed-jog?distance=-5.0"),
        ("jog_extruder", (1, 10.0), f"{API}/printers/1/extruder-jog?distance=10.0"),
        ("home_axes", (1,), f"{API}/printers/1/home-axes?axes=all"),
        ("clear_hms", (1,), f"{API}/printers/1/hms/clear"),
        ("clear_plate", (1,), f"{API}/printers/1/clear-plate"),
        ("refresh_status", (1,), f"{API}/printers/1/refresh-status"),
        ("load_filament", (1, 254), f"{API}/printers/1/ams/load?tray_id=254"),
        ("unload_filament", (1,), f"{API}/printers/1/ams/unload"),
        ("start_drying", (1, 128, 65, 8), f"{API}/printers/1/drying/start?ams_id=128&temp=65&duration=8"),
        ("stop_drying", (1, 128), f"{API}/printers/1/drying/stop?ams_id=128"),
        ("select_extruder", (1, 1), f"{API}/printers/1/select-extruder?extruder=1"),
        ("set_ams_backup", (1, True), f"{API}/printers/1/ams-backup?enabled=true"),
        ("set_ams_backup", (1, False), f"{API}/printers/1/ams-backup?enabled=false"),
        ("reset_slot", (1, 0, 2), f"{API}/printers/1/ams/0/tray/2/reset"),
        ("refresh_rfid", (1, 128, 0), f"{API}/printers/1/ams/128/slot/0/refresh"),
    ],
)
async def test_each_command_reaches_its_route(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    call: str,
    args: tuple[Any, ...],
    url: str,
) -> None:
    """Every control is a POST with its parameters in the query, as
    BamBuddy's FastAPI routes read them. The chamber light's flag goes as
    text: aiohttp refuses a Python bool in a query."""
    aioclient_mock.post(url, json={"success": True, "message": "sent"})

    assert await getattr(_client(hass), call)(*args) is None

    [(method, called, _, headers)] = aioclient_mock.mock_calls
    assert (method, str(called)) == ("POST", url)
    assert headers["X-API-Key"] == API_KEY


@pytest.mark.parametrize(
    ("status", "body", "error", "detail"),
    [
        (401, {"detail": "Authentication required"}, BamBuddyAuthError, None),
        (
            403,
            {"detail": "API key does not have 'can_control_printer' permission"},
            BamBuddyPermissionError,
            "API key does not have 'can_control_printer' permission",
        ),
        (404, {"detail": "Printer not found"}, BamBuddyNotFoundError, "Printer not found"),
        (500, {"detail": "Failed to pause print"}, BamBuddyApiError, "Failed to pause print"),
        (422, {"detail": [{"type": "missing", "msg": "Field required"}]}, BamBuddyApiError, "Field required"),
        # A page instead of BamBuddy's text: the status (a gateway's is no answer, below).
        (500, b"<html>Internal error</html>", BamBuddyApiError, "HTTP 500"),
    ],
)
async def test_each_failure_becomes_its_error(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    status: int,
    body: Any,
    error: type[Exception],
    detail: str | None,
) -> None:
    """A wrong key, a missing permission, an unknown printer and BamBuddy's
    own refusals each reach the caller as their own error, with
    BamBuddy's text where it sent one."""
    url = f"{API}/printers/1/print/pause"
    if isinstance(body, bytes):
        aioclient_mock.post(url, status=status, content=body)
    else:
        aioclient_mock.post(url, status=status, json=body)

    with pytest.raises(error) as raised:
        await _client(hass).pause(1)

    if detail is not None:
        assert detail in str(raised.value)


@pytest.mark.parametrize("failure", [aiohttp.ClientConnectionError("refused"), TimeoutError()])
async def test_an_unreachable_bambuddy_is_a_connection_error(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, failure: Exception
) -> None:
    aioclient_mock.get(f"{API}/system/info", exc=failure)

    with pytest.raises(BamBuddyConnectionError):
        await _client(hass).get_system_info()


async def test_a_closed_session_is_a_connection_error(hass: HomeAssistant) -> None:
    """Home Assistant closes its web session as it stops: a request a timer
    sends after that ("Session is closed", a RuntimeError) is one more
    BamBuddy Home Assistant does not reach."""
    session = aiohttp.ClientSession()
    await session.close()

    with pytest.raises(BamBuddyConnectionError):
        await BamBuddyClient(URL, API_KEY, session).get_printers()


async def test_an_answer_that_is_no_json_is_an_api_error(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A proxy page in front of BamBuddy answers 200 with HTML."""
    aioclient_mock.get(f"{API}/system/info", content=b"<html>login</html>")

    with pytest.raises(BamBuddyApiError):
        await _client(hass).get_system_info()


async def test_the_stream_token_never_reaches_the_log(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, caplog: pytest.LogCaptureFixture
) -> None:
    """The token travels in the camera's snapshot and stream URLs: whoever
    reads the log could watch the printer."""
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy")
    aioclient_mock.post(f"{API}/printers/camera/stream-token", json={"token": STREAM_TOKEN})

    client = _client(hass)
    assert await client.get_stream_token() == STREAM_TOKEN
    assert client.stream_url(1, STREAM_TOKEN, 30) == f"{API}/printers/1/camera/stream?fps=30&token={STREAM_TOKEN}"
    assert STREAM_TOKEN not in caplog.text
    assert API_KEY not in caplog.text


async def test_the_print_objects_and_skipping_them(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """The objects come from the running job; skipping takes their ids as a
    JSON array -- BamBuddy's route reads a bare list as the body."""
    objects = {"objects": [{"id": 87, "name": "Bracket", "x": 72.4, "y": 128.0, "skipped": False}], "total": 1}
    aioclient_mock.get(f"{API}/printers/1/print/objects", json=objects)
    aioclient_mock.post(f"{API}/printers/1/print/skip-objects", json={"success": True, "skipped_objects": [87]})
    client = _client(hass)

    assert await client.get_print_objects(1) == objects
    await client.skip_objects(1, [87])

    assert aioclient_mock.mock_calls[1][2] == [87]


async def test_the_snapshot_is_fetched_with_the_token(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    aioclient_mock.get(f"{API}/printers/1/camera/snapshot", content=b"jpeg")

    assert await _client(hass).get_snapshot(1, STREAM_TOKEN) == b"jpeg"

    [(_, url, _, _)] = aioclient_mock.mock_calls
    assert url.query["token"] == STREAM_TOKEN


async def test_the_cover_is_fetched_with_the_key(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """BamBuddy 1.2.5.6 and newer take the key for the cover."""
    aioclient_mock.get(f"{API}/printers/1/cover", content=b"png")

    assert await _client(hass).get_cover(1) == b"png"

    [(_, _, _, headers)] = aioclient_mock.mock_calls
    assert headers["X-API-Key"] == API_KEY


@pytest.mark.parametrize(("verify_ssl", "ssl"), [(False, False), (True, True)])
async def test_certificate_checks_can_be_turned_off(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, verify_ssl: bool, ssl: bool
) -> None:
    """A BamBuddy behind a self-signed certificate: aiohttp skips the
    check with ssl=False and makes it with ssl=True."""
    aioclient_mock.get(f"{API}/system/info", json={})
    session = async_get_clientsession(hass)
    client = BamBuddyClient(URL, API_KEY, session, verify_ssl=verify_ssl)

    with patch.object(session, "request", wraps=session.request) as request:
        await client.get_system_info()

    assert request.call_args.kwargs["ssl"] is ssl


async def test_configuring_a_slot(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy's own Configure dialog: all in the query, the colour with its
    alpha; an empty filament id lets BamBuddy keep the slot's preset."""
    url = (
        f"{API}/printers/1/slots/255/1/configure?tray_info_idx=&tray_type=PETG&tray_sub_brands=Generic+PETG"
        "&tray_color=C12E1FFF&nozzle_temp_min=220&nozzle_temp_max=260&cali_idx=-1&nozzle_diameter=0.6"
    )
    aioclient_mock.post(url, json={"success": True, "message": "Configured AMS 255 tray 1 with Generic PETG"})

    await _client(hass).configure_slot(
        1, 255, 1, tray_type="PETG", name="Generic PETG", color="C12E1FFF", temp_min=220, temp_max=260, nozzle_diameter="0.6"
    )

    [(method, called, _, _)] = aioclient_mock.mock_calls
    assert (method, called.path, dict(called.query)) == (
        "POST",
        "/api/v1/printers/1/slots/255/1/configure",
        {
            "tray_info_idx": "",
            "tray_type": "PETG",
            "tray_sub_brands": "Generic PETG",
            "tray_color": "C12E1FFF",
            "nozzle_temp_min": "220",
            "nozzle_temp_max": "260",
            "cali_idx": "-1",
            "nozzle_diameter": "0.6",
        },
    )


async def test_a_slot_with_its_k_profile(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """The printer's own calibration: BamBuddy selects it for the slot under
    the profile's filament, so the selection holds."""
    url = f"{API}/printers/1/slots/0/2/configure"
    aioclient_mock.post(url, json={"success": True, "message": "Configured"})

    await _client(hass).configure_slot(
        1, 0, 2, tray_type="PLA", name="Generic PLA", color="FFFFFFFF", temp_min=190, temp_max=240,
        tray_info_idx="GFL99", cali_idx=3, kprofile_filament_id="GFL99", kprofile_setting_id="GFSL99", k_value=0.018,
    )

    [(_, called, _, _)] = aioclient_mock.mock_calls
    assert {key: called.query[key] for key in ("cali_idx", "kprofile_filament_id", "kprofile_setting_id", "k_value")} == {
        "cali_idx": "3",
        "kprofile_filament_id": "GFL99",
        "kprofile_setting_id": "GFSL99",
        "k_value": "0.018",
    }


async def test_the_printers_k_profiles(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """Per nozzle diameter, with BamBuddy's trailing slash; the printer is
    asked live, which can take BamBuddy 16 s."""
    aioclient_mock.get(f"{API}/printers/1/kprofiles/?nozzle_diameter=0.6", json={"profiles": [{"slot_id": 1}], "nozzle_diameter": "0.6"})

    assert await _client(hass).get_kprofiles(1, "0.6") == [{"slot_id": 1}]


@pytest.mark.parametrize(("enabled", "flag"), [(True, "true"), (False, "false")])
async def test_switching_a_detector(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, enabled: bool, flag: str) -> None:
    """"never_halt" makes BamBuddy leave the sensitivity out: the printer
    keeps the one its user chose."""
    url = f"{API}/printers/1/print-options?module_name=clump_detector&enabled={flag}&sensitivity=never_halt"
    aioclient_mock.post(url, json={"success": True})

    await _client(hass).set_print_option(1, "clump_detector", enabled)

    [(method, called, _, _)] = aioclient_mock.mock_calls
    assert (method, str(called)) == ("POST", url)


async def test_the_print_hours(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy's runtime counter, Read Status suffices."""
    aioclient_mock.get(f"{API}/printers/1/runtime-debug", json={"total_hours": 559.5})

    assert await _client(hass).get_runtime(1) == {"total_hours": 559.5}


async def test_the_system_information_may_take_long(hass: HomeAssistant) -> None:
    """BamBuddy walks through its whole archive for it."""
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={})) as request:
        await client.get_system_info()

    assert request.await_args is not None
    assert request.await_args.kwargs["timeout"].total == 30


async def test_the_statistics_may_take_long_but_briefly_at_setup(hass: HomeAssistant) -> None:
    """BamBuddy asks every smart plug for its energy, one after another."""
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={})) as request:
        await client.get_statistics()
        await client.get_statistics(patient=False)

    timeouts = [call.kwargs["timeout"] for call in request.await_args_list]
    assert [(timeout.total, timeout.connect) for timeout in timeouts] == [(30, 5), (10, 5)]


async def test_a_connection_gets_five_seconds(hass: HomeAssistant) -> None:
    """A connect that hangs is told apart from a slow answer."""
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={})) as request:
        await client.get_status(1)
        await client.get_system_info(patient=False)

    assert request.await_args_list[0].kwargs["timeout"].connect == 5
    assert request.await_args_list[1].kwargs["timeout"].total == 10
    assert request.await_args_list[1].kwargs["timeout"].connect == 5


@pytest.mark.parametrize("status", [502, 503, 504])
async def test_a_proxy_without_bambuddy_is_no_answer(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, status: int) -> None:
    """BamBuddy restarting behind a reverse proxy: the proxy's page is no
    error BamBuddy sent -- it cannot be reached."""
    aioclient_mock.get(f"{API}/printers/1/status", status=status, text="<html>Bad Gateway</html>")

    with pytest.raises(BamBuddyConnectionError):
        await _client(hass).get_status(1)


async def test_bambuddys_own_unavailable_keeps_its_text(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    aioclient_mock.get(f"{API}/printers/1/status", status=503, json={"detail": "Printer service is starting"})

    with pytest.raises(BamBuddyApiError) as raised:
        await _client(hass).get_status(1)

    assert raised.value.detail == "Printer service is starting"


async def test_marking_a_maintenance_task_done(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy wants a body, notes or none."""
    aioclient_mock.post(f"{API}/maintenance/items/17/perform", json={"id": 17, "is_due": False})

    assert await _client(hass).perform_maintenance(17) is None

    [(method, called, body, headers)] = aioclient_mock.mock_calls
    assert (method, str(called), body) == ("POST", f"{API}/maintenance/items/17/perform", {"notes": None})
    assert headers["X-API-Key"] == API_KEY


async def test_the_connection_check_may_take_half_a_minute(hass: HomeAssistant) -> None:
    """It probes the printer's ports and waits up to ten seconds for a
    report: some 26 seconds at worst."""
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={})) as request:
        await client.get_diagnostic(1)

    assert request.await_args is not None
    assert request.await_args.kwargs["timeout"].total == 40


async def test_the_smart_plugs_are_read(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy's plug list comes from its database: one cheap read."""
    aioclient_mock.get(f"{API}/smart-plugs/", json=[{"id": 3, "name": "X1C plug", "printer_id": 1}])

    assert await _client(hass).get_smart_plugs() == [{"id": 3, "name": "X1C plug", "printer_id": 1}]


async def test_a_plug_list_that_is_no_list_is_refused(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    aioclient_mock.get(f"{API}/smart-plugs/", json={"detail": "odd"})

    with pytest.raises(BamBuddyApiError):
        await _client(hass).get_smart_plugs()


async def test_a_plugs_status_may_take_half_a_minute(hass: HomeAssistant) -> None:
    """BamBuddy asks the plug itself: a Home Assistant plug with energy
    sensors takes several calls of up to ten seconds each."""
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={"state": "ON", "reachable": True})) as request:
        assert await client.get_plug_status(3) == {"state": "ON", "reachable": True}

    assert request.await_args is not None
    assert request.await_args.args == ("GET", "/smart-plugs/3/status")
    assert request.await_args.kwargs["timeout"].total == 30


@pytest.mark.parametrize(("on", "action"), [(True, "on"), (False, "off")])
async def test_a_plug_is_switched(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, on: bool, action: str) -> None:
    """On and off by name: BamBuddy's toggle skips its bookkeeping (the
    printer marked offline, the scripts of the printer)."""
    aioclient_mock.post(f"{API}/smart-plugs/3/control", json={"success": True, "action": action})

    assert await _client(hass).control_plug(3, on) is None

    [(method, called, body, headers)] = aioclient_mock.mock_calls
    assert (method, str(called), body) == ("POST", f"{API}/smart-plugs/3/control", {"action": action})
    assert headers["X-API-Key"] == API_KEY


async def test_a_plug_that_does_not_answer_is_an_api_error(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy reached, the plug not: 503 with BamBuddy's text, no proxy."""
    aioclient_mock.post(f"{API}/smart-plugs/3/control", status=503, json={"detail": "Failed to communicate with device"})

    with pytest.raises(BamBuddyApiError) as caught:
        await _client(hass).control_plug(3, False)

    assert (caught.value.status, caught.value.detail) == (503, "Failed to communicate with device")


@pytest.mark.parametrize(
    ("answer", "free"),
    [({"stopped": 1}, True), ({"stopped": 0}, True), ({"stopped": 0, "skipped": True}, False)],
)
async def test_stopping_the_camera(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, answer: dict[str, Any], free: bool
) -> None:
    """BamBuddy ends the printer's camera connection only when nobody
    watches any more; it says so with `skipped`."""
    aioclient_mock.post(f"{API}/printers/1/camera/stop", json=answer)

    assert await _client(hass).stop_camera(1) is free


async def test_a_proxys_404_is_no_answer_of_bambuddys(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """A reverse proxy before a BamBuddy that is not up (Traefik: "404 page not found", text) is a
    connection problem; BamBuddy's own 404 always carries its JSON detail."""
    aioclient_mock.get(f"{API}/updates/version", status=404, text="404 page not found", headers={"Content-Type": "text/plain"})
    aioclient_mock.get(f"{API}/printers/7/status", status=404, json={"detail": "Printer not found"})

    with pytest.raises(BamBuddyConnectionError):
        await _client(hass).get_version()
    with pytest.raises(BamBuddyNotFoundError):
        await _client(hass).get_status(7)


async def test_no_snapshot_token_in_the_log(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, caplog: pytest.LogCaptureFixture
) -> None:
    """The snapshot carries the camera token in its address; neither a good nor a refused one logs it."""
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy")
    aioclient_mock.get(f"{API}/printers/1/camera/snapshot", content=b"jpeg")
    aioclient_mock.get(f"{API}/printers/2/camera/snapshot", status=401, json={"detail": "Valid camera stream token required"})

    assert await _client(hass).get_snapshot(1, STREAM_TOKEN) == b"jpeg"
    with pytest.raises(BamBuddyAuthError):
        await _client(hass).get_snapshot(2, STREAM_TOKEN)

    assert STREAM_TOKEN not in caplog.text


async def test_the_update_checks_may_take_a_minute(hass: HomeAssistant) -> None:
    """BamBuddy asks GitHub (10 s of its own) and, per printer model, Bambu Lab's pages live."""
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={})) as request:
        await client.get_update_check()
        await client.get_firmware_updates()

    assert [(call.kwargs["timeout"].total, call.kwargs["timeout"].connect) for call in request.await_args_list] == [(60, 5), (60, 5)]


@pytest.mark.parametrize(
    ("call", "args", "total"),
    [
        # The printer is asked live: up to about 16 seconds.
        ("get_kprofiles", (1, "0.4"), 25),
        # BamBuddy waits up to 15 seconds for a fresh frame.
        ("get_snapshot", (1, STREAM_TOKEN), 20),
        ("get_print_objects", (1,), 60),
        ("get_cover", (1,), 30),
        ("control_plug", (3, False), 30),
        ("get_plug_status", (3,), 30),
    ],
)
async def test_the_slow_answers_get_their_time(hass: HomeAssistant, call: str, args: tuple[Any, ...], total: int) -> None:
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={})) as request:
        await getattr(client, call)(*args)
    timeout = request.await_args.kwargs["timeout"]
    assert (timeout.total, timeout.connect) == (total, 5)


async def test_a_plug_at_the_start_gets_five_seconds(hass: HomeAssistant) -> None:
    """At Home Assistant's start the plugs' first reads may not hold the setup up."""
    client = _client(hass)
    with patch.object(client, "_request", AsyncMock(return_value={})) as request:
        await client.get_plug_status(3, patient=False)
    assert request.await_args.kwargs["timeout"].total == 5


@pytest.mark.parametrize(
    ("fixture", "marks"),
    [
        # BamBuddy's default toggles and Control Printer: the extra toggles do no harm.
        ("auth_me_control.json", {"read_status": "Y", "control_printer": "Y", "manage_maintenance": "Y"}),
        # BamBuddy's create dialog leaves Control Printer off.
        ("auth_me_default.json", {"read_status": "Y", "control_printer": "N", "manage_maintenance": "Y"}),
        ("auth_me_read.json", {"read_status": "Y", "control_printer": "N", "manage_maintenance": "N"}),
        # Its owner may only read: BamBuddy narrows the key to it.
        ("auth_me_viewer.json", {"read_status": "Y", "control_printer": "N", "manage_maintenance": "N"}),
        ("auth_me_other.json", {"read_status": "N", "control_printer": "N", "manage_maintenance": "N"}),
    ],
)
async def test_check_key_marks_each_toggle(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, fixture: str, marks: dict[str, str]
) -> None:
    """A toggle counts only with every permission the integration uses
    under it; the marks are what the texts show."""
    aioclient_mock.get(f"{API}/auth/me", json=load_fixture(fixture))

    scopes = await _client(hass).check_key()

    symbol = {"Y": "✓", "N": "✗"}
    assert scopes.marks() == {key: symbol[value] for key, value in marks.items()}
    assert scopes.missing == [key for key, value in marks.items() if value == "N"]
    assert aioclient_mock.mock_calls[-1][3]["X-API-Key"] == API_KEY


@pytest.mark.parametrize(
    ("answer", "error"),
    [
        ({"status": 401, "json": {"detail": "Authentication required"}}, BamBuddyAuthError),
        ({"status": 403, "json": {"detail": "API key owner is deactivated or no longer exists"}}, BamBuddyPermissionError),
        ({"json": {"username": "api-key:bb_x..."}}, BamBuddyBadAnswerError),
        ({"json": {"permissions": None}}, BamBuddyBadAnswerError),
    ],
)
async def test_check_key_refusals(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, answer: dict[str, Any], error: type[Exception]
) -> None:
    aioclient_mock.get(f"{API}/auth/me", **answer)

    with pytest.raises(error):
        await _client(hass).check_key()


async def test_an_error_names_its_route_without_the_query(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """The guard's warning names the route BamBuddy refused; the camera's
    token travels in the query and must not."""
    aioclient_mock.get(f"{API}/printers/3/cover", status=403, json={"detail": "nope"})

    with pytest.raises(BamBuddyPermissionError) as raised:
        await _client(hass).get_cover(3)

    assert raised.value.path == "GET /printers/3/cover"
    assert STREAM_TOKEN not in raised.value.path
