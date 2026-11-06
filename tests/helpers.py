"""Helpers more than one test module uses."""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from typing import Any

import aiohttp
from multidict import CIMultiDict, CIMultiDictProxy
import yarl
from homeassistant.config_entries import SOURCE_REAUTH, SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.bambuddy.api import BamBuddyConnectionError
from custom_components.bambuddy.const import DOMAIN
from tests.conftest import API_KEY, X1C, load_fixture


async def reload_entry(hass: HomeAssistant, entry_id: str, *, wait_background_tasks: bool = False) -> None:
    """Reload the entry; the reload must succeed."""
    assert await hass.config_entries.async_reload(entry_id)
    await hass.async_block_till_done(wait_background_tasks=wait_background_tasks)


def plug_list(**changes: dict[str, Any]) -> list[dict[str, Any]]:
    """BamBuddy's plug list (tests/fixtures/smart_plugs.json), some plugs changed (by number as text)."""
    return [{**plug, **changes.get(str(plug["id"]), {})} for plug in load_fixture("smart_plugs.json")]


def plug_info(plug_id: int) -> dict[str, object]:
    """One plug of tests/fixtures/smart_plugs.json."""
    return next(dict(plug) for plug in load_fixture("smart_plugs.json") if plug["id"] == plug_id)


def plugs_but(*plug_ids: int) -> list[dict[str, Any]]:
    """BamBuddy's plug list without these plugs."""
    return [plug for plug in load_fixture("smart_plugs.json") if plug["id"] not in plug_ids]


def with_plugs(api: SimpleNamespace) -> None:
    """BamBuddy with the plugs of tests/fixtures/smart_plugs.json."""
    api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")


async def remove_device(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, entry: MockConfigEntry, device: dr.DeviceEntry
) -> dict:
    assert await async_setup_component(hass, "config", {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "config/device_registry/remove_config_entry",
            "config_entry_id": entry.entry_id,
            "device_id": device.id,
        }
    )
    response: dict = await client.receive_json()
    return response


class FakeSocket:
    """aiohttp's client socket as far as the live connection reads it: a
    message, or the end (a close code; 1006 after a heartbeat failure)."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[aiohttp.WSMessage] = asyncio.Queue()
        self.closed = False
        self.close_code: int | None = None
        self.closes = 0

    def push(self, body: Any) -> None:
        text = body if isinstance(body, str) else json.dumps(body)
        self._queue.put_nowait(aiohttp.WSMessage(aiohttp.WSMsgType.TEXT, text, None))

    def send(self, kind: aiohttp.WSMsgType, data: Any = None) -> None:
        self._queue.put_nowait(aiohttp.WSMessage(kind, data, None))

    def end(self, code: int = 1000) -> None:
        self.send(aiohttp.WSMsgType.CLOSE, code)

    def __aiter__(self) -> FakeSocket:
        return self

    async def __anext__(self) -> aiohttp.WSMessage:
        message = await self._queue.get()
        if message.type is aiohttp.WSMsgType.CLOSE:
            self.closed, self.close_code = True, message.data
            raise StopAsyncIteration
        if message.type is aiohttp.WSMsgType.ERROR:
            self.closed, self.close_code = True, 1006
        return message

    async def close(self) -> bool:
        self.closes += 1
        self.closed = True
        return True


async def settle(hass: HomeAssistant) -> None:
    """Lets the connection's task run while its socket stays open -- no
    wait for background tasks: an open socket's never ends."""
    for _ in range(20):
        await hass.async_block_till_done()
        await asyncio.sleep(0)


def devices_by_identifier(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, dr.DeviceEntry]:
    """The entry's devices by their BamBuddy identifier."""
    return {
        identifier: device
        for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
        for domain, identifier in device.identifiers
        if domain == DOMAIN
    }


def entity_ids(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, str]:
    """The entry's registered entities, unique ID to entity ID."""
    return {item.unique_id: item.entity_id for item in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)}


def as_model(bambuddy_api: SimpleNamespace, model: str | None, printer_id: int = X1C) -> None:
    """The printer's place listed as another model."""
    printers = load_fixture("printers.json")
    for printer in printers:
        if printer["id"] == printer_id:
            printer["model"] = model
    bambuddy_api.get_printers.return_value = printers


def listed_with(bambuddy_api: SimpleNamespace, printer_id: int, **fields: Any) -> None:
    """BamBuddy lists the printer with these fields, in its list and its details."""
    printers = [{**item, **fields} if item["id"] == printer_id else item for item in load_fixture("printers.json")]
    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.get_printer.side_effect = lambda wanted: next(item for item in printers if item["id"] == wanted)


def renamed_in_bambuddy(bambuddy_api: SimpleNamespace, printer_id: int, name: str) -> None:
    """The printer has a new name in BamBuddy: in its list, its details and its status."""
    listed_with(bambuddy_api, printer_id, name=name)
    bambuddy_api.statuses[printer_id]["name"] = name


def reauth_flows(hass: HomeAssistant) -> list[dict[str, Any]]:
    """This integration's reauthentication flows in progress."""
    return [flow for flow in hass.config_entries.flow.async_progress_by_handler(DOMAIN) if flow["context"].get("source") == SOURCE_REAUTH]


def details_are(bambuddy_api: SimpleNamespace, details: dict[str, Any]) -> None:
    """BamBuddy's details of a printer (`GET /printers/{id}`) answer this, whichever is asked."""
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = details


