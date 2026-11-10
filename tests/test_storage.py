"""The integration's own stores, each loaded once a run."""
from __future__ import annotations

import asyncio

from homeassistant.core import HomeAssistant

from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.storage import async_load_once


async def test_a_store_is_loaded_once_however_many_ask(hass: HomeAssistant) -> None:
    """Two first asks at once share one load; a later ask loads nothing."""
    loads = 0

    async def load() -> dict[str, int]:
        nonlocal loads
        loads += 1
        await asyncio.sleep(0)
        return {"n": loads}

    first, second = await asyncio.gather(async_load_once(hass, "probe", "probe_lock", load), async_load_once(hass, "probe", "probe_lock", load))
    third = await async_load_once(hass, "probe", "probe_lock", load)

    assert loads == 1
    assert first is second is third
    assert hass.data[DOMAIN]["probe"] == {"n": 1}
