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
  // SheetJS WorkSheet index signature unions cells with metadata keys ('!cols' etc),
  // so ws[addr]?.v never narrows — this accessor is the single cast point.
  const ws = buildQSDataInputSheet(myers);
  const cell = (addr: string) => (ws[addr] as import("xlsx").CellObject | undefined)?.v;

  // ── ① Job information ────────────────────────────────────────────────────────
  it("writes client name to I3", () => {
    expect(cell("I3")).toBe("Caley Myers");
  });
  it("writes site address to I4", () => {
    expect(cell("I4")).toBe("126 Setters Line");
  });
  it("writes city to I5", () => {
    expect(cell("I5")).toBe("Palmerston North");
  });

  // ── ② Core measurements ───────────────────────────────────────────────────────
  it("writes floor area 234 to D12", () => {
    expect(cell("D12")).toBe(234);
  });
  it("writes alfresco 26 to D13", () => {
    expect(cell("D13")).toBe(26);
  });
  it("writes perimeter 93 to D15", () => {
    expect(cell("D15")).toBe(93);
  });
  it("writes ext wall length 93 to D19", () => {
    expect(cell("D19")).toBe(93);
  });
  it("writes wall height 2.4 to D20", () => {
    expect(cell("D20")).toBe(2.4);
  });

  // ── Downpipes ────────────────────────────────────────────────────────────────
  it("writes white downpipes to E145", () => {
    expect(cell("E145")).toBe(7);
  });
  it("writes PVC downpipes to E147", () => {
    expect(cell("E147")).toBe(7);
  });

  // ── ④ Garage doors ───────────────────────────────────────────────────────────
  it("writes garage door 4.8×2.1 insulated to H176", () => {
    expect(cell("H176")).toBe(1);
  });
  it("H180 (2.7×2.1) is empty", () => {
    expect(ws["H180"]).toBeUndefined();
  });

  // ── Interior doors ───────────────────────────────────────────────────────────
  it("writes 11 standard interior doors to H187", () => {
    expect(cell("H187")).toBe(11);
  });
  it("writes 4 double doors to H192", () => {
    expect(cell("H192")).toBe(4);
  });
  it("writes 5 cavity sliders to H193", () => {
    expect(cell("H193")).toBe(5);
  });

  // ── No floor area written to wrong cells ──────────────────────────────────────
  it("D13 is alfresco (26) not floor area", () => {
    expect(cell("D13")).toBe(26);
    expect(cell("D13")).not.toBe(234);
  });
});
