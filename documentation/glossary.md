# Glossary

The terms these pages use, in a few words each.

[← Documentation](README.md)

## Access code

The password BamBuddy uses to reach a printer; Home Assistant does not need it. It changes whenever LAN Only or Developer Mode is switched, and must then be entered again in BamBuddy. More: [Connection check](troubleshooting.md#connection-check).

## Airduct

The flap that sets how air moves through the chamber of the P2S, the X2D and the H2 series: heating keeps the warmth in, cooling lets fresh air through. More: [Chamber](chamber.md).

## AMS

Bambu's Automatic Material System: a unit that feeds filament to the printer, with four slots (an AMS HT: one). The first model is called AMS, and these pages also use the word for all of them. More: [AMS and filament](ams-and-filament.md).

## AMS 2 Pro

An AMS with four slots that can also dry its filament. More: [Dry filament](ams-and-filament.md#dry-filament).

## AMS HT

A unit with one slot that dries its filament, hotter than an AMS 2 Pro. More: [Dry filament](ams-and-filament.md#dry-filament).

## AMS Lite

The open four-slot unit of the A series. It has no climate sensor, so no humidity or temperature entities. More: [AMS units](entities.md#ams-units).

## Auxiliary fan

A fan in the chamber that helps cool the print. The X2D has a left and a right one. More: [Fans](printers.md#fans).

## BamBuddy

A self-hosted command center for Bambu Lab printers, a project of its own. The integration shows what BamBuddy knows and sends commands through it. More: [How it works](how-it-works.md).

## Bambu Studio

Bambu Lab's slicer. The integration's list of filaments comes from it. More: [Set a filament](ams-and-filament.md#set-a-filament).

## Developer LAN mode

A printer setting the controls need: without it the printer ignores what BamBuddy passes on. It takes the printer off Bambu's cloud. More: [Printers and controls](troubleshooting.md#printers-and-controls).

## Exhaust fan

The fan that blows chamber air out. The H2 series and the X2D have one; a P2S gets it with the External Exhaust Fan kit. More: [Per model](chamber.md#per-model).

## External spool

A spool outside the AMS, fed straight into the printer. Two-nozzle printers have a left and a right one. More: [The external spool](ams-and-filament.md#the-external-spool).

## Filament backup

When a spool runs out, the printer continues with a matching spool from the AMS: same brand, material and color. More: [Filament backup](ams-and-filament.md#filament-backup).

## Filament profile

A filament's entry in Bambu Studio's list, such as *Bambu PLA Basic*. A slot holds one, so the printer knows what is loaded. More: [Set a filament](ams-and-filament.md#set-a-filament).

## Filament Track Switch

An accessory that lets AMS units reach both nozzles of a two-nozzle printer. More: [Known limitations](troubleshooting.md#known-limitations).

## H2 series

The H2S, H2D, H2D Pro and H2C. The pages also say *X1 series* for the X1, X1C and X1E, *P1 series* for the P1P and P1S, and *A series* for the A1 mini, A1 and A2L. More: [Printers](printers.md).

## HMS

The printer's own warning system (Health Management System). Clearing a message only removes the message: errors the printer still sees come back. More: [HMS messages](dashboard-card.md#hms-messages).

## K profile

A saved flow calibration for a filament, kept on the printer. If unsure, leave it as it is. More: [K profiles](ams-and-filament.md#k-profiles).

## Live connection

BamBuddy's WebSocket. It reports a printer's change at once, so the integration reads that printer without waiting for the next timed read. More: [What is read when](how-it-works.md#what-is-read-when).

## Open frame

A printer without an enclosure: the A1 mini, A1, A2L and P1P. Its light is called *Light*, not *Chamber light*. More: [Hardware at a glance](printers.md#hardware-at-a-glance).

## Part cooling fan

The fan on the print head that cools the printed plastic. Every printer has one. More: [Fans](printers.md#fans).

## Print stage

What the printer is doing right now, such as heating the nozzle or changing filament. *Print status* is the broader state of the job. More: [Print status, stage and AMS status](entities.md#print-status-stage-and-ams-status).

## RFID chip

The chip in a Bambu Lab spool. The AMS reads the filament from it, so such a spool needs no filament set by hand. More: [Reset a slot or read its chip](ams-and-filament.md#reset-a-slot-or-read-its-chip).

## Slot

A place for one spool in an AMS unit: four in most units, one in an AMS HT. More: [The Filament tab](ams-and-filament.md#the-filament-tab).

## Spool inventory

BamBuddy's own list of your spools, with what is left of each and where it is kept. More: [Spool inventory](spool-inventory.md).

## Spoolman

A separate spool manager BamBuddy can use instead of its own inventory. While it does, the integration shows no inventory. More: [Not with Spoolman](spool-inventory.md#not-with-spoolman).

## See also

- [Printers](printers.md)
- [Entities](entities.md)
- [Troubleshooting](troubleshooting.md)
