/**
 * NO SILENT DROP — regression tests from the 12 Jun live failures.
 *
 * JM-0027 (wing plan): vision extracted 13 windows; the export printed 6 and
 * silently dropped Media (4), generic "Bedroom" (2), Laundry (1).
 * JM-0029 (orthogonal): vision extracted 2 ("Unknown" room); the export printed 0.
 *
 * Law under test: every extracted window is either placed in an IQ slot row or
 * surfaced as a flagged UNPLACED manual line — and B15 always shows the true total.
 */
import { describe, it, expect } from "vitest";
import { buildDropInSheet, type QSExportData } from "../../src/lib/iq-qs-export";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";

function cellVal(ws: ReturnType<typeof buildDropInSheet>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v ?? undefined;
}

function manualText(ws: ReturnType<typeof buildDropInSheet>): string {
  const lines: string[] = [];
  for (let r = 47; r <= 80; r++) {
    const v = cellVal(ws, `A${r}`);
    if (typeof v === "string") lines.push(v);
  }
  return lines.join("\n");
}

function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0027",
    clientName: "Test Client",
    address: "Full Test",
    templateId: null,
    createdAt: "",
    floorAreaM2: 199,
    perimeterLm: 80,
    firstFloorAreaM2: null,
    studHeightMm: 2400,
    alfrescoAreaM2: 1.1,
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
    streetAddress: "1 Test St",
    addressLine2: null,
    city: "Feilding",
    email: null,
    phone: null,
    jmwNumber: "JM-0027",
    planVersion: "1",
    exteriorWallLengthLm: 80,
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

function op(type: Opening["type"], room: string | null, h: number, w: number): Opening {
  return {
    type,
    room,
    height_m: h,
    width_m: w,
    glazed: type !== "sectional_door",
    cladding: null,
    area_m2: h * w,
    source: "vision",
    confidence: "medium",
  };
}

/** JM-0027 stored shape: 13 vision windows, 7 of which had no slot pre-fix. */
const JM0027_OPENINGS: Opening[] = [
  op("window", "Bed 1 (Master)", 0.6, 1.5),
  op("window", "Bed 1 (Master)", 0.6, 1.5),
  op("window", "Ensuite", 1.52, 2.01),
  op("window", "Ensuite", 1.52, 2.01),
  op("window", "Bed 4", 1.35, 0.9),
  op("window", "Media", 1.8, 0.9),
  op("window", "Media", 1.8, 0.9),
  op("window", "Media", 1.8, 0.9),
  op("window", "Media", 1.8, 0.9),
  op("window", "Bedroom", 1.2, 0.9),
  op("window", "Bedroom", 1.2, 0.9),
  op("window", "Laundry", 1.1, 0.6),
  op("garage_window", "Garage", 0.6, 0.6),
];

describe("export never silently drops a window (JM-0027 regression)", () => {
  const ws = buildDropInSheet(base({ openings: JM0027_OPENINGS }));

  it("B15 shows the TRUE total (13), not the placed subset (6)", () => {
    expect(cellVal(ws, "B15")).toBe(13);
  });

  it("mapped rooms still land in their slot rows", () => {
    expect(cellVal(ws, "B33")).toBe(2); // Bed 1
    expect(cellVal(ws, "B34")).toBe(2); // Ensuite
    expect(cellVal(ws, "B37")).toBe(1); // Bed 4
    expect(cellVal(ws, "B43")).toBe(1); // Garage window
  });

  it("conservation: placed + unplaced-flagged === extracted", () => {
    let placed = 0;
    for (const r of [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43]) {
      const v = cellVal(ws, `B${r}`);
      placed += typeof v === "number" ? v : 0;
    }
    const m = manualText(ws);
    let flagged = 0;
    for (const line of m.split("\n")) {
      const hit = line.match(/UNPLACED - .*?: (\d+) window/);
      if (hit) flagged += Number(hit[1]);
    }
    expect(placed + flagged).toBe(13);
  });

  it("Media, generic Bedroom, and Laundry each surface as flagged manual lines with dims", () => {
    const m = manualText(ws);
    expect(m).toMatch(/UNPLACED - Media: 4 window/);
    expect(m).toMatch(/UNPLACED - Bedroom: 2 window/);
    expect(m).toMatch(/UNPLACED - Laundry: 1 window/);
    expect(m).toMatch(/7 of 13 windows have NO IQ slot/);
  });
});

describe("JM-0029 regression: weak extraction is shown, not zeroed", () => {
  const ws = buildDropInSheet(
    base({
      jobNumber: "JM-0029",
      openings: [op("window", "Unknown", 1.0, 0.51), op("window", "Unknown", 1.0, 0.51)],
    }),
  );

  it("B15 shows 2 (pre-fix it showed 0)", () => {
    expect(cellVal(ws, "B15")).toBe(2);
  });

  it("the Unknown-room windows are flagged with dims", () => {
    expect(manualText(ws)).toMatch(/UNPLACED - Unknown: 2 window/);
  });
});

describe("JM-0045 regression: abbreviated Ens maps to the Ensuite slot", () => {
  const ws = buildDropInSheet(base({ openings: [op("window", "Ens", 1.8, 0.6)] }));

  it("routes Ens into IQ Import row 34 instead of flagging it unplaced", () => {
    expect(cellVal(ws, "B34")).toBe(1);
    expect(cellVal(ws, "C34")).toBe(1.8);
    expect(cellVal(ws, "D34")).toBe(0.6);
    expect(manualText(ws)).not.toMatch(/UNPLACED — Ens/);
  });
});

describe("zero-window hard sanity flag", () => {
  it("fires when extraction ran and produced nothing", () => {
    const ws = buildDropInSheet(base({ openings: [] }));
    expect(cellVal(ws, "B15")).toBe(0);
    expect(manualText(ws)).toMatch(/ZERO WINDOWS EXTRACTED/);
    expect(manualText(ws)).toMatch(/DO NOT price/);
  });

  it("does NOT fire when no extraction data was wired at all", () => {
    const ws = buildDropInSheet(base({ openings: null, windowsByRoom: {} }));
    expect(manualText(ws)).not.toMatch(/ZERO WINDOWS EXTRACTED/);
  });

  it("does NOT fire when opening pricing is deliberately blocked", () => {
    const ws = buildDropInSheet(base({ openings: [], openingPricingBlocked: true }));
    expect(manualText(ws)).toMatch(/Opening reconciliation blocked/);
    expect(manualText(ws)).not.toMatch(/ZERO WINDOWS EXTRACTED/);
  });
});
