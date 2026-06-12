/**
 * Stage 5 validation — McAlevey reference job
 * Ground truth extracted from McAlevey EST 06.05.26.xlsm, sheet "5. Data Input House "
 * Every assertion corresponds to a cell the estimator will paste into QS.
 */
import { describe, it, expect } from "vitest";
import { buildQSDataInputSheet } from "../iq-qs-export";
import type { QSExportData } from "../iq-qs-export";

// Minimal valid QSExportData seeded with McAlevey ground-truth values
const mcalevey: QSExportData = {
  // Job info → I3/I4/I5/I8
  clientName: "Liz McAlevey",
  clientFirstName: "Liz",
  clientSurname: "McAlevey",
  streetAddress: "520A Ruahine Street",
  addressLine2: null,
  city: "Palmerston North",
  email: null,
  phone: null,
  jmwNumber: "JMW80730",
  jobNumber: "JMW80730",
  address: "520A Ruahine Street",
  planVersion: "1",
  templateId: null,
  createdAt: new Date().toISOString(),

  // Core measurements → D12/D13/D15/D19/D20
  floorAreaM2: 133.4,
  alfrescoAreaM2: 1.3,
  perimeterLm: 55, internalWallLm: null, gableSpanM: null,
  exteriorWallLengthLm: 55,
  exteriorWallHeightM: 2.4,
  firstFloorAreaM2: 0,
  studHeightMm: null,
  pathsPatioM2: null,
  drivewayM2: null,

  // Windows by room → D/E/F at specific rows
  windowsByRoom: {
    bed1:         { cladding: "", qty: 1, height: 1.3,  width: 2.1 },
    ensuite:      { cladding: "", qty: 1, height: 1.1,  width: 0.8 },
    bed2:         { cladding: "", qty: 1, height: 1.3,  width: 1.5 },
    bed3:         { cladding: "", qty: 1, height: 1.3,  width: 1.5 },
    bathroom:     { cladding: "", qty: 1, height: 1.1,  width: 1.2 },
    kitchen:      { cladding: "", qty: 1, height: 1.8,  width: 2.1 },
    dining:       { cladding: "", qty: 1, height: 1.8,  width: 1.8 },
    lounge:       { cladding: "", qty: 1, height: 2.15, width: 2.6 },
    garageWindow: { cladding: "", qty: 1, height: 2.15, width: 2.0 },
    garageDoor1:  { cladding: "", qty: 1, height: 2.1,  width: 2.7 },
    entrance:     { cladding: "", qty: 1, height: 2.15, width: 1.6 },
  },

  // Garage doors → H180 (2.7×2.1 insulated)
  garageDoor48x21Insulated: 0,
  garageDoor48x21Std:       0,
  garageDoor24x21Insulated: 0,
  garageDoor24x21Std:       0,
  garageDoor27x21Insulated: 1,
  garageDoor27x21Std:       0,

  // Interior doors → H187/H192/H193
  intDoorStandard:     7,
  intDoorUGroove:      0,
  intDoorVGroove:      0,
  intDoorBarnSlider:   0,
  intDoorDouble:       4,
  intDoorCavitySlider: 2,

  // Downpipes → E145/E147
  downpipesWhite:       5,
  downpipesColourSteel: 0,
  downpipesPvcColoured: 5,

  // Unused in data input sheet but required by type
  roofPitch: null,
  ridgeType: null,
  underlay: null,
  claddingType1: null,
  claddingType2: null,
  windows: [],
  garageDoors: [],
  interiorDoors: [],
  downpipes: [],
  heatPumps: [],
  extras: [],
  skylights: [],
  ceilingHatch: 0,
  atticStair: 0,
  letterboxUrban: 0,
  washingLine: 0,
  heatPumpWallUnit: 0,
  heatPumpDucted: 0,
  specItems: {},
};

