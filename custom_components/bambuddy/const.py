"""Constants of the BamBuddy integration."""
from __future__ import annotations

from datetime import timedelta

DOMAIN = "bambuddy"

# Entry data (version 2) and options.
CONF_URL = "url"
CONF_API_KEY = "api_key"
CONF_VERIFY_SSL = "verify_ssl"
CONF_PRINTERS = "printers"
CONF_PRINTER_ID = "printer_id"
CONF_PRINTER_NAME = "printer_name"
# The printer's serial number: what the entry knows it by.
CONF_SERIAL = "serial_number"

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
# BamBuddy only publishes a command; the printer reports back about a
# second later.
REFRESH_AFTER_COMMAND = 1.5
# Smart plugs: BamBuddy's list (from its database) once a minute; each
# plug's state every 15 s -- BamBuddy asks the plug itself each time --,
# and 2 s after a switch.
PLUG_INTERVAL = timedelta(seconds=15)
PLUG_LIST_INTERVAL = 60.0
REFRESH_AFTER_PLUG = 2.0
# A printer BamBuddy no longer lists: its list read so often until it is back.
MISSING_INTERVAL = timedelta(seconds=60)
# The printer's K profiles, once listed: what Set filament picks from for so
# long -- a printer may not answer the same question twice in a row.
K_PROFILES_KEEP = 600.0

# BamBuddy's print speed modes.
PRINT_SPEEDS = {1: "silent", 2: "standard", 3: "sport", 4: "ludicrous"}
