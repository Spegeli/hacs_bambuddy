"""Test the v1 -> v2 config entry migration for BamBuddy.

Runnable with: python3 -m unittest tests.test_migrate -v
Runs standalone without Home Assistant installed by stubbing
the homeassistant modules.
"""
import asyncio
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

REPO_ROOT = Path(__file__).resolve().parents[1]
COMPONENT_DIR = REPO_ROOT / "custom_components"


def _install_stubs() -> None:
    """Stub homeassistant.* and aiohttp so the component can be imported."""
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.ClientSession = object
    aiohttp.ClientTimeout = lambda total=10: None
    aiohttp.ClientConnectorError = type("ClientConnectorError", (Exception,), {})
    sys.modules["aiohttp"] = aiohttp

    hass_pkg = types.ModuleType("homeassistant")
    hass_pkg.__path__ = []
    sys.modules["homeassistant"] = hass_pkg

    hass_const = types.ModuleType("homeassistant.const")
    Platform = type("Platform", (), {})
    for _name in (
        "SENSOR",
        "BINARY_SENSOR",
        "BUTTON",
        "SELECT",
        "SWITCH",
        "CAMERA",
        "IMAGE",
    ):
        setattr(Platform, _name, _name)
    hass_const.Platform = Platform
    sys.modules["homeassistant.const"] = hass_const

    hass_exc = types.ModuleType("homeassistant.exceptions")
    hass_exc.HomeAssistantError = type("HomeAssistantError", (Exception,), {})
    sys.modules["homeassistant.exceptions"] = hass_exc

    hass_core = types.ModuleType("homeassistant.core")
    hass_core.HomeAssistant = type("HomeAssistant", (), {})
    sys.modules["homeassistant.core"] = hass_core

    config_entries = types.ModuleType("homeassistant.config_entries")
    config_entries.ConfigEntry = type("ConfigEntry", (), {})
    sys.modules["homeassistant.config_entries"] = config_entries

    helpers = types.ModuleType("homeassistant.helpers")
    helpers.__path__ = []
    sys.modules["homeassistant.helpers"] = helpers

    dr = types.ModuleType("homeassistant.helpers.device_registry")
    dr.DeviceEntry = type("DeviceEntry", (), {})
    sys.modules["homeassistant.helpers.device_registry"] = dr

    aiohttp_client = types.ModuleType("homeassistant.helpers.aiohttp_client")
    aiohttp_client.async_get_clientsession = lambda hass: None
    sys.modules["homeassistant.helpers.aiohttp_client"] = aiohttp_client

    update_coordinator = types.ModuleType("homeassistant.helpers.update_coordinator")
    update_coordinator.DataUpdateCoordinator = type("DataUpdateCoordinator", (), {})
    update_coordinator.UpdateFailed = type("UpdateFailed", (Exception,), {})
    sys.modules["homeassistant.helpers.update_coordinator"] = update_coordinator

    cc = types.ModuleType("custom_components")
    cc.__path__ = [str(COMPONENT_DIR)]
    sys.modules["custom_components"] = cc

    sys.path.insert(0, str(REPO_ROOT))


_install_stubs()

import custom_components.bambuddy as bambuddy  # noqa: E402
from custom_components.bambuddy import const  # noqa: E402


class MigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.updated: dict = {}
        self.hass = Mock()

        def fake_update_entry(entry, **kwargs):
            self.updated.update(kwargs)

        self.hass.config_entries.async_update_entry.side_effect = fake_update_entry

    def _old_entry(self):
        """An entry created by the old (v1, host+port) config flow."""
        entry = Mock()
        entry.version = 1
        entry.data = {
            const.CONF_HOST: "bambuddy.example.com",
            const.CONF_PORT: 8000,
            const.CONF_API_KEY: "secret",
        }
        return entry

    def test_migrate_v1_adds_base_url_and_method(self):
        entry = self._old_entry()

        result = asyncio.run(bambuddy.async_migrate_entry(self.hass, entry))

        self.assertTrue(result)
        self.assertEqual(self.updated["version"], 2)
        data = self.updated["data"]
        self.assertEqual(data[const.CONF_BASE_URL], "http://bambuddy.example.com:8000")
        self.assertEqual(data[const.CONF_CONNECTION_METHOD], const.CONN_METHOD_HOST_PORT)
        self.assertEqual(data[const.CONF_API_KEY], "secret")

    def test_migrate_v1_keeps_existing_base_url(self):
        entry = self._old_entry()
        entry.data[const.CONF_BASE_URL] = "http://host/"

        result = asyncio.run(bambuddy.async_migrate_entry(self.hass, entry))

        self.assertTrue(result)
        self.assertEqual(self.updated["version"], 2)
        self.assertEqual(
            self.updated["data"][const.CONF_BASE_URL], "http://host"
        )
        self.assertEqual(
            self.updated["data"][const.CONF_CONNECTION_METHOD],
            const.CONN_METHOD_HOST_PORT,
        )

    def test_entry_not_at_v1_is_not_modified(self):
        entry = self._old_entry()
        entry.version = 2

        result = asyncio.run(bambuddy.async_migrate_entry(self.hass, entry))

        self.assertTrue(result)
        self.assertEqual(self.updated, {})


if __name__ == "__main__":
    unittest.main()
