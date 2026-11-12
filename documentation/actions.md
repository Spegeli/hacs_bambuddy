# Actions

Every `bambuddy.*` action: what it takes, what it does and when it refuses.

[← Documentation](README.md)

Actions do what no entity can. Use them in automations and scripts, or try them in Home Assistant's developer tools.

## When actions refuse

An action that cannot run says why, and sends nothing.

| Situation | What it stops | What still works |
|---|---|---|
| Printer offline | Every action refuses with "… is offline" | `run_diagnostic`, `mark_maintenance_done`, `get_filaments`, `get_spools`, `unassign_spool` |
| A print is running or paused | `move_axis`, `home_axes`, `extrude` | Skipping objects |
| A print is running, not paused | `load_filament`, `unload_filament`, `reset_slot`, `refresh_rfid` | The same four in a pause |
| The AMS changes filament | Moving, loading, slot tools, `assign_spool`, `start_drying` | `unassign_spool`, the reads |
| No print running or paused | `get_print_objects`, `skip_objects` | Nothing |

- Moving, homing and extruding refuse during a print because BamBuddy would put them into the print.
- Loading and unloading work in a pause for a color change by hand.
- For moving, loading and the slot tools a job that is preparing counts as running; its objects can be read and skipped only once it prints.

The card's side of this: [Why a control is locked](dashboard-card.md#why-a-control-is-locked).

## Temperatures are in °C

The actions' fields are in °C, whatever unit Home Assistant uses: `temperature` of `bambuddy.start_drying` is one. So are attributes such as `nozzle_temp_min`, `drying_temp` and `target_temperature`. Entities show your unit: [Units](entities.md#units).

## All actions

| Action | Fields | What it does |
|---|---|---|
| `bambuddy.move_axis` | `device_id`, `axis`, `distance` | Moves the toolhead or the bed |
| `bambuddy.home_axes` | `device_id` | Moves all axes to their home position |
| `bambuddy.extrude` | `device_id`, `distance` | Extrudes, or retracts with a negative length |
| `bambuddy.load_filament` | `entity_id` | Loads a slot's filament |
| `bambuddy.unload_filament` | `device_id` | Unloads the filament in the nozzle |
| `bambuddy.set_filament` | `entity_id`, `filament`, `color`, `k_profile` | Tells the printer what a spool without a chip holds |
| `bambuddy.get_k_profiles` | `entity_id` | Lists the printer's K calibrations for the slot; a response only |
| `bambuddy.get_filaments` | `entity_id` | Lists the filaments Bambu Studio offers for the slot; a response only |
| `bambuddy.reset_slot` | `entity_id` | Clears the slot's material and color |
| `bambuddy.refresh_rfid` | `entity_id` | Lets the AMS read the spool's chip again |
| `bambuddy.assign_spool` | `entity_id`, `spool_id` | Assigns an inventory spool to the slot |
| `bambuddy.unassign_spool` | `entity_id` | Removes the slot's link to its spool |
| `bambuddy.get_spools` | `entity_id` | Lists the inventory's spools for the slot; a response only |
| `bambuddy.start_drying` | `device_id`, `temperature`, `duration` | Dries an AMS unit's filament |
| `bambuddy.stop_drying` | `device_id` | Stops drying |
| `bambuddy.get_print_objects` | `device_id` | Lists the running print's objects; a response only |
| `bambuddy.skip_objects` | `device_id`, `objects` | Leaves objects out of the rest of the print |
| `bambuddy.answer_hms` | `device_id`, `code`, `action` | Answers an HMS message as the printer's screen would |
| `bambuddy.run_diagnostic` | `device_id` | Checks BamBuddy's connection to the printer; a response only |
| `bambuddy.mark_maintenance_done` | `device_id`, `task_id` | Marks a maintenance task done |

- `device_id` is the printer's device, or the AMS unit's for the drying actions.
- `entity_id` is a slot or external spool sensor, in the action's data, not as a `target`. It takes one slot.
- An action that gives only a response needs `response_variable` in an automation.

```yaml
action: bambuddy.set_filament
data:
  entity_id: sensor.ams_2_pro_19c06a000000001_slot_2
  filament: GFL99
  color: [255, 0, 0]
```

## Moving the printer

### `bambuddy.move_axis`

Moves the toolhead (X, Y; on the A1, the A1 mini and the A2L, Y moves the bed) or changes the distance between nozzle and bed (Z; positive moves them apart).

- `axis`: `x`, `y` or `z`.
- `distance`: in mm, −200 to 200, not 0. Negative moves the other way.

