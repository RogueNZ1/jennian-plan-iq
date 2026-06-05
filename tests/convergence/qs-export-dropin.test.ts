// @vitest-environment node
/**
 * Drop-in paste sheet — buildDropInSheet.
 *
 * Verifies the exact cell addresses that must match the master's IQ Input tab.
 * All tests are offline (no DB, no AI). The fixture is JM-0015/Young-shaped:
 * 10 openings including the Dining slider, no garage, 5+2+2 door counts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDropInSheet, type QSExportData } from "../../src/lib/iq-qs-export";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";

// ── helpers ──────────────────────────────────────────────────────────────────
function cellVal(ws: ReturnType<typeof buildDropInSheet>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v ?? undefined;
}

/** Minimal QSExportData base used across tests. */
function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0015", clientName: "Test Client", address: "23 Main St, Feilding",
    templateId: null, createdAt: "", floorAreaM2: 100.3, perimeterLm: 44.6,
    firstFloorAreaM2: null, studHeightMm: 2400, alfrescoAreaM2: 0.9,
    roofPitch: null, ridgeType: null, underlay: null, claddingType1: null, claddingType2: null,
    windows: [], garageDoors: [], interiorDoors: [], downpipes: [], heatPumps: [],
    extras: [], skylights: [], clientFirstName: "Test", clientSurname: "Client",
    streetAddress: "23 Main St", addressLine2: null, city: "Feilding",
    email: null, phone: null, jmwNumber: "JM-0015", planVersion: "1",
    exteriorWallLengthLm: 44.6, exteriorWallHeightM: 2.4,
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

// ── Young-shaped openings (10 rows, Dining slider included) ──────────────────
const YOUNG_OPENINGS: Opening[] = [
  op("window",  "Bed 1 (Master)", 1.3, 1.8),
  op("window",  "Bed 1 (Master)", 1.3, 1.8),
  op("window",  "Bed 2",          1.3, 1.5),
  op("window",  "Kitchen",        1.8, 0.6),
  op("window",  "Lounge",         1.4, 1.3),
  op("window",  "Wc",             1.1, 0.7),
  op("window",  "Bathroom",       1.1, 0.7),
  op("window",  "Laundry",        1.8, 0.6), // ← must be dropped (no laundry window slot)
  op("slider",  "Dining",         2.1, 2.4), // ← must land at row 59
  op("entrance","Entry",          2.1, 0),   // ← w=0 unresolved, must appear at row 72
];

describe("buildDropInSheet — core cells", () => {
  it("writes floor area D4, perimeter E4, first-floor F4, alfresco D13, stud-height D20", () => {
    const ws = buildDropInSheet(base());
    expect(cellVal(ws, "D4")).toBe(100.3);
    expect(cellVal(ws, "E4")).toBe(44.6);
    expect(cellVal(ws, "F4")).toBe(0);        // single-storey default
    expect(cellVal(ws, "D13")).toBe(0.9);
    expect(cellVal(ws, "D20")).toBe(2400);    // mm, not metres
  });

  it("writes city from address to I5 without a hardcoded fallback", () => {
    const ws = buildDropInSheet(base());
    expect(cellVal(ws, "I5")).toBe("Feilding");
  });

  it("omits I5 when city is null (no 'Palmerston North' fallback)", () => {
    const ws = buildDropInSheet(base({ city: null }));
    expect(cellVal(ws, "I5")).toBeUndefined();
  });
});

