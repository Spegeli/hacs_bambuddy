import { describe, expect, it } from "vitest";

import { findPrinter, isPrinter, printerDevices, shownUnits } from "../src/discovery";
import type { PrinterRefs } from "../src/types";
import { a1mini, amsDevice, h2d, instanceDevice, makeHass, offlineP1s, readOnlyX1c, x1c, type FakeDevice } from "./fixtures";

describe("finding a printer's entities", () => {
  it("finds an X1C's entities by their translation keys", () => {
    const refs = findPrinter(makeHass({ devices: x1c() }), "dev-x1c");
    expect(refs).toMatchObject({
      deviceId: "dev-x1c",
      name: "Workshop (X1C / 00M09A350100123)",
      model: "X1C",
      status: "sensor.x1c_print_status",
      stage: "sensor.x1c_print_stage",
      progress: "sensor.x1c_progress",
      remaining: "sensor.x1c_remaining_time",
      endTime: "sensor.x1c_end_time",
      layer: "sensor.x1c_current_layer",
      totalLayers: "sensor.x1c_total_layers",
      job: "sensor.x1c_current_print",
      dual: false,
      nozzles: [{ sensor: "sensor.x1c_nozzle_temperature", target: "number.x1c_nozzle_target_temperature" }],
      bed: { sensor: "sensor.x1c_bed_temperature", target: "number.x1c_bed_target_temperature" },
      chamber: { sensor: "sensor.x1c_chamber_temperature", target: undefined },
      hotendFan: "sensor.x1c_hotend_fan",
      hms: "sensor.x1c_hms_errors",
      activeFilament: "sensor.x1c_active_filament",
      externalSpools: ["sensor.x1c_external_spool"],
      online: "binary_sensor.x1c_online",
      plateClearNeeded: "binary_sensor.x1c_plate_clear_needed",
      pause: "button.x1c_pause",
      resume: "button.x1c_resume",
      stop: "button.x1c_stop",
      plateCleared: "button.x1c_plate_cleared",
      clearHms: "button.x1c_clear_hms_errors",
      speed: "select.x1c_print_speed",
      fans: [
        { key: "part", entityId: "fan.x1c_part_cooling_fan" },
        { key: "aux", entityId: "fan.x1c_auxiliary_fan" },
        { key: "chamber", entityId: "fan.x1c_chamber_fan" },
      ],
      light: "light.x1c_chamber_light",
      camera: "camera.x1c_camera",
      cover: "image.x1c_cover",
    });
    expect(refs?.ams).toEqual([
      {
        deviceId: "dev-x1c-ams-0",
        name: "AMS A",
        model: "AMS",
        humidity: "sensor.dev-x1c_ams_0_humidity",
        temperature: "sensor.dev-x1c_ams_0_temperature",
        slots: ["sensor.dev-x1c_ams_0_slot_1", "sensor.dev-x1c_ams_0_slot_2", "sensor.dev-x1c_ams_0_slot_3", "sensor.dev-x1c_ams_0_slot_4"],
        drying: undefined,
        dryingRemaining: undefined,
      },
    ]);
    // Every entity of the printer and its AMS unit is watched.
    expect(refs?.watched).toContain("sensor.x1c_progress");
    expect(refs?.watched).toContain("sensor.dev-x1c_ams_0_slot_3");
  });

  it("finds both nozzles, both external spools and the AMS units of an H2D, in BamBuddy's order", () => {
    const refs = findPrinter(makeHass({ devices: h2d() }), "dev-h2d");
    expect(refs?.dual).toBe(true);
    expect(refs?.nozzles).toEqual([
      { sensor: "sensor.h2d_left_nozzle_temperature", target: "number.h2d_left_nozzle_target_temperature" },
      { sensor: "sensor.h2d_right_nozzle_temperature", target: "number.h2d_right_nozzle_target_temperature" },
    ]);
    expect(refs?.chamber.target).toBe("number.h2d_chamber_target_temperature");
    expect(refs?.externalSpools).toEqual(["sensor.h2d_left_external_spool", "sensor.h2d_right_external_spool"]);
    expect(refs?.fans.map((fan) => fan.key)).toEqual(["part", "aux", "chamber", "left_aux"]);
    // The fixture lists the AMS HT first; BamBuddy numbers it after the AMS.
    expect(refs?.ams.map((unit) => [unit.name, unit.model])).toEqual([
      ["AMS A", "AMS 2 Pro"],
      ["AMS HT A", "AMS HT"],
    ]);
    expect(refs?.ams[0]?.drying).toBe("binary_sensor.dev-h2d_ams_0_drying");
    expect(refs?.ams[0]?.dryingRemaining).toBe("sensor.dev-h2d_ams_0_drying_remaining_time");
  });

  it("names an AMS unit without its printer's name and its model and serial, also after the printer was renamed", () => {
    const refs = findPrinter(makeHass({ devices: a1mini() }), "dev-a1mini");
    expect(refs?.name).toBe("Desk A1 mini");
    expect(refs?.ams[0]?.name).toBe("AMS A");
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const renamed = findPrinter(makeHass({ devices: [printer, { ...ams, nameByUser: "Left AMS" }] }), "dev-x1c");
    expect(renamed?.ams[0]?.name).toBe("Left AMS");
    const foreign = findPrinter(makeHass({ devices: [printer, { ...ams, name: "Some unit" }] }), "dev-x1c");
    expect(foreign?.ams[0]?.name).toBe("Some unit");
    const serial = findPrinter(makeHass({ devices: [printer, { ...ams, name: "Workshop AMS B (AMS 2 Pro / 19C06A000000003)" }] }), "dev-x1c");
    expect(serial?.ams[0]?.name).toBe("AMS B");
  });

  it("knows a printer has two nozzles also where the user disabled a nozzle's sensor", () => {
    const [printer, ...units] = h2d() as [FakeDevice, ...FakeDevice[]];
    const bare = { ...printer, entities: printer.entities.filter((entity) => entity.key !== "left_nozzle_temperature") };
    const refs = findPrinter(makeHass({ devices: [bare, ...units] }), "dev-h2d");
    expect(refs?.dual).toBe(true);
    expect(refs?.nozzles).toEqual([
      { sensor: undefined, target: "number.h2d_left_nozzle_target_temperature" },
      { sensor: "sensor.h2d_right_nozzle_temperature", target: "number.h2d_right_nozzle_target_temperature" },
    ]);
    expect(refs?.externalSpools).toEqual(["sensor.h2d_left_external_spool", "sensor.h2d_right_external_spool"]);
  });

  it("finds no controls with a key that lacks Control Printer", () => {
    const refs = findPrinter(makeHass({ devices: readOnlyX1c() }), "dev-x1c");
    expect(refs).toMatchObject({ pause: undefined, stop: undefined, speed: undefined, light: undefined, fans: [] });
    expect(refs?.nozzles).toEqual([{ sensor: "sensor.x1c_nozzle_temperature", target: undefined }]);
  });

  it("orders slots by their slot number and units by their trays, unknown ones last", () => {
    const [printer] = x1c() as [FakeDevice];
    const unit = amsDevice({ printer, amsId: 1, model: "AMS", slots: [{ trayId: 4 }, { trayId: 5 }] });
    // Shuffle the slots and take one slot's number away.
    const shuffled: FakeDevice = {
      ...unit,
      entities: [
        { ...(unit.entities[1] as FakeDevice["entities"][number]) },
        { ...(unit.entities[0] as FakeDevice["entities"][number]), attributes: { tray_id: 4 } },
      ],
    };
    const bare = amsDevice({ printer, amsId: 2, model: "AMS", slots: [{ trayId: 8 }] });
    const noTrays: FakeDevice = { ...bare, name: `${printer.name} AMS 0`, entities: bare.entities.map((entity) => ({ ...entity, attributes: {} })) };
    const refs = findPrinter(makeHass({ devices: [noTrays, printer, shuffled] }), "dev-x1c");
    expect(refs?.ams.map((item) => item.name)).toEqual(["AMS B", "AMS 0"]);
    expect(refs?.ams[0]?.slots).toEqual(["sensor.dev-x1c_ams_1_slot_2", "sensor.dev-x1c_ams_1_slot_1"]);
  });

  it("shows no unit that is no longer plugged in while the printer is online, but keeps it and watches it", () => {
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const gone = amsDevice({ printer, amsId: 1, model: "AMS", slots: [{ trayId: 4 }], online: false });
    const hass = makeHass({ devices: [printer, ams, gone] });
    const refs = findPrinter(hass, "dev-x1c") as PrinterRefs;
    expect(refs.ams.map((unit) => unit.deviceId)).toEqual([ams.id, gone.id]);
    expect(shownUnits(hass, refs).map((unit) => unit.deviceId)).toEqual([ams.id]);
    expect(refs.watched).toContain("sensor.dev-x1c_ams_1_slot_1");
    // An offline printer's units are all unavailable: they stay.
    const offline = makeHass({ devices: offlineP1s() });
    expect(shownUnits(offline, findPrinter(offline, "dev-p1s") as PrinterRefs)).toHaveLength(1);
  });

  it("skips a child device without slots, and entities without a translation key", () => {
    const [printer] = x1c() as [FakeDevice];
    const child: FakeDevice = { id: "dev-child", name: "Other", model: "Hub", via: "dev-x1c", entities: [{ entityId: "sensor.child", key: "other", state: "1" }] };
    const untranslated = { ...printer, entities: [...printer.entities, { entityId: "sensor.x1c_extra", key: "", state: "1" }] };
    const refs = findPrinter(makeHass({ devices: [untranslated, child] }), "dev-x1c");
    expect(refs?.ams).toEqual([]);
    expect(refs?.watched).toContain("sensor.x1c_extra");
  });

  it("finds nothing for a device that is no printer, or none at all", () => {
    const hass = makeHass({ devices: [...x1c(), instanceDevice] });
    expect(findPrinter(hass, undefined)).toBeUndefined();
    expect(findPrinter(hass, "dev-gone")).toBeUndefined();
    expect(findPrinter(hass, "dev-x1c-ams-0")).toBeUndefined();
    expect(findPrinter(hass, "dev-instance")).toBeUndefined();
  });

  it("ignores other integrations' entities and entities without a device", () => {
    const hass = makeHass({
      devices: x1c(),
      foreign: [
        { entityId: "sensor.print_status", key: "print_status", state: "idle" },
        { entityId: "sensor.other_print_status", key: "print_status", state: "idle", platform: "bambuddy" },
      ],
    });
    expect(printerDevices(hass).map((device) => device.id)).toEqual(["dev-x1c"]);
  });

  it("finds a printer that a model without a model name reports", () => {
    const [printer] = offlineP1s() as [FakeDevice];
    const refs = findPrinter(makeHass({ devices: [{ ...printer, model: "" }] }), "dev-p1s");
    expect(refs?.model).toBe("");
  });
});

describe("which devices are printers", () => {
  const hass = makeHass({ devices: [...x1c(), ...h2d(), instanceDevice] });

  it("knows a printer by its print status sensor", () => {
    expect(isPrinter(hass, "dev-x1c")).toBe(true);
    expect(isPrinter(hass, "dev-x1c-ams-0")).toBe(false);
    expect(isPrinter(hass, "dev-instance")).toBe(false);
    expect(isPrinter(hass, null)).toBe(false);
    expect(isPrinter(hass, "dev-unknown")).toBe(false);
  });

  it("lists the printers in the device registry's order", () => {
    expect(printerDevices(hass).map((device) => device.id)).toEqual(["dev-x1c", "dev-h2d"]);
  });

  it("uses the device's model for a device without one, and its name for a nameless one", () => {
    const [printer] = x1c() as [FakeDevice];
    const bare = makeHass({ devices: [printer] });
    const device = bare.devices["dev-x1c"];
    if (device) {
      device.name = null;
      device.model = null;
    }
    const refs = findPrinter(bare, "dev-x1c");
    expect(refs?.name).toBe("");
    expect(refs?.model).toBe("");
  });
});
