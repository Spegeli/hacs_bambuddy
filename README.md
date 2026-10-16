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

- **Everything your printer reports** — print status and stage, progress, layers, remaining time and end time, the job's name and cover, temperatures, fans, HMS errors, Wi-Fi, nozzle type and size
- **AMS and spools** — every AMS unit (AMS, AMS 2 Pro, AMS HT, AMS Lite) as its own device: the filament in each slot with its colour and what is left, humidity and temperature, drying; the external spool and the active filament; material and colour of a spool without a chip set from Home Assistant
- **Control** — pause, resume and stop; skipping objects of the running print; the AI detection (spaghetti, first layer, build plate …); print speed; nozzle, bed and chamber target temperatures; the active nozzle of two-nozzle printers; fans; the chamber light; airduct mode; the AMS filament backup; clearing HMS errors and the plate
- **Move the printer** — actions to move the axes, home, extrude and retract, load and unload filament, start and stop drying
- **Camera** — the live stream and snapshots through BamBuddy's camera proxy
- **Dashboard card** — one card per printer, shipped with the integration: status, camera, temperatures, AMS colours, controls, heating and a jog pad; nothing else to install
- **Updates** — new BamBuddy releases and new printer firmware as update entities
- **Several printers** — add any number of the printers BamBuddy manages; choose them while setting up
- **BamBuddy itself** — print statistics, printers online and disk space of your BamBuddy server
- **Made for Home Assistant** — entity names in English and German, a new API key or address without setting up again, diagnostics without secrets
- Updates every 10 seconds

---

## 📋 Requirements

