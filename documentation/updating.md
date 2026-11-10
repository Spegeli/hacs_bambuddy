# Updating

Install new versions, try a beta and go back, or move up from a date version.

[← Documentation](README.md)

From Home Assistant 2026.11 the Marketplace replaces HACS. [Home Assistant's documentation](https://www.home-assistant.io/integrations/marketplace/) says it moves what you installed with HACS over by itself, the first time it starts after the update.

## With the Marketplace

### Updates

1. Open **Settings → Updates**. BamBuddy is listed under **Marketplace**.
2. Choose its row. The dialog shows the installed and the latest version, and the release notes.
3. Choose **Update**. **Skip** passes over this version.
4. Restart Home Assistant: **Settings → Repairs** now has *Restart required for BamBuddy*, with **Restart**.

Until the restart the old version keeps running. After it, reload the browser page, so the [card](dashboard-card.md) updates too.

The same list shows new BamBuddy releases and printer firmware. Those it can only show: install them in BamBuddy and on the printer.

### Beta versions

A new version can come out as a beta first, for testing before everyone gets it. Betas can contain unstable changes. With HACS: [With HACS, before Home Assistant 2026.11](#with-hacs-before-home-assistant-202611).

To get betas as updates:

1. Open **Settings → Marketplace**, tab **Installed**, and choose **BamBuddy**.
2. Choose **⋮ → Include pre-releases**, then **Include**.
3. Choose **Update** on this page, then **Update** in the dialog, and restart Home Assistant.

**To keep this setting across a restart,** also enable the *Pre-release* switch. It is the same setting, but disabled at first, and while it is disabled the choice is lost at the next restart of Home Assistant.

1. Open **Settings → Devices & services → Marketplace** and the device **BamBuddy**.
2. Enable its *Pre-release* switch, as [Disabled entities](entities.md#disabled-entities) shows.
3. Reload the Marketplace entry.

### Install one version of your choice

1. On BamBuddy's page in the Marketplace, choose **⋮ → Install another version**.
2. Pick it under **Version**. The list holds the newest 30 releases, betas included, whatever the pre-release setting says.
3. Choose **Update** (**Install** if BamBuddy is not installed yet), then restart Home Assistant.

### Go back from a beta

1. On BamBuddy's page, choose **⋮ → Exclude pre-releases**.
2. If the Marketplace offers the last stable version as an update, choose **Update**. If not, restore the backup you made before the beta; **Install another version** also works, but Home Assistant advises a backup for going back.
3. Restart Home Assistant.

The dialog for pre-releases says an installed one stays until a newer stable version is out. That holds for versions the Marketplace can compare. While 2.0.0 is the latest stable version, it cannot compare its tag `v2.0.0_redesign`, so it offers 2.0.0 at once. The Marketplace also warns: "To go back to an earlier version, restoring a backup is the safer way."

## With HACS, before Home Assistant 2026.11

**Updates:** HACS offers a new version as an update. Restart Home Assistant afterwards.

**Betas:**

- **Once, a version of your choice:** **HACS → BamBuddy → ⋮ → Redownload**, open **Need a different version?**, choose the version under **Release** (betas are marked as pre-releases) and select **Download**. Restart Home Assistant afterwards.
- **As updates:** under **Settings → Devices & services → HACS**, open **BamBuddy**. Its **Pre-release** switch is under **Diagnostic** and disabled at first: select it, open its settings (⚙), enable it, and turn it on once it appears. HACS then offers betas as updates too.
- **Back again:** turned off, the switch offers stable versions only. A beta you installed stays until the next stable version replaces it.

## Installed by hand

Copy the `custom_components/bambuddy` folder of the new [release](https://github.com/Spegeli/hacs_bambuddy/releases) over the old one, and restart Home Assistant.

## Upgrading from a date version

2.0.0 is a new integration under the old name. Home Assistant migrates the BamBuddy entry by itself; still, plan a few minutes. The upgrade cannot be undone, so make a backup first.

1. **Create a new API key** in BamBuddy, with **Read Status**, **Control Printer** and **Manage Maintenance** ([Create an API key](../README.md#create-an-api-key)). A 1.x key usually has Read Status only.
2. **Install the new version:** on BamBuddy's page in the Marketplace, choose **⋮ → Install another version**, pick the latest stable version under **Version**, choose **Update** and restart.
3. **Enter the new key** if Home Assistant asks for it under **Settings → Repairs**.
4. **Check dashboards and automations** against the tables below.

**Why Install another version?** The Marketplace cannot compare `v2.0.0_redesign` with a date. So it offers 2.0.0 as an update only while 2.0.0 is the latest stable version and pre-releases are excluded. `v2.1.0` compares below `2026.05.17`, and so does a beta. Once a newer stable version is out, or with pre-releases included, a date version gets no update: **Install another version** is the one way. Neither the Marketplace nor HACS then offers anything: no update appears, and the repository page still shows the README of the installed 2026.05.17.

With HACS, before Home Assistant 2026.11, the same holds: HACS offers 2.0.0 as an update while it is the latest stable version and the *Pre-release* switch is off, and nothing once a newer stable version is out. Then choose the version under **⋮ → Redownload**.

### What changes

| What | From 2.0.0 |
|---|---|
| The API key | Needs the three permissions. 1.x worked with Read Status alone, and with BamBuddy's authentication off with any text |
| The connection | A single address (`http://host:port`); nothing to do |
| Device names | *BamBuddy name (model / serial number)*, following BamBuddy from then on |
| Entity names | New and translated |
| Entity IDs | Stay where the entity stayed |
| New entities | IDs of model, serial number and English key; an AMS unit's: its own model and serial |
| Printers and AMS units | Known by their serial numbers |
| Pause, resume and stop buttons | No longer under *Configuration* on the device page |

- **The new key:** where the stored key lacks a permission or BamBuddy does not know it, Home Assistant asks for a new one after the update.
- **A name you gave a device** in Home Assistant is replaced by BamBuddy's, and Repairs tells you once. Rename the printer or its AMS units in BamBuddy instead. Entity names in a dashboard card show the longer device name in front.
- **Serial numbers:** a new BamBuddy, a restored database, or an AMS plugged in at another place on the same printer keeps their devices, entities and history.

### Values that changed

Check automations that compare these values.

| Entity | In 1.x | From 2.0.0 |
|---|---|---|
| *Print status* | *Status*, with BamBuddy's `RUNNING`, `FINISH`, … | `idle`, `preparing`, `slicing`, `printing`, `paused`, `finished`, `failed`, `offline`, `unknown` |
| *Print speed* | Not there | The options `silent`, `standard`, `sport`, `ludicrous` |
| *HMS errors* | The *HMS Status* sensor | A number |
| *Current print* on an idle printer | Empty | Unknown |

### Gone or changed

Replace these in dashboards and automations.

| In 1.x | From 2.0.0 |
|---|---|
| *Subtask*, *GCode File* | *Current print* |
| The target temperature sensors | Numbers you can set |
| The fan sensors | Fans, except the hotend fan |
| *HMS Errors* as binary sensor | The *HMS errors* count |
| The *Chamber Light* switch | A light |
| *Version*, *Health Status*, *Uptime*, *Archive Count*, *Model*, *Firmware Version* | The update entities and the device page show them |

### New

- AMS devices
- Smart plug devices with the switch-off after the print
- Numbers, fans and a light
- The ventilation of printers with an airduct
- The AI detection and AMS filament backup switches
- The *Maintenance* sensor, the active nozzle and airduct selects, update entities
- Actions and the dashboard card

## See also

- [When the key stops working](configuration.md#when-the-key-stops-working)
- [Repairs notices](troubleshooting.md#repairs-notices)
- [Entities](entities.md)