describe("QS Export — McAlevey reference (Stage 5 validation)", () => {
  // SheetJS WorkSheet index signature unions cells with metadata keys ('!cols' etc),
  // so ws[addr]?.v never narrows — this accessor is the single cast point.
  const ws = buildQSDataInputSheet(mcalevey);
  const cell = (addr: string) => (ws[addr] as import("xlsx").CellObject | undefined)?.v;

  // ── ① Job information ────────────────────────────────────────────────────────
  it("writes client name to I3", () => {
    expect(cell("I3")).toBe("Liz McAlevey");
  });
  it("writes site address to I4", () => {
    expect(cell("I4")).toBe("520A Ruahine Street");
  });
  it("writes city to I5", () => {
    expect(cell("I5")).toBe("Palmerston North");
  });
  it("writes JMW number to I8", () => {
    expect(cell("I8")).toBe("JMW80730");
  });

  // ── ② Core measurements ───────────────────────────────────────────────────────
  it("writes floor area 133.4 to D12", () => {
    expect(cell("D12")).toBe(133.4);
  });
  it("writes alfresco 1.3 to D13", () => {
    expect(cell("D13")).toBe(1.3);
  });
  it("writes perimeter 55 to D15", () => {
    expect(cell("D15")).toBe(55);
  });
  it("writes ext wall length 55 to D19", () => {
    expect(cell("D19")).toBe(55);
  });
  it("writes wall height 2.4 to D20", () => {
    expect(cell("D20")).toBe(2.4);
  });
  it("does NOT write first floor to D12 or D13 (zero → skipped)", () => {
    // D12 should be floorAreaM2, not first floor
    expect(cell("D12")).toBe(133.4);
    // F4 should be empty (firstFloorAreaM2 = 0 → val skips 0)
    expect(ws["F4"]).toBeUndefined();
  });

  // ── ③ Windows by room ────────────────────────────────────────────────────────
  it("writes Bed 1 qty/height/width to D41/E41/F41", () => {
    expect(cell("D41")).toBe(1);
    expect(cell("E41")).toBe(1.3);
    expect(cell("F41")).toBe(2.1);
  });
  it("does NOT write cladding type to C41 (gap — numeric type unknown)", () => {
    expect(ws["C41"]).toBeUndefined();
  });
  it("writes Ensuite qty/height/width to D43/E43/F43", () => {
    expect(cell("D43")).toBe(1);
    expect(cell("E43")).toBe(1.1);
    expect(cell("F43")).toBe(0.8);
  });
  it("writes Bed 2 to D45/E45/F45", () => {
    expect(cell("D45")).toBe(1);
    expect(cell("E45")).toBe(1.3);
    expect(cell("F45")).toBe(1.5);
  });
  it("writes Bed 3 to D47/E47/F47", () => {
    expect(cell("D47")).toBe(1);
    expect(cell("E47")).toBe(1.3);
    expect(cell("F47")).toBe(1.5);
  });
  it("Bed 4 is absent from windowsByRoom → row 49 empty", () => {
    expect(ws["D49"]).toBeUndefined();
  });
  it("writes Bathroom to D52/E52/F52", () => {
    expect(cell("D52")).toBe(1);
    expect(cell("E52")).toBe(1.1);
    expect(cell("F52")).toBe(1.2);
  });
  it("writes Kitchen to D54/E54/F54", () => {
    expect(cell("D54")).toBe(1);
    expect(cell("E54")).toBe(1.8);
    expect(cell("F54")).toBe(2.1);
  });
  it("writes Dining to D59/E59/F59", () => {
    expect(cell("D59")).toBe(1);
    expect(cell("E59")).toBe(1.8);
    expect(cell("F59")).toBe(1.8);
  });
  it("writes Lounge to D62/E62/F62", () => {
    expect(cell("D62")).toBe(1);
    expect(cell("E62")).toBe(2.15);
    expect(cell("F62")).toBe(2.6);
  });
  it("writes Garage Window to D65/E65/F65", () => {
    expect(cell("D65")).toBe(1);
    expect(cell("E65")).toBe(2.15);
    expect(cell("F65")).toBe(2);
  });
  it("writes Garage Door 1 to D67/E67/F67", () => {
    expect(cell("D67")).toBe(1);
    expect(cell("E67")).toBe(2.1);
    expect(cell("F67")).toBe(2.7);
  });
  it("writes Entrance to D72/E72/F72", () => {
    expect(cell("D72")).toBe(1);
    expect(cell("E72")).toBe(2.15);
    expect(cell("F72")).toBe(1.6);
  });

  // ── Downpipes ────────────────────────────────────────────────────────────────
  it("writes white downpipes to E145", () => {
    expect(cell("E145")).toBe(5);
  });
  it("E146 is empty (no colorsteel downpipes)", () => {
    expect(ws["E146"]).toBeUndefined();
  });
  it("writes PVC downpipes to E147", () => {
    expect(cell("E147")).toBe(5);
  });

  // ── ④ Garage doors ───────────────────────────────────────────────────────────
  it("writes garage door 2.7×2.1 insulated to H180", () => {
    expect(cell("H180")).toBe(1);
  });
  it("H176 (4.8×2.1) is empty", () => {
    expect(ws["H176"]).toBeUndefined();
  });

  // ── Interior doors ───────────────────────────────────────────────────────────
  it("writes 7 standard interior doors to H187", () => {
    expect(cell("H187")).toBe(7);
  });
  it("writes 4 double doors to H192", () => {
    expect(cell("H192")).toBe(4);
  });
  it("writes 2 cavity sliders to H193", () => {
    expect(cell("H193")).toBe(2);
  });

  // ── Yellow fill on all value cells ───────────────────────────────────────────
  it("all value cells have yellow fill style", () => {
    const valueCells = ["I3","I4","I5","I8","D12","D13","D15","D19","D20",
      "D41","E41","F41","E145","E147","H180","H187","H192","H193"];
    for (const addr of valueCells) {
      const styled = ws[addr] as (import("xlsx").CellObject & { s?: { fill?: { fgColor?: { rgb?: string } } } }) | undefined;
      expect(styled?.s?.fill?.fgColor?.rgb, `${addr} fill`).toBe("FFFF00");
    }
  });
});
