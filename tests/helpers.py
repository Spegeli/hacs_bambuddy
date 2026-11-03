"""Helpers more than one test module uses."""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.bambuddy.const import DOMAIN
from tests.conftest import load_fixture


async def reload_entry(hass: HomeAssistant, entry_id: str) -> None:
    assert await hass.config_entries.async_reload(entry_id)
    await hass.async_block_till_done()


def plug_list(**changes: dict[str, Any]) -> list[dict[str, Any]]:
    """BamBuddy's plug list (tests/fixtures/smart_plugs.json), some plugs changed (by number as text)."""
    return [{**plug, **changes.get(str(plug["id"]), {})} for plug in load_fixture("smart_plugs.json")]


def plug_info(plug_id: int) -> dict[str, object]:
    """One plug of tests/fixtures/smart_plugs.json."""
    return next(dict(plug) for plug in load_fixture("smart_plugs.json") if plug["id"] == plug_id)


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


def listed_with(bambuddy_api: SimpleNamespace, printer_id: int, **fields: Any) -> None:
    """BamBuddy lists the printer with these fields, in its list and its details."""
    printers = [{**item, **fields} if item["id"] == printer_id else item for item in load_fixture("printers.json")]
    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.get_printer.side_effect = lambda wanted: next(item for item in printers if item["id"] == wanted)


def reauth_flows(hass: HomeAssistant) -> list[dict[str, Any]]:
    return [flow for flow in hass.config_entries.flow.async_progress() if flow["context"]["source"] == "reauth"]