Home first, so the printer knows where it is. Moves over BamBuddy are G-code: the printer's firmware does not limit them to its build volume. Move in small steps near the ends of an axis.

### `bambuddy.home_axes`

Moves all axes to their home position. Clear the plate first.

### `bambuddy.extrude`

Extrudes, or retracts with a negative length.

- `distance`: in mm, −100 to 100, not 0.

It needs the nozzle at 170 °C or more. On a two-nozzle printer that is the active one: see *Active nozzle* under [Filament](entities.md#filament).

## Filament and slots

### `bambuddy.load_filament`

Loads the filament of a slot or an external spool.

Refused:

- For an empty slot.
- From an AMS HT with BamBuddy before 1.3.0: only 1.3.0 and newer load from it.
- From an H3C's external input: BamBuddy 1.3.1 does not load from them, and passes on its own refusal.
- From an AMS slot on a printer with the [Filament Track Switch](glossary.md#filament-track-switch): such a load must name the nozzle, which this action does not ask. Load it on the printer or in BamBuddy. The external spools load.

### `bambuddy.unload_filament`

Unloads the filament in the nozzle. On a two-nozzle printer, that is the active one.

### `bambuddy.set_filament`

Tells the printer what a spool without a chip holds. Give at least one of the three fields; the others stay.

| Field | What it sets |
|---|---|
| `filament` | A Bambu Studio profile id, such as `GFL99` (Generic PLA). It takes that profile with the default K value |
| `color` | RGB, such as `[255, 0, 0]`. A new color keeps the slot's profile |
| `k_profile` | The printer's own K calibration by its `index`; `-1` is the default |

Only what Bambu Studio offers for the printer, its nozzle and the slot goes: [`bambuddy.get_filaments`](#bambuddyget_filaments) lists it. It also works on the slot a running print feeds, which then changes mid-print.

Refused:

- For a spool with a chip, or an empty AMS slot.
- During a filament change.
- For a filament Bambu Studio does not offer there, or does not allow in the AMS or on that nozzle.
- For a `k_profile` the printer does not list, or when it did not answer. Ask again in a moment.
- Without `filament`, on a slot whose filament the printer does not know: choose a filament too.

More: [Set a filament](ams-and-filament.md#set-a-filament) and [K profiles](ams-and-filament.md#k-profiles).

### `bambuddy.get_k_profiles`

Returns the printer's own K calibrations (flow dynamics, also called pressure advance) for the diameter of the nozzle that feeds the slot. On a two-nozzle printer it lists that nozzle's; where it has none, the other nozzle's, each with its `nozzle`. The printer is asked live, which takes up to about 16 seconds.

| Field | What it holds |
|---|---|
| `nozzle_diameter` | The nozzle's diameter |
| `current` | The slot's current profile; `-1`: none |
| `profiles` | Each with `index`, `name`, `k_value`, `filament_id`; `nozzle` on two-nozzle printers |
| `answered` | With an empty list: `true`, the printer has none for that diameter; `false`, it did not answer |

### `bambuddy.get_filaments`

Returns what [`bambuddy.set_filament`](#bambuddyset_filament) can set here. It works while the printer is offline.

| Field | What it holds |
|---|---|
| `current` | The slot's current filament, a profile id |
| `vendors` | Each with `name` and `filaments`; a filament has `id`, `name`, `type` |

### `bambuddy.reset_slot`

Clears the slot's material and color, as Reset on the printer's screen. A spool with a chip shows again once the AMS reads it. Refused for an empty AMS slot.

### `bambuddy.refresh_rfid`

Lets the AMS read the spool's chip again, for a Bambu Lab spool it did not recognize. It takes an AMS slot sensor: the external spools have no reader.

It works only while no filament is loaded, which is BamBuddy's rule. Refused for a slot without a spool.

## Spool inventory

Spools come from BamBuddy's own inventory: [Spool inventory](spool-inventory.md). None of these work while Spoolman keeps the spools: [Not with Spoolman](spool-inventory.md#not-with-spoolman).

### `bambuddy.assign_spool`

Assigns a spool to the slot. BamBuddy then sets the slot from it: material, color, profile, K. A spool assigned elsewhere moves.

The slot a running print feeds is set anew mid-print.

- `spool_id`: the spool's number in BamBuddy's inventory.

Needs a key with **Manage Inventory**. Refused:

- For a slot that holds a Bambu Lab spool with its chip.
- During a filament change.
- For a Bambu Lab spool whose chip links it to another slot.
- For a spool in a slot of another printer that is printing or paused.
- For a spool that does not fit the slot, as Bambu Studio says.
- For a spool BamBuddy has archived or does not have.

### `bambuddy.unassign_spool`

Removes the slot's link to its spool. Nothing is sent to the printer, so it also works during a print and while the printer is offline. The slot keeps its filament.

Needs a key with **Manage Inventory**. Refused for a slot without an assigned spool.

### `bambuddy.get_spools`

Returns the inventory's spools, read fresh, the slot's first. Read Status is enough. It works while the printer is offline.

| Field | What it holds |
|---|---|
| `assigned` | The number of the slot's spool, or `null` |
| `spools` | The list below |

Each spool has its `id`, `name`, `brand`, `material`, `color_name`, `remaining_g`, `remaining_pct`, `storage_location` and more, and:

| Field | What it holds |
|---|---|
| `place` | `{"this_slot": true}`, the slot it sits in, or `null` |
| `also` | Further slots BamBuddy holds it in |
| `type` | The slot type its material counts as, such as PLA for PLA+ |
| `fits` | `null` if it can go here, else the reason below |
| `printing` | The printer's name, with `fits` `printing` |

A `place` that is another slot has `printer_id`, `printer_name`, `ams_id`, `tray_id`, `ams_label` and `same_printer`.

| `fits` | Why the spool cannot go here |
|---|---|
| `not_for_ams` | Not for the AMS |
| `not_for_nozzle` | Not for this nozzle |
| `not_for_printer` | Not for this printer |
| `by_chip` | Its chip links it to another slot |
| `printing` | It sits in a slot of another printer that is printing or paused |

## Drying

### `bambuddy.start_drying`

Dries an AMS 2 Pro's, AMS HT's or AMS 3H's filament. The AMS 3H dries its drying zone, and the action names the zone's filament, so BamBuddy cools it down to suit.

- `device_id`: the AMS unit.
- `temperature`: 45 to 85 °C; an AMS 2 Pro reaches at most 65 °C.
- `duration`: 1 to 24 hours.

Refused:

- For a unit that cannot dry.
- On a printer that starts drying only from its own screen, or whose firmware cannot: [Drying from Home Assistant](printers.md#drying-from-home-assistant).
- While the unit dries already, or the printer changes filament.
- While the printer prints, where its firmware cannot do both.
- For a countdown that stands still: stop the drying on the printer or in BamBuddy, then start it again.
- For the printer's other reasons, such as its power supply or filament left at the outlet: BamBuddy's text says which.

More: [Dry filament](ams-and-filament.md#dry-filament).

### `bambuddy.stop_drying`

Stops drying. `device_id` is the AMS unit.

Refused while the unit does not dry. Refused too where BamBuddy reports that the printer dried from its own screen only: stop it there.

## The running print

### `bambuddy.get_print_objects`

Returns the running print's `objects`, each with `id`, `name` and `skipped`. It works while a print runs or is paused.

### `bambuddy.skip_objects`

Leaves objects out of the rest of the print, such as one that came off the plate. This cannot be undone. It works while a print runs or is paused.

- `objects`: a list of ids from [`bambuddy.get_print_objects`](#bambuddyget_print_objects).

## HMS messages

### `bambuddy.answer_hms`

Answers an [HMS](glossary.md#hms) message as the printer's screen would.

- `code`: the message's code, from the *HMS errors* sensor's `errors`.
- `action`: an answer that message lists in `actions`, such as `RESUME_PRINTING_PROBELM_SOLVED` (Bambu's spelling) once the filament is loaded.

Refused for a message the printer does not report now, and for an answer it does not offer. Refused too when the printer does not take the answer: check that it is still connected to BamBuddy, then try again. Some answers work only on the printer's own screen: Home Assistant cannot send them. More: [HMS messages](dashboard-card.md#hms-messages).

## Connection and maintenance

### `bambuddy.run_diagnostic`

Returns BamBuddy's check of the connection to the printer: its ports, access code, developer mode and status reports. It works while the printer is offline. It sends the printer no command, and takes up to half a minute.

| Field | What it holds |
|---|---|
| `overall` | `ok`, `warnings` or `problems` |
| `checks` | Each with `id`, `status` and `params`; `status` is `pass`, `warn`, `fail` or `skip` |

What each check means: [Connection check](troubleshooting.md#connection-check).

### `bambuddy.mark_maintenance_done`

Marks a task done in BamBuddy: its count starts over. It works while the printer is offline.

- `task_id`: an `id` from the *Maintenance* sensor's `tasks`.

Refused for a task BamBuddy does not list for that printer.

## See also

- [Entities](entities.md)
- [Automations](automations.md)
- [Troubleshooting](troubleshooting.md)