def failure_key(coordinator: DataUpdateCoordinator[Any]) -> str | None:
    """The translation key of the coordinator's last failure."""
    err = coordinator.last_exception
    return getattr(err, "translation_key", None)


def home_assistant_stops(hass: HomeAssistant) -> None:
    """The first stage of `async_stop`: the timers it may cancel go."""
    hass._cancel_cancellable_timers()  # noqa: SLF001


def timed_out(text: str) -> BamBuddyConnectionError:
    """A request that timed out, as the client raises it: "<route>: TimeoutError"."""
    err = BamBuddyConnectionError(f"{text}: TimeoutError")
    err.__cause__ = TimeoutError()
    return err


def socket_ready(bambuddy_api: SimpleNamespace, socket: FakeSocket | None = None) -> FakeSocket:
    """BamBuddy's live connection opens: this socket, a new one by default."""
    socket = socket if socket is not None else FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket
    return socket


def handshake_refusal(url: str, status: int, message: str = "Invalid response status") -> aiohttp.WSServerHandshakeError:
    """A refused WebSocket handshake as aiohttp raises it: its text names the URL, token included."""
    address = yarl.URL(url)
    info = aiohttp.RequestInfo(address, "GET", CIMultiDictProxy(CIMultiDict()), address)
    return aiohttp.WSServerHandshakeError(info, (), status=status, message=message)


async def never_answers(*_: Any, **__: Any) -> str:
    """A request that never comes back."""
    await asyncio.Event().wait()
    raise AssertionError("never answers")


# Configure's choices one menu down: under Manage printers or Settings.
_UNDER = {"add_printer": "printers", "remove_printer": "printers", "live_updates": "settings"}


async def open_options(hass: HomeAssistant, entry: MockConfigEntry, choice: str) -> dict[str, Any]:
    """Configure opened and its menus walked down to `choice`."""
    result: dict[str, Any] = await hass.config_entries.options.async_init(entry.entry_id)  # type: ignore[assignment]
    assert result["type"] is FlowResultType.MENU
    if choice in _UNDER:
        result = await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": _UNDER[choice]})  # type: ignore[assignment]
        assert result["type"] is FlowResultType.MENU
    return await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": choice})  # type: ignore[return-value]


def spool_row(**fields: Any) -> dict[str, Any]:
    """BamBuddy's first fixture spool (tests/fixtures/inventory_spools.json), some fields changed."""
    return {**load_fixture("inventory_spools.json")[0], **fields}


def with_inventory(bambuddy_api: SimpleNamespace, *extra: dict[str, Any]) -> None:
    """BamBuddy's inventory of tests/fixtures/inventory_*.json: spool 1 in
    the Workshop X1C's AMS A slot 3, spool 2 in slot 4, spool 3 in the Desk's
    first slot (printer 99, not set up), a deleted and an archived spool's
    rows; `extra` spools in no slot."""
    bambuddy_api.get_spools.return_value = [*load_fixture("inventory_spools.json"), *extra]
    bambuddy_api.get_spool_assignments.return_value = load_fixture("inventory_assignments.json")


async def call_action(hass: HomeAssistant, name: str, /, *, response: bool = False, **data: Any) -> Any:
    """One of the integration's actions, waited for; its answer with
    `response`. `data` may hold a field named `action` (answer_hms)."""
    return await hass.services.async_call(DOMAIN, name, data, blocking=True, return_response=response)


FLOW_INPUT = {"url": "bambuddy.local:8000/", "api_key": API_KEY, "verify_ssl": True}


# A second address: another BamBuddy, or the same one moved.
NEW_URL = "http://192.0.2.99:8000"


async def flow_start(hass: HomeAssistant) -> dict[str, Any]:
    result: dict[str, Any] = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    return result


async def flow_reconfigure(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, Any]:
    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    return result


def field_defaults(result: dict[str, Any]) -> dict[str, Any]:
    """The value each field of a form starts with."""
    return {str(key): key.default() for key in result["data_schema"].schema}


def field_choices(result: dict[str, Any], part: str = "value") -> list[str]:
    """The values or labels a form's one field offers."""
    [field] = result["data_schema"].schema
    return [option[part] for option in result["data_schema"].schema[field].config["options"]]


async def flow_submit(hass: HomeAssistant, flow_id: str, data: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = await hass.config_entries.flow.async_configure(flow_id, data)
    return result


async def flow_first_step(hass: HomeAssistant, data: dict[str, Any] = FLOW_INPUT) -> dict[str, Any]:
    """A new entry's flow, its first form sent."""
    return await flow_submit(hass, (await flow_start(hass))["flow_id"], data)


async def flow_at_new_address(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, Any]:
    """Reconfigure opened and sent with a new address."""
    result = await flow_reconfigure(hass, entry)
    return await flow_submit(hass, result["flow_id"], {**FLOW_INPUT, "url": NEW_URL})


async def flow_switch(hass: HomeAssistant, flow_id: str, answer: dict[str, Any]) -> dict[str, Any]:
    """A new address's second step answered, then its summary confirmed."""
    result = await flow_submit(hass, flow_id, answer)
    assert result["step_id"] in ("confirm_same", "confirm_other"), result
    return await flow_submit(hass, flow_id, {})
