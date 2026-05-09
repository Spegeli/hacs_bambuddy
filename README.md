# BamBuddy Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/release/Spegeli/hacs_bambuddy.svg)](https://github.com/Spegeli/hacs_bambuddy/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> [!WARNING]
> **This integration is currently under active development and is not intended for production use.**
> Expect breaking changes, incomplete features, and potential instability. Use at your own risk.

A custom [Home Assistant](https://www.home-assistant.io/) integration for [BamBuddy](https://bambuddy.cool) — a management application for Bambu Lab 3D printers.

This integration connects to your BamBuddy instance via its REST API and exposes your printers as devices in Home Assistant, including live status sensors, temperature monitoring, camera feeds, and print controls.

---

## Features

- **Multiple printers** — manage any number of printers from one BamBuddy instance
- **Live status** — print progress, layer count, remaining time, current job name
- **Temperature sensors** — nozzle, bed (and chamber where available), including target temperatures
- **Fan speeds** — cooling, auxiliary, chamber, and heatbreak fans
- **Camera** — live MJPEG stream and snapshot from the printer camera
- **Cover image** — current print job cover image, auto-refreshing on new jobs
- **Print controls** — pause, resume, and stop the current print job
- **Print speed** — select between Silent, Standard, Sport, and Ludicrous modes
- **Chamber light** — toggle the printer chamber light on/off
- **Diagnostic entities** — firmware version, IP address, Wi-Fi signal, wired network, developer mode, HMS error status

---

## Requirements

- Home Assistant 2023.7 or newer
- A running [BamBuddy](https://bambuddy.cool) instance reachable from your HA server
- A BamBuddy API key

---

## Installation

### Via HACS (recommended)

1. Open HACS in Home Assistant
2. Go to **Integrations** → click the three-dot menu → **Custom repositories**
3. Add `https://github.com/Spegeli/hacs_bambuddy` with category **Integration**
4. Search for **BamBuddy** and install it
5. Restart Home Assistant

### Manual

1. Copy the `custom_components/bambuddy` folder into your HA `custom_components` directory
2. Restart Home Assistant

---

## Configuration

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **BamBuddy**
3. Enter your BamBuddy host, port (default: `8000`), and API key
4. After setup, click the **Configure** button (wrench icon) on the integration card to add your printers

### Adding printers

Open the integration options (wrench icon) and select **Add Printer**. BamBuddy will list all available printers. Select one to create a device in Home Assistant.

Printers can be removed either via the options menu or by deleting the device directly from the device page.

---

## Entities

### Per printer

| Entity | Type | Description |
|---|---|---|
| Status | Sensor | Current printer state |
| Progress | Sensor | Print progress in % |
| Remaining Time | Sensor | Estimated time remaining |
| Current Layer / Total Layers | Sensor | Layer progress |
| Current Print | Sensor | Active print job name |
| Nozzle Temperature | Sensor | Current nozzle temp |
| Nozzle Target Temperature | Sensor | Target nozzle temp |
| Bed Temperature | Sensor | Current bed temp |
| Bed Target Temperature | Sensor | Target bed temp |
| Chamber Temperature | Sensor | Chamber temp (where available) |
| Cooling / Aux / Chamber / Heatbreak Fan | Sensor | Fan speeds in % |
| Print Speed | Select | Silent / Standard / Sport / Ludicrous |
| Chamber Light | Switch | Toggle chamber light |
| Camera | Camera | Live MJPEG stream + snapshot |
| Cover | Image | Current print job cover image |
| Pause / Resume / Stop Print | Button | Print job controls *(Configuration)* |
| Clear Plate | Button | Clear the build plate |
| Refresh Status | Button | Force a status update |
| Online | Binary Sensor | Printer connectivity |
| HMS Errors | Binary Sensor | Active HMS errors *(Diagnostic)* |
| HMS Status / Clear HMS Errors | Sensor / Button | HMS error info *(Diagnostic)* |
| Firmware Version | Sensor | *(Diagnostic)* |
| IP Address | Sensor | *(Diagnostic)* |
| Wi-Fi Signal | Sensor | *(Diagnostic)* |
| Wired Network | Binary Sensor | *(Diagnostic)* |
| Developer Mode | Binary Sensor | *(Diagnostic)* |

### BamBuddy instance

| Entity | Type | Description |
|---|---|---|
| Version | Sensor | BamBuddy app version |
| Health Status | Sensor | Instance health |
| Uptime | Sensor | Instance uptime in hours |
| Printers Total / Connected | Sensor | Printer counts |
| Total / Successful / Failed Prints | Sensor | Print statistics |
| Total Print Time | Sensor | Cumulative print hours |
| Total Filament Used | Sensor | Cumulative filament in grams |
| Archive Count | Sensor | Stored archives |
| Disk Free / Disk Used | Sensor | Storage info |

---

## Update Interval

Status is polled every **10 seconds**.

---

## License

MIT — see [LICENSE](LICENSE)
