# Automations

Five examples to paste, and how to write triggers that fire only when they should.

[← Documentation](README.md)

## Use an example

1. Go to **Settings → Automations & scenes → Create automation → ⋮ → Edit in YAML**.
2. Paste an example.
3. Put in your entity IDs. Your printer's device under **Settings → Devices & services → BamBuddy** lists them; the forms are in [Entity IDs](entities.md#entity-ids).
4. Put in your phone's notify action, `notify.mobile_app_<your phone>`, where the examples say `notify.mobile_app_your_phone`.

Every example works from Home Assistant 2025.5 on.

**Easier for a first one:** in the visual editor choose **Add trigger → Entity**, then the state trigger (**State**; **State changed** in the newest versions). Pick your printer's *Print status*, set **From** to *Printing* and **To** to *Finished*.

## Print done

A push message with the job's name when a print finishes or fails. A print you stop yourself counts as failed.

```yaml
alias: BamBuddy print finished or failed
triggers:
  - trigger: state
    entity_id: sensor.x1c_00m00a000000001_print_status
    from: [printing, paused]
    to: [finished, failed]
actions:
  - action: notify.mobile_app_your_phone
    data:
      title: "{{ 'Print done' if trigger.to_state.state == 'finished' else 'Print failed' }}"
      message: "{{ states('sensor.x1c_00m00a000000001_current_print') }}"
```

**What could go wrong:** without `from` it would report old news. It fires only when the status changes from `printing` or `paused`. So a printer back from offline, a restart of Home Assistant or a reload of the integration sends nothing about a print that ended earlier.

## HMS message

A push message with the text of the printer's [HMS](glossary.md#hms) messages whenever there are more than before. `severity` tells an `error` from a `warning` or a `notice`.

```yaml
alias: BamBuddy HMS message
triggers:
  - trigger: state
    entity_id: sensor.x1c_00m00a000000001_hms_errors
    not_from: [unavailable, unknown]
conditions:
  # Only a new message: the count rose. Not one that cleared, not a reload.
  - condition: template
    value_template: "{{ trigger.from_state is not none and trigger.to_state.state | int(0) > trigger.from_state.state | int(0) }}"
actions:
  - action: notify.mobile_app_your_phone
    data:
      title: "{{ device_attr(trigger.entity_id, 'name') }}"
      message: >
        {% for error in state_attr(trigger.entity_id, 'errors') %}
        {{ error.severity }}: {{ error.description or error.code }}
        {% endfor %}
```

**What could go wrong:** a trigger on "above 0" would miss a second message while the first is still there. The condition keeps it quiet when a message clears, when the integration reloads and when the sensor is created.

## Chamber light

The light comes on when a print starts and goes off when it ends: finished, failed or stopped. The trigger's `id` is the second half of the action's name.

```yaml
alias: BamBuddy chamber light while printing
triggers:
  # The light comes on when a print starts ...
  - trigger: state
    id: "on"
    entity_id: sensor.x1c_00m00a000000001_print_status
    from: [idle, slicing, finished, failed]
    to: [preparing, printing]
  # ... and goes off when it ends.
  - trigger: state
    id: "off"
    entity_id: sensor.x1c_00m00a000000001_print_status
    from: [preparing, printing, paused]
    to: [finished, failed, idle]
actions:
  - action: "light.turn_{{ trigger.id }}"
    target:
      entity_id: light.x1c_00m00a000000001_chamber_light
```

On an A1, A1 mini, A2L or P1P the light is `light.<model>_<serial>_light` (they have no chamber).

**What could go wrong:** both triggers name the states they come from. So a restart, a reload or a printer that drops offline mid-print leaves the light as it is, and a pause does not switch it. Delete the second trigger to leave the light on at the end.

## Wet filament

A push message when an AMS unit's humidity has stayed above 40 % for an hour. The message reads the humidity as it is then, and the unit's device name says which unit it is. List several humidity sensors under `entity_id` for several units.

```yaml
alias: BamBuddy wet AMS
triggers:
  - trigger: numeric_state
    entity_id: sensor.ams_2_pro_19c06a000000001_humidity
    above: 40
    for: "01:00:00"
actions:
  - action: notify.mobile_app_your_phone
    data:
      title: Wet filament
      message: "{{ device_attr(trigger.entity_id, 'name') }} is at {{ states(trigger.entity_id) }} % humidity: time to dry the filament."
```

**What could go wrong:** it fires once when the hour is up, and again after the humidity has fallen below 40 % and risen above it, or after a reload of the integration while it stays above. The AMS Lite has no humidity sensor. To dry the filament, see [`bambuddy.start_drying`](actions.md#bambuddystart_drying).

## Lost printer

A push message when the print status has been `offline` for three minutes after `printing` or `paused`: the printer lost its power or its Wi-Fi, or BamBuddy lost it. The three minutes ignore a short drop.

```yaml
alias: BamBuddy printer lost during a print
triggers:
  - trigger: state
    entity_id: sensor.x1c_00m00a000000001_print_status
    from: [printing, paused]
    to: offline
    # A short drop is ignored.
    for: "00:03:00"
actions:
  - action: notify.mobile_app_your_phone
    data:
      title: Printer lost
      message: "{{ device_attr(trigger.entity_id, 'name') }} went offline during a print."
```

**What could go wrong:** if BamBuddy itself stops answering, every entity of the printer turns `unavailable`, not `offline`. Write `to: [offline, unavailable]` to hear of that too. Turning the printer off after a finished print, by hand or with the switch-off after the print, sends nothing: only a status that comes from a running print counts.

## Triggers that do not misfire

A reload of the integration or a restart of Home Assistant makes entities `unavailable` for a moment. Three habits keep that out of your automations:

- **Name where a state comes from.** Give a state trigger `from`, as the examples do. With `to` alone it fires again each time the state returns.
- **Attributes need `from` too.** While an entity is unloaded it has no attributes. A trigger on an attribute with `to` alone fires again at every reload while the value holds.
- **Compare counts in a condition.** For a number, as in [HMS message](#hms-message), check that it rose, and leave out `unavailable` and `unknown` with `not_from`.

To react to the switch-off after the print, use a state trigger on the switch's `phase` from `waiting` to `done`: [Turn off after the print](smart-plugs.md#turn-off-after-the-print).

*Print status* changes last of all the entities of a read. A trigger on it that reads the printer's other entities gets values from that same read.

## See also

- [Entities](entities.md)
- [Actions](actions.md)
- [Dashboard card](dashboard-card.md)
