# Configuration

Connect Home Assistant to BamBuddy, choose your printers, and change either later.

[← Documentation](README.md)

**Needs:** the integration installed, as the [README](../README.md) shows.

## Before you start

- **BamBuddy 1.2.5.7 or newer.** BamBuddy shows its version at the foot of its menu and in **Settings → General**, card **Updates**.
- **Home Assistant must reach BamBuddy** over your network.
- **Your printers added in BamBuddy first** ([BamBuddy's documentation](https://wiki.bambuddy.cool)). The integration shows what BamBuddy manages.
- **An API key:** [Create an API key](../README.md#create-an-api-key) has the steps.
- **For the controls:** the printer's [developer LAN mode](glossary.md#developer-lan-mode). Without it the printer ignores the commands BamBuddy passes on.

## What each permission opens

The integration refuses a key without **Read Status**, **Control Printer** and **Manage Maintenance**. **Manage Inventory** is optional.

| Feature | Permission |
|---|---|
| Everything shown: status, AMS, statistics, plug states, maintenance, updates | **Read Status** |
| The camera: pictures and the live view | **Read Status** |
| K profiles, a print's objects, the connection check | **Read Status** |
| The live connection | **Read Status** |
| The spool assigned to a slot | **Read Status** |
| Pause, resume, stop, skipping objects, print speed | **Control Printer** |
| Temperatures, fans, light, airduct, active nozzle | **Control Printer** |
| AI detection switches, AMS filament backup | **Control Printer** |
| Moving the axes, homing, extruding | **Control Printer** |
| Loading, unloading, setting a filament, resetting a slot, drying | **Control Printer** |
| Reading a slot's chip again, clearing the plate | **Control Printer** |
| Answering and clearing HMS messages | **Control Printer** |
| Switching smart plugs, and the switch-off after a print | **Control Printer** |
| Marking maintenance done | **Manage Maintenance** |
| Assigning spools of the inventory to a slot, and removing them | **Manage Inventory** |

- **Without Manage Inventory**, the spool BamBuddy assigned to a slot still shows. Only the way to assign one from Home Assistant is missing.
- **A permission counts only as far as the key's owner may do it.** A ticked permission its owner lacks counts as missing.
- **The live connection** is not needed: a key whose owner may not connect still works, and the status comes with the read every 10 seconds.
- **No API key can create, change or delete a smart plug.** That is BamBuddy's rule, so BamBuddy's own *Auto Off* cannot be set from Home Assistant.
- **BamBuddy cannot add a permission to an existing key.** If one is missing, create a new key and enter it as [When the key stops working](#when-the-key-stops-working) says.

## BamBuddy's authentication

BamBuddy enforces the permissions only while its authentication is on (**Settings → Authentication**).

With it off, BamBuddy answers every request, whatever key it carries or none. Anyone who can reach BamBuddy can then control your printers. Turning authentication on before you create the key is recommended.

The integration checks the key either way: it takes only a key BamBuddy knows, with the three permissions.

A key created while authentication was off keeps working once you turn it on, limited by its permissions alone. A key created afterwards as an administrator also gets an owner, which BamBuddy recommends: see its [API Keys & Webhooks](https://wiki.bambuddy.cool/features/api-keys/).

## Set up

The steps are in the [README](../README.md#set-up-the-integration). The form asks for three things:

| Field | What to enter |
|---|---|
| **BamBuddy address** | The address you open BamBuddy with in your browser, such as `192.168.1.20:8000` or `https://bambuddy.example.com` |
| **API key** | The key from BamBuddy, with all three permissions |
| **Verify SSL certificate** | Matters only for an `https` address. Turn it off for a self-signed certificate |

- **Without `http://` or `https://`** the address counts as `http://`.
- **With the [BamBuddy app](https://github.com/Spegeli/homeassistant-app-bambuddy):** use the address you open BamBuddy with, such as `http://homeassistant.local:8000`, not `localhost`.
- **Names come from BamBuddy:** a name given in Home Assistant, also under **Name and assign**, goes back to BamBuddy's ([Names](entities.md#names)).
- **BamBuddy has no printers yet?** The integration starts with BamBuddy's own figures. Add printers later, as below.

Your printers are then under **Settings → Devices & services → BamBuddy**. Next: the [dashboard card](dashboard-card.md#add-the-card).

## Add and remove printers

1. On the BamBuddy entry, choose **Configure** (a ⚙ in recent Home Assistant versions), then **Manage printers**.
2. **Add printers** lists the printers of your BamBuddy that are not added yet.
3. **Remove printers** removes them from Home Assistant again, with their AMS units, smart plugs and entities. Nothing changes in BamBuddy.

You can also delete a printer's device on its device page (**⋮ → Delete**).

**A printer removed in BamBuddy** shows up under **Settings → Repairs**. **Remove printer** there removes it here as well, and **Remove printers** under **Configure → Manage printers** removes several at once.

Leave the notice, and the printer comes back by itself within a minute once BamBuddy lists it again (found by its serial number), with its devices, entities and history. A printer you removed stays removed: add it again under **Add printers**.

## Another address or server

1. On the BamBuddy entry, choose **⋮ → Reconfigure**.
2. Change **BamBuddy address**, **New API key** or **Verify SSL certificate**. The form never shows the stored API key: leave the field empty to keep it.
3. Only the key or the certificate check changed? That is all.
4. A new address leads to a second step. Say under **Which BamBuddy server is it?** whether it is the same one or another.
5. Under **Add printers of this BamBuddy server**, tick those it has that this entry lacks, if you want them.
6. **Confirm the switch** shows the address and which printers are **Kept**, **Removed** and **Added**. Nothing changes until you choose **Switch**; closing the dialog leaves everything as it is.

Printers are found at the new address by their serial numbers. Which server you say it is decides the rest:

| What | The same BamBuddy server | Another BamBuddy server |
|---|---|---|
| The server's own figures (print statistics, storage …) | Carry on | Start afresh: history deleted, entity IDs stay |
| Printers found there | Keep devices, entities and history | Keep devices, entities and history |
| Printers not found there | Removed, with AMS units and smart plugs | Removed, with AMS units and smart plugs |
| Smart plugs of the kept printers | Stay | Become new devices, see below |

**On another server** the kept printers' smart plugs come from the new server, and an area or name you gave a plug device starts afresh.

- A plug that uses the same Tasmota, Home Assistant entity or MQTT topic and path as before keeps its entity IDs and history.
- The others get new ones.
- Plugs the new server does not have for these printers are removed.

## A second BamBuddy server

Each BamBuddy server is an entry of its own: add the integration again with the other address. The entity IDs of the second server's own figures end in `_2`.

- **One address, one entry.** An address another entry uses is refused.
- **A printer comes through one entry.** Setup and **Add printers** leave out printers another BamBuddy entry already has, and name that entry.
- **Reconfigure does not leave them out.** A printer it adds that another entry holds gets a second device, with IDs ending in `_2`.

## When the key stops working

| What happened | What you see | What to do |
|---|---|---|
| BamBuddy no longer accepts the key | An entry under **Settings → Repairs**, and the BamBuddy entry under **Settings → Devices & services** | Enter a new key in the dialog they lead to |
| The key lacks a permission, for example because its owner lost a right in BamBuddy | Within ten minutes, an entry under **Settings → Repairs** | Read the dialog: ✓ marks what the stored key has, ✗ what it lacks |
| The key's owner is deactivated or deleted in BamBuddy | The same way, a dialog that says so | Create a new key as an active user |

While the key only lacks a permission, the values go on, and a control BamBuddy refuses says why. Once BamBuddy no longer accepts the key, the values are unavailable until you enter a new one. Either way your devices, entities and their history are kept.

Gave the owner the right back? The notice clears by itself at the next check, within ten minutes; or leave the dialog's field empty to check the stored key at once.

## Live updates

On the BamBuddy entry, choose **Configure → Settings → Live updates**. Each time it opens, the page tests BamBuddy's [live connection](glossary.md#live-connection) and says whether it is open or why it does not open. A test that fails: [Changes show only seconds later](troubleshooting.md#changes-show-only-seconds-later).

| Setting | What it does |
|---|---|
| **Use live updates** | Off: no live connection and no attempts to open one. The read every 10 seconds and the reads after a command stay |
| **Reads after live messages, per printer at most** | Spaces the reads the live connection sets off: **every second** (the default), **every 2 seconds** or **every 5 seconds** |

Reading less often spares BamBuddy and keeps Home Assistant's history smaller, which helps with many printers or a small computer. Saved, both apply at once.

Home Assistant's own **⋮ → System options → Enable polling for changes** on the entry stops the timed reads. That means each printer's 10-second read and the reads of the smart plugs, the spool inventory, the statistics and the update checks. The reads the live connection sets off and those after a command go on.

Some values do not come through the live connection on their own: [What is not pushed](how-it-works.md#what-is-not-pushed).

## See also

- [Add the card](dashboard-card.md#add-the-card)
- [Printers](printers.md)
- [Setup problems](troubleshooting.md#setup)
