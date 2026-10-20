"""Switch off after the print -- ours, in Home Assistant: BamBuddy's own
auto off cannot be changed with an API key, so the switch-off is our own.

For the plug that powers a printer. Armed, it waits after a print that
finished until the printer stands still and every nozzle is below the
user's temperature (50 °C unless set), then switches the plug off. It
never acts on a paused or running print, on a printer BamBuddy lost or
Home Assistant cannot read (its values are stale), while the AMS changes
filament or dries, while someone heats the printer, or beside BamBuddy's
own auto off. A failed or stopped print leaves the printer on. Right
before it switches, it reads the printer once more.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import TYPE_CHECKING, Literal, cast, get_args

from homeassistant.core import CALLBACK_TYPE, callback
from homeassistant.util import dt as dt_util

from .api import BamBuddyAuthError, BamBuddyError, BamBuddyPermissionError
from .entity import refuse
from .models import ENDED_STATES, JOB_STATES, PrinterData, drying_minutes, short_name
from .plugs import Plug

if TYPE_CHECKING:
    from .coordinator import BamBuddyConfigEntry, BamBuddyPlugCoordinator, BamBuddyPrinterCoordinator

_LOGGER = logging.getLogger(__name__)

# The entities of a plug's switch-off: (platform, key).
ENTITIES = (("switch", "auto_off"), ("switch", "auto_off_every_print"), ("number", "auto_off_temperature"), ("button", "auto_off_skip"))

# idle: armed or not, nothing pending; waiting: a print finished, it waits to
# switch off; done: it switched off (or the plug went off meanwhile);
# skipped: "not this time"; failed_print: the print failed or was stopped,
# the printer stays on; gave_up: within two hours the printer never got
# ready (a hot nozzle, drying, a filament change, a target, BamBuddy lost it),
# or the plug never took the switch-off; bambuddy: BamBuddy's own auto off is
# on for the plug, ours stands aside.
type Phase = Literal["idle", "waiting", "done", "skipped", "failed_print", "gave_up", "bambuddy"]
PHASES: tuple[str, ...] = get_args(Phase.__value__)

# What a wait waits for, for the card: the nozzle to cool, the AMS to dry or
# to finish a filament change, someone heating the printer, BamBuddy to
# reach the printer (or Home Assistant to read it), the plug to answer.
type Waiting = Literal["nozzle", "drying", "filament", "heating", "printer", "plug"]

# 70 °C (BamBuddy's) is too hot to touch; the user may set it.
DEFAULT_TEMPERATURE = 50.0
MIN_TEMPERATURE = 30
MAX_TEMPERATURE = 100
# It stops waiting after so long.
WAIT_LIMIT = timedelta(hours=2)
# A switch-off the plug does not take: tried with every update for so long.
RETRY_LIMIT = timedelta(minutes=10)
# A read of the plug right after the switch-off may still say on: only one
# later counts as switched on again.
ON_AGAIN_AFTER = timedelta(minutes=1)
# The printer stands still.
_STILL = frozenset({"FINISH", "IDLE"})


def _nozzles(data: PrinterData) -> list[float | None]:
    """Every nozzle's temperature, None where BamBuddy does not know it."""
    temperatures = data.temperatures
    names = ("nozzle", "nozzle_2") if data.is_dual_nozzle else ("nozzle",)
    return [value if isinstance(value, int | float) and not isinstance(value, bool) else None for value in map(temperatures.get, names)]


def _drying(data: PrinterData) -> bool:
    """An AMS unit dries: it needs the power."""
    return any(drying_minutes(unit) for unit in data.ams_units)


def _heating(data: PrinterData) -> bool:
    """A target set: someone heats the printer (to unload, say)."""
    temperatures = data.temperatures
    return any(
        isinstance(value, int | float) and not isinstance(value, bool) and value > 0
        for value in map(temperatures.get, ("nozzle_target", "nozzle_2_target", "bed_target", "chamber_target"))
    )


def blocker(data: PrinterData, threshold: float) -> Waiting | None:
    """What keeps the printer from being switched off now; None: nothing.
    Stale values (BamBuddy lost the printer), a job, a filament change,
    drying, a target set, a nozzle not known or not cool enough."""
    if not data.connected or data.state not in _STILL:
        return "printer"
    if data.changing_filament:
        return "filament"
    if _drying(data):
        return "drying"
    if _heating(data):
        return "heating"
    nozzles = _nozzles(data)
    if any(value is None for value in nozzles) or max(value or 0.0 for value in nozzles) >= threshold:
        return "nozzle"
    return None


# The states that end a job; anything else after one ("unknown", "INIT") waits for the next read.
_END_STATES = ENDED_STATES | {"IDLE"}


