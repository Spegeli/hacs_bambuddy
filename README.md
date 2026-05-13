<p align="center">
  <img src="https://github.com/Spegeli/hacs_bambuddy/blob/main/logo.png?raw=true" alt="BamBuddy Logo" width="300">
</p>

# 🚀 BamBuddy – Home Assistant Integration

<p align="center">
  A custom <a href="https://www.home-assistant.io/">Home Assistant</a> integration for <a href="https://github.com/maziggy/bambuddy">BamBuddy</a> — a self-hosted command center for Bambu Lab.<br><br>
  <strong>Your printers. No cloud. Your rules.</strong>
</p>

<p align="center">
  <a href="https://github.com/hacs/integration"><img src="https://img.shields.io/badge/HACS-Custom-orange.svg"></a>
  <img src="https://img.shields.io/github/v/release/Spegeli/hacs_bambuddy?label=release&color=blue">
  <!--<img src="https://img.shields.io/github/v/release/Spegeli/hacs_bambuddy?include_prereleases&label=pre-release&color=orange">-->
  <img src="https://img.shields.io/badge/License-MIT-green.svg">
</p>

> [!WARNING]
> **This integration is currently under active development and is not intended for production use.**
> Expect breaking changes, incomplete features, and potential instability. Use at your own risk.

---

## ✨ Features

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

## 📋 Requirements

- Home Assistant 2023.7 or newer
- A running [BamBuddy](https://github.com/maziggy/bambuddy) instance reachable from your HA server
- A BamBuddy API key

---

## 📦 Installation

### Via HACS (recommended)

Click the button below to automatically add the repository to HACS:

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Spegeli&repository=hacs_bambuddy&category=Integration)

Or add it manually:

1. Open HACS in Home Assistant
2. Go to **Integrations** → click the three-dot menu → **Custom repositories**
3. Add `https://github.com/Spegeli/hacs_bambuddy` with category **Integration**
4. Search for **BamBuddy** and install it
5. Restart Home Assistant

### Manual

1. Copy the `custom_components/bambuddy` folder into your HA `custom_components` directory
2. Restart Home Assistant

---

## ⚙️ Configuration

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **BamBuddy**
3. Enter your BamBuddy host, port (default: `8000`), and API key
4. After setup, click the **Configure** button (wrench icon) on the integration card to add your printers

### Adding & removing printers

Open the integration options (wrench icon) and select **Add Printer**. BamBuddy will list all available printers — select one to create a device in Home Assistant.

Printers can be removed either via the options menu or by deleting the device directly from the device page.

---

## 📊 Entities

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
| SD Card | Binary Sensor | SD card presence *(Diagnostic)* |
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

## 🔄 Update Interval

Status is polled every **10 seconds**.

---

## ⚖️ Disclaimer

This is **not** an official release by the BamBuddy developer. This project provides a custom Home Assistant integration that connects to [BamBuddy](https://github.com/maziggy/bambuddy) via its REST API.

I am not affiliated with or the developer of BamBuddy itself — therefore I am unable to provide support for BamBuddy-related issues, bugs, or feature requests. For anything related to BamBuddy, please refer to the original project:

👉 **[github.com/maziggy/bambuddy](https://github.com/maziggy/bambuddy)**

Support provided here is limited to the **Home Assistant integration** only.

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
