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
UPDATE_INTERVAL = timedelta(hours=6)
# BamBuddy only publishes a command; the printer reports back about a
# second later.
# The print hours change slowly: read once a minute, not with every status.
RUNTIME_INTERVAL = 60.0
# How long an AMS unit without a serial number waits for one: BamBuddy
# reports it a moment after it connects.
AMS_SERIAL_WAIT = 60.0
REFRESH_AFTER_COMMAND = 1.5

# BamBuddy's print speed modes.
PRINT_SPEEDS = {1: "silent", 2: "standard", 3: "sport", 4: "ludicrous"}

# BamBuddy's permission for the printer controls.
CONTROL_PERMISSION = "printers:control"
