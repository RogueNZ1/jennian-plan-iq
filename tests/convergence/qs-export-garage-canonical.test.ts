// @vitest-environment node
/**
 * Phase 1 (export faithfulness) — canonical sectional-door routing in buildDropInSheet.
 *
 * Reproduces the JM-0020 symptoms with a same-shaped offline fixture:
 *   - a Lounge slider that must land at the Lounge row (62) with its real dims, and
 *   - a non-standard-width (3.0×2.1) sectional door that previously vanished because the
 *     H175-180 block read ONLY the relational counters and openings[] sectionals were
 *     skipped with a routing comment that routed nowhere.
 *
 * Also locks the dedupe rule: relational counters (which know insulation) win whenever
 * they carry any door; canonical openings[] fill the block only when relational is empty.
 * All tests offline (no DB, no AI).
 */
import { describe, it, expect } from "vitest";
import { buildDropInSheet, type QSExportData } from "../../src/lib/iq-qs-export";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";

function cellVal(ws: ReturnType<typeof buildDropInSheet>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v ?? undefined;
}

/** Minimal QSExportData base (mirrors qs-export-dropin.test.ts). */
function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0020", clientName: "Test Client", address: "1 Test St, Feilding",
    templateId: null, createdAt: "", floorAreaM2: 100, perimeterLm: 40,
    firstFloorAreaM2: null, studHeightMm: 2400, alfrescoAreaM2: 0,
    roofPitch: null, ridgeType: null, underlay: null, claddingType1: null, claddingType2: null,
    windows: [], garageDoors: [], interiorDoors: [], downpipes: [], heatPumps: [],
    extras: [], skylights: [], clientFirstName: "Test", clientSurname: "Client",
    streetAddress: "1 Test St", addressLine2: null, city: "Feilding",
    email: null, phone: null, jmwNumber: "JM-0020", planVersion: "1",
    exteriorWallLengthLm: 40, exteriorWallHeightM: 2.4,
    pathsPatioM2: null, drivewayM2: null, windowsByRoom: {},
    downpipesWhite: 0, downpipesColourSteel: 0, downpipesPvcColoured: 0,
    garageDoor48x21Std: 0, garageDoor48x21Insulated: 0,
    garageDoor24x21Std: 0, garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0, garageDoor27x21Insulated: 0,
    intDoorStandard: 0, intDoorUGroove: 0, intDoorVGroove: 0,
    intDoorBarnSlider: 0, intDoorDouble: 0, intDoorCavitySlider: 0,
    ceilingHatch: 0, atticStair: 0, letterboxUrban: 0, washingLine: 0,
    heatPumpWallUnit: 0, heatPumpDucted: 0, specItems: {},
    openings: null,
    ...over,
  };
}

function op(type: Opening["type"], room: string | null, h: number, w: number): Opening {
  return { type, room, height_m: h, width_m: w, glazed: type !== "sectional_door",
           cladding: null, area_m2: h * w, source: "vision", confidence: "medium" };
}

// ── JM-0020-shaped fixture: lounge slider + non-standard 3.0×2.1 sectional ───
const JM0020_OPENINGS: Opening[] = [
  op("window",         "Bed 1",  1.3, 1.8),
  op("slider",         "Lounge", 2.1, 2.4), // ← must land at row 62 with real dims
  op("sectional_door", "Garage", 2.1, 3.0), // ← non-standard width: rows 67/68, not H-bins
];

