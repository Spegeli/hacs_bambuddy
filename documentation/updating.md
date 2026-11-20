# Updating

Install new versions, try a beta and go back.

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

The dialog for pre-releases says an installed one stays until a newer stable version is out. The Marketplace also warns: "To go back to an earlier version, restoring a backup is the safer way."

## With HACS, before Home Assistant 2026.11

**Updates:** HACS offers a new version as an update. Restart Home Assistant afterwards.

**Betas:**

- **Once, a version of your choice:** **HACS → BamBuddy → ⋮ → Redownload**, open **Need a different version?**, choose the version under **Release** (betas are marked as pre-releases) and select **Download**. Restart Home Assistant afterwards.
- **As updates:** under **Settings → Devices & services → HACS**, open **BamBuddy**. Its **Pre-release** switch is under **Diagnostic** and disabled at first: select it, open its settings (⚙), enable it, and turn it on once it appears. HACS then offers betas as updates too.
- **Back again:** turned off, the switch offers stable versions only. A beta you installed stays until the next stable version replaces it.

## Installed by hand

Copy the `custom_components/bambuddy` folder of the new [release](https://github.com/Spegeli/hacs_bambuddy/releases) over the old one, and restart Home Assistant.

## See also

- [When the key stops working](configuration.md#when-the-key-stops-working)
- [Repairs notices](troubleshooting.md#repairs-notices)
- [Entities](entities.md)
