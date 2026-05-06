"""Constants for BamBuddy integration."""

DOMAIN = "bambuddy"

CONF_HOST = "host"
CONF_PORT = "port"
CONF_API_KEY = "api_key"
CONF_PRINTER_ID = "printer_id"
CONF_PRINTER_NAME = "printer_name"

DEFAULT_PORT = 8000
DEFAULT_SCAN_INTERVAL = 10  # seconds

ENTRY_TYPE_INSTANCE = "instance"
ENTRY_TYPE_PRINTER = "printer"

PRINTER_STATES = {
    "idle": "Idle",
    "printing": "Printing",
    "paused": "Paused",
    "error": "Error",
    "offline": "Offline",
    "finish": "Finished",
    "failed": "Failed",
}

PRINT_SPEED_MODES = {
    1: "Silent (50%)",
    2: "Standard (100%)",
    3: "Sport (124%)",
    4: "Ludicrous (166%)",
}
