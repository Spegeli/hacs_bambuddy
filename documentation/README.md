# Documentation

Everything about the BamBuddy integration for Home Assistant. New here? Start with the [README](../README.md): it installs the integration, sets it up and adds the card.

These pages describe the latest stable release. A beta's new parts are in its [release notes](https://github.com/Spegeli/hacs_bambuddy/releases) until it is stable.

| Page | Find here |
|---|---|
| [Configuration](configuration.md) | What each permission opens, setup, adding printers, another address, key problems, live updates |
| [Printers](printers.md) | What each of the 14 models has: chamber, fans, limits, camera, AI detection, drying |
| [Dashboard card](dashboard-card.md) | Adding the card, its tabs and chips, camera, HMS messages, maintenance, options |
| [AMS and filament](ams-and-filament.md) | Slots, loading, setting a filament, K profiles, drying, filament backup, the external spool |
| [Spool inventory](spool-inventory.md) | BamBuddy's spools: shown, assigned, scanned by their label |
| [Chamber](chamber.md) | Heating and ventilating, and what locks what |
| [Smart plugs](smart-plugs.md) | Switching plugs, power and energy, turning the printer off after a print |
| [Automations](automations.md) | Five examples to copy, and triggers that do not misfire |
| [Entities](entities.md) | Every entity by name, entity IDs, disabled entities |
| [Actions](actions.md) | Every `bambuddy.*` action with its fields and refusals |
| [Glossary](glossary.md) | AMS, HMS, K profile, airduct and the other terms |
| [How it works](how-it-works.md) | What is read when, what stays local, privacy |
| [Troubleshooting](troubleshooting.md) | Problems in the words on the screen, the connection check, Repairs notices, known limitations |
| [Updating](updating.md) | Updates, beta versions, upgrading from a date version |

## How the devices fit together

One BamBuddy entry is one BamBuddy server. Below it, Home Assistant shows these devices:

```text
BamBuddy server     statistics, storage, BamBuddy's updates
└── Printer         one for each printer you add
    ├── AMS unit    one for each unit: slots, humidity, drying
    └── Smart plug  one for each plug BamBuddy links to the printer
```

Names come from BamBuddy, such as *Workshop (X1C / 00M00A000000001)* for a printer and *Workshop AMS A (AMS 2 Pro / serial number)* for its AMS. An external spool is no device: its entities belong to the printer.

## Languages

Entity names, setup dialogs and the card come in English and German, following Home Assistant's language. Any other language gets English.

Entity IDs are the same in every language. This documentation is in English.

## See also

- [The README](../README.md)
- [Questions in the Home Assistant forum](https://community.home-assistant.io/t/1029750)
- [Report a bug](troubleshooting.md#report-a-bug)
