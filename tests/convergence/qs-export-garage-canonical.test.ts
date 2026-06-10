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

// ── Overflow rows (verified against the master: blanks under each room are live) ────

describe("buildDropInSheet — IQ Import: JM-0020-shaped canonical rendering", () => {
  it("non-standard 3.0×2.1 sectional → B24 exact size, row 44 real dims, never re-binned", () => {
    const ws = buildDropInSheet(base({
      openings: [
        op("window", "Lounge", 1.3, 1.8),
        op("slider", "Lounge", 2.1, 2.4),
        op("sectional_door", "Garage", 2.1, 3.0),
      ],
    }));
    expect(cellVal(ws, "B24")).toBe("3x2.1");
    expect([cellVal(ws, "B44"), cellVal(ws, "C44"), cellVal(ws, "D44")]).toEqual([1, 2.1, 3]);
    // lounge: window (arrival group 1) on the slot, slider in the manual block
    expect([cellVal(ws, "B42"), cellVal(ws, "C42"), cellVal(ws, "D42")]).toEqual([1, 1.3, 1.8]);
  });

  it("standard 4.8 canonical sectional → B24='4.8x2.1' (feeds the QS H176 string match)", () => {
    const ws = buildDropInSheet(base({ openings: [op("sectional_door", "Garage", 2.1, 4.8)] }));
    expect(cellVal(ws, "B24")).toBe("4.8x2.1");
  });

  it("relational counters win over canonical sectionals — single source, never both", () => {
    const ws = buildDropInSheet(base({
      garageDoor48x21Insulated: 1,
      openings: [op("sectional_door", "Garage", 2.1, 2.4)],
    }));
    expect(cellVal(ws, "B24")).toBe("4.8x2.1"); // relational, not the canonical 2.4
    expect(cellVal(ws, "D44")).toBe(4.8);
  });
});