describe("buildDropInSheet — window routing (openings[] path)", () => {
  const ws = buildDropInSheet(base({ openings: YOUNG_OPENINGS }));

  it("Bed 1 qty=2 at row 41 (two openings with same room aggregate)", () => {
    expect(cellVal(ws, "D41")).toBe(2);
    expect(cellVal(ws, "E41")).toBe(1.3);
    expect(cellVal(ws, "F41")).toBe(1.8);
  });

  it("Dining slider at row 59 (type=slider, room=Dining)", () => {
    expect(cellVal(ws, "D59")).toBe(1);
    expect(cellVal(ws, "E59")).toBe(2.1);
    expect(cellVal(ws, "F59")).toBe(2.4);
  });

  it("WC maps to row 51 (Toilet slot)", () => {
    expect(cellVal(ws, "D51")).toBe(1);
    expect(cellVal(ws, "E51")).toBe(1.1);
    expect(cellVal(ws, "F51")).toBe(0.7);
  });

  it("entrance at row 72 with w=0 (unresolved, written not dropped)", () => {
    expect(cellVal(ws, "D72")).toBe(1);
    expect(cellVal(ws, "E72")).toBe(2.1);
    // w=0 → not written (zero is the 'already zeroed' value)
    // Row was pre-zeroed so F72=0 either way; presence of D72=1 proves it was written
  });

  it("Laundry window is DROPPED (no slot for it)", () => {
    // No laundry row in the master. Row 70 = Laundry Door (PA door) not laundry window.
    // The Laundry window opening (room='Laundry') must not reach any slot.
    // Bed2=45, Bed3=47 etc. should be 0 (no openings for them in Young plan).
    expect(cellVal(ws, "D45")).toBe(1);   // Bed 2 present
    // Laundry was the 8th opening — if it leaked into any slot other than 70 that's a bug.
    // Row 70 should be 0 (no pa_door in Young's openings).
    expect(cellVal(ws, "D70")).toBe(0);
  });

  it("zeros ALL rows 41-72 that IQ didn't populate (kills template defaults)", () => {
    // Bed 3 (row 47), Bed 4 (49), Ensuite (43), Family (56), Lounge (62), etc.
    // not in Young openings → must be 0, not the template's 200 m² default
    // Kitchen (54) and Lounge (62) ARE in Young's openings — only check truly empty slots:
    for (const row of [43, 47, 49, 56, 65, 67, 68]) {
      expect(cellVal(ws, `D${row}`)).toBe(0);
    }
  });
});

describe("buildDropInSheet — garage doors", () => {
  it("all H175-H180 are 0 when no garage", () => {
    const ws = buildDropInSheet(base({ openings: YOUNG_OPENINGS }));
    for (const row of [175, 176, 177, 178, 179, 180]) {
      expect(cellVal(ws, `H${row}`)).toBe(0);
    }
  });

  it("sets H175=1 for 4.8×2.1 standard, all others 0", () => {
    const ws = buildDropInSheet(base({ garageDoor48x21Std: 1 }));
    expect(cellVal(ws, "H175")).toBe(1);
    for (const row of [176, 177, 178, 179, 180]) expect(cellVal(ws, `H${row}`)).toBe(0);
  });

  it("sets H179=1 for 2.7×2.1 standard", () => {
    const ws = buildDropInSheet(base({ garageDoor27x21Std: 1 }));
    expect(cellVal(ws, "H179")).toBe(1);
    expect(cellVal(ws, "H175")).toBe(0);
  });
});

describe("buildDropInSheet — interior door counts", () => {
  it("writes H187/190/192/193 from door counts and zeros when 0", () => {
    const ws = buildDropInSheet(base({
      intDoorStandard: 5, intDoorBarnSlider: 0,
      intDoorDouble: 2,   intDoorCavitySlider: 2,
    }));
    expect(cellVal(ws, "H187")).toBe(5);  // standard
    expect(cellVal(ws, "H190")).toBe(0);  // barn slider (zeroed)
    expect(cellVal(ws, "H192")).toBe(2);  // double
    expect(cellVal(ws, "H193")).toBe(2);  // cavity
  });
});

describe("buildDropInSheet — relational fallback (null openings)", () => {
  it("routes windowsByRoom slots to correct rows when openings[] absent", () => {
    const ws = buildDropInSheet(base({
      openings: null,
      windowsByRoom: {
        dining: { cladding: "", qty: 1, height: 2.1, width: 2.4 },
        bed1:   { cladding: "", qty: 1, height: 1.3, width: 1.8 },
      },
    }));
    expect(cellVal(ws, "D59")).toBe(1);   // dining row
    expect(cellVal(ws, "E59")).toBe(2.1);
    expect(cellVal(ws, "F59")).toBe(2.4);
    expect(cellVal(ws, "D41")).toBe(1);   // bed1 row
  });
});
