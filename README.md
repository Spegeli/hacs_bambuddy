<p align="center">
  <img src="https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/.github/readme/logo.png" alt="BamBuddy Logo" width="300">
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

*This is the integration, not the app: it connects Home Assistant to a BamBuddy server — on any machine, or inside Home Assistant with the [BamBuddy app](https://github.com/Spegeli/homeassistant-app-bambuddy).*

> [!IMPORTANT]
> **Updating from a date version (2026.05.17 or older)?** Read [Upgrading from a date version](#%EF%B8%8F-upgrading-from-a-date-version) first — it needs a new API key and cannot be undone.

---

## ✨ Features

- **Everything your printer reports** — print status and stage, progress, layers, remaining time and end time, the job's name and cover, temperatures, fans, HMS errors, Wi-Fi, nozzle type and size
- **AMS and spools** — every AMS unit (AMS, AMS 2 Pro, AMS HT, AMS Lite) as its own device: the filament in each slot with its color and what is left, humidity and temperature, drying; the external spool and the active filament; the filament (vendor and profile, as in Bambu Studio) and color of a spool without a chip set from Home Assistant
- **Control** — pause, resume and stop; skipping objects of the running print; the printer's own AI detection (spaghetti, first layer, build plate …; not BamBuddy's Obico failure detection); print speed; nozzle, bed and chamber target temperatures; the active nozzle of two-nozzle printers; fans; the chamber light; airduct mode and ventilating the chamber; the AMS filament backup; answering and clearing HMS errors; clearing the plate
- **Move the printer** — actions to move the axes, home, extrude and retract, load and unload filament, start and stop drying
- **Camera** — the live stream and snapshots through BamBuddy's camera proxy
- **Maintenance and connection check** — the printer's maintenance tasks as BamBuddy keeps them, marked done from Home Assistant; BamBuddy's check of the connection to a printer that went offline
- **Smart plugs** — the plugs BamBuddy links to a printer: switch them, see their power and energy, and switch the printer off after a print once its nozzle has cooled
- **Dashboard card** — one card per printer, shipped with the integration: status, camera, temperatures, AMS colors, controls, heating and a jog pad, arranged as you like; nothing else to install
- **Updates** — new BamBuddy releases and new printer firmware as update entities
- **Several printers** — add any number of the printers BamBuddy manages; choose them while setting up, add or remove them later
- **BamBuddy itself** — print statistics, printers online and disk space of your BamBuddy server
- **Made for Home Assistant** — entity names in English and German, a new API key or address without setting up again, diagnostics without secrets
- Live status: most changes show as soon as BamBuddy hears of them, with a full read every 10 seconds besides

---

## 📋 Requirements

- Home Assistant **2025.5** or newer
- A running [BamBuddy](https://github.com/maziggy/bambuddy) server, version **1.2.5.7** or newer (BamBuddy shows its version at the foot of its menu and in **Settings → General**, card **Updates**), that Home Assistant can reach — with your printers added in BamBuddy first (see [BamBuddy's documentation](https://wiki.bambuddy.cool)): the integration shows what BamBuddy manages
- For the installation through HACS: [HACS](https://hacs.xyz) installed in Home Assistant
- A BamBuddy API key with **Read Status**, **Control Printer** and **Manage Maintenance** (see [Create an API key](#create-an-api-key))
- For the controls: the printer's **developer LAN mode** on — without it the printer ignores the commands BamBuddy passes on (see [Troubleshooting](#-troubleshooting))

---

## 🧩 Home Assistant App

The integration brings your printers into Home Assistant; the [BamBuddy app](https://github.com/Spegeli/homeassistant-app-bambuddy) runs BamBuddy itself — on Home Assistant OS, inside Home Assistant, installed and updated like any other app. With the app, set up the integration with the address you open BamBuddy with, e.g. `http://homeassistant.local:8000` (not `localhost`), and an API key created in BamBuddy.

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

1. In BamBuddy, open **Settings → API Keys** and choose **Create Key**.
2. Give it a name, such as `Home Assistant`, and tick the three permissions the integration needs:
   - **Read Status**: everything Home Assistant shows, the camera included.
   - **Control Printer**: the controls — print, speed, temperatures, fans, light, moving the axes, filament, drying and switching smart plugs.
   - **Manage Maintenance**: marking maintenance done.

   The integration refuses a key that lacks one of them and needs no other. BamBuddy cannot add a permission to an existing key: if one is missing, create a new key and enter it in Home Assistant (see [Changing settings later](#changing-settings-later)).
3. Copy the key: BamBuddy shows it only once.

BamBuddy enforces the permissions only while its authentication is on (**Settings → Authentication**). With it off, BamBuddy answers every request, whatever key it carries or none, and anyone who can reach BamBuddy can control your printers. Recommended: turn authentication on before you create the key. The integration checks the key either way: it takes only a key BamBuddy knows, with the three permissions.

A key created while authentication was off keeps working once you switch it on, limited by its permissions alone. A key created afterwards as an administrator also gets an owner, which BamBuddy recommends — see its [API Keys & Webhooks](https://wiki.bambuddy.cool/features/api-keys/).

### Set up the integration

1. Go to **Settings → Devices & services → Add integration** and search for **BamBuddy**.
2. Enter BamBuddy's address — the one you open it with in your browser, such as `192.168.1.20:8000` or `https://bambuddy.example.com` — and the API key. **Verify SSL certificate** only matters for an `https` address; turn it off for a self-signed certificate.
3. Choose your printers: all are selected. Each becomes a device named as in BamBuddy, its AMS units devices of their own.

Next: your printers are under **Settings → Devices & services → BamBuddy**; add the [dashboard card](#-dashboard-card) to see and control them.

### Add and remove printers

1. On the BamBuddy entry, choose **Configure** (a ⚙ in recent Home Assistant versions), then **Manage printers**.
2. **Add printers** lists the printers of your BamBuddy that are not added yet.
3. **Remove printers** removes them from Home Assistant again; nothing changes in BamBuddy. You can also delete a printer's device on its device page (**⋮ → Delete**).

A printer removed in BamBuddy shows up under **Settings → Repairs**; **Remove printer** there removes it here as well, and **Remove printers** under **Configure → Manage printers** removes several at once. Once BamBuddy lists it again (by its serial number), it comes back by itself within a minute, with its devices, entities and history.

### Changing settings later

- **Another address, key or certificate check:** on the BamBuddy entry, choose **⋮ → Reconfigure**. The form never shows the stored API key: leave the field empty to keep it. A new address leads to a second step: say whether it is the same BamBuddy server or another one — for another, the history of the server's own figures (print statistics, storage …) is deleted, their entity IDs stay. The printers are found there by their serial numbers and keep their devices, entities and history; those the new address lacks are removed with their AMS units and smart plugs, and you can add those only it has. On another server the kept printers' smart plugs become new devices; a plug that uses the same Tasmota, Home Assistant entity or MQTT topic and path as before keeps its entity IDs and history. A last step shows the address and which printers stay, go and come: nothing changes until you choose **Switch**.
- **A key BamBuddy no longer accepts:** Home Assistant asks for a new one — an entry under **Settings → Repairs** and the BamBuddy entry under **Settings → Devices & services** lead you there.
- **A key that lacks a permission** — its owner lost a right in BamBuddy, say: within ten minutes Home Assistant asks for a new key, under **Settings → Repairs**; the dialog shows which permissions the stored key has (✓) and lacks (✗). Meanwhile the values go on, and a control BamBuddy refuses says why. Gave the owner the right back? The request goes by itself at the next check, within ten minutes; or leave the dialog's field empty to check the stored key at once.
- **Live updates:** on the BamBuddy entry, choose **Configure → Settings → Live updates**. Each time it opens, the page tests BamBuddy's live connection and says whether it is open or why it does not open. **Use live updates** off: no live connection and no attempts to open one — the read every 10 seconds and the reads after a command stay. **Reads after live messages, per printer at most** spaces the reads the live connection sets off: every second (the default), every 2 or every 5 seconds — less often spares BamBuddy and Home Assistant's history, with many printers or a small computer, say. Saved, both apply at once. Home Assistant's own **⋮ → System options → Enable polling for changes** on the entry stops its timed reads — each printer's 10-second read, the smart plugs', the statistics' and the update checks'; the reads the live connection sets off and those after a command go on.

### How the integration reads BamBuddy

Unless switched off under **Configure → Settings → Live updates**, it keeps BamBuddy's live connection (its WebSocket) open: when a printer reports a change, the integration reads that printer's status at once — at most once a second, or as set there. Besides, it asks BamBuddy for
- each printer's status every 10 seconds (a new name in BamBuddy comes with it), its print hours and its AMS units' names every minute, its maintenance every 10 minutes and after a print;
- the list of smart plugs every minute, each plug's state every 15 seconds;
- BamBuddy's print statistics every minute, its version, printers and disk space every 5 minutes;
- new BamBuddy releases and printer firmware every 6 hours (a check that fails is asked again after 15 minutes).

After a command it reads the printer again a moment later and once more a few seconds after: the printer reports back to BamBuddy first, and BamBuddy's live connection does not tell of every result. It needs no cloud and opens no connection to the printers itself: everything goes through BamBuddy.

---

## 📊 Entities

Entity names are in Home Assistant's language: English or German, English for any other. Which entities a printer gets depends on its model: an A1 has no chamber temperature, no door and no auxiliary fan; only printers with a chamber heater get a chamber target temperature; a two-nozzle printer (H2D, H2D Pro, H2C, X2D) gets left and right versions.

While a printer is offline, BamBuddy keeps its last values, so most of its entities are unavailable: **Online** and **Print status** (`offline`) tell about it; the print hours, *Maintenance*, the build plate, *Plate cleared*, the firmware and *Camera frame rate* stay available. Home Assistant skips an unavailable entity without an error (only a warning in its log): an automation that presses an offline printer's *Pause* or sets its nozzle target sends nothing. The `bambuddy.*` actions refuse with "… is offline" instead — all but `bambuddy.run_diagnostic`, `bambuddy.mark_maintenance_done` and `bambuddy.get_filaments`, which work without the printer, as *Plate cleared* does.

### Per printer

| Entity | Type | Description |
|---|---|---|
| Print status | Sensor | Idle, preparing, slicing, printing, paused, finished, failed, offline, unknown |
| Print stage | Sensor | What the printer is doing, e.g. heating the nozzle, auto bed leveling, changing filament |
| Progress | Sensor | Print progress in % |
| Remaining time / End time | Sensor | Time left, and when the print will be done |
| Current layer / Total layers | Sensor | Layer progress |
| Current print | Sensor | Name of the job |
| Print hours | Sensor | Hours the printer has printed, as BamBuddy counts them (with the offset set in BamBuddy) |
| Maintenance | Sensor | *OK*, *Due soon* or *Overdue*, as BamBuddy keeps the printer's maintenance; its tasks in the attribute `tasks`. Read every 10 minutes and after a print: a read can write to BamBuddy's database (it adds missing default tasks). BamBuddy counts a task never marked done from 0 hours, so a printer with print hours shows such tasks overdue until you mark them done. Attributes `due_count` and `due_soon_count` (numbers) |
| Nozzle / Bed / Chamber temperature | Sensor | Current temperatures (two nozzles: left and right) |
| Nozzle / Bed / Chamber target temperature | Number | Set the heaters; their lowest value (0 °C, 32 °F) turns them off. A running job may set them again |
| Part cooling / Auxiliary / Chamber fan | Fan | Fan speeds in %, settable, in steps of 10 as Bambu's apps show them. The H2 series, the X2D and a P2S with the External Exhaust Fan kit have an *Exhaust fan* instead of a *Chamber fan* (a base P2S has neither); the X2D has a *Left* and a *Right auxiliary fan*, a P2S with a left auxiliary fan a *Left auxiliary fan* beside its *Auxiliary fan*. The stock X1 has no auxiliary fan and the P1P neither that nor a chamber fan: kits add them, so they are there, disabled at first |
| Hotend fan | Sensor | Hotend fan speed *(Diagnostic)* |
| Chamber light | Light | Switch the chamber light (*Light* on the open A1 series and the P1P) |
| Print speed | Select | Silent, Standard, Sport, Ludicrous — while printing |
| Airduct mode | Select | Cooling or heating (P2S, X2D, H2 series) — while no print runs: the printer sets it at every print start; *Laser mode* while the printer has set it for its laser module. Cooling is refused while the chamber heats, heating while it is ventilated *(Configuration)* |
| Ventilation | Fan | Printers with an airduct (P2S, X2D, H2 series): on sets the airduct to cooling and runs the fans that bring the air through — the exhaust fan on the H2 series, the right auxiliary and the exhaust fan on the X2D, the auxiliary fan on the P2S and, with the kit, its exhaust fan — at one speed in steps of 10 %, 60 % unless you give one. It is refused while the chamber heats (on the P2S: while the airduct keeps it warm) and during a print in heating mode. A chamber target in turn is refused while the chamber is ventilated and during a print in cooling mode, and sets the airduct to heating first. Off sends nothing outside cooling mode: the ventilation is off there already, and its fans do other work — filtering on the X2D, circulating through the filter on the P2S, drawing off a laser's fumes on the H2 series |
| Active nozzle | Select | Left or right nozzle of a two-nozzle printer — while no print runs |
| AMS filament backup | Switch | When a spool runs out, the printer continues with a matching spool from the AMS (same brand, material and color). Printers with an AMS; *unknown* where BamBuddy cannot read it (the A1 and P1 series before BamBuddy 1.3.0) — switching works all the same *(Configuration)* |
| AI print monitoring / First layer inspection / Build plate (position) detection / Spaghetti, purge chute pile-up, nozzle clumping and air printing detection | Switch | The printer's AI detection, only what the model has: the X1 series has AI monitoring, the first layer and the plate position check, the A series the plate position check, the P2S, X2D and H2 series the build plate check and each detector on its own — air printing only the H2D, H2D Pro and H2C (an H2D before firmware 01.01.02.08: AI monitoring and the build plate check). Their sensitivity stays as set on the printer *(Configuration)* |
| Pause print / Resume print / Stop print | Button | Print controls; pressed at the wrong time they say why. They act at once — the dashboard card asks only before it stops a print |
| Plate cleared | Button | Tell BamBuddy the plate is empty: its queue may start the next print |
| Build plate | Binary sensor | *Needs clearing* while BamBuddy waits for the plate to be cleared, else *Ready* |
| AMS status | Sensor | What a filament change is doing: heating, feeding, retracting, purging … |
| HMS errors | Sensor | Number of active HMS errors; each error's `code`, `severity` (`error`, `warning`, `notice` or `unknown`), `description` (BamBuddy's text, in English) and the answers the printer offers for it (`actions`) in the attribute `errors` |
| Clear HMS errors / Refresh status | Button | *(Diagnostic)* |
| Active filament | Sensor | The filament in use, with its color and slot |
| External spool | Sensor | Filament on the spool holder (two nozzles: left and right) |
| Door | Binary sensor | Open or closed (printers with a door sensor) |
| Camera | Camera | Live stream and snapshot; its attribute `frame_rate` says the frames a second a stream asks for, and while a stream runs `streamed_frame_rate` the frames a second that arrive |
| Camera frame rate | Number | The live view's frames a second *(Configuration; Home Assistant's own setting)*: from 5 up to what the camera gives — 30 on the X1, X2D, H2 and P2 series, 15 for a camera BamBuddy takes from elsewhere — in steps of 5, the most unless set. The A1 and P1 series and the A2L give 5 and have none, unless BamBuddy takes an external camera for them. BamBuddy shares one connection to its printers' own cameras among everyone watching, at the rate the first of them asked: while someone else watches (BamBuddy's own page asks for 8 or 15), the stream gets that rate, and the next start of the live view asks again |
| Cover image | Image | The job's plate picture, while a job runs and after it has finished or failed |
| Firmware | Update | New firmware Bambu Lab offers *(Diagnostic; install it on the printer or in BamBuddy)* |
| Online / Developer mode / SD card / Wired network / Wi-Fi signal / IP address / Nozzle type / Nozzle diameter | Binary sensor / Sensor | *(Diagnostic; Wired network only on the X1E and the H2D Pro, the printers with a port; Wi-Fi signal disabled at first on a wired printer. The P2S, X2D and H2 series have a USB drive instead of the SD card)* |
| Printable objects / Timelapse | Sensor / Binary sensor | *(disabled at first)* |

### Per AMS unit

Each AMS unit is a device under its printer — **AMS**, **AMS 2 Pro**, **AMS HT** or **AMS Lite** — known by its serial number: it keeps its device, entities and history wherever on the printer it is plugged in, and its entity IDs carry its model and serial, such as `sensor.ams_2_pro_19c06a000000001_slot_1`. A unit's serial number is on its device page. BamBuddy 1.2.5.7 reports no serial for the AMS Lite ([maziggy/bambuddy#3348](https://github.com/maziggy/bambuddy/issues/3348); its 1.3.0 betas do): until yours does, the AMS Lite's IDs carry the printer's serial and its letter, such as `sensor.ams_lite_0309da000000002_a_slot_1` (the A2L's AMS Lite has no letter). Once BamBuddy reports the serial, the BamBuddy entry reloads once — its entities are unavailable for a few seconds —, the unit keeps its device and history, its entity IDs take its serial, and **Settings → Repairs** lists the renamed IDs for your automations — choose **Done** there once they use the new IDs; the list goes with the notice. IDs you changed yourself stay. A replacement unit with a serial of its own is a new device with its own IDs (an AMS Lite stays the same device while BamBuddy reports no serial), while the old one stays with unavailable entities until you delete it (its device page offers Delete once the printer no longer reports it). A unit moved to another printer is a new device there: delete its old device first, and it gets the plain entity IDs; otherwise they end in `_2`.

| Entity | Type | Description |
|---|---|---|
| Slot 1 … 4 | Sensor | The filament in the slot, or *Empty*; attributes such as `color`, `type`, `name`, `remaining` (%, only for a spool with a chip: without one the AMS cannot estimate it), `active` and `tray_id`, and on a two-nozzle printer the nozzle the unit feeds (`nozzle`: `left` or `right`) |
| Humidity / Temperature | Sensor | Inside the unit (not the AMS Lite) |
| Drying / Drying time left | Binary sensor / Sensor | AMS 2 Pro and AMS HT. Its attribute `remote_start` says whether Home Assistant can start drying: a P1P, P1S, A1 or A1 mini dries only from its own screen, and older firmware not from here at all; `target_temperature` the temperature it dries at, while it dries — when the drying was started through BamBuddy or Home Assistant (BamBuddy does not learn the temperature of one started on the printer) |

### Per smart plug

Each smart plug BamBuddy links to a printer is a device under that printer, named after the printer and the plug, such as *Workshop Exhaust fan (Smart Plug)*; moved to another printer in BamBuddy, it follows. Its entities belong to what it switches: a Tasmota by its IP address, a Home Assistant plug by its entity, an MQTT plug by its topic and the path BamBuddy reads there, a REST plug by the plug in BamBuddy. Pointed at another one in BamBuddy, the plug keeps its device and gets new entities — also for a Tasmota given a new IP address, which BamBuddy knows only by its address —; two plugs swapped in BamBuddy keep their devices and swap their entities, with their history. The switch-off after the print stays with its printer either way. Deleted in BamBuddy, or linked to no printer set up here, its device goes within a minute, and its entities with it — unless another plug switches the same device, which then takes them over. Entities that go keep their recorded history until the recorder purges it; their statistics are deleted once their entity ID has been unused for 10 days. Plugs are added and set up in BamBuddy; Home Assistant switches them only.

| Entity | Type | Description |
|---|---|---|
| *The plug* | Switch | On or off. Off cuts the power: a plug that powers the printer takes it offline in BamBuddy, and a running print stops. Its attributes, kept while BamBuddy cannot reach the plug, say whether it powers the printer (`powers_printer`) and is the printer's own plug (`printer_main`: BamBuddy's pick where several power it), whether BamBuddy shows it on its printer card (`on_printer_card`) and whether BamBuddy's own auto off is on (`bambuddy_auto_off`). A plug BamBuddy only watches (MQTT): a binary sensor instead |
| Run | Button | A Home Assistant script BamBuddy keeps as a plug: it runs, it has no on and off |
| Power / Energy today / Energy total | Sensor | Only the figures the plug reports; *Energy total* fits Home Assistant's energy dashboard |
| Switch off after the print | Switch | For the printer's own plug — where several power it, the one BamBuddy picks —, see below |
| Repeat after every print / Switch off when nozzle is below | Switch / Number | Its settings *(Configuration)*: only after the next print (the default) or after every print; the nozzle temperature, 50 °C unless set (30–100 °C) |
| Don't switch off this time | Button | While it waits: this time the printer stays on |

**Switching off after the print.** BamBuddy's own *Auto Off* cannot be changed with an API key, so the integration brings its own. Switched on, it waits after a print that finished until the printer stands still, the AMS neither changes filament nor dries, no heater has a target and every nozzle is below the set temperature — then it switches the plug off. It never acts during a running or paused print or on a printer BamBuddy cannot reach, and a failed or stopped print leaves the printer on. After two hours it gives up. While BamBuddy's own *Auto Off* is on for the plug, Home Assistant's cannot be turned on: turn BamBuddy's off first, so the two never act at once. Its switch's attributes say where it stands: `phase` (`idle`, `waiting`, `done`, `skipped`, `failed_print`, `gave_up`, `bambuddy`) and `waiting_for` (`nozzle`, `drying`, `filament`, `heating`, `printer` or `plug`, while it waits). In the logbook the plug turns off, and this switch with it where it was on only for the next print. To react to the switch-off, use a state trigger on the switch's `phase` from `waiting` to `done`: without `from`, it fires again when the integration reloads. `done` lasts until the plug is on again, a print starts or this switch is turned on or off.

Home Assistant does not refuse a plug's off during a print — the plug is an emergency stop; only the card asks first. Leave a printer's plug out of automations and voice commands that switch everything off.

### BamBuddy

| Entity | Type | Description |
|---|---|---|
| Connection | Binary sensor | Whether BamBuddy answers, asked once a minute — available also when it does not. Its printers' entities turn unavailable sooner, within about 20 seconds |
| Total / Successful / Failed / Cancelled prints | Sensor | Print statistics |
| Total print time / Total filament used | Sensor | Over all prints |
| Printers online | Sensor | Printers BamBuddy is connected to |
| Printers total / Free disk space / Disk usage | Sensor | *(Diagnostic)* |
| Update | Update | A new BamBuddy release, with its notes |

---

## 🎛️ Actions

For what is no entity. Moving, homing and extruding refuse while a print is running or paused: BamBuddy would put them into the print. Loading and unloading refuse while a print is running, but work while it is paused — for a color change by hand. None of these work while the AMS changes filament. Skipping objects, on the other hand, works only while a print is running or paused. The slot actions take one slot each, as `entity_id` in the action's data (not as a `target`).

| Action | Fields | What it does |
|---|---|---|
| `bambuddy.move_axis` | `device_id` (printer), `axis` (`x`, `y`, `z`), `distance` (mm, −200 … 200) | Moves the toolhead (X, Y; on the A1, the A1 mini and the A2L Y moves the bed) or changes the distance between nozzle and bed (Z; positive moves them apart) |
| `bambuddy.home_axes` | `device_id` | Moves all axes to their home position — clear the plate first |
| `bambuddy.extrude` | `device_id`, `distance` (mm, −100 … 100) | Extrudes, or retracts with a negative length; needs the nozzle at 170 °C or more (on a two-nozzle printer the active one — see *Active nozzle*) |
| `bambuddy.load_filament` | `entity_id` (a slot or external spool sensor) | Loads that filament (not from an AMS HT: BamBuddy cannot; and not from an AMS slot on a printer with the Filament Track Switch: such a load must name the nozzle, which this action does not ask — load it on the printer or in BamBuddy) |
| `bambuddy.unload_filament` | `device_id` | Unloads the filament in the nozzle (on a two-nozzle printer, the active one) |
| `bambuddy.set_filament` | `entity_id` (a slot or external spool sensor), `filament`, `color` (RGB), `k_profile` | Tells the printer what a spool without a chip holds: a new color keeps the slot's profile; a new `filament` — a Bambu Studio profile id such as `GFL99` (Generic PLA), those Bambu Studio offers for the printer, its nozzle and the slot; `bambuddy.get_filaments` lists them — takes its profile with the default K value, or the printer's own K calibration `k_profile` (`-1`: the default) |
| `bambuddy.get_k_profiles` | `entity_id` (a slot or external spool sensor) | Returns `nozzle_diameter`, the slot's current profile (`current`; `-1`: none) and `profiles`, the printer's own K (pressure advance) calibrations for the nozzle that feeds the slot (`index`, `name`, `k_value`, `filament_id`, `nozzle` on two-nozzle printers). The printer is asked live, which takes up to about 16 seconds; an empty `profiles` means the printer listed none or did not answer |
| `bambuddy.get_filaments` | `entity_id` (a slot or external spool sensor) | Returns the slot's current filament (`current`, a profile id) and `vendors`: the filaments Bambu Studio offers for the slot, by vendor (`name`, `filaments` with `id`, `name`, `type`) — a response only, as `get_k_profiles` |
| `bambuddy.reset_slot` | `entity_id` (a slot or external spool sensor) | Clears the slot's material and color, as Reset on the printer's screen — not during a print; in a paused one it is allowed |
| `bambuddy.refresh_rfid` | `entity_id` (an AMS slot sensor) | Lets the AMS read the spool's chip again — only while no filament is loaded (BamBuddy's rule) |
| `bambuddy.start_drying` | `device_id` (AMS 2 Pro or AMS HT), `temperature` (45 … 85 °C), `duration` (1 … 24 h) | Dries the unit's filament (AMS 2 Pro: at most 65 °C) |
| `bambuddy.stop_drying` | `device_id` (AMS 2 Pro or AMS HT) | Stops drying |
| `bambuddy.get_print_objects` | `device_id` | Returns the running print's objects (`id`, `name`, `skipped`) — while a print runs or is paused |
| `bambuddy.skip_objects` | `device_id`, `objects` (list of ids) | Leaves these objects out of the rest of the print — cannot be undone |
| `bambuddy.answer_hms` | `device_id`, `code`, `action` | Answers an HMS message as the printer's screen would, such as `RESUME_PRINTING_PROBELM_SOLVED` (Bambu's spelling) once the filament is loaded — only an answer the message lists in `actions` |
| `bambuddy.run_diagnostic` | `device_id` | Returns BamBuddy's check of the connection to the printer (`overall`: `ok`, `warnings` or `problems`; `checks` with `id`, `status` — `pass`, `warn`, `fail` or `skip` — and `params`): its ports, access code, developer mode and status reports — also while the printer is offline. Sends the printer no command; takes up to half a minute |
| `bambuddy.mark_maintenance_done` | `device_id`, `task_id` (an `id` from the *Maintenance* sensor's `tasks`) | Marks the task done in BamBuddy: its count starts over — also while the printer is offline |

Moves over BamBuddy are G-code: the printer's firmware does not limit them to its build volume. Move in small steps near the ends of an axis.

---

## 🃏 Dashboard card

The integration brings its own card: one per printer, with its status, camera, temperatures, AMS colors and controls. Nothing else to install.

> [!NOTE]
> After installing or updating the integration, reload the browser page (twice if the card is still missing). In the companion app: **Settings → Companion app → Troubleshooting → Reset frontend cache**.

<table>
  <tr>
    <td valign="top"><img src="https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/.github/readme/cards/status.png" alt="The BamBuddy card's Status tab: a print at 45 % with its cover, layer, time left and end time; pause, stop and skip objects; the printer's plug with its power and the switch-off after the print; temperatures; four AMS units with their colors; fans and print speed" width="300"></td>
    <td valign="top"><img src="https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/.github/readme/cards/two-nozzle.png" alt="The Status tab of a two-nozzle H2D: left and right nozzle with the active one marked, and four AMS 2 Pro and eight AMS HT units, two of them drying" width="300"></td>
  </tr>
  <tr>
    <td valign="top"><img src="https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/.github/readme/cards/control.png" alt="The Control tab: nozzle and bed heating, the print options with the AI detections, and the jog pad with bed and extruder" width="300"></td>
    <td valign="top"><img src="https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/.github/readme/cards/filament.png" alt="The Filament tab: an AMS and an AMS HT with each slot's material, color and what is left, load and unload, drying with its time left, the filament backup and the external spool" width="300"></td>
  </tr>
</table>

### Add the card

1. Open a dashboard, choose **Edit dashboard** (✏️), then **Add card**.
2. Switch to **By card**, search for **BamBuddy** and choose **BamBuddy printer**.
3. Check the printer: the editor starts with one already chosen — pick the one you want. The other options can stay as they are: the groups **General**, **Status**, **Control** and **Filament** below the printer hold what you can change.

### What it shows

- **Status:** the job on top — a picture (the job's cover — a tap shows it large — and the live view: its camera button starts it, or it runs always; it names its frame rate, and where the camera gives more than 5 frames a second, its ⚙ sets it, and ⛶ shows it full screen (on an iPhone as large as the window: iOS has no full screen for it)), its state in words (*Printing*, *Paused by the user*, *Heating nozzle*, …), progress with layers, time left and end time, and *Plate cleared* when the next print waits for it. Below it, in the order you choose: pause, stop and skip objects; temperatures with their targets, the chamber's with its ventilation or keeping warm (tap one to set it); the printer's smart plugs with their power and energy — every plug asks before it goes off — and the switch-off after the print; the AMS colors with what is left, each unit's model, humidity and temperature, and what a filament change is doing; fans; the print speed. While the printer's plug is off, the card says so and switches the printer on, and counts while it starts.
- **Head:** the printer's name in BamBuddy with its model, nozzle and print hours; the chamber light; chips for the network, HMS messages colored by severity and the firmware (tap one for more), and on request (`header_chips`) for maintenance — add it to see due tasks on the card —, an open door, missing storage, drying AMS units and the printer's plug; a line while an HMS message matters; and ⋮ for the printer's information, its maintenance, a refresh, the connection check and, for admins, its device page. The maintenance list marks a task done after a question in its row. The HMS messages offer the answers the printer's screen offers for them — resume, retry, ignore, stop (stopping asks first) — and a link to Bambu Lab's HMS wiki.
- **Control:** heating and ventilation — the nozzle, the bed and, where the printer heats it, the chamber, each with − and + and a power switch that switches it on or off (the switches of the nozzles and the bed are hidden while a print runs or is paused); on the P2S, keeping the chamber warm, on or off; on printers with an airduct, ventilating the chamber, on or off and in steps of 10 % — the chamber heated and the chamber ventilated wait for each other, and each says why; the print options — the printer's AI detections, folded, the head saying how many are off; the active nozzle on two-nozzle printers; a jog pad for X and Y and the bed closer or farther, in steps of 0.1, 1 or 10 mm, homing, and extruding or retracting 10 mm; a camera button beside the steps opens the live view above them. Moving and extruding are locked while a print runs or is paused and during a filament change.
- **Filament:** each AMS unit with its slots — load and unload, humidity, temperature, drying for the AMS 2 Pro and the AMS HT, set to the gentlest of the loaded spools' advice —, the AMS filament backup, and the external spool (left and right on two-nozzle printers). The ✏️ on a filled slot opens its tools: vendor, filament, color and K profile for a spool without an RFID chip, reading the chip again, and resetting the slot. On two-nozzle printers each unit names the nozzle it feeds (L or R). From three units on, each unit shows only its head, colors and drying at first; a tap on the head shows its slots. In a paused print it offers to resume once the new filament is in.

While the printer is offline, or BamBuddy gives no data, every tab says so with the printer's picture; offline it offers *Check connection*: BamBuddy checks its ports and its connection to the printer, and the card says what is wrong and what to do. Stop, skipping objects, homing, loading, unloading, and starting and stopping drying ask before they act. After a command the card shows *Sent*; with developer LAN mode off it warns that the printer takes no commands.

### Card options

| Option | Values | Default | Meaning |
|---|---|---|---|
| `printer` | a device ID | — | The printer (the editor lists them). The ID is the last part of the address of the printer's device page (`…/config/devices/device/<ID>`) |
| `camera` | `tap`, `always`, `off` | `tap` | The live view: on a tap of its camera button, always while the dashboard is open, or never (the job's picture then) |
| `status_blocks` | a list of `controls`, `power`, `temperatures`, `ams`, `fans`, `speed` | all six, in this order | The Status tab's sections below the job, in the list's order; a section left out is hidden. The job always stays on top. Print controls and print speed show only while a print runs or is paused; power only for a printer with a smart plug |
| `header_chips` | a list of `network`, `hms`, `firmware`, `maintenance`, `door`, `storage`, `drying`, `power` | `network`, `hms`, `firmware` | The chips below the name, in the list's order; a chip left out is hidden. Door, storage and drying show only while the door is open, the storage is missing or an AMS unit dries — one chip for all units, with the longest time left; power only for a printer with a smart plug, a tap shows its plugs. An HMS error shows whatever you choose. Chips never cut their text: more chips take more rows |
| `compact_chips` | `true`, `false` | `false` | The chips with icon and value only: *OK* instead of *HMS OK*, *3* instead of *Maintenance: 3 due*, the version an update brings, the drying time (*2×* before it for several units), a plug's power or its state in a word; an open door and missing storage as their icon. A tooltip shows the full text, and screen readers read it out |
| `start_view` | `status`, `control`, `filament` | `status` | The tab the card opens on; Status where that tab is hidden (the editor warns when its options hide it) |
| `show_control_tab` | `true`, `false` | `true` | The Control tab |
| `control_sections` | a list of `heating`, `options`, `motion` | all three, in this order | The Control tab's sections: heating and ventilation, print options, axes and extruder |
| `read_only` | `true`, `false` | `false` | Hide controls: the card only shows — the light, heating, ventilation and the print options as states, no button that acts, no axes |
| `show_filament_tab` | `true`, `false` | `true` | The Filament tab |
| `ams_folding` | `auto`, `folded`, `open` | `auto` | How the Filament tab shows AMS units at first: folded from three units on, folded, or with their slots |
| `show_external_spool` | `true`, `false` | `true` | The external spool in the Status and Filament tabs, on a printer with an AMS; one the printer or its running job feeds from shows all the same |
| `show_auto_off` | `true`, `false` | `true` | The row of the switch-off after the print under the printer's plug |

```yaml
type: custom:bambuddy-printer-card
printer: 1f0c8e6a5b3d4c2e9a7b6d5c4e3f2a1b
camera: tap
status_blocks: [temperatures, controls, ams]
ams_folding: folded
```

In the editor, drag a section or a chip by its handle (≡) to move it, and × hides it. Without a mouse or touch, remove one and add it again: it goes to the end. The editor shows every option as it applies, defaults included, and saves only what differs from the defaults: an option you set back leaves the YAML again. Its preview shows a section with nothing to show at the moment, such as the print controls without a print or every section while the printer is offline, faded as an example; the dashboard, also while you edit it, shows the card as it is. A list you never changed shows a section that a later version adds; a list you saved keeps it hidden until you add it.

*Hide controls* turns the card into a display: what can be set shows as its state, and a tap opens nothing that could set it (a temperature or the hotend fan opens its sensor, the other fans open nothing). It is no lock: actions, automations and device pages still work.

The live view uses bandwidth while it runs; with `tap` it stops when you leave the page. Home Assistant Cast does not show the card: Cast loads no integration's own modules.

---

## 🤖 Automation examples

How to use them: **Settings → Automations & scenes → Create automation → ⋮ → Edit in YAML**, paste an example and put in your entity IDs (your printer's device under **Settings → Devices & services → BamBuddy** lists them) and your phone's notify action (`notify.mobile_app_<your phone>`). Easier for a first one: in the visual editor choose **Add trigger → Entity**, then the state trigger (**State**; **State changed** in the newest versions), pick your printer's *Print status*, set **From** to *Printing* and **To** to *Finished*.

Entity IDs are made of the printer's model and serial number and the entity's English key — `sensor.x1c_00m00a000000001_print_status` —, an AMS unit's of its own model and serial — `sensor.ams_2_pro_19c06a000000001_humidity`; an AMS Lite's, for now, of the printer's serial and its letter (see [Per AMS unit](#per-ams-unit)) —, whatever the printer is called and in any language. Yours carry the model and serial of your printer or AMS unit; its device page shows the serial. BamBuddy's own start with `bambuddy`, such as `sensor.bambuddy_total_prints` (a second BamBuddy's end in `_2`). A smart plug's carry a short code made from what the plug switches — `switch.bambuddy_smart_plug_3f9a2c` (the plug itself), `sensor.bambuddy_smart_plug_3f9a2c_power`, `sensor.bambuddy_smart_plug_3f9a2c_energy_today` —: they stay when the plug is renamed or moved to another printer, and go with what it switches (see [Per smart plug](#per-smart-plug)); a second plug that switches the same device ends in `_2`.

**Tell me when a print is done**

```yaml
triggers:
  - trigger: state
    entity_id: sensor.x1c_00m00a000000001_print_status
    from: printing
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
conditions:
  - "{{ trigger.from_state.state not in ['unavailable', 'unknown'] }}"
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
  - action: "light.turn_{{ 'on' if trigger.to_state.state in ['preparing', 'printing', 'paused'] else 'off' }}"
    target:
      entity_id: light.x1c_00m00a000000001_chamber_light
```

On an A1, A1 mini, A2L or P1P the light is `light.<model>_<serial>_light` (they have no chamber).

**Remind me of a wet AMS**

```yaml
triggers:
  - trigger: numeric_state
    entity_id: sensor.ams_2_pro_19c06a000000001_humidity
    above: 40
    for: "01:00:00"
actions:
  - action: notify.notify
    data:
      message: "{{ device_attr(trigger.entity_id, 'name') }} is at {{ trigger.to_state.state }} % humidity: time to dry the filament."
```

---

## ⬆️ Upgrading from a date version

2.0.0 is a new integration under the old name. Home Assistant migrates the BamBuddy entry by itself; still, plan a few minutes:

- **The API key** needs **Read Status**, **Control Printer** and **Manage Maintenance**. 1.x worked with Read Status alone, and with BamBuddy's authentication off with any text: where the stored key lacks a permission or BamBuddy does not know it, Home Assistant asks for a new one after the update (**Settings → Repairs**). Create it in BamBuddy first (see [Create an API key](#create-an-api-key)).
- **The connection** becomes a single address (`http://host:port`); nothing to do.
- **Device names** become *BamBuddy name (model / serial number)* and follow BamBuddy from then on. A name you gave a device in Home Assistant is replaced by it (Repairs tells you once); rename the printer or its AMS units in BamBuddy instead. Entity names in a dashboard card show the longer device name in front.
- **Entity names** are new and translated; **entity IDs stay** where the entity stayed. The values changed with the names: *Print status* (1.x's *Status*) now reads `idle`, `preparing`, `slicing`, `printing`, `paused`, `finished`, `failed`, `offline` (1.x showed BamBuddy's `RUNNING`, `FINISH`, …), *Print speed* has the options `silent`, `standard`, `sport`, `ludicrous`, *HMS errors* (the old *HMS Status* sensor) is a number, and an idle printer's *Current print* is unknown instead of empty. Check automations that compare these values. New entities get IDs of model, serial number and English key (an AMS unit's: its own model and serial).
- **Printers and AMS units are known by their serial numbers:** a new BamBuddy, a restored database or an AMS plugged in elsewhere keeps their devices, entities and history.
- **Gone or changed:** *Subtask* and *GCode File* (now *Current print*), the target temperature sensors (now numbers you can set), the fan sensors (now fans, except the hotend fan), *HMS Errors* as binary sensor (now the *HMS errors* count), the *Chamber Light* switch (now a light), and *Version*, *Health Status*, *Uptime*, *Archive Count*, *Model* and *Firmware Version* (the update entities and the device page show them). Replace them in dashboards and automations.
- **Buttons** for pause, resume and stop are no longer under *Configuration* on the device page.
- **New:** AMS devices, smart plug devices with the switch-off after the print, numbers, fans, the ventilation of printers with an airduct, a light, the AI detection and AMS filament backup switches, the *Maintenance* sensor, the active nozzle and airduct selects, update entities, actions, the dashboard card.

HACS offers 2.0.0 as an update to everyone on a date version.

---

## ⚠️ Known limitations

- **Through BamBuddy only.** The integration shows what BamBuddy knows; if BamBuddy loses a printer, so does Home Assistant. Commands go to BamBuddy, which passes them to the printer without waiting: a command can be accepted and still be ignored by a printer without developer LAN mode.
- **No soft limits on moves** — see [Actions](#%EF%B8%8F-actions).
- **What BamBuddy cannot do, neither can the integration:** start a print, change the plate type, load from an AMS HT, send raw G-code.
- **Filament Track Switch:** a load from an AMS slot must name the nozzle to feed, which `bambuddy.load_filament` and the card do not ask: load it on the printer or in BamBuddy. The external spools load.
- **AMS Lite without its serial number:** BamBuddy 1.2.5.7 does not report it ([maziggy/bambuddy#3348](https://github.com/maziggy/bambuddy/issues/3348); its 1.3.0 betas do). Until yours does, the AMS Lite's entity IDs carry the printer's serial number and the unit's letter (`sensor.ams_lite_0309da000000002_a_slot_1`). Once BamBuddy reports it, they are renamed once and **Settings → Repairs** lists them — see [Per AMS unit](#per-ams-unit).
- **Firmware and BamBuddy updates** are shown, not installed.
- **Live updates need BamBuddy's WebSocket.** A reverse proxy in front of BamBuddy must pass WebSockets on the address you gave; without them the status is up to 10 seconds old. **Configure → Settings → Live updates** tests it. Some values BamBuddy's live connection does not tell of on their own — HMS messages, the remaining time, the print speed, the chamber and right-nozzle targets, the AI detection switches, the airduct, the AMS humidity: they come with the next change, at the latest with the 10-second read.
- **Printer names come from BamBuddy:** a printer is named after its name in BamBuddy, then model and serial number, e.g. *Workshop (X1C / 00M00A000000001)*. Rename it in BamBuddy; a name given in Home Assistant goes back to BamBuddy's within a minute, and **Settings → Repairs** says why. Smart plug devices and the BamBuddy device keep a name you give them in Home Assistant. AMS units follow their printer, lettered as on the printer — *Workshop AMS A (AMS 2 Pro / serial number)* — or named as in BamBuddy — *Workshop Silk (AMS 2 Pro / serial number)* —, so they sort right under it.
- **Cast** does not show the dashboard card.
- **No icon before Home Assistant 2026.3:** older versions take an integration's icon only from Home Assistant's brands repository, which has none for BamBuddy; from 2026.3 on, the integration brings its own.

---

## 🔧 Troubleshooting

**The setup form, or the BamBuddy entry under Settings → Devices & services, says BamBuddy cannot be reached.**
Use the address you open BamBuddy with in your browser, including the port. With BamBuddy running as a Home Assistant app, use the host's address and the port the app shows, not `localhost`. The part in brackets after the entry's message, such as `(GET /updates/version: ClientConnectorDNSError)`, is for a bug report.

**The setup does not accept the key.**
Check that you pasted all of it. BamBuddy shows a key only once: if you no longer have it, create a new one. Where the form shows the three permissions, the key lacks those marked ✗: BamBuddy cannot add them to an existing key — create a new one with **Read Status**, **Control Printer** and **Manage Maintenance**. If you ticked one marked ✗, the key's owner may not do it: give them that right in BamBuddy, or create the key as a user who has it.

**A button or a temperature does nothing on the printer.**
Turn on the printer's developer LAN mode (the *Developer mode* entity shows it): on the printer's screen under **Settings → Network** (or **WLAN**), first **LAN Only Mode**, then **Developer Mode** — see BamBuddy's [Enabling Developer Mode](https://wiki.bambuddy.cool/getting-started/#enabling-developer-mode). It takes the printer off Bambu's cloud — Bambu Handy and printing through the cloud no longer reach it; printing over your home network does — and its access code changes: enter the new one in BamBuddy. Check BamBuddy's own printer page: if it cannot control the printer, neither can Home Assistant.

**Everything of a printer is unavailable.**
With *Print status* `offline`, BamBuddy lost the printer: it is off, asleep or out of the network — the card's *Check connection* (or the action `bambuddy.run_diagnostic`) says which. If *Print status* is unavailable too, BamBuddy itself does not answer — its *Connection* sensor turns off within a minute — or it no longer accepts the API key: Home Assistant then asks for a new one under **Settings → Repairs**. If **Settings → Repairs** says *No longer in BamBuddy* for the printer, BamBuddy does not list it; the card says so too.

**A printer has only a few entities, and its name shows no model.**
BamBuddy has no model stored for it (it detects none for a printer added by hand), and the integration cannot find it out. Open the printer in BamBuddy, enter its model and save: within a minute the device gets the model in its name and the entities that model has. Entities created before keep their entity IDs, which say `printer` in place of the model (`sensor.printer_<serial>_print_status`).

**Changes show only seconds later.**
The integration hears of a printer's changes through BamBuddy's live connection (its WebSocket). Open **Configure → Settings → Live updates** on the BamBuddy entry: the page tests the connection. `HTTP 404`: no WebSocket answered at BamBuddy's address. BamBuddy answers 404 when the request reaches it without the WebSocket upgrade, which usually means a proxy in front of it does not pass WebSockets. `HTTP 403`: the connection was refused. BamBuddy refuses the socket when its token is missing or not valid, and the token when the API key's owner may not connect; a proxy can refuse either. Any other text says what failed instead. Behind a proxy that will not pass them, turn **Use live updates** off there: the integration then stops trying. The entry's diagnostics (**⋮ → Download diagnostics**) show the same under `live` (`enabled`, `connected`, `last_error`). Meanwhile everything goes on with the 10-second read.

**The camera shows nothing.**
The printer's live view must be on, and most printers allow one camera connection at a time: close Bambu Studio's or Bambu Handy's camera view.

**The card is missing in "Add card", or shows "Custom element doesn't exist".**
Reload the page (twice), or reset the companion app's frontend cache. The card needs no entry under *Resources*: the integration loads it itself.

**A card says the printer is no longer available.**
The card remembers the printer's device, and deleting the BamBuddy entry deletes its devices: a new setup creates new ones. Open the card's settings and choose the printer again. To change the BamBuddy server's address or key, use **⋮ → Reconfigure** on the entry instead: it keeps the devices and cards of the printers found at the new address.

**A bug report:** download the diagnostics on the BamBuddy entry (**⋮ → Download diagnostics**) and add them. They leave out the API key, BamBuddy's address, the printers' network addresses, access codes, camera addresses and serial numbers, and of a smart plug its address, login and URLs; printer, plug and print job names stay in. Use the entry's, not a device's: Home Assistant names a device's file after the device, serial number included.

---

## 🗑️ Removal

1. Go to **Settings → Devices & services → BamBuddy** and delete the entry with **⋮ → Delete**. Its devices, their entities and the API key stored in Home Assistant go with it — set up again later, the printers get new devices, and cards that showed them need their printer chosen again.
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

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details. It covers this project's code and documentation, not BamBuddy's name and logo (`.github/readme/logo.png` and `custom_components/bambuddy/brand/`), which belong to the BamBuddy project (see [Disclaimer](#%EF%B8%8F-disclaimer)).
