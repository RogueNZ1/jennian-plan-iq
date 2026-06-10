/**
 * Stage 5 validation — Myers reference job
 * Ground truth extracted from Myers EST 11.05.26.xlsm, sheet "5. Data Input House "
 * Key differences from McAlevey: 234m² house, 26m² alfresco, 2.4m stud (NOT 2.55 — confirmed from xlsm D20=2.4)
 */
import { describe, it, expect } from "vitest";
import { buildQSDataInputSheet } from "../iq-qs-export";
import type { QSExportData } from "../iq-qs-export";

const myers: QSExportData = {
  // Job info → I3/I4/I5
  clientName: "Caley Myers",
  clientFirstName: "Caley",
  clientSurname: "Myers",
  streetAddress: "126 Setters Line",
  addressLine2: null,
  city: "Palmerston North",
  email: null,
  phone: null,
  jmwNumber: "",
  jobNumber: "",
  address: "126 Setters Line",
  planVersion: "1",
  templateId: null,
  createdAt: new Date().toISOString(),

  // Core measurements → D12/D13/D15/D19/D20
  floorAreaM2: 234,
  alfrescoAreaM2: 26,
  perimeterLm: 93, internalWallLm: null, gableSpanM: null,
  exteriorWallLengthLm: 93,
  exteriorWallHeightM: 2.4,  // xlsm D20 = 2.4 (not 2.55 — stud height is separate from wall height)
  firstFloorAreaM2: 0,
  studHeightMm: null,
  pathsPatioM2: null,
  drivewayM2: null,

  windowsByRoom: {},

  // Garage doors → H176 (4.8×2.1 insulated)
  garageDoor48x21Insulated: 1,
  garageDoor48x21Std:       0,
  garageDoor24x21Insulated: 0,
  garageDoor24x21Std:       0,
  garageDoor27x21Insulated: 0,
  garageDoor27x21Std:       0,

  // Interior doors → H187/H192/H193
  intDoorStandard:     11,
  intDoorUGroove:      0,
  intDoorVGroove:      0,
  intDoorBarnSlider:   0,
  intDoorDouble:       4,
  intDoorCavitySlider: 5,

  // Downpipes → E145/E147
  downpipesWhite:       7,
  downpipesColourSteel: 0,
  downpipesPvcColoured: 7,

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

describe("QS Export — Myers reference (Stage 5 validation)", () => {
  const ws = buildQSDataInputSheet(myers);

  // ── ① Job information ────────────────────────────────────────────────────────
  it("writes client name to I3", () => {
    expect(ws["I3"]?.v).toBe("Caley Myers");
  });
  it("writes site address to I4", () => {
    expect(ws["I4"]?.v).toBe("126 Setters Line");
  });
  it("writes city to I5", () => {
    expect(ws["I5"]?.v).toBe("Palmerston North");
  });

  // ── ② Core measurements ───────────────────────────────────────────────────────
  it("writes floor area 234 to D12", () => {
    expect(ws["D12"]?.v).toBe(234);
  });
  it("writes alfresco 26 to D13", () => {
    expect(ws["D13"]?.v).toBe(26);
  });
  it("writes perimeter 93 to D15", () => {
    expect(ws["D15"]?.v).toBe(93);
  });
  it("writes ext wall length 93 to D19", () => {
    expect(ws["D19"]?.v).toBe(93);
  });
  it("writes wall height 2.4 to D20", () => {
    expect(ws["D20"]?.v).toBe(2.4);
  });

  // ── Downpipes ────────────────────────────────────────────────────────────────
  it("writes white downpipes to E145", () => {
    expect(ws["E145"]?.v).toBe(7);
  });
  it("writes PVC downpipes to E147", () => {
    expect(ws["E147"]?.v).toBe(7);
  });

  // ── ④ Garage doors ───────────────────────────────────────────────────────────
  it("writes garage door 4.8×2.1 insulated to H176", () => {
    expect(ws["H176"]?.v).toBe(1);
  });
  it("H180 (2.7×2.1) is empty", () => {
    expect(ws["H180"]).toBeUndefined();
  });

  // ── Interior doors ───────────────────────────────────────────────────────────
  it("writes 11 standard interior doors to H187", () => {
    expect(ws["H187"]?.v).toBe(11);
  });
  it("writes 4 double doors to H192", () => {
    expect(ws["H192"]?.v).toBe(4);
  });
  it("writes 5 cavity sliders to H193", () => {
    expect(ws["H193"]?.v).toBe(5);
  });

  // ── No floor area written to wrong cells ──────────────────────────────────────
  it("D13 is alfresco (26) not floor area", () => {
    expect(ws["D13"]?.v).toBe(26);
    expect(ws["D13"]?.v).not.toBe(234);
  });
});
