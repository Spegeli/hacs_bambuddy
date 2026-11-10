# How it works

What the integration reads from BamBuddy and when, what stays on your network, and what it keeps private.

[← Documentation](README.md)

## What is read when

Unless turned off under [Live updates](configuration.md#live-updates), the integration keeps BamBuddy's [live connection](glossary.md#live-connection) (its WebSocket) open. When a printer reports a change, the integration reads that printer's status at once: at most once a second, or as set there.

It also reads BamBuddy on a timer:

| What | How often |
|---|---|
| Each printer's status, a new name in BamBuddy with it | Every 10 seconds |
| Its AMS units' names | Every minute |
| Its maintenance and its print hours | Every 10 minutes and after a print |
| Each smart plug's state | Every 15 seconds |
| The list of smart plugs | Every minute |
| The spool inventory: the spools and which slot each sits in | Every minute, and at once when BamBuddy reports a change |
| BamBuddy's print statistics | Every minute |
| BamBuddy's version, printers and disk space | Every 5 minutes |
| The API key's permissions | Every 10 minutes, and when BamBuddy refuses a request |
| New BamBuddy releases and printer firmware | Every 6 hours; a check that fails is asked again after 15 minutes |

## After a command

BamBuddy passes a command on without waiting, and the printer reports back to it first. So the integration reads the printer again 1.5 seconds after a command, and once more after 4 seconds: BamBuddy's live connection does not report every result.

A smart plug is read 2 seconds after a switch.

## What is not pushed

BamBuddy's live connection does not report these on their own:

- HMS messages
- The remaining time
- The print speed
- The chamber and right-nozzle targets
- The AI detection switches
- The airduct
- The AMS humidity

They come with the next change, at the latest with the 10-second read.

## What stays local

- **No cloud.** The integration talks only to your own BamBuddy server, through its REST API and its live connection.
- **No connection to the printers.** Everything goes through BamBuddy.
- **Nothing to fetch.** The filament list and the card come with the integration.
- **No telemetry.** The integration sends nothing to its authors.

The update entities are BamBuddy's check: BamBuddy looks for new versions online, and the integration shows what it found.

## Privacy

- **The API key** stays in Home Assistant. No form shows it again, and it goes only to your BamBuddy.
- **Over an `http://` address** the key and the camera picture travel unencrypted. Use `https://` where that matters.
- **[Debug logging](troubleshooting.md#debug-logging)** holds no secrets.

The entry's [diagnostics](troubleshooting.md#report-a-bug) are made to be shared in a bug report:

| Left out | Stays in |
|---|---|
| The API key, tokens, BamBuddy's address | BamBuddy's version |
| The printers' network addresses, access codes, camera addresses, serial numbers | Printer names, models, status |
| Chip IDs of spools | Filament types and colors |
| A smart plug's address, login and URLs | A plug's name and settings |
| The print job's file name, a printer's location | The figures of the print |

## See also

- [Live updates](configuration.md#live-updates)
- [Report a bug](troubleshooting.md#report-a-bug)
- [Known limitations](troubleshooting.md#known-limitations)
