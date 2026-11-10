# Troubleshooting

Find the words on your screen, then the cause and the fix.

[← Documentation](README.md)

**On this page:** [Setup](#setup) · [Printers and controls](#printers-and-controls) · [Live updates and camera](#live-updates-and-camera) · [Dashboard card](#dashboard-card) · [Connection check](#connection-check) · [Repairs notices](#repairs-notices) · [A printer paused itself](#a-printer-paused-itself) · [Known limitations](#known-limitations) · [Debug logging](#debug-logging) · [Report a bug](#report-a-bug)

## Setup

Each heading is the message as the form or the entry shows it.

### BamBuddy does not answer at this address, or cannot be reached

**Cause:** the address is wrong, or BamBuddy is not running. The form says *does not answer at this address*, the entry *cannot be reached*.

**Fix:** use the address you open BamBuddy with in your browser, including the port. With the app: the host's address and the port it shows, not `localhost`.

### BamBuddy … is too old

**Cause:** the integration needs BamBuddy 1.2.5.7 or newer.

**Fix:** update BamBuddy, then try again. On the entry, that is **⋮ → Reload**.

### BamBuddy does not accept this API key

**Cause:** the key is incomplete or no longer valid.

**Fix:** Check that you pasted all of it. BamBuddy shows a key only once: without it, [create a new one](../README.md#create-an-api-key).

### The API key you entered lacks permissions

**Cause:** the form marks the three permissions: the key lacks those marked ✗.

**Fix:** BamBuddy cannot add them. Create a new key with **Read Status**, **Control Printer** and **Manage Maintenance**.

### BamBuddy knows this API key, but its owner is deactivated or deleted

**Cause:** the user who created the key cannot sign in any more.

**Fix:** sign in to BamBuddy as an active user and create a new key with the three permissions.

### BamBuddy does not use https at this address

**Cause:** the address starts with `https://`, but BamBuddy answers plain HTTP there.

**Fix:** enter it with `http://`, such as `http://192.168.1.20:8000`.

### BamBuddy's certificate could not be verified

**Cause:** BamBuddy uses a self-signed certificate, or one Home Assistant does not trust.

**Fix:** for a self-signed certificate, turn off **Verify SSL certificate**.

### Leave the user name and password out of the address

**Cause:** the address holds a login, such as `http://user:password@host`.

**Fix:** remove it. The integration signs in with the API key.

### No BamBuddy answers at this address

**Cause:** something answers there, but not BamBuddy, or a BamBuddy older than 1.2.5.7.

**Fix:** check the address and the port, and BamBuddy's version.

### This address answered with an error

**Cause:** a login page, a proxy or another server answers there, not BamBuddy.

**Fix:** enter BamBuddy's own address and port, not one behind a login.

### This BamBuddy server is already set up

**Cause:** an entry for this address exists.

**Fix:** use that entry. To add or remove printers, choose **Configure** on it.

### This address already belongs to the entry

**Cause:** in **⋮ → Reconfigure** you entered the address of another BamBuddy entry.

**Fix:** use that entry. To change its printers, choose **Configure** on it.

### Every printer of this BamBuddy server is set up already

**Cause:** another entry holds all of this server's printers. Setup offers a printer in one entry only.

**Fix:** to reach the server at another address, use **⋮ → Reconfigure** on that entry. To add or remove printers, choose **Configure** there.

### More on setup

- **The part in brackets** after the entry's message, such as `(GET /updates/version: ClientConnectorDNSError)`, is for a bug report.
- **You ticked a permission marked ✗?** The key's owner may not do it: give them that right in BamBuddy, or create the key as a user who has it.
- **A key that worked and stopped:** [When the key stops working](configuration.md#when-the-key-stops-working).
- **Two servers:** [A second BamBuddy server](configuration.md#a-second-bambuddy-server).

## Printers and controls

### A button or a temperature does nothing on the printer

**Cause:** the printer's [developer LAN mode](glossary.md#developer-lan-mode) is off. BamBuddy passes a command on without waiting, so it can be accepted and still be ignored. The *Developer mode* entity shows the mode.

**Fix:** on the printer's screen, under **Settings → Network** (or **WLAN**), turn on first **LAN Only Mode**, then **Developer Mode**. BamBuddy's wiki shows it: [Enabling Developer Mode](https://wiki.bambuddy.cool/getting-started/#enabling-developer-mode).

- It takes the printer off Bambu's cloud. Bambu Handy and printing through the cloud no longer reach it; printing over your home network does.
- Its [access code](glossary.md#access-code) changes: enter the new one in BamBuddy.

Check BamBuddy's own printer page too: if it cannot control the printer, neither can Home Assistant.

### BamBuddy did not answer in time, or refused the command

**Cause:** BamBuddy took longer than 10 seconds, or said no. A command that timed out may still reach the printer.

**Fix:** watch the printer before you send it again. For a refusal, BamBuddy's text after the colon says why; if BamBuddy's own page cannot do it either, neither can Home Assistant.

### Everything of a printer is unavailable

**Cause and fix** depend on what *Print status* says:

| You see | Cause | Fix |
|---|---|---|
| *Print status* `offline` | BamBuddy lost the printer: off, asleep or out of the network | The [Connection check](#connection-check) says which |
| *Print status* unavailable too | BamBuddy does not answer, or no longer accepts the API key | Its *Connection* sensor turns off within a minute. For a key, see **Settings → Repairs** |
| **Settings → Repairs** says *No longer in BamBuddy* | BamBuddy does not list the printer; the card says so too | [The notice](#no-longer-in-bambuddy) |

### A printer has only a few entities, and its name shows no model

**Cause:** BamBuddy has no model stored for it. It detects none for a printer added by hand, and the integration cannot find it out.

**Fix:** open the printer in BamBuddy, enter its model and save. Within a minute the device gets the model in its name and the entities that model has.

Entities created before keep their entity IDs, which say `printer` in place of the model (`sensor.printer_<serial>_print_status`).

### No SD card, or No USB drive

**Cause:** the printer has no storage in it. BamBuddy cannot send prints to it, and prints are archived without a thumbnail.

**Fix:** insert a microSD card or a USB drive, whichever the printer takes. See [Head and chips](dashboard-card.md#head-and-chips).

## Live updates and camera

### Changes show only seconds later

**Cause:** the integration hears of a printer's changes through BamBuddy's [live connection](glossary.md#live-connection), its WebSocket, and that connection does not open. Meanwhile everything goes on with the 10-second read.

**Fix:** on the BamBuddy entry, open **Configure → Settings → Live updates**. The page tests the connection:

- **`HTTP 404`:** no WebSocket answered at BamBuddy's address. BamBuddy answers 404 when the request reaches it without the WebSocket upgrade. That usually means a proxy in front of it does not pass WebSockets.
- **`HTTP 403`:** the connection was refused. BamBuddy refuses the socket when its token is missing or not valid, and the token when the API key's owner may not connect. A proxy can refuse either.
- ***no answer within 10 seconds*:** nothing answered the request in time. Often a proxy holds WebSocket requests, or BamBuddy is busy.
- **Any other text** says what failed.

Behind a proxy that will not pass WebSockets, turn **Use live updates** off there: the integration then stops trying.

The entry's diagnostics (**⋮ → Download diagnostics**) show the same under `live`: `enabled`, `connected`, `last_error`.

### The camera shows nothing

**Cause:** the printer's live view is off, or another app holds the camera. Most printers allow one camera connection at a time.

**Fix:** turn the printer's live view on, and close Bambu Studio's or Bambu Handy's camera view.

### Scan QR asks for a photo instead of showing the camera

**Cause:** browsers give a page the camera only over HTTPS (or on `localhost`).

**Fix:** any one of these:

- Open Home Assistant over HTTPS.
- Scan in the Home Assistant app: its scanner works without.
- In Chrome or Edge, add your Home Assistant's address at `chrome://flags` (Edge: `edge://flags`) → *Insecure origins treated as secure*.
- Take the photo: a photo of the label works everywhere.

## Dashboard card

### The card is missing in "Add card", or shows "Custom element doesn't exist"

**Cause:** the browser or the app still holds the old frontend.

**Fix:** reload the page (twice), or reset the companion app's frontend cache. The card needs no entry under *Resources*: the integration loads it itself.

### A card says the printer is no longer available

**Cause:** the card remembers the printer's device, and deleting the BamBuddy entry deletes its devices. A new setup creates new ones.

**Fix:** open the card's settings and choose the printer again.

To change the BamBuddy server's address or key, use **⋮ → Reconfigure** on the entry instead. It keeps the devices and cards of the printers found at the new address.

## Connection check

BamBuddy checks its ports and its connection to the printer, and the card says what is wrong and what to do. It sends the printer no command.

**Start it:** with **Check connection** in the card's ⋮ menu, or on the offline view. As an action: [`bambuddy.run_diagnostic`](actions.md#bambuddyrun_diagnostic). It usually takes a few seconds, at most half a minute.

**The result** is *No problems found*, *The printer should work, but … needs attention*, or the number of problems. A check that could not run says *Not checked*, and one marked *Usually follows from the problem above* needs no fix of its own.

| Check | `id` | A failure means | What to do |
|---|---|---|---|
| Control (port 8883) | `port_mqtt` | The printer cannot be reached | Is it on, and at the same IP address? Is a firewall blocking the port? |
| File transfer (port 990) | `port_ftps` | BamBuddy cannot send prints | Unblock port 990. If the port is open but the service hangs, restart the printer |
| Camera (port shown) | `port_rtsps` | No live view. Printing still works | Check that nothing blocks the port: 6000 on the A1 mini, A1, A2L, P1P and P1S, else 322; the row names the one BamBuddy checks. More: [The camera shows nothing](#the-camera-shows-nothing) |
| macOS: local network | `macos_local_network` | macOS silently blocks the connection | See below |
| Container network | `network_mode` | BamBuddy runs on a bridge network | Printer discovery needs host networking (`network_mode: host`) |
| Subnet | `subnet` | Printer and BamBuddy are on different subnets | This works only with routing between them |
| Files on external storage | `external_storage` | Prints cannot be sent, or lose their thumbnail | See below |
| Credentials | `mqtt_auth` | Reachable, but not connected | Read the access code on the printer's screen and enter it again in BamBuddy |
| Developer mode (LAN) | `developer_mode` | The printer takes no commands | [Turn on developer LAN mode](#a-button-or-a-temperature-does-nothing-on-the-printer) |
| Status reports | `printer_publishing` | Connected, but the printer reports nothing | Usually the serial number in BamBuddy is mistyped. Case matters |

**Credentials:** the [access code](glossary.md#access-code) changes whenever LAN Only or Developer Mode is switched. A refusal can also mean a wrong serial number.

**macOS:** run BamBuddy's update script (`install/update_macos.sh`) and restart BamBuddy. Where the check asks for it, allow BamBuddy's Python under System Settings → Privacy & Security → Local Network.

**Files on external storage:**

| The check says | What to do |
|---|---|
| No SD card or USB drive | Insert one: prints cannot be sent without it |
| Off on the printer | Turn on *Store sent files on external storage*, in the printer's print settings or the slicer's Device tab. Without it archives get no thumbnail |
| The last print sat in internal storage | Start prints from BamBuddy, or use *Send* with *External* in the slicer |
| The last print came from the printer's own storage | Start prints from BamBuddy or the slicer |
| Cannot be set on the P1 | Nothing to do |

## Repairs notices

The integration raises three notices under **Settings → Repairs**. A refused key has its own: [When the key stops working](configuration.md#when-the-key-stops-working).

### No longer in BamBuddy

**Cause:** the BamBuddy server no longer lists the printer. Most likely it was removed there.

**Fix:**

- If you no longer need it here, choose **Remove printer**. The printer, its AMS units and smart plugs and their entities leave Home Assistant; nothing changes in BamBuddy.
- If BamBuddy lists it again, close the notice: the printer comes back by itself within a minute.

More: [Add and remove printers](configuration.md#add-and-remove-printers).

### Names come from BamBuddy

**Cause:** you renamed a printer or an AMS unit in Home Assistant. Those names come from BamBuddy, so they went back.

**Fix:** rename it in BamBuddy: Home Assistant follows within a minute. See [Names](entities.md#names).

### AMS entity IDs renamed

**Cause:** BamBuddy now reports an AMS serial number it did not report before. The unit keeps its device, entities and history, and its entity IDs carry the serial.

**Fix:** update the automations, scripts and dashboards that use the old IDs; the notice lists them. The BamBuddy card finds the units by itself.

Then choose **Done**: the list goes with the notice. IDs you changed yourself stay.

More: [When a unit is replaced or moved](ams-and-filament.md#when-a-unit-is-replaced-or-moved).

## A printer paused itself

*Print status* says `paused`, and *Print stage* says why. The card shows it as the job's state.

1. Read the printer's [HMS](glossary.md#hms) message, if it has one: the card's chip, or the *HMS errors* sensor.
2. Deal with the cause at the printer.
3. Check the print, then resume or stop it: the message's answer in the card, or *Resume print*.

| *Print stage* | State | What to look at |
|---|---|---|
| Paused: filament ran out | `paused_filament_runout` | Load new filament: [Load and unload](ams-and-filament.md#load-and-unload) |
| Paused: AMS offline | `paused_ams_offline` | Is the AMS plugged in? |
| Paused: front cover fell off | `paused_front_cover` | The front cover |
| Paused: nozzle clog | `paused_nozzle_clog` | The nozzle |
| Paused: nozzle clumping | `paused_nozzle_clumping` | The nozzle, and the print |
| Paused: first layer error | `paused_first_layer` | The first layer |
| Paused: step loss | `paused_step_loss` | The print so far |
| Paused: cutter error | `paused_cutter` | The filament cutter |
| Paused: hotend fan too slow | `paused_hotend_fan` | The hotend fan |
| Paused: nozzle temperature malfunction | `paused_nozzle_temperature` | The HMS message |
| Paused: heatbed temperature malfunction | `paused_bed_temperature` | The HMS message |
| Paused: chamber temperature problem | `paused_chamber_temperature` | The HMS message |
| Paused by G-code, Paused by M400 | `paused_by_gcode`, `m400_pause` | The print file asked for it. Resume when ready |
| Paused by the user | `paused_by_user` | Someone paused it, here or at the printer |

- *Clear HMS errors* removes only the message: a fault the printer still sees comes back ([HMS messages](dashboard-card.md#hms-messages)).
- An AI detection can pause a print too. For a false alarm, turn its switch off during the print: [AI detection](entities.md#ai-detection).
- All the stages: [Print status, stage and AMS status](entities.md#print-status-stage-and-ams-status).

## Known limitations

### What comes from BamBuddy

- **Through BamBuddy only.** The integration shows what BamBuddy knows; if BamBuddy loses a printer, so does Home Assistant. Commands go to BamBuddy, which passes them to the printer without waiting.
- **What BamBuddy cannot do, neither can the integration:** start a print, change the plate type, send raw G-code; before BamBuddy 1.3.0 also load from an AMS HT.
- **No soft limits on moves.** The printer's firmware does not stop them at its build volume: [`bambuddy.move_axis`](actions.md#bambuddymove_axis).
- **[Filament Track Switch](glossary.md#filament-track-switch):** a load from an AMS slot must name the nozzle to feed, which `bambuddy.load_filament` and the card do not ask. Load it on the printer or in BamBuddy. The external spools load.
- **Firmware and BamBuddy updates** are shown, not installed.
- **Live updates need BamBuddy's WebSocket.** A reverse proxy in front of BamBuddy must pass WebSockets on the address you gave; without them the status is up to 10 seconds old. **Configure → Settings → Live updates** tests it. Some values the live connection does not report on their own: [What is not pushed](how-it-works.md#what-is-not-pushed).

### Until BamBuddy reports it

- **AMS Lite without its serial number:** BamBuddy 1.2.5.7 does not report it ([maziggy/bambuddy#3348](https://github.com/maziggy/bambuddy/issues/3348); BamBuddy 1.3.0 does). Until yours does, the AMS Lite's entity IDs carry the printer's serial number and the unit's letter (`sensor.ams_lite_0309da000000002_a_slot_1`). Once BamBuddy reports it, they are renamed once and **Settings → Repairs** lists them: see [AMS units](entities.md#ams-units).
- **Chamber of the H2D Pro and the X1E with BamBuddy 1.2.5.7:** it reports no chamber temperature or heater for an H2D Pro, and no chamber heater for an X1E ([maziggy/bambuddy#3335](https://github.com/maziggy/bambuddy/issues/3335); BamBuddy 1.3.0 does). Until yours does, the H2D Pro has no *Chamber temperature*, and neither has a *Chamber target temperature*. Once BamBuddy reports them, the BamBuddy entry reloads once by itself and the entities come.

### In Home Assistant

- **Printer names come from BamBuddy:** rename a printer or AMS unit there. A name given in Home Assistant goes back within a minute: [Names](entities.md#names).
- **Cast** does not show the dashboard card: Home Assistant Cast loads no integration's own modules.
- **No icon before Home Assistant 2026.3:** older versions take an integration's icon only from Home Assistant's brands repository, which has none for BamBuddy. From 2026.3 on, the integration brings its own.

## Debug logging

A debug log shows what the integration is doing. Turn it on in one of two ways:

- **For one problem:** on the BamBuddy integration page choose **⋮ → Enable debug logging**, reproduce the problem, then disable it. The log downloads.
- **From the start:** add this to `configuration.yaml`, restart and reproduce:

```yaml
logger:
  logs:
    custom_components.bambuddy: debug
```

The log holds no secrets, also at debug level. It leaves out the API key, the camera's stream token, a printer's access code, a camera address's login, and a smart plug's logins and tokens. Printer names do appear.

For a card problem, also open the browser's developer tools (F12), reload the page and copy what **Console** shows.

## Report a bug

[Open a bug report](https://github.com/Spegeli/hacs_bambuddy/issues/new?template=bug_report.yml) and add the diagnostics:

1. On the BamBuddy entry, choose **⋮ → Download diagnostics**.
2. Add the file to the report. Use the entry's, not a device's: Home Assistant names a device's file after the device, serial number included.

What they leave out: [Privacy](how-it-works.md#privacy).

## See also

- [Configuration](configuration.md)
- [How it works](how-it-works.md)
- [Updating](updating.md)
