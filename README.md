# BamBuddy Home Assistant Integration

[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz)

Home Assistant integration for [BamBuddy](https://github.com/maziggy/bambuddy) — a self-hosted print archive and management system for Bambu Lab 3D printers.

## Requirements

- [BamBuddy](https://github.com/maziggy/bambuddy) running and accessible from Home Assistant
- An API key created in BamBuddy (Settings → API Keys)

## Installation via HACS

1. Open HACS in Home Assistant
2. Go to **Integrations** → **⋮** → **Custom Repositories**
3. Add `https://github.com/Spegeli/hacs_bambuddy` as **Integration**
4. Click **BamBuddy** → **Download**
5. Restart Home Assistant

## Setup

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **BamBuddy**
3. Choose **Add BamBuddy Instance** and enter:
   - Host / IP of your BamBuddy instance (e.g. `192.168.178.3`)
   - Port (default: `8000`)
   - API Key
4. After adding the instance, add individual printers via **Add Integration → BamBuddy → Add Printer**

## Entities

### BamBuddy Instance
| Entity | Type | Description |
|---|---|---|
| Version | Sensor | BamBuddy version |
| Health Status | Sensor | healthy / unhealthy |
| Database Status | Sensor | connected / disconnected |
| MQTT Status | Sensor | connected / disconnected |
| Uptime | Sensor | Seconds since last restart |
| Total Prints | Sensor | All-time print count |
| Successful Prints | Sensor | Successful print count |
| Failed Prints | Sensor | Failed print count |
| Success Rate | Sensor | Success rate in % |
| Total Print Time | Sensor | All-time print time in seconds |
| Total Filament Used | Sensor | All-time filament usage in grams |
| Archive Count | Sensor | Number of archived prints |

### Per Printer
| Entity | Type | Description |
|---|---|---|
| Status | Sensor | idle / printing / paused / error |
| Model | Sensor | Printer model |
| Current Print | Sensor | Filename of active print |
| Progress | Sensor | Print progress in % |
| Remaining Time | Sensor | Remaining time in seconds |
| Current Layer | Sensor | Current layer number |
| Total Layers | Sensor | Total layer count |
| Nozzle Temperature | Sensor | °C |
| Bed Temperature | Sensor | °C |
| Chamber Temperature | Sensor | °C |
| HMS Status | Sensor | ok / error |
| Print Speed | Select | Silent / Standard / Sport / Ludicrous |
| Clear HMS Errors | Button | Clear printer errors |
| Clear Plate | Button | Mark plate as cleared |
| Refresh Status | Button | Force status refresh from printer |
