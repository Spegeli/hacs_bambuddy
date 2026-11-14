# Entities

Every entity of the integration: its name, its ID and what it shows.

[← Documentation](README.md)

**On this page:** [Entity IDs](#entity-ids) · [Names](#names) · [Printer](#printer) · [AMS units](#ams-units) · [Smart plugs](#smart-plugs) · [BamBuddy server](#bambuddy-server) · [Print status, stage and AMS status](#print-status-stage-and-ams-status) · [Disabled entities](#disabled-entities) · [While a printer is offline](#while-a-printer-is-offline) · [Units](#units)

Entity names are in Home Assistant's language: English or German, English for any other ([Languages](README.md#languages)).

Which entities a printer gets depends on its model; [Printers](printers.md) has the tables.

## Entity IDs

An entity ID does not depend on what the printer is called, or on the language.

| Kind | Form | Example |
|---|---|---|
| Printer | `<model>_<serial>_<key>` | `sensor.x1c_00m00a000000001_print_status` |
| Printer without a model | `printer_<serial>_<key>` | `sensor.printer_00m00a000000001_print_status` |
| AMS unit | `<AMS model>_<serial>_<key>` | `sensor.ams_2_pro_19c06a000000001_humidity` |
| AMS Lite, for now | `ams_lite_<printer serial>_<letter>_<key>` | `sensor.ams_lite_0309da000000002_a_slot_1` |
| BamBuddy server | `bambuddy_<key>` | `sensor.bambuddy_total_prints` |
| Smart plug itself | `bambuddy_smart_plug_<code>` | `switch.bambuddy_smart_plug_3f9a2c` |
| Smart plug's other entities | `bambuddy_smart_plug_<code>_<key>` | `sensor.bambuddy_smart_plug_3f9a2c_power` |
| Switch-off after the print | `<model>_<serial>_<key>`, as the printer's | `switch.x1c_00m00a000000001_auto_off` |

- **Yours** carry the model and serial of your printer or AMS unit. The device page shows the serial.
- **The AMS Lite** carries the printer's serial and its letter until BamBuddy reports its own serial ([AMS units](#ams-units)). The A2L's AMS Lite has no letter.
- **A second BamBuddy server's** own entities end in `_2`, such as `sensor.bambuddy_total_prints_2`. Its printers' IDs carry their own serials; a printer set up in both entries gets `_2` in the second.
- **A smart plug's** code is made from what the plug switches. Its IDs stay when the plug is renamed or moved to another printer, and go with what it switches ([Smart plugs](#smart-plugs)).
- **A Tasmota plug's** code comes from its IP address: if that changes, the plug gets new entities and entity IDs. Give it a fixed address ([How a plug is known](smart-plugs.md#how-a-plug-is-known)).
- **A second plug** that switches the same device ends in `_2`.
- **The switch-off after the print** belongs to the printer, not the plug: its entities keep their IDs when another plug becomes the printer's own.

The key is English. It mostly follows the entity's name, but not always:

| Entity | Key |
|---|---|
| *Build plate* | `plate_clear_needed` |
| *Pause print*, *Resume print*, *Stop print* | `pause`, `resume`, `stop` |
| *Cover image* | `cover` |
| *AI print monitoring* | `ai_monitoring` |
| *Purge chute pile-up detection*, *Nozzle clumping detection* | `pileup_detection`, `clumping_detection` |
| *Drying time left* | `drying_remaining_time` |
| *Connection* (BamBuddy server) | `online` |
| *Free disk space* | `disk_free` |
| *Turn off after the print*, *Repeat after every print* | `auto_off`, `auto_off_every_print` |
| *Turn off when nozzle is below*, *Don't turn off this time* | `auto_off_temperature`, `auto_off_skip` |

## Names

| Device | Named | Where to rename it |
|---|---|---|
| Printer | Its name in BamBuddy, then model and serial number: *Workshop (X1C / 00M00A000000001)* | In BamBuddy |
| AMS unit | After its printer, lettered as on the printer: *Workshop AMS A (AMS 2 Pro / serial number)* | In BamBuddy, which gives *Workshop Silk (AMS 2 Pro / serial number)* |
| Smart plug | After the printer and the plug: *Workshop Exhaust fan (Smart Plug)* | In Home Assistant, or in BamBuddy |
| BamBuddy server | The entry's title | In Home Assistant |

- AMS units start with their printer's name, so they sort right under it.
- A printer or AMS name given in Home Assistant goes back to BamBuddy's within a minute, and **Settings → Repairs** says why ([Repairs notices](troubleshooting.md#repairs-notices)).
- Smart plug devices and the BamBuddy device keep a name you give them in Home Assistant.

## Printer

### Print

| Entity | Type | What it shows |
|---|---|---|
| Print status | Sensor | The state of the job: [the states](#print-status-stage-and-ams-status). Attribute `bambuddy_name`: the printer's name in BamBuddy |
| Print stage | Sensor | What the printer is doing, such as heating the nozzle or changing filament |
| Progress | Sensor | Print progress in % |
| Remaining time | Sensor | Time left, in minutes |
| End time | Sensor | When the print will be done |
| Current layer | Sensor | The layer it prints |
| Total layers | Sensor | The job's layers |
| Current print | Sensor | The job's name; unknown while idle |
| Print hours | Sensor | Hours printed as BamBuddy counts them, with the offset set in BamBuddy |
| Pause print | Button | Pauses a running job |
| Resume print | Button | Resumes a paused print, but not during a filament change |
| Stop print | Button | Stops the job |
| Print speed | Select | Silent (50 %), Standard (100 %), Sport (124 %), Ludicrous (166 %); only during a job |
| Plate cleared | Button | Tells BamBuddy the plate is empty: its queue may start the next print |
| Build plate | Binary sensor | *Needs clearing* while BamBuddy waits for the plate to be cleared, else *Ready* |
| Printable objects | Sensor | How many objects the job has (disabled at first) |
| Timelapse | Binary sensor | Whether the job records a timelapse (disabled at first) |

The buttons act at once; only the dashboard card asks before it stops a print. Pressed at the wrong time, a button says why it does nothing. *Plate cleared* works after a print and while BamBuddy waits for the plate.

### Temperatures

| Entity | Type | What it shows |
|---|---|---|
| Nozzle temperature | Sensor | The nozzle now |
| Left nozzle temperature | Sensor | Two nozzles: the left one |
| Right nozzle temperature | Sensor | Two nozzles: the right one |
| Bed temperature | Sensor | The bed now |
| Chamber temperature | Sensor | The chamber now, where the printer reports one |
| Nozzle target temperature | Number | Sets the nozzle |
| Left nozzle target temperature | Number | Two nozzles: sets the left one |
| Right nozzle target temperature | Number | Two nozzles: sets the right one |
| Bed target temperature | Number | Sets the bed |
| Chamber target temperature | Number | Sets the chamber heater, where BamBuddy reports one |

- A target goes as high as [Temperature limits](printers.md#temperature-limits) says for the model. On the H2 series the entity stops at 320 °C, BamBuddy's limit, though the printer reaches 350 °C.
- The lowest value (0 °C, 32 °F) turns a heater off.
- A running job may set a target again.
- The chamber's target has rules of its own: [Who locks whom](chamber.md#who-locks-whom).

### Fans

| Entity | Type | What it shows |
|---|---|---|
| Part cooling fan | Fan | Every printer |
| Auxiliary fan | Fan | Most printers; the stock X1 and the P1P have it disabled at first |
| Left auxiliary fan | Fan | The X2D, and a P2S with that fan |
| Right auxiliary fan | Fan | The X2D |
| Chamber fan | Fan | The X1 series and the P1S; the P1P has it disabled at first |
| Exhaust fan | Fan | The H2 series, the X2D, a P2S with the External Exhaust Fan kit |
| Hotend fan | Sensor | Its speed in % (Diagnostic) |
| Airduct mode | Select | Cooling or Heating; *Laser mode* while the printer set it for its laser module (Configuration) |
| Ventilation | Fan | Printers with an airduct: draws air through the chamber |

- Fans show and take their speed in %, in steps of 10, as Bambu's apps do. Turned on without a speed, a fan runs at 100 %, *Ventilation* at 60 %.
- A running job sets the fans again with its next command.
- Which model has which: [Fans](printers.md#fans). The stock X1 and the P1P lack those fans; kits add them, so the entities are there, [disabled at first](#disabled-entities).
- *Airduct mode* changes only while no print and no filament change runs: the printer sets it at every print start. Its rules and those of *Ventilation*: [Chamber](chamber.md).

### Light

| Entity | Type | What it shows |
|---|---|---|
| Chamber light | Light | Enclosed printers. Where a printer has two chamber lights, BamBuddy switches both |
| Light | Light | The open A1, A1 mini, A2L and P1P |

### Camera

| Entity | Type | What it shows |
|---|---|---|
| Camera | Camera | Live stream and snapshot |
| Camera frame rate | Number | The live view's frames a second; Home Assistant's own setting (Configuration) |
| Cover image | Image | The job's cover image, while a job runs and after it has finished or failed |

- *Camera* has the attribute `frame_rate`, the frames a second a stream asks for. While a stream runs, `streamed_frame_rate` says what arrives.
- *Camera* shows *Idle* while no stream runs. That is normal for a camera that starts on demand.
- *Camera frame rate* goes from 5 up to what the camera gives, in steps of 5: [Camera](dashboard-card.md#camera) and the [table by model](printers.md#camera).

### AI detection

The printer's own detections, as switches (Configuration). A printer has only what its model has: [AI detection](printers.md#ai-detection).

| Entity | Type | Has a sensitivity |
|---|---|---|
| AI print monitoring | Switch | Yes |
| First layer inspection | Switch | No |
| Build plate detection | Switch | No |
| Build plate position detection | Switch | No |
| Spaghetti detection | Switch | Yes |
| Purge chute pile-up detection | Switch | Yes |
| Nozzle clumping detection | Switch | Yes |
| Air printing detection | Switch | Yes |

A sensitivity stays as set on the printer. The other checks are on or off only. The switches work during a print too, to silence a false alarm.

### Filament

| Entity | Type | What it shows |
|---|---|---|
| Active nozzle | Select | Left or right nozzle of a two-nozzle printer; changes only while no print and no filament change runs |
| AMS filament backup | Switch | With a spool out, the printer continues with a matching one (Configuration) |
| AMS status | Sensor | What a filament change is doing: [the states](#print-status-stage-and-ams-status) |
| Active filament | Sensor | The filament in use, or *None*; attributes as a [slot's](#slot-attributes) |
| External spool | Sensor | The filament on the spool holder, or *Empty* |
| Left external spool | Sensor | Two nozzles: the left spool holder |
| Right external spool | Sensor | Two nozzles: the right spool holder |
| External 1 … 9 | Sensor | H3C: the external input of each tool, numbered as on its screen |
| PrintTool on toolhead | Sensor | H3C: the PrintTool on the toolhead (1 to 9), or *None* while all nine are in the rack |
| PrintTool 1 … 9 | Sensor | H3C: each PrintTool's print time in hours, with its nozzle and what feeds it as attributes |

- *AMS filament backup* comes with the first AMS unit. A matching spool has the same brand, material and color: [Filament backup](ams-and-filament.md#filament-backup).
- It reads *unknown* where BamBuddy cannot read it, on the A1 and P1 series before BamBuddy 1.3.0. Switching works all the same.
- The external spool sensors carry the attributes of an [AMS slot](#slot-attributes). They have no `nozzle`, and `remaining` stays empty.
- A *PrintTool* sensor belongs to a place in the H3C's rack: a tool moved to another place is read there. Its attributes: `nozzle_code` (such as `HS01`), `nozzle_diameter`, `nozzle_material`, `nozzle_flow` (`standard`, `high_flow`, `tpu_high_flow`, `tpu_285`), `filament_diameter` (1.75 or 2.85), `has_filament`, `on_toolhead`, `filament_color` and `fed_by` (`ams` while the AMS 3H is reported, else `external`). A place the rack does not report reads *unknown*.

### Maintenance and messages

| Entity | Type | What it shows |
|---|---|---|
| Maintenance | Sensor | *OK*, *Due soon* or *Overdue*, as BamBuddy keeps the printer's maintenance |
| HMS errors | Sensor | How many [HMS](glossary.md#hms) messages are active |
| Clear HMS errors | Button | Clears the messages (Diagnostic) |
| Refresh status | Button | Asks the printer for its full status (Diagnostic) |
| Door | Binary sensor | Open or closed, on printers with a door sensor |

*Maintenance* has the attributes `tasks`, `due_count` and `due_soon_count`. Each task has its `id`, `name`, `due`, `due_soon`, `left`, `unit`, `interval` and `last_done`. How BamBuddy counts: [Maintenance](dashboard-card.md#maintenance).

*HMS errors* lists its messages in the attribute `errors`:

| Field | What it holds |
|---|---|
| `code` | The message's code, such as `0700_2000_0002_0012` |
| `severity` | `error`, `warning`, `notice` or `unknown` |
| `description` | BamBuddy's text, in English |
| `actions` | The answers the printer offers for it that Home Assistant can send; answers for the printer's own screen are left out |

*Clear HMS errors* removes only the message: [HMS messages](dashboard-card.md#hms-messages). To answer one, use [`bambuddy.answer_hms`](actions.md#bambuddyanswer_hms).

### Diagnostics

| Entity | Type | What it shows |
|---|---|---|
| Firmware | Update | New firmware Bambu Lab offers. Install it on the printer or in BamBuddy |
| Online | Binary sensor | Whether BamBuddy is connected to the printer |
| Developer mode | Binary sensor | Whether the printer's [developer LAN mode](glossary.md#developer-lan-mode) is on |
| SD card | Binary sensor | Whether a card is in |
| USB drive | Binary sensor | Whether a drive is in; the P2S, X2D and H2 series have it instead of the SD card |
| Wired network | Binary sensor | Only the X1E and the H2D Pro, the printers with a port |
| Wi-Fi signal | Sensor | In dBm; disabled at first on a printer that is on a cable at setup |
| IP address | Sensor | The printer's address in BamBuddy |
| Nozzle type | Sensor | Such as *Hardened steel* or *Stainless steel, high flow* |
| Left nozzle type | Sensor | Two nozzles: the left one |
| Right nozzle type | Sensor | Two nozzles: the right one |
| Nozzle diameter | Sensor | In mm |
| Left nozzle diameter | Sensor | Two nozzles: the left one |
| Right nozzle diameter | Sensor | Two nozzles: the right one |

## AMS units

Each [AMS](glossary.md#ams) unit is a device under its printer: **AMS**, **AMS 2 Pro**, **AMS HT**, **AMS Lite** or the H3C's **AMS 3H**. A unit is known by its serial number, which its device page shows. It keeps its device, entities and history wherever on the printer it is plugged in.

Its IDs carry its model and serial, such as `sensor.ams_2_pro_19c06a000000001_slot_1`.

BamBuddy 1.2.5.7 reports no serial for the [AMS Lite](glossary.md#ams-lite) ([maziggy/bambuddy#3348](https://github.com/maziggy/bambuddy/issues/3348); BamBuddy 1.3.0 does). Until yours does, its IDs carry the printer's serial and the unit's letter, such as `sensor.ams_lite_0309da000000002_a_slot_1`. What happens once it reports the serial, and to a replaced or moved unit: [When a unit is replaced or moved](ams-and-filament.md#when-a-unit-is-replaced-or-moved).

| Entity | Type | What it shows |
|---|---|---|
| Slot 1 … 4 | Sensor | The filament in the slot, or *Empty*. An AMS HT has one slot: *Slot 1*; an AMS 3H nine: *Slot 1 … 9* |
| Humidity | Sensor | Inside the unit; not the AMS Lite |
| Temperature | Sensor | Inside the unit; not the AMS Lite |
| Drying | Binary sensor | AMS 2 Pro, AMS HT and AMS 3H: *Drying* or *Not drying* |
| Drying time left | Sensor | AMS 2 Pro, AMS HT and AMS 3H: in minutes |

How many units a printer takes: [AMS units per printer](printers.md#ams-units-per-printer).

### Slot attributes

| Attribute | What it holds |
|---|---|
| `slot` | The slot's number |
| `color`, `type`, `name` | The filament's color, material and name |
| `remaining` | What is left in %; only for a spool with a chip, the AMS estimates no other |
| `active` | Whether the printer feeds from this slot |
| `empty`, `present` | Whether the slot is empty; whether a spool sits there, described or not |
| `tray_id` | BamBuddy's number of the slot |
| `nozzle_temp_min`, `nozzle_temp_max` | The filament's nozzle range, in °C |
| `drying_temp`, `drying_time` | A spool's own drying advice from its chip, in °C and hours |
| `rfid` | Whether BamBuddy names a chip for the spool |
| `nozzle` | Two nozzles: the nozzle the unit feeds, `left` or `right` |

### Inventory attributes

While BamBuddy's inventory can be read, a slot sensor and the external spool sensors have these too. With Spoolman they do not: [Not with Spoolman](spool-inventory.md#not-with-spoolman).

| Attribute | What it holds |
|---|---|
| `inventory_assignable` | Whether spools can be assigned: the key may, and the inventory has spools |
| `inventory_spool` | The slot's assigned spool, if it has one |

`inventory_spool` holds:

| Field | What it holds |
|---|---|
| `id` | The spool's number in the inventory |
| `name`, `brand`, `material`, `color_name` | What BamBuddy knows of it |
| `remaining_g`, `remaining_pct` | What is left, in grams and % |
| `storage_location` | Where it is kept |
| `filament_diameter` | 1.75 or 2.85, from its profile (BamBuddy keeps no diameter); empty where the profile is unknown |
| `also_assigned` | Other slots BamBuddy holds it in |

It holds a few more fields for the card, such as `rgba`. More: [Spool inventory](spool-inventory.md).

### Drying attributes

| Attribute of *Drying* | What it holds |
|---|---|
| `remote_start` | Whether Home Assistant can start drying |
| `target_temperature` | The temperature it dries at, while it dries |
| `zone_slots` | AMS 3H: the two slots of its drying zone, such as `[6, 8]`; none while BamBuddy reports no zone |
| `zone_humidity`, `zone_temperature` | AMS 3H: the drying zone's own humidity and temperature. *Humidity* and *Temperature* are the other slots' |

- A P1P, P1S, A1 or A1 mini dries only from its own screen, and older firmware not from here at all: [Drying from Home Assistant](printers.md#drying-from-home-assistant).
- BamBuddy knows `target_temperature` only for a drying started through BamBuddy or Home Assistant, not for one started on the printer.

## Smart plugs

Each smart plug BamBuddy links to a printer is a device under that printer. What makes a plug the same plug: [How a plug is known](smart-plugs.md#how-a-plug-is-known). Plugs are added and set up in BamBuddy; Home Assistant switches them only.

| Entity | Type | What it shows |
|---|---|---|
| *The plug*, named as its device | Switch | On or off. A plug BamBuddy only watches (MQTT): a binary sensor instead |
| Run | Button | A Home Assistant script BamBuddy keeps as a plug: it runs, it has no on and off |
| Power | Sensor | Watts, if the plug reports it |
| Energy today | Sensor | kWh, if the plug reports it |
| Energy total | Sensor | kWh, if the plug reports it; fits Home Assistant's energy dashboard |
| Turn off after the print | Switch | The printer's own plug: [Turn off after the print](smart-plugs.md#turn-off-after-the-print) |
| Repeat after every print | Switch | After every print, or only after the next one, the default (Configuration) |
| Turn off when nozzle is below | Number | 50 °C unless set, 30–100 °C (Configuration) |
| Don't turn off this time | Button | While it waits: this time the printer stays on |

Off cuts the power: a plug that powers the printer takes it offline in BamBuddy, and a running print stops ([Off during a print](smart-plugs.md#off-during-a-print)).

The plug's own entity has these attributes. All but `on_since` stay while BamBuddy cannot reach the plug.

| Attribute | What it holds |
|---|---|
| `powers_printer` | Whether it powers the printer |
| `printer_main` | Whether it is the printer's own plug: BamBuddy's pick where several power it |
| `on_printer_card` | Whether BamBuddy shows it on its printer card |
| `bambuddy_auto_off` | Whether BamBuddy's own *Auto Off* is on |
| `plug_type` | The plug's kind in BamBuddy |
| `on_since` | When Home Assistant saw it turn on |

## BamBuddy server

The BamBuddy server's own figures, and its print statistics over all printers.

| Entity | Type | What it shows |
|---|---|---|
| Connection | Binary sensor | Whether BamBuddy answers, asked once a minute; available also when it does not |
| Total prints | Sensor | Prints in all |
| Successful prints | Sensor | Prints that finished |
| Failed prints | Sensor | Prints that failed |
| Cancelled prints | Sensor | Prints that were stopped |
| Total print time | Sensor | Over all prints, in hours |
| Total filament used | Sensor | Over all prints, in grams |
| Printers online | Sensor | Printers BamBuddy is connected to |
| Printers total | Sensor | Printers BamBuddy lists (Diagnostic) |
| Free disk space | Sensor | On BamBuddy's disk, in GiB (Diagnostic) |
| Disk usage | Sensor | On BamBuddy's disk, in % (Diagnostic) |
| Update | Update | A new BamBuddy release, with its notes |

A printer's entities turn unavailable sooner than *Connection* turns off, within about 20 seconds.

## Print status, stage and AMS status

Three sensors, three questions:

| Sensor | Answers | Example |
|---|---|---|
| *Print status* | The state of the job | `printing` |
| *Print stage* | What the printer is doing right now | `changing_filament`, *Changing filament* |
| *AMS status* | Which step a filament change is at | `purging`, *Purging old filament* |

**Print status** has these states. Automations compare the state on the left.

| State | Shown as | Means |
|---|---|---|
| `idle` | Idle | No job |
| `preparing` | Preparing | A job is starting |
| `slicing` | Slicing | A job is being sliced |
| `printing` | Printing | A print is running |
| `paused` | Paused | A print is paused, by you or by the printer |
| `finished` | Finished | The print is done |
| `failed` | Failed | The print failed, or was stopped by hand |
| `offline` | Offline | BamBuddy lost the printer |
| `unknown` | Unknown | BamBuddy does not know the state |

A print you stop yourself counts as failed: that is the firmware's state. BamBuddy's *Cancelled prints* counts the stops.

**Print stage** has about 70 states, such as `heating_nozzle`, `auto_bed_leveling` or `paused_filament_runout`. The sensor's `options` attribute lists them all. The stages that start with "Paused" say why a print stopped: [A printer paused itself](troubleshooting.md#a-printer-paused-itself).

**AMS status** is a sensor of the printer, not of an AMS unit:

| State | Shown as |
|---|---|
| `idle` | Idle |
| `heating` | Heating the nozzle |
| `feeding` | Feeding filament |
| `retracting` | Retracting filament |
| `verifying` | Checking the filament |
| `purging` | Purging old filament |
| `changing_filament` | Changing filament |
| `reading_rfid` | Reading the spool's RFID |
| `assist` | Assisting the print |
| `calibrating` | Calibrating |

## Disabled entities

These exist but are off until you turn them on:

| Entity | Disabled |
|---|---|
| *Printable objects*, *Timelapse* | On every printer |
| *Auxiliary fan* | On the stock X1 and the P1P |
| *Chamber fan* | On the P1P |
| *Wi-Fi signal* | On a printer that is on a cable at setup |

To turn one on:

1. Open the printer's device under **Settings → Devices & services → BamBuddy**.
2. In its list of entities, choose **+1 disabled entity** (the number varies), then the entity.
3. Open the entity's settings, turn on **Enabled** and save.

Home Assistant adds the entity about half a minute later.

## While a printer is offline

While a printer is offline, BamBuddy keeps its last values; so that these old values do not show as current, most of its entities are unavailable. **Online** and **Print status** (`offline`) show it.

These stay available: *Print hours*, *Maintenance*, *Build plate*, *Plate cleared*, *Firmware* and *Camera frame rate*.

Home Assistant skips an unavailable entity without an error, with only a warning in its log. An automation that presses an offline printer's *Pause print* or sets its nozzle target sends nothing. The `bambuddy.*` actions refuse instead: [When actions refuse](actions.md#when-actions-refuse).

## Units

- Temperature sensors and numbers show in your Home Assistant's unit: °F with US customary units. A number's `set_value` then takes °F too.
- The dashboard card follows the same unit.
- A sensor that already exists keeps its unit when you change the unit system later.
- Attributes stay in °C, and so do the actions' fields: [Temperatures are in °C](actions.md#temperatures-are-in-c).
- *Nozzle diameter* stays in mm, also where inches are the unit.

## See also

- [Actions](actions.md)
- [Automations](automations.md)
- [Printers](printers.md)
