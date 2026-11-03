"""The integration's own stores: each loaded once a run, under a lock."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from homeassistant.core import HomeAssistant

from .const import DOMAIN

_T = TypeVar("_T")


async def async_load_once(hass: HomeAssistant, data_key: str, lock_key: str, load: Callable[[], Awaitable[_T]]) -> _T:
    """What `load` gives, kept in hass.data[DOMAIN][data_key] for the run;
    callers asking at once wait for the one load."""
    domain: dict[str, Any] = hass.data.setdefault(DOMAIN, {})
    if lock_key not in domain:
        domain[lock_key] = asyncio.Lock()
    lock: asyncio.Lock = domain[lock_key]
    async with lock:
        if data_key not in domain:
            domain[data_key] = await load()
    loaded: _T = domain[data_key]
    return loaded
