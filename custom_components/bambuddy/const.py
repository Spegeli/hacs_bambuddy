"""Constants of the BamBuddy integration."""
from __future__ import annotations

from datetime import timedelta

DOMAIN = "bambuddy"

# Entry data (version 2) and options.
CONF_URL = "url"
CONF_API_KEY = "api_key"
CONF_VERIFY_SSL = "verify_ssl"
CONF_PRINTERS = "printers"
# Configure -> Settings -> Live updates, in the options beside the printers.
CONF_LIVE_UPDATES = "live_updates"
CONF_PUSH_GAP = "push_gap"
CONF_PRINTER_ID = "printer_id"
CONF_PRINTER_NAME = "printer_name"
# The printer's serial number: what the entry knows it by.
CONF_SERIAL = "serial_number"

# What the integration needs of an API key, by the key's toggle in
# BamBuddy (Settings -> API Keys): every permission its calls need under each
# (BamBuddy's core/auth.py _APIKEY_SCOPE_BY_PERMISSION; the routes'
# RequirePermissionIfAuthEnabled). A toggle counts only with all of them --
# one missing is what the key's owner may not do.
REQUIRED_SCOPES: dict[str, frozenset[str]] = {
    "read_status": frozenset(
        {
            "printers:read",
            "camera:view",
            "stats:read",
            "system:read",
            "firmware:read",
            "smart_plugs:read",
            "maintenance:read",
            "kprofiles:read",
        }
    ),
    "control_printer": frozenset({"printers:control", "printers:clear_plate", "printers:ams_rfid", "smart_plugs:control"}),
    "manage_maintenance": frozenset({"maintenance:update"}),
}
# How often the running entry checks its key; how soon again after no answer.
KEY_CHECK_INTERVAL = timedelta(minutes=10)
KEY_RETRY_DELAY = timedelta(minutes=1)

# The first BamBuddy that tells an API key its real permissions (before, a
# key heard it held all of them), reports HMS severities as Bambu's alert
# levels and AMS humidity in percent.
MIN_BAMBUDDY_VERSION = "1.2.5.7"

# The printer's live status; BamBuddy's own figures; update checks, which
# ask GitHub and Bambu Lab each time.
PRINTER_INTERVAL = timedelta(seconds=10)
INSTANCE_INTERVAL = timedelta(seconds=60)
# For the system information BamBuddy walks through its whole archive.
SYSTEM_INTERVAL = timedelta(minutes=5)
UPDATE_INTERVAL = timedelta(hours=6)
# A check that failed is asked again sooner.
UPDATE_RETRY_INTERVAL = timedelta(minutes=15)
# The print hours, BamBuddy's name and details of a printer change slowly:
# read once a minute, not with every status.
RUNTIME_INTERVAL = 60.0
# Maintenance: every ten minutes (and after a print) -- a read can write to
# BamBuddy's database.
MAINTENANCE_INTERVAL = 600.0
# How long an AMS unit without a serial number waits for one: BamBuddy
# reports it a moment after it connects.
AMS_SERIAL_WAIT = 60.0
# How often an AMS unit whose serial newly arrived is held for a reload in
# one Home Assistant run before it gets its entities as a new device.
HOLD_LIMIT = 3
# BamBuddy only publishes a command; the printer reports back about a
# second later.
REFRESH_AFTER_COMMAND = 1.5
# Once more a little later: some results the printer reports late, and
# BamBuddy's live connection never tells of some on their own (the print
# speed, the chamber target, the detection switches).
REFRESH_AFTER_COMMAND_AGAIN = 4.0
# BamBuddy's live connection tells of a printer's change: a read of it at
# most once in this many seconds by default; what comes meanwhile is read
# once after.
PUSH_GAP = 1
# The gaps Configure -> Settings -> Live updates offers.
PUSH_GAPS = (1, 2, 5)
# Waits between two attempts to open the live connection (seconds, each
# a fifth either way); back to the first after a connection that held this
# long.
LIVE_BACKOFF = (1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 60.0)
LIVE_STEADY = 60.0
# Configure's test of the live connection: the token and the handshake
# together, behind a proxy that swallows the request too.
LIVE_TEST_TIMEOUT = 10.0
# Smart plugs: BamBuddy's list (from its database) once a minute; each
# plug's state every 15 s -- BamBuddy asks the plug itself each time --,
# and 2 s after a switch.
PLUG_INTERVAL = timedelta(seconds=15)
PLUG_LIST_INTERVAL = 60.0
# A smart plug entity ID no entity took for this long loses its statistics.
PLUG_STATISTICS_KEEP = timedelta(days=10)
# How often that is looked at, beside each setup.
PLUG_HISTORY_INTERVAL = timedelta(days=1)
REFRESH_AFTER_PLUG = 2.0
# A printer BamBuddy no longer lists: its list read so often until it is back.
MISSING_INTERVAL = timedelta(seconds=60)
# The printer's K profiles, once listed: what Set filament picks from for so
# long -- a printer may not answer the same question twice in a row.
K_PROFILES_KEEP = 600.0
# An empty list of K profiles that took this long is no answer: BamBuddy
# asks the printer three times, 5 s each, and then gives an empty list
# (about 16 s); an answer, also one without profiles, comes within about
# 11 s -- most at once.
K_PROFILES_NO_ANSWER = 14.0

# BamBuddy's print speed modes.
PRINT_SPEEDS = {1: "silent", 2: "standard", 3: "sport", 4: "ludicrous"}