class AutoOff:
    """The switch-off after the print of one printer's plug: its settings,
    where it stands, and the rules -- checked with every read of the
    printer and of the plug."""

    def __init__(self, printer: BamBuddyPrinterCoordinator, plugs: BamBuddyPlugCoordinator, plug_id: int) -> None:
        self.printer = printer
        self.plugs = plugs
        self.plug_id = plug_id
        self.armed = False
        # After every print or only the next: only the next by default.
        self.every_print = False
        self.threshold = DEFAULT_TEMPERATURE
        self.phase: Phase = "idle"
        self.since: datetime | None = None
        self.waiting_for: Waiting | None = None
        # A job seen while BamBuddy was connected: only its end arms --
        # never a FINISH found at the start or after a reconnect.
        self._job_seen = False
        self._failing_since: datetime | None = None
        # A switch-off on its way: "not this time" can no longer stop it.
        self.switching = False
        self._listeners: list[Callable[[], None]] = []

    @property
    def plug(self) -> Plug | None:
        return (self.plugs.data or {}).get(self.plug_id)

    @callback
    def async_add_listener(self, update: Callable[[], None]) -> CALLBACK_TYPE:
        """An entity that shows a part of it."""
        self._listeners.append(update)

        @callback
        def remove() -> None:
            self._listeners.remove(update)

        return remove

    @callback
    def _notify(self) -> None:
        for update in list(self._listeners):
            update()

    @callback
    def async_start(self, entry: BamBuddyConfigEntry) -> None:
        entry.async_on_unload(self.printer.async_add_listener(self._check))
        entry.async_on_unload(self.plugs.async_add_listener(self._check))
        # A print under way now counts: its end arms. A FINISH found now does not.
        self._check()

    @callback
    def _set(self, phase: Phase) -> None:
        self.phase = phase
        self.since = dt_util.utcnow()
        self.waiting_for = None
        self._failing_since = None
        self._notify()

    # What the user does

    @callback
    def arm(self) -> None:
        """On -- refused while BamBuddy's own auto off is on for the plug:
        the two must not get in each other's way."""
        plug = self.plug
        if plug is not None and plug.bambuddy_auto_off:
            raise refuse("auto_off_bambuddy", plug=plug.name)
        self.armed = True
        if self.phase != "waiting":
            self._set("idle")
        self._notify()

    @callback
    def disarm(self) -> None:
        self.armed = False
        if self.phase != "idle":
            self._set("idle")
        self._notify()

    @callback
    def skip(self) -> None:
        """Not this time: the printer stays on; "only after the next print"
        is used up by it. Too late once the switch-off is on its way."""
        if self.phase != "waiting" or self.switching:
            return
        self._end("skipped")

    @callback
    def set_every_print(self, every_print: bool) -> None:
        self.every_print = every_print
        self._notify()

    @callback
    def set_threshold(self, threshold: float) -> None:
        self.threshold = threshold
        self._notify()

    @callback
    def restore(self, armed: bool, phase: str | None, since: datetime | None, every_print: bool, printer: str | None = None) -> None:
        """After a restart: a wait goes on with fresh data -- one older than
        the limit is over (a time ahead of now counts as now), as a running
        one ends: from now, and "only after the next print" used up.
        `every_print`: the setting as it was stored (its own switch restores
        it too). `printer`: the printer the phase was stored with -- a plug
        moved in BamBuddy meanwhile starts over at its new printer, armed as
        it was."""
        self.armed = armed
        self.every_print = every_print
        now = dt_util.utcnow()
        if phase in PHASES and printer in (None, self.printer.key):
            self.phase = cast(Phase, phase)
            self.since = min(since, now) if since else None
        if self.phase == "waiting" and (self.since is None or now - self.since > WAIT_LIMIT):
            self._end("gave_up")
        self._notify()

    # The rules

    def _belongs(self, plug: Plug) -> bool:
        """The plug still powers this printer, and can be switched: one moved
        in BamBuddy waits for the reload that follows it."""
        return plug.printer_id == self.printer.printer_id and plug.powers_printer and plug.kind == "switch"

    @callback
    def _check(self) -> None:
        data = self.printer.data
        if data is None:
            return
        plug = self.plug
        # Only what Home Assistant read just now counts.
        fresh = self.printer.last_update_success and not self.printer.replaced
        if fresh and data.connected:
            if data.state in JOB_STATES:
                # A print under way: the last one's outcome is over; if it
                # waited, it waits no more.
                if self.phase != "idle":
                    self._set("idle")
                self._job_seen = True
            elif self._job_seen and data.state in _END_STATES:
                # "unknown" for a moment (BamBuddy's start, its power-off
                # guess) is no end: the next read tells.
                self._job_seen = False
                if self.armed:
                    if data.state != "FINISH":
                        # Failed or stopped: left on for a look (as BamBuddy).
                        self._end("failed_print")
                    elif plug is not None and plug.bambuddy_auto_off:
                        self._end("bambuddy")
                    else:
                        self._set("waiting")
        elif fresh:
            # BamBuddy lost the printer: what ends after it comes back did not
            # end before our eyes.
            self._job_seen = False
        if (
            self.phase == "done"
            and plug is not None
            and plug.state is True
            and self.since is not None
            and dt_util.utcnow() - self.since > ON_AGAIN_AFTER
        ):
            # The plug on again: the switch-off no longer stands (a restart,
            # which writes the plug anew, does not end it).
            self._set("idle")
        if self.phase == "waiting":
            self._wait(data, plug, fresh)

    @callback
    def _wait(self, data: PrinterData, plug: Plug | None, fresh: bool) -> None:
        now = dt_util.utcnow()
        if not self.armed:
            self._set("idle")
            return
        if (self.since is not None and now - self.since > WAIT_LIMIT) or (
            self._failing_since is not None and now - self._failing_since > RETRY_LIMIT
        ):
            self._end("gave_up")
            return
        if plug is None or not self._belongs(plug):
            return
        if plug.bambuddy_auto_off:
            self._end("bambuddy")
            return
        if plug.state is False:
            # Off already: by hand, or by BamBuddy.
            self._end("done")
            return
        waiting: Waiting | None = "printer" if not fresh else blocker(data, self.threshold)
        if waiting is None and not plug.reachable:
            waiting = "plug"
        # Tried again after the plug did not take it: the plug is what it waits for.
        shown: Waiting | None = waiting if waiting is not None else ("plug" if self._failing_since is not None else None)
        if shown != self.waiting_for:
            self.waiting_for = shown
            self._notify()
        if waiting is not None or self.switching:
            return
        self.switching = True
        self._notify()
        self.plugs.config_entry.async_create_background_task(
            self.plugs.hass, self._switch_off(plug), f"bambuddy switch off plug {plug.id} after the print"
        )

    async def _switch_off(self, plug: Plug) -> None:
        """Reads the printer once more -- the values may be ten seconds old,
        a print may have started since -- and switches off only if nothing
        stands in the way still."""
        try:
            try:
                status = await self.printer.client.get_status(self.printer.printer_id)
            except BamBuddyError as err:
                # Not the plug: the next check reads the printer again.
                _LOGGER.debug("Reading %s before switching its plug off failed: %s", short_name(self.printer.info), err)
                return
            now = PrinterData(self.printer.info, status, None, None)
            if self.phase != "waiting" or not self.armed or blocker(now, self.threshold) is not None:
                return
            self.plugs.note_command()
            await self.plugs.client.control_plug(plug.id, False)
        except BamBuddyError as err:
            _LOGGER.debug("Switching the plug %s off after the print failed: %s", plug.name, err)
            if isinstance(err, (BamBuddyAuthError, BamBuddyPermissionError)):
                # Whether the key is the cause: the guard checks it.
                self.plugs.config_entry.runtime_data.key.async_read_refused(err)
            if self._failing_since is None:
                self._failing_since = dt_util.utcnow()
            self.waiting_for = "plug"
            return
        finally:
            self.switching = False
            self._notify()
        temperatures = [value for value in _nozzles(now) if value is not None]
        _LOGGER.info(
            "Switched the plug %s of %s off after the print: nozzle %s °C, below %s °C",
            plug.name,
            short_name(self.printer.info),
            max(temperatures) if temperatures else "?",
            self.threshold,
        )
        self._end("done")
        self.plugs.async_switched(plug.id, False)
        self.plugs.async_refresh_soon()
        self.printer.async_refresh_soon()

    @callback
    def _end(self, phase: Phase) -> None:
        """A print's outcome: the phase it ended in, whatever its end; "only
        after the next print" is used up by it."""
        self._set(phase)
        if not self.every_print:
            self.armed = False
            self._notify()


def gets_auto_off(plugs: BamBuddyPlugCoordinator, plug: Plug) -> bool:
    """The printer's own plug -- BamBuddy's pick among those that power it
    -- where it switches: one switch-off per printer, never two."""
    return plug.kind == "switch" and plugs.main_plug(plug.printer_id) == plug.id


def auto_off_for(entry: BamBuddyConfigEntry, plug: Plug) -> AutoOff | None:
    """The switch-off after the print of the printer's own plug, where this
    key may switch it; one per plug, started once."""
    runtime = entry.runtime_data
    plugs = runtime.plugs
    if not gets_auto_off(plugs, plug):
        return None
    printer = plugs.printers.get(plug.printer_id or -1)
    if printer is None:
        return None
    auto_off = runtime.auto_offs.get(plug.id)
    if auto_off is None:
        auto_off = runtime.auto_offs[plug.id] = AutoOff(printer, plugs, plug.id)
        auto_off.async_start(entry)
    return auto_off