- Home Assistant **2025.5** or newer
- A running [BamBuddy](https://github.com/maziggy/bambuddy) server, version **1.2.5.7** or newer, that Home Assistant can reach
- A BamBuddy API key with **Read Status**; for the controls also **Control Printer** (see [Create an API key](#create-an-api-key))
- For the controls: the printer's **developer LAN mode** on — without it the printer ignores the commands BamBuddy passes on (see [Troubleshooting](#-troubleshooting))

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
2. Give it a name, such as `Home Assistant`, and tick **Read Status**. For the controls — print, speed, temperatures, fans, light, moving the axes, filament and drying — tick **Control Printer** as well. The integration needs no other permission.
3. Copy the key: BamBuddy shows it only once.

The permissions only count while authentication is on in BamBuddy (**Settings → Users**). With it off, BamBuddy answers every request, whatever key it carries or none: the setup then accepts any text as the key, and anyone who can reach BamBuddy can control your printers.

A key created while authentication was off keeps working once you switch it on, limited by its permissions alone. A key created afterwards as an administrator also gets an owner, which BamBuddy recommends — see its [API Keys & Webhooks](https://wiki.bambuddy.cool/features/api-keys/).

### Set up the integration

1. Go to **Settings → Devices & services → Add integration** and search for **BamBuddy**.
2. Enter BamBuddy's address — the one you open it with in your browser, such as `192.168.1.20:8000` or `https://bambuddy.example.com` — and the API key. **Verify SSL certificate** only matters for an `https` address; turn it off for a self-signed certificate.
3. Choose your printers: all are selected. Each becomes a device, its AMS units devices of their own.

### Add and remove printers

1. On the BamBuddy entry, choose **Configure** (⚙).
2. **Add printers** lists the printers of your BamBuddy that are not added yet.
3. **Remove printers** removes them from Home Assistant again; nothing changes in BamBuddy. You can also delete a printer's device on its device page (**⋮ → Delete**).

A printer removed in BamBuddy shows up under **Settings → Repairs**; **Remove printer** there removes it here as well.

### Changing settings later

- **Another address, key or certificate check:** on the BamBuddy entry, choose **⋮ → Reconfigure**. The form never shows the stored API key: leave the field empty to keep it. At a new address, say whether it is the same BamBuddy or another one — for another, BamBuddy's own figures start afresh: their history is deleted, their entity IDs stay. The printers are found by their serial numbers and keep their devices, entities and history; in the same step you can remove those the new address lacks and add those only it has. One you keep shows up under **Settings → Repairs**.
- **A key BamBuddy no longer accepts:** Home Assistant asks for a new one — a notification and the BamBuddy entry under **Settings → Devices & services** lead you there.
- **Permissions changed in BamBuddy** (for instance **Control Printer** added): reload the entry (**⋮ → Reload**) to get the controls.

### How the integration reads BamBuddy

It asks BamBuddy for each printer's status every 10 seconds, for BamBuddy's own figures every minute, and for new BamBuddy releases and printer firmware every 6 hours. After a command it reads the printer again a moment later, once the printer has reported back. It needs no cloud and opens no connection to the printers itself: everything goes through BamBuddy.

---

## 📊 Entities

Entity names follow Home Assistant's language when the entity is created (English and German included). Which entities a printer gets depends on its model: an A1 has no chamber temperature, no door and no auxiliary fan; only printers with a chamber heater get a chamber target temperature; a two-nozzle printer (H2D, H2D Pro, H2C, X2D) gets left and right versions. Controls appear only when the API key has **Control Printer**. While a printer is offline, its entities are unavailable — only **Online** and **Print status** (`offline`) tell about it — as BamBuddy keeps the last values of a printer it lost.

### Per printer

| Entity | Type | Description |
|---|---|---|
| Print status | Sensor | Idle, preparing, slicing, printing, paused, finished, failed, offline |
| Print stage | Sensor | What the printer is doing, e.g. heating the nozzle, auto bed leveling, changing filament |
| Progress | Sensor | Print progress in % |
| Remaining time / End time | Sensor | Time left, and when the print will be done |
| Current layer / Total layers | Sensor | Layer progress |
| Current print | Sensor | Name of the job |
| Print hours | Sensor | Hours the printer has printed, as BamBuddy counts them (with the offset set in BamBuddy) |
| Nozzle / Bed / Chamber temperature | Sensor | Current temperatures (two nozzles: left and right) |
| Nozzle / Bed / Chamber target temperature | Number | Set the heaters; 0 turns them off. A running job may set them again |
| Part cooling / Auxiliary / Chamber fan | Fan | Fan speeds in %, settable (P2S, X2D: Exhaust fan; with the accessory: Left auxiliary fan) |
| Hotend fan | Sensor | Hotend fan speed *(Diagnostic)* |
| Chamber light | Light | Switch the chamber light |
| Print speed | Select | Silent, Standard, Sport, Ludicrous — while printing |
| Airduct mode | Select | Cooling or heating (P2S, X2D, H2 series) *(Configuration)* |
| Active nozzle | Select | Left or right nozzle of a two-nozzle printer — while no print runs |
| AMS filament backup | Switch | Switch to a slot with the same filament when one runs out *(Configuration)* |
| AI print monitoring / First layer inspection / Build plate detection / Spaghetti, purge chute pile-up, nozzle clumping and air printing detection | Switch | The printer's AI detection, only what the model has: the X1 series has AI monitoring and the first layer check, the A series the build plate check, the P2S, X2D and H2 series each detector on its own (an H2D before firmware 01.01.02.08: AI monitoring). Their sensitivity stays as set on the printer *(Configuration)* |
| Pause print / Resume print / Stop print | Button | Print controls; pressed at the wrong time they say why |
| Plate cleared | Button | Tell BamBuddy the plate is empty: its queue may start the next print |
| Build plate | Binary sensor | *Problem* while BamBuddy waits for the plate to be cleared |
| AMS status | Sensor | What a filament change is doing: heating, feeding, retracting, purging … |
| HMS errors | Sensor | Number of active HMS errors; each error's code, severity and text as an attribute |
| Clear HMS errors / Refresh status | Button | *(Diagnostic)* |
| Active filament | Sensor | The filament in use, with its colour and slot |
| External spool | Sensor | Filament on the spool holder (two nozzles: left and right) |
| Door | Binary sensor | Open or closed (printers with a door sensor) |
| Camera | Camera | Live stream and snapshot |
| Cover | Image | The job's plate picture, while a job runs |
| Firmware | Update | New firmware Bambu Lab offers *(Diagnostic; install it on the printer or in BamBuddy)* |
| Online / Developer mode / SD card / Wired network / Wi-Fi signal / IP address / Nozzle type / Nozzle diameter | Binary sensor / Sensor | *(Diagnostic)* |
| Printable objects / Timelapse | Sensor / Binary sensor | *(disabled at first)* |

### Per AMS unit

Each AMS unit is a device under its printer: **AMS**, **AMS 2 Pro**, **AMS HT** or **AMS Lite**.

| Entity | Type | Description |
|---|---|---|
| Slot 1 … 4 | Sensor | The filament in the slot, or *Empty*; attributes `color`, `type`, `name`, `remaining` (%), `active`, `tray_id` |
| Humidity / Temperature | Sensor | Inside the unit |
| Drying / Drying time left | Binary sensor / Sensor | AMS 2 Pro and AMS HT |

### BamBuddy

| Entity | Type | Description |
|---|---|---|
| Connection | Binary sensor | Whether BamBuddy answers — available also when it does not |
| Total / Successful / Failed / Cancelled prints | Sensor | Print statistics |
| Total print time / Total filament used | Sensor | Over all prints |
| Printers online | Sensor | Printers BamBuddy is connected to |
| Printers / Free disk space / Disk usage | Sensor | *(Diagnostic)* |
| BamBuddy update | Update | A new BamBuddy release, with its notes |

---

## 🎛️ Actions

For what is no entity. Every action but `get_print_objects` needs **Control Printer** on the API key. Moving, homing and extruding refuse while a print is running or paused: BamBuddy would put them into the print. Loading and unloading refuse while a print is running, but work while it is paused — for a colour change by hand. Nothing of this works while the AMS changes filament. Skipping objects works only then.

| Action | Fields | What it does |
|---|---|---|
| `bambuddy.move_axis` | `device_id` (printer), `axis` (`x`, `y`, `z`), `distance` (mm, −200 … 200) | Moves the toolhead (X, Y; on the A1 series Y moves the bed) or changes the distance between nozzle and bed (Z; positive moves them apart) |
| `bambuddy.home_axes` | `device_id` | Moves all axes to their home position — clear the plate first |
| `bambuddy.extrude` | `device_id`, `distance` (mm, −100 … 100) | Extrudes, or retracts with a negative length; needs a nozzle at 170 °C or more |
| `bambuddy.load_filament` | `entity_id` (a slot or external spool sensor) | Loads that filament (not from an AMS HT: BamBuddy cannot) |
| `bambuddy.unload_filament` | `device_id` | Unloads the filament in the nozzle |
| `bambuddy.set_filament` | `entity_id` (a slot or external spool sensor), `material`, `color` (RGB) | Tells the printer what a spool without a chip holds: a new colour keeps the slot's profile, a new material takes Bambu's generic profile (and the default K value) |
| `bambuddy.start_drying` | `device_id` (AMS 2 Pro or AMS HT), `temperature` (45 … 85 °C), `duration` (1 … 24 h) | Dries the unit's filament (AMS 2 Pro: at most 65 °C) |
| `bambuddy.stop_drying` | `device_id` (AMS unit) | Stops drying |
| `bambuddy.get_print_objects` | `device_id` | Returns the running print's objects (`id`, `name`, `skipped`) — while a print runs or is paused |
| `bambuddy.skip_objects` | `device_id`, `objects` (list of ids) | Leaves these objects out of the rest of the print — cannot be undone |

Moves over BamBuddy are G-code: the printer's firmware does not limit them to its build volume. Move in small steps near the ends of an axis.

---

## 🃏 Dashboard card

The integration brings its own card: one per printer, with its status, camera, temperatures, AMS colours and controls. Nothing else to install.

> [!NOTE]
> After installing or updating the integration, reload the browser page (twice if the card is still missing). In the companion app: **Settings → Companion app → Troubleshooting → Reset frontend cache**.

### Add the card

1. Open a dashboard, choose **Edit dashboard** (✏️), then **Add card**.
2. Switch to **By card**, search for **BamBuddy** and choose **BamBuddy printer**.
3. Pick the printer. The other options can stay as they are.

### What it shows

- **Status:** the print status, a picture — the job's cover, or the camera after a tap — progress with layers, time left and end time, the stage while the printer prepares, temperatures with their targets (tap one to set it), fans, the AMS colours with what is left and what a filament change is doing, HMS messages coloured by severity, and pause, stop, skip objects, print speed, the chamber light and *Plate cleared*.
- **Control:** heating — the nozzle, the bed and, where the printer heats it, the chamber, each with − and + and an off switch, and *Cool down* for all (off and *Cool down* are hidden while a print runs); the active nozzle on two-nozzle printers; a jog pad for X and Y, the bed closer or farther, homing, and extruding or retracting 10 mm. Moving and extruding are locked while a print runs or is paused, during a filament change, and with the printer offline.
- **Filament:** each AMS unit with its slots — load and unload, humidity, temperature, drying for the AMS 2 Pro and the AMS HT, set to the gentlest of the loaded spools' advice — and the external spool.

Stop, skipping objects, homing, loading, unloading and drying ask before they act. After a command the card shows *Sent*; with developer LAN mode off it warns that the printer may ignore commands. Without **Control Printer** on the API key the card only shows.

### Card options

| Option | Values | Default | Meaning |
|---|---|---|---|
| `printer` | a device ID | — | The printer (the editor lists them) |
| `camera` | `tap`, `always`, `off` | `tap` | The live camera: after a tap, always, or never (the cover then) |
| `show_temperatures` | `true`, `false` | `true` | Temperatures and targets |
| `show_fans` | `true`, `false` | `true` | Fan speeds |
| `show_ams` | `true`, `false` | `true` | AMS colours and the Filament tab |
| `show_controls` | `true`, `false` | `true` | Every control; off makes the card read-only |

```yaml
type: custom:bambuddy-printer-card
printer: 1f0c8e6a5b3d4c2e9a7b6d5c4e3f2a1b
camera: tap
show_fans: false
```

The live camera uses bandwidth while it runs; with `tap` it stops when you leave the page. Home Assistant Cast does not show the card: Cast loads no integration's own modules.

---

## 🤖 Automation examples

Entity IDs are made of the printer's model and serial number and the entity's English key — `sensor.x1c_00m00a000000001_print_status`, `sensor.x1c_00m00a000000001_ams_a_humidity` — whatever the printer is called and in any language. Yours carry your printer's model and serial. BamBuddy's own start with `bambuddy`, such as `sensor.bambuddy_total_prints` (a second BamBuddy's end in `_2`).

**Tell me when a print is done**

```yaml
triggers:
  - trigger: state
    entity_id: sensor.x1c_00m00a000000001_print_status
    to: finished
actions:
  - action: notify.notify
    data:
      message: "{{ states('sensor.x1c_00m00a000000001_current_print') }} is done."
```

**Warn on an HMS error**

```yaml
triggers:
  - trigger: numeric_state
    entity_id: sensor.x1c_00m00a000000001_hms_errors
    above: 0
actions:
  - action: notify.notify
    data:
      message: >
        {% for error in state_attr('sensor.x1c_00m00a000000001_hms_errors', 'errors') %}
        {{ error.severity }}: {{ error.description or error.code }}
        {% endfor %}
```

**Light on while printing**

```yaml
triggers:
  - trigger: state
    entity_id: sensor.x1c_00m00a000000001_print_status
actions:
  - action: "light.turn_{{ 'on' if trigger.to_state.state in ['preparing', 'printing'] else 'off' }}"
    target:
      entity_id: light.x1c_00m00a000000001_chamber_light
```

**Remind me of a wet AMS**

```yaml
triggers:
  - trigger: numeric_state
    entity_id: sensor.x1c_00m00a000000001_ams_a_humidity
    above: 40
    for: "01:00:00"
actions:
  - action: notify.notify
    data:
      message: "AMS A is at {{ trigger.to_state.state }} % humidity: time to dry the filament."
```

---

## ⬆️ Upgrading from a date version

2.0.0 is a new integration under the old name. Home Assistant migrates the BamBuddy entry by itself; still, plan a few minutes:

- **The connection** becomes a single address (`http://host:port`); nothing to do.
- **Device names** become *BamBuddy name (model / serial number)*, and follow BamBuddy from then on.
- **Entity names** are new and translated; **entity IDs stay** where the entity stayed, so dashboards and automations keep working for them. New entities get IDs of model, serial number and English key.
- **Printers and AMS units are known by their serial numbers:** a new BamBuddy, a restored database or an AMS plugged in elsewhere keeps their devices, entities and history.
- **Gone or changed:** *Subtask* and *GCode File* (now *Current print*), the target temperature sensors (now numbers you can set), the fan sensors (now fans, except the hotend fan), *HMS Errors* as binary sensor (now the *HMS errors* count), the *Chamber Light* switch (now a light), and *Version*, *Health Status*, *Uptime*, *Archive Count*, *Model* and *Firmware Version* (the update entities and the device page show them). Replace them in dashboards and automations.
- **Buttons** for pause, resume and stop are no longer under *Configuration* on the device page.
- **New:** AMS devices, numbers, fans, a light, the AMS filament backup switch, the active nozzle and airduct selects, update entities, actions, the dashboard card.

HACS offers 2.0.0 as an update to everyone on a date version.

---

## ⚠️ Known limitations

- **Through BamBuddy only.** The integration shows what BamBuddy knows; if BamBuddy loses a printer, so does Home Assistant. Commands go to BamBuddy, which passes them to the printer without waiting: a command can be accepted and still be ignored by a printer without developer LAN mode.
- **No soft limits on moves.** BamBuddy sends moves as G-code, which the firmware does not hold to the build volume.
- **What BamBuddy cannot do, neither can the integration:** start a print, change the plate type, load from an AMS HT, send raw G-code.
- **Firmware and BamBuddy updates** are shown, not installed.
- **Polling, not push.** The status is at most about 10 seconds old.
- **Printer names come from BamBuddy:** a printer is named after its name in BamBuddy, then model and serial number, e.g. *Workshop (X1C / 00M00A000000001)*. Rename it in BamBuddy; a name given in Home Assistant goes back to BamBuddy's within a minute. AMS units follow their printer, lettered as on the printer: *Workshop AMS A (AMS 2 Pro / serial number)*, so they sort right under it.
- **Cast** does not show the dashboard card.

---

## 🔧 Troubleshooting

**The setup says BamBuddy cannot be reached.**
Use the address you open BamBuddy with in your browser, including the port. With BamBuddy running as a Home Assistant app, use the host's address and the port the app shows, not `localhost`.

**The setup does not accept the key.**
Copy it again from BamBuddy (it is shown once) and make sure it has **Read Status**. With BamBuddy's authentication off, any key works — and anyone can use BamBuddy.

**There are no buttons, numbers, fans or light.**
The key lacks **Control Printer**. Turn it on in BamBuddy under **Settings → API Keys** and reload the BamBuddy entry.

**A button or a temperature does nothing on the printer.**
Turn on the printer's developer LAN mode (the *Developer mode* entity shows it). Check BamBuddy's own printer page: if it cannot control the printer, neither can Home Assistant.

**Everything of a printer is unavailable.**
BamBuddy lost the printer: it is off, asleep or out of the network. *Print status* says `offline`.

**The camera shows nothing.**
The printer's live view must be on, and most printers allow one camera connection at a time: close Bambu Studio's or Bambu Handy's camera view.

**The card is missing in "Add card", or shows "Custom element doesn't exist".**
Reload the page (twice), or reset the companion app's frontend cache. The card needs no entry under *Resources*: the integration loads it itself.

**A bug report:** download the diagnostics on the BamBuddy entry (**⋮ → Download diagnostics**) and add them. They leave out the API key, the printers' access codes, camera addresses and serial numbers.

---

## 🗑️ Removal

1. Go to **Settings → Devices & services → BamBuddy** and delete the entry with **⋮ → Delete**. Its devices, their entities and the API key stored in Home Assistant go with it.
2. Remove **BamBuddy** in HACS (its **⋮** menu → **Remove**). Installed manually: delete the `/config/custom_components/bambuddy/` folder.
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
