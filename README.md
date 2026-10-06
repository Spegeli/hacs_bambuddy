<p align="center">
  <img src="https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/logo.png" alt="BamBuddy Logo" width="300">
</p>

<h1 align="center">BamBuddy – Home Assistant Integration</h1>

<p align="center">
  <a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=Spegeli&repository=hacs_bambuddy&category=Integration"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store."></a>
</p>

<p align="center">
  <a href="https://github.com/hacs/integration"><img src="https://img.shields.io/badge/HACS-Custom-orange.svg"></a>
  <a href="https://github.com/Spegeli/hacs_bambuddy/releases/latest"><img src="https://img.shields.io/github/v/release/Spegeli/hacs_bambuddy.svg?label=release&color=blue&display_name=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow" alt="License: MIT"></a>
  <a href="https://www.home-assistant.io/"><img src="https://img.shields.io/badge/Home%20Assistant-2025.5%2B-41BDF5.svg" alt="Home Assistant 2025.5+"></a>
</p>

A custom <a href="https://www.home-assistant.io/">Home Assistant</a> integration for **BamBuddy**: the status, camera and controls of your Bambu Lab printers on your dashboard.

[BamBuddy](https://github.com/maziggy/bambuddy) is a self-hosted command center for Bambu Lab 3D printers. The integration talks only to your own BamBuddy server, through its REST API; it uses no cloud.

> [!WARNING]
> **This integration is currently under active development and is not intended for production use.**
> Expect breaking changes, incomplete features, and potential instability. Use at your own risk.

---

## ✨ Features

- **BamBuddy instance** — version, health, uptime, print statistics and disk space of your BamBuddy server
- **Multiple printers** — add any number of the printers your BamBuddy manages, each as its own device
- **Live status** — print progress, layer count, remaining time, current job name
- **Temperature sensors** — nozzle, bed (and chamber where available), including target temperatures
- **Fan speeds** — cooling, auxiliary, chamber, and heatbreak fans
- **Camera** — live MJPEG stream and snapshot from the printer camera
- **Cover image** — current print job cover image, auto-refreshing on new jobs
- **Print controls** — pause, resume, and stop the current print job; clear the plate; clear HMS errors
- **Print speed** — select between Silent, Standard, Sport, and Ludicrous modes
- **Chamber light** — toggle the printer chamber light on/off
- **Diagnostic entities** — firmware version, IP address, Wi-Fi signal, wired network, developer mode, HMS error status
- Updates every 10 seconds

---

## 📋 Requirements

- Home Assistant **2025.5** or newer
- A running [BamBuddy](https://github.com/maziggy/bambuddy) server that Home Assistant can reach
- A BamBuddy API key with **Read Status**; for the print controls also **Control Printer** (see [Create an API key](#create-an-api-key))

---

## 📦 Installation

### Method 1: Installation via HACS (Recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Spegeli&repository=hacs_bambuddy&category=Integration)

**One-Click Install:** Click the button above to add and open the repository directly inside Home Assistant!

**Manual HACS Steps:**
1. In Home Assistant, open **HACS**.
2. Click the three dots `⋮` in the top right corner and choose **Custom repositories**.
3. Paste the repository URL:
   ```text
   https://github.com/Spegeli/hacs_bambuddy
   ```
4. Select **Integration** as the **Type** and click **Add**.
5. Find **BamBuddy** in the list and click **Download**.
6. Restart Home Assistant.

### Method 2: Manual Installation

1. Download the `Source code (zip)` of the latest release from the [Releases](https://github.com/Spegeli/hacs_bambuddy/releases) page.
2. Unpack the ZIP archive.
3. Copy its `custom_components/bambuddy` folder into your Home Assistant directory under:
   ```text
   /config/custom_components/bambuddy/
   ```
4. Restart Home Assistant.

### Beta versions

A new version can come out as a beta first, for testing before everyone gets it. HACS offers two ways to get one:

- **Once, a version of your choice:** **HACS → BamBuddy → ⋮ → Redownload**, open **Need a different version?**, choose the version under **Release** — betas are marked as pre-releases — and select **Download**. Restart Home Assistant afterwards.
- **As updates:** under **Settings → Devices & services → HACS**, open **BamBuddy**. Its **Pre-release** switch is under **Diagnostic** and disabled at first: select it, open its settings (⚙), enable it, and turn it on once it appears. HACS then offers betas as updates too. Turned off again, it offers stable versions only; a beta you installed stays until the next stable version replaces it.

---

## ⚙️ Configuration

### Create an API key

1. In BamBuddy, open **Settings → API Keys** and choose **Create API Key**.
2. Give it a name, such as `Home Assistant`, and tick **Read Status**. For the print controls — pause, resume, stop, print speed, chamber light, clearing HMS errors and the plate — tick **Control Printer** as well. The integration needs no other permission.
3. Copy the key: BamBuddy shows it only once.

The permissions only count while authentication is on in BamBuddy (**Settings → Users**). With it off, BamBuddy answers every request, whatever key it carries or none: the setup then accepts any text as the key, and anyone who can reach BamBuddy can control your printers.

A key created while authentication was off keeps working once you switch it on, limited by its permissions alone. A key created afterwards as an administrator also gets an owner, which BamBuddy recommends — see its [API Keys & Webhooks](https://wiki.bambuddy.cool/features/api-keys/).

### Set up the integration

1. Go to **Settings → Devices & services → Add integration** and search for **BamBuddy**.
2. Enter the host or IP address of your BamBuddy server, its port (default: `8000`) and the API key.

### Add and remove printers

1. On the BamBuddy entry, choose **Configure** (⚙).
2. **Add Printer** lists the printers of your BamBuddy that are not added yet: choose one, and it appears as a device.
3. **Remove Printer** removes one again. You can also delete a printer's device on its device page (**⋮ → Delete**).

### Changing settings later

Host, port and API key cannot be changed yet: delete the BamBuddy entry (**⋮ → Delete**) and set it up again.

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
| Subtask | Sensor | Subtask of the current job |
| GCode File | Sensor | G-code file of the current job |
| Printable Objects | Sensor | Printable objects in the current job |
| Nozzle Temperature | Sensor | Current nozzle temp |
| Nozzle Target Temperature | Sensor | Target nozzle temp |
| Bed Temperature | Sensor | Current bed temp |
| Bed Target Temperature | Sensor | Target bed temp |
| Chamber Temperature | Sensor | Chamber temp — only for printers that report one when the integration starts |
| Cooling / Auxiliary / Chamber / Heatbreak Fan | Sensor | Fan speeds in % |
| Print Speed | Select | Silent / Standard / Sport / Ludicrous |
| Chamber Light | Switch | Toggle chamber light |
| Camera | Camera | Live MJPEG stream + snapshot |
| Cover | Image | Current print job cover image |
| Pause / Resume / Stop Print | Button | Print job controls *(Configuration)* |
| Clear Plate | Button | Tell BamBuddy the plate is clear: its queue may then start the next print |
| Refresh Status | Button | Ask the printer for a full status update |
| Online | Binary Sensor | Printer connectivity *(Diagnostic)* |
| SD Card | Binary Sensor | SD card presence *(Diagnostic)* |
| HMS Errors | Binary Sensor | Active HMS errors *(Diagnostic)* |
| HMS Status / Clear HMS Errors | Sensor / Button | HMS error info *(Diagnostic)* |
| Firmware Version | Sensor | *(Diagnostic)* |
| IP Address | Sensor | *(Diagnostic)* |
| Model | Sensor | *(Diagnostic)* |
| WiFi Signal | Sensor | *(Diagnostic)* |
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

## 🤖 Automation examples

*Coming soon.*

---

## ⬆️ Upgrading from a date version

*Coming soon.*

---

## ⚠️ Known limitations

*Coming soon.*

---

## 🔧 Troubleshooting

*Coming soon.*

---

## 🗑️ Removal

1. Go to **Settings → Devices & services → BamBuddy** and delete the entry with **⋮ → Delete**. Its devices, their entities and the API key stored in Home Assistant go with it.
2. Remove **BamBuddy** in HACS (its **⋮** menu → **Remove**). Installed manually: delete the `config/custom_components/bambuddy` folder.
3. Restart Home Assistant.
4. Optional: delete the API key in BamBuddy (**Settings → API Keys**) if nothing else uses it.

**History:** the recorded history of the removed entities stays in Home Assistant's database until the recorder purges it — after 10 days by default (the recorder's `purge_keep_days`).

**Long-term statistics** are not purged: delete them under **Settings → Tools → Statistics** (before Home Assistant 2026.8: **Developer tools → Statistics**) if you no longer want them.

---

## ⚖️ Disclaimer

- **Not a BamBuddy or Bambu Lab product.** This integration is an independent community project. Neither the BamBuddy project nor Bambu Lab develops, endorses or supports it, and their support cannot help with it — use the [GitHub issue tracker](https://github.com/Spegeli/hacs_bambuddy/issues) instead. Problems with BamBuddy itself belong to [its own project](https://github.com/maziggy/bambuddy/issues).
- **Names and logos.** BamBuddy and its logo belong to the BamBuddy project; Bambu Lab and the names of its printers are trademarks of their owner. They appear here only to name the software and the printers the integration connects to.
- **Status for information only.** The integration shows what BamBuddy's REST API returns; values can be delayed or differ from BamBuddy's own interface and the printer's display.
- **Use at your own risk.** The software is provided as is, without warranty, under the MIT License. Its controls act on a real printer: pause, stop and the other commands reach it through BamBuddy — mind that in automations.

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details. It covers this project's code and documentation, not BamBuddy's name and logo (`logo.png` and `custom_components/bambuddy/brand/`), which belong to the BamBuddy project (see [Disclaimer](#%EF%B8%8F-disclaimer)).
