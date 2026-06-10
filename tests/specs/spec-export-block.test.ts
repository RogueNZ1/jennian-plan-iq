// @vitest-environment node
/**
 * SPECIFICATIONS block on the IQ Import paste sheet — behaviour + the
 * collision guard that keeps the floating blocks (MANUAL ENTRIES, CLADDING)
 * out of the fixed spec rows.
 */
import { describe, it, expect } from "vitest";
import { buildDropInSheet, dropInSheetToTSV, type QSExportData } from "../../src/lib/iq-qs-export";
import {
  SPECS,
  SPEC_BLOCK_HEADER_ROW,
  SPEC_GUARD_ROW,
  specById,
} from "../../src/lib/specs/spec-schema";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";

function cellVal(ws: ReturnType<typeof buildDropInSheet>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v ?? undefined;
}

function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0015",
    clientName: "Test Client",
    address: "23 Main St, Feilding",
    templateId: null,
    createdAt: "",
    floorAreaM2: 100.3,
    perimeterLm: 44.6,
    internalWallLm: null,
    gableSpanM: null,
    firstFloorAreaM2: null,
    studHeightMm: 2400,
    alfrescoAreaM2: 0.9,
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
    clientFirstName: "Test",
    clientSurname: "Client",
    streetAddress: "23 Main St",
    addressLine2: null,
    city: "Feilding",
    email: null,
    phone: null,
    jmwNumber: "JM-0015",
    planVersion: "1",
    exteriorWallLengthLm: 44.6,
    exteriorWallHeightM: 2.4,
    pathsPatioM2: null,
    drivewayM2: null,
    windowsByRoom: {},
    downpipesWhite: 0,
    downpipesColourSteel: 0,
    downpipesPvcColoured: 0,
    garageDoor48x21Std: 0,
    garageDoor48x21Insulated: 0,
    garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0,
    garageDoor27x21Insulated: 0,
    intDoorStandard: 0,
    intDoorUGroove: 0,
    intDoorVGroove: 0,
    intDoorBarnSlider: 0,
    intDoorDouble: 0,
    intDoorCavitySlider: 0,
    ceilingHatch: 0,
    atticStair: 0,
    letterboxUrban: 0,
    washingLine: 0,
    heatPumpWallUnit: 0,
    heatPumpDucted: 0,
    specItems: {},
    openings: null,
    ...over,
  };
}

function paDoor(): Opening {
  return {
    type: "pa_door",
    room: "Laundry",
    height_m: 2.0,
    width_m: 0.86,
    glazed: true,
    cladding: null,
    area_m2: 1.72,
    source: "vision",
    confidence: "medium",
  };
}

describe("SPECIFICATIONS block — coded cells", () => {
  const heating = specById("heating")!;
  const shower = specById("shower")!;
  const cooktop = specById("cooktop")!;

  it("answered specs write code to B and label to C at the fixed row", () => {
    const ws = buildDropInSheet(base({ specifications: { heating: 2, shower: 2 } }));
    expect(cellVal(ws, `B${heating.row}`)).toBe(2);
    expect(cellVal(ws, `C${heating.row}`)).toBe("High wall heat pump");
    expect(cellVal(ws, `B${shower.row}`)).toBe(2);
    expect(cellVal(ws, `C${shower.row}`)).toBe("Tiled wet-floor");
    expect(cellVal(ws, `A${heating.row}`)).toBe("heating");
    expect(cellVal(ws, `D${heating.row}`)).toBe("heating");
  });

  it("unanswered specs leave B and C blank — the export never invents a selection", () => {
    const ws = buildDropInSheet(base({ specifications: { heating: 1 } }));
    expect(cellVal(ws, `B${shower.row}`)).toBeUndefined();
    expect(cellVal(ws, `C${shower.row}`)).toBeUndefined();
    // …but the row is still labelled so the QS contract is visible
    expect(cellVal(ws, `A${shower.row}`)).toBe("shower");
  });

  it("a code outside the spec's option set is dropped, not exported (incl. an N/A 0 — no v2 spec defines one)", () => {
    const ws = buildDropInSheet(base({ specifications: { heating: 99, cooktop: 0 } }));
    expect(cellVal(ws, `B${heating.row}`)).toBeUndefined();
    expect(cellVal(ws, `B${cooktop.row}`)).toBeUndefined();
  });

  it("missing specifications map → all spec rows blank, header still present", () => {
    const ws = buildDropInSheet(base());
    expect(String(cellVal(ws, `A${SPEC_BLOCK_HEADER_ROW}`))).toContain("SPECIFICATIONS (CODED)");
    for (const s of SPECS) expect(cellVal(ws, `B${s.row}`)).toBeUndefined();
  });

  it("every spec row is inside the TSV (clipboard paste carries the whole block)", () => {
    const tsv = dropInSheetToTSV(base({ specifications: { heating: 1 } }));
    const lines = tsv.split("\n");
    const last = SPECS[SPECS.length - 1];
    expect(lines.length).toBeGreaterThanOrEqual(last.row);
    expect(lines[heating.row - 1].split("\t")[1]).toBe("1"); // B column, 1-indexed row
    expect(lines[last.row - 1].split("\t")[0]).toBe(last.id);
  });
});

describe("collision guard — floating blocks never reach the spec rows", () => {
  it("a pathological job (60 manual lines, mixed cladding, gables) stays below the guard row", () => {
    const openings: Opening[] = Array.from({ length: 60 }, paDoor);
    const ws = buildDropInSheet(
      base({
        openings,
        claddingType1: "Brick",
        claddingType2: "Linea",
        elevationSummary: {
          roofType: "gable",
          roofPitchDegrees: 25,
          externalDoorCount: 2,
          gableEndCount: 2,
          drivewayConcretM2: null,
          patioConcreteM2: null,
          totalConcreteM2: null,
          windowCountMatch: null,
          windowCountWarning: null,
        },
      }),
    );
    for (let r = SPEC_GUARD_ROW; r < SPEC_BLOCK_HEADER_ROW; r++) {
      expect(cellVal(ws, `A${r}`), `floating content leaked to row ${r}`).toBeUndefined();
    }
    // the cap summarises the overflow instead of growing into the block
    let foundSummary = false;
    for (let r = 47; r < SPEC_GUARD_ROW; r++) {
      const v = cellVal(ws, `A${r}`);
      if (typeof v === "string" && v.includes("more — see Review Notes")) foundSummary = true;
    }
    expect(foundSummary).toBe(true);
  });

  it("normal jobs are unaffected by the cap", () => {
    const ws = buildDropInSheet(base({ openings: [paDoor(), paDoor()] }));
    const a48 = String(cellVal(ws, "A48") ?? "");
    expect(a48).toContain("Laundry/PA door");
  });
});
