"""A timer that ends when Home Assistant stops.

Home Assistant's first stop stage cancels the timers whose handle carries a
job marked `cancel_on_shutdown`. `async_call_later` hands the loop
`(hass, job)`, so its timers are never among them (Home Assistant 2026.10):
a read due during the stop would meet the closed web session. This one
hands the loop the job first."""
from __future__ import annotations

from collections.abc import Callable, Coroutine
from datetime import datetime
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HassJob, HomeAssistant, callback
from homeassistant.util import dt as dt_util


def _run(job: HassJob[[datetime], Coroutine[Any, Any, None] | None], hass: HomeAssistant) -> None:
    hass.async_run_hass_job(job, dt_util.utcnow())


@callback
def async_call_later_until_stop(
    hass: HomeAssistant, delay: float, action: Callable[[datetime], Coroutine[Any, Any, None] | None]
) -> CALLBACK_TYPE:
    """`action` in `delay` seconds, unless Home Assistant stops first; the cancel."""
    job: HassJob[[datetime], Coroutine[Any, Any, None] | None] = HassJob(action, cancel_on_shutdown=True)
    return hass.loop.call_later(delay, _run, job, hass).cancel