describe("buildDropInSheet — JM-0020-shaped canonical rendering", () => {
  const ws = buildDropInSheet(base({ openings: JM0020_OPENINGS }));

  it("lounge slider 2.1×2.4 lands at row 62 (qty/height/width)", () => {
    expect(cellVal(ws, "D62")).toBe(1);
    expect(cellVal(ws, "E62")).toBe(2.1);
    expect(cellVal(ws, "F62")).toBe(2.4);
  });

  it("3.0×2.1 sectional lands at row 67 with REAL dims — never re-binned to 2.4", () => {
    expect(cellVal(ws, "D67")).toBe(1);
    expect(cellVal(ws, "E67")).toBe(2.1);
    expect(cellVal(ws, "F67")).toBe(3);
    // The 2.4 standard bin (and every other H bin) must stay 0 — a silent 2.4
    // re-bin writes a WRONG product onto a quote, which is worse than dropping.
    for (const row of [175, 176, 177, 178, 179, 180]) {
      expect(cellVal(ws, `H${row}`)).toBe(0);
    }
  });

  it("second non-standard row 68 stays zeroed when only one non-standard door exists", () => {
    expect(cellVal(ws, "D68")).toBe(0);
  });
});

describe("buildDropInSheet — canonical standard-width sectionals fill the H bins", () => {
  it("4.8×2.1 canonical sectional → H175=1 (std), all other bins 0, row 67 untouched", () => {
    const ws = buildDropInSheet(base({
      openings: [op("sectional_door", "Garage", 2.1, 4.8)],
    }));
    expect(cellVal(ws, "H175")).toBe(1);
    for (const row of [176, 177, 178, 179, 180]) expect(cellVal(ws, `H${row}`)).toBe(0);
    expect(cellVal(ws, "D67")).toBe(0);
  });

  it("width within tolerance (4.78) still bins to H175", () => {
    const ws = buildDropInSheet(base({
      openings: [op("sectional_door", "Garage", 2.1, 4.78)],
    }));
    expect(cellVal(ws, "H175")).toBe(1);
  });

  it("2.7×2.1 → H179; 2.4×2.1 → H177", () => {
    const ws = buildDropInSheet(base({
      openings: [
        op("sectional_door", "Garage", 2.1, 2.7),
        op("sectional_door", "Garage", 2.1, 2.4),
      ],
    }));
    expect(cellVal(ws, "H179")).toBe(1);
    expect(cellVal(ws, "H177")).toBe(1);
  });

  it("mixed: one standard (4.8) + one non-standard (3.0) → H175=1 AND row 67 dims", () => {
    const ws = buildDropInSheet(base({
      openings: [
        op("sectional_door", "Garage", 2.1, 4.8),
        op("sectional_door", "Garage", 2.1, 3.0),
      ],
    }));
    expect(cellVal(ws, "H175")).toBe(1);
    expect(cellVal(ws, "D67")).toBe(1);
    expect(cellVal(ws, "F67")).toBe(3);
  });

  it("two distinct non-standard sizes → rows 67 then 68", () => {
    const ws = buildDropInSheet(base({
      openings: [
        op("sectional_door", "Garage", 2.1, 3.0),
        op("sectional_door", "2nd Garage", 2.0, 3.2),
      ],
    }));
    expect(cellVal(ws, "D67")).toBe(1);
    expect(cellVal(ws, "F67")).toBe(3);
    expect(cellVal(ws, "D68")).toBe(1);
    expect(cellVal(ws, "F68")).toBe(3.2);
  });
});

describe("buildDropInSheet — dedupe: relational counters win when populated", () => {
  it("relational insulated 4.8 present → H176=1, canonical 4.8 NOT double-counted at H175", () => {
    const ws = buildDropInSheet(base({
      garageDoor48x21Insulated: 1,
      openings: [op("sectional_door", "Garage", 2.1, 4.8)],
    }));
    expect(cellVal(ws, "H176")).toBe(1);
    expect(cellVal(ws, "H175")).toBe(0); // canonical did not also fire
    expect(cellVal(ws, "D67")).toBe(0);
  });

  it("no relational, no canonical sectionals → all garage cells stay 0 (unchanged behaviour)", () => {
    const ws = buildDropInSheet(base({
      openings: [op("window", "Bed 1", 1.3, 1.8)],
    }));
    for (const row of [175, 176, 177, 178, 179, 180]) expect(cellVal(ws, `H${row}`)).toBe(0);
    expect(cellVal(ws, "D67")).toBe(0);
    expect(cellVal(ws, "D68")).toBe(0);
  });
});
