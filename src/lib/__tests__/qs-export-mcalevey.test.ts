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
  const ws = buildQSDataInputSheet(mcalevey);

  // ── ① Job information ────────────────────────────────────────────────────────
  it("writes client name to I3", () => {
    expect(ws["I3"]?.v).toBe("Liz McAlevey");
  });
  it("writes site address to I4", () => {
    expect(ws["I4"]?.v).toBe("520A Ruahine Street");
  });
  it("writes city to I5", () => {
    expect(ws["I5"]?.v).toBe("Palmerston North");
  });
  it("writes JMW number to I8", () => {
    expect(ws["I8"]?.v).toBe("JMW80730");
  });

  // ── ② Core measurements ───────────────────────────────────────────────────────
  it("writes floor area 133.4 to D12", () => {
    expect(ws["D12"]?.v).toBe(133.4);
  });
  it("writes alfresco 1.3 to D13", () => {
    expect(ws["D13"]?.v).toBe(1.3);
  });
  it("writes perimeter 55 to D15", () => {
    expect(ws["D15"]?.v).toBe(55);
  });
  it("writes ext wall length 55 to D19", () => {
    expect(ws["D19"]?.v).toBe(55);
  });
  it("writes wall height 2.4 to D20", () => {
    expect(ws["D20"]?.v).toBe(2.4);
  });
  it("does NOT write first floor to D12 or D13 (zero → skipped)", () => {
    // D12 should be floorAreaM2, not first floor
    expect(ws["D12"]?.v).toBe(133.4);
    // F4 should be empty (firstFloorAreaM2 = 0 → val skips 0)
    expect(ws["F4"]).toBeUndefined();
  });

  // ── ③ Windows by room ────────────────────────────────────────────────────────
  it("writes Bed 1 qty/height/width to D41/E41/F41", () => {
    expect(ws["D41"]?.v).toBe(1);
    expect(ws["E41"]?.v).toBe(1.3);
    expect(ws["F41"]?.v).toBe(2.1);
  });
  it("does NOT write cladding type to C41 (gap — numeric type unknown)", () => {
    expect(ws["C41"]).toBeUndefined();
  });
  it("writes Ensuite qty/height/width to D43/E43/F43", () => {
    expect(ws["D43"]?.v).toBe(1);
    expect(ws["E43"]?.v).toBe(1.1);
    expect(ws["F43"]?.v).toBe(0.8);
  });
  it("writes Bed 2 to D45/E45/F45", () => {
    expect(ws["D45"]?.v).toBe(1);
    expect(ws["E45"]?.v).toBe(1.3);
    expect(ws["F45"]?.v).toBe(1.5);
  });
  it("writes Bed 3 to D47/E47/F47", () => {
    expect(ws["D47"]?.v).toBe(1);
    expect(ws["E47"]?.v).toBe(1.3);
    expect(ws["F47"]?.v).toBe(1.5);
  });
  it("Bed 4 is absent from windowsByRoom → row 49 empty", () => {
    expect(ws["D49"]).toBeUndefined();
  });
  it("writes Bathroom to D52/E52/F52", () => {
    expect(ws["D52"]?.v).toBe(1);
    expect(ws["E52"]?.v).toBe(1.1);
    expect(ws["F52"]?.v).toBe(1.2);
  });
  it("writes Kitchen to D54/E54/F54", () => {
    expect(ws["D54"]?.v).toBe(1);
    expect(ws["E54"]?.v).toBe(1.8);
    expect(ws["F54"]?.v).toBe(2.1);
  });
  it("writes Dining to D59/E59/F59", () => {
    expect(ws["D59"]?.v).toBe(1);
    expect(ws["E59"]?.v).toBe(1.8);
    expect(ws["F59"]?.v).toBe(1.8);
  });
  it("writes Lounge to D62/E62/F62", () => {
    expect(ws["D62"]?.v).toBe(1);
    expect(ws["E62"]?.v).toBe(2.15);
    expect(ws["F62"]?.v).toBe(2.6);
  });
  it("writes Garage Window to D65/E65/F65", () => {
    expect(ws["D65"]?.v).toBe(1);
    expect(ws["E65"]?.v).toBe(2.15);
    expect(ws["F65"]?.v).toBe(2);
  });
  it("writes Garage Door 1 to D67/E67/F67", () => {
    expect(ws["D67"]?.v).toBe(1);
    expect(ws["E67"]?.v).toBe(2.1);
    expect(ws["F67"]?.v).toBe(2.7);
  });
  it("writes Entrance to D72/E72/F72", () => {
    expect(ws["D72"]?.v).toBe(1);
    expect(ws["E72"]?.v).toBe(2.15);
    expect(ws["F72"]?.v).toBe(1.6);
  });

  // ── Downpipes ────────────────────────────────────────────────────────────────
  it("writes white downpipes to E145", () => {
    expect(ws["E145"]?.v).toBe(5);
  });
  it("E146 is empty (no colorsteel downpipes)", () => {
    expect(ws["E146"]).toBeUndefined();
  });
  it("writes PVC downpipes to E147", () => {
    expect(ws["E147"]?.v).toBe(5);
  });

  // ── ④ Garage doors ───────────────────────────────────────────────────────────
  it("writes garage door 2.7×2.1 insulated to H180", () => {
    expect(ws["H180"]?.v).toBe(1);
  });
  it("H176 (4.8×2.1) is empty", () => {
    expect(ws["H176"]).toBeUndefined();
  });

  // ── Interior doors ───────────────────────────────────────────────────────────
  it("writes 7 standard interior doors to H187", () => {
    expect(ws["H187"]?.v).toBe(7);
  });
  it("writes 4 double doors to H192", () => {
    expect(ws["H192"]?.v).toBe(4);
  });
  it("writes 2 cavity sliders to H193", () => {
    expect(ws["H193"]?.v).toBe(2);
  });

  // ── Yellow fill on all value cells ───────────────────────────────────────────
  it("all value cells have yellow fill style", () => {
    const valueCells = ["I3","I4","I5","I8","D12","D13","D15","D19","D20",
      "D41","E41","F41","E145","E147","H180","H187","H192","H193"];
    for (const addr of valueCells) {
      expect(ws[addr]?.s?.fill?.fgColor?.rgb, `${addr} fill`).toBe("FFFF00");
    }
  });
});
