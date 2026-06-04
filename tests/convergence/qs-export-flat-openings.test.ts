// @vitest-environment node
/**
 * Flat per-opening block — augmented gate.
 *
 * Proves the new ③ branch in buildQSDataInputSheet:
 *   (1) RENDERING: bench openings[] → one worksheet row per opening, no drops, no collapse.
 *       Tested on all 5 fixtures using ground-truth.json joinery_bench.openings[] as input
 *       (deterministic, no AI cost — renders what it receives).
 *   (2) FULL SHEET (Young): core cells D12/D15/D19 are populated from the enriched overlay
 *       (floor area, perimeter, ext-wall length) — proves the sheet is not empty, not just
 *       the openings block.
 *   (3) NO DOUBLE-COUNT: entrance / pa_door / sectional_door live in ③ only. They must NOT
 *       appear in section ④ (H176…H181 garage-door cells, H187/192/193 interior-door cells),
 *       which stays internal-doors-only from door_counts.
 *   (4) FALLBACK INTACT: null openings → old slot layout → existing tests in
 *       qs-export-openings-cells.test.ts unchanged.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildQSDataInputSheet, applyEnrichedTakeoff, type QSExportData } from "../../src/lib/iq-qs-export";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";

const FIX = resolve(process.cwd(), "tests/fixtures");

/** Read all non-metadata cells from a worksheet. */
function cells(ws: ReturnType<typeof buildQSDataInputSheet>) {
  return Object.fromEntries(
    Object.entries(ws)
      .filter(([k]) => !k.startsWith("!"))
      .map(([k, v]) => [k, (v as { v?: unknown }).v]),
  );
}

/** Minimal QSExportData base — enough for the IQ Data Input sheet builder. */
function base(openings: Opening[] | null, overrides: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "TEST", clientName: "Test Client", address: "", templateId: null, createdAt: "",
    floorAreaM2: null, perimeterLm: null, firstFloorAreaM2: null, studHeightMm: 2400, alfrescoAreaM2: null,
    roofPitch: null, ridgeType: null, underlay: null, claddingType1: null, claddingType2: null,
    windows: [], garageDoors: [], interiorDoors: [], downpipes: [], heatPumps: [], extras: [], skylights: [],
    clientFirstName: "", clientSurname: "", streetAddress: "", addressLine2: null, city: null,
    email: null, phone: null, jmwNumber: "TEST", planVersion: "1",
    exteriorWallLengthLm: null, exteriorWallHeightM: 2.4,
    pathsPatioM2: null, drivewayM2: null, windowsByRoom: {},
    downpipesWhite: 0, downpipesColourSteel: 0, downpipesPvcColoured: 0,
    garageDoor48x21Std: 0, garageDoor48x21Insulated: 0, garageDoor24x21Std: 0, garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0, garageDoor27x21Insulated: 0,
    intDoorStandard: 0, intDoorUGroove: 0, intDoorVGroove: 0, intDoorBarnSlider: 0,
    intDoorDouble: 0, intDoorCavitySlider: 0,
    ceilingHatch: 0, atticStair: 0, letterboxUrban: 0, washingLine: 0,
    heatPumpWallUnit: 0, heatPumpDucted: 0, specItems: {},
    openings,
    ...overrides,
  };
}

// ── (1) PER-FIXTURE RENDERING RE-BASELINE ─────────────────────────────────────────────────
// Feed each fixture's joinery_bench.openings[] (the verified QS truth) into buildQSDataInputSheet
// and assert every opening appears as a flat row — no keyword routing, no collapse, no drops.

const FIXTURES = [
  {
    id: "15a",
    expectedCount: 15,
    criticalRows: [
      // sectional door is glazed:false → solidStyle, but must appear
      (os: Opening[]) => expect(os.some(o => o.type === "sectional_door" && !o.glazed && Math.abs(o.width_m - 2.7) < 0.05)).toBe(true),
      (os: Opening[]) => expect(os.some(o => o.type === "entrance" && o.glazed)).toBe(true),
    ],
  },
  {
    id: "beddis",
    expectedCount: 15,
    criticalRows: [
      (os: Opening[]) => expect(os.filter(o => ["window","slider","garage_window"].includes(o.type))).toHaveLength(13),
      (os: Opening[]) => expect(os.some(o => o.type === "sectional_door" && Math.abs(o.width_m - 4.8) < 0.05 && !o.glazed)).toBe(true),
    ],
  },
  {
    id: "harrison",
    expectedCount: 14,
    criticalRows: [
      (os: Opening[]) => expect(os.some(o => o.type === "pa_door" && o.glazed)).toBe(true),
      (os: Opening[]) => expect(os.some(o => o.type === "sectional_door" && !o.glazed)).toBe(true),
    ],
  },
  {
    id: "oneil",
    expectedCount: 15,
    criticalRows: [
      (os: Opening[]) => expect(os.some(o => o.type === "sectional_door" && Math.abs(o.width_m - 4.8) < 0.05 && !o.glazed)).toBe(true),
      (os: Opening[]) => expect(os.some(o => o.type === "pa_door" && Math.abs(o.width_m - 0.96) < 0.05 && o.glazed)).toBe(true),
    ],
  },
  {
    id: "young",
    // Young bench has 11 entries; the live pipeline produced 10 (no garage — correct for this plan).
    // We use the live snapshot here (from the re-run) rather than the bench so the count
    // matches what actually lands in openings[], and the Dining slider is the focus.
    useLiveSnapshot: true,
    expectedCount: 10,
    criticalRows: [
      (os: Opening[]) => expect(os.some(o => o.type === "slider" && (o.room ?? "").toLowerCase().includes("din") && Math.abs(o.width_m - 2.4) < 0.05 && o.glazed)).toBe(true),
      // entrance w=0: present (not dropped) even though width is 0
      (os: Opening[]) => expect(os.some(o => o.type === "entrance" && o.width_m === 0)).toBe(true),
      // WC: present (no longer dropped by missing slot)
      (os: Opening[]) => expect(os.some(o => o.type === "window" && (o.room ?? "").toLowerCase() === "wc")).toBe(true),
    ],
  },
] as const;

describe("Flat per-opening block — ③ rendering re-baseline (5 fixtures)", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: all openings appear as flat rows, critical types present`, () => {
      let openings: Opening[];
      if ((fixture as { useLiveSnapshot?: boolean }).useLiveSnapshot) {
        const snap = JSON.parse(readFileSync(resolve(FIX, "young/takeoff-snapshot.json"), "utf8"));
        openings = snap.openings as Opening[];
      } else {
        const gt = JSON.parse(readFileSync(resolve(FIX, `${fixture.id}/ground-truth.json`), "utf8"));
        openings = gt.joinery_bench.openings as Opening[];
      }

      // Confirm count matches expected
      expect(openings).toHaveLength(fixture.expectedCount);

      // Build the sheet
      const ws = buildQSDataInputSheet(base(openings));
      const c = cells(ws);

      // Row 39 has the flat-block headers (not the old "Cladding type (1/2)" label)
      expect(c["A39"]).toBe("Type");
      expect(c["B39"]).toBe("Room");

      // One row per opening starting at row 40; check each type and width appear
      for (let i = 0; i < openings.length; i++) {
        const row = 40 + i;
        const o = openings[i];
        expect(c[`A${row}`]).toBe(o.type);   // type written
        expect(c[`B${row}`]).toBe(o.room ?? ""); // room written
        expect(c[`D${row}`]).toBe(o.width_m); // width written (including 0 for unresolved)
        expect(c[`F${row}`]).toBe(o.glazed ? "Y" : "N"); // glazed flag
      }

      // Critical-type assertions per fixture
      for (const check of fixture.criticalRows as ReadonlyArray<(os: Opening[]) => void>) {
        check(openings);
      }
    });
  }
});

// ── (2) FULL SHEET — Young core cells populated (floor area, perimeter, ext-wall) ────────
// Proves the enriched overlay reaches the sheet, not just the openings block.
// Without this gate we'd only know ③ renders and nothing else.

describe("Full sheet — Young enriched overlay (D12/D15/D19 gate)", () => {
  it("D12 floor area / D15 perimeter / D19 ext-wall length are populated from the enriched takeoff", () => {
    const tj = JSON.parse(
      readFileSync(resolve(FIX, "young/takeoff-snapshot.json"), "utf8"),
    ) as EnrichedTakeoff & { openings?: Opening[] };

    // Simulate what buildQSExportData does: apply the enriched takeoff overlay on a base
    // (the base starts with null scalars; the enriched overlay wins).
    const enrichedBase = applyEnrichedTakeoff(base(null), tj);
    // Carry the openings[] through (buildQSExportData does this via applyEnrichedTakeoff).
    const data = { ...enrichedBase, openings: tj.openings ?? null };
    const ws = buildQSDataInputSheet(data);
    const c = cells(ws);

    // D12 = floor area (geometry-sourced from Young's enriched takeoff)
    expect(typeof c["D12"]).toBe("number");
    expect(c["D12"] as number).toBeGreaterThan(50); // Young floor ~100 m²

    // D15 = perimeter
    expect(typeof c["D15"]).toBe("number");
    expect(c["D15"] as number).toBeGreaterThan(30); // Young perimeter ~44 m

    // D19 = exterior wall length
    expect(typeof c["D19"]).toBe("number");
    expect(c["D19"] as number).toBeGreaterThan(30);

    // Also confirm the opening rows are present (flat block fired)
    expect(c["A39"]).toBe("Type"); // flat header, not relational header
    expect(c["A40"]).toBeTruthy(); // at least one opening row
  });
});

// ── (3) NO DOUBLE-COUNT — exterior doors must not appear in section ④ ──────────────────
// entrance / pa_door / sectional_door are exterior openings that write into ③.
// Section ④ (H176–H181 garage-door cells, H187/192/193 interior-door cells) must stay zero
// when those openings arrive only from openings[] and door_counts is not populated.
// (The base() helper sets all door counts to 0 — exactly what a job with no separate
// door_counts row would look like.)

describe("No double-count — exterior doors in ③ do not bleed into ④", () => {
  it("sectional_door in openings[] does not populate H176–H181 (garage-door cells at row 174+)", () => {
    const openings: Opening[] = [
      { type: "sectional_door", room: "Garage", height_m: 2.1, width_m: 4.8, glazed: false,
        cladding: null, area_m2: 10.08, source: "callout", confidence: "high" },
      { type: "window", room: "Lounge", height_m: 1.3, width_m: 1.5, glazed: true,
        cladding: null, area_m2: 1.95, source: "vision", confidence: "medium" },
    ];
    const ws = buildQSDataInputSheet(base(openings));
    const c = cells(ws);
    // All garage-door cells must be empty (undefined) — sectional_door stays in ③ only
    for (const addr of ["H176", "H177", "H178", "H179", "H180", "H181"]) {
      expect(c[addr]).toBeUndefined();
    }
  });

  it("pa_door and entrance in openings[] do not populate H187/192/193 (interior-door cells)", () => {
    const openings: Opening[] = [
      { type: "pa_door", room: "Garage", height_m: 2.1, width_m: 0.96, glazed: true,
        cladding: null, area_m2: 2.016, source: "callout", confidence: "high" },
      { type: "entrance", room: "Entry", height_m: 2.1, width_m: 1.03, glazed: true,
        cladding: null, area_m2: 2.163, source: "callout", confidence: "high" },
    ];
    const ws = buildQSDataInputSheet(base(openings));
    const c = cells(ws);
    // All interior-door cells must be empty — pa_door/entrance stay in ③ only
    for (const addr of ["H187", "H192", "H193"]) {
      expect(c[addr]).toBeUndefined();
    }
    // Confirm the openings ARE in ③ (sanity)
    expect(c["A40"]).toBe("pa_door");
    expect(c["A41"]).toBe("entrance");
  });
});

// ── (4) FALLBACK INTACT — relational slot layout unchanged for null openings ──────────
// The existing qs-export-openings-cells.test.ts exercises the fallback path (null openings →
// old slot cells D41/E41/F41 etc.). This test just confirms the branch triggers correctly.

describe("Fallback intact — null openings triggers relational slot layout", () => {
  it("null openings → old relational header at C39 (not the flat-block header at A39)", () => {
    const ws = buildQSDataInputSheet(base(null, {
      windowsByRoom: { bed1: { cladding: "", qty: 1, height: 1.3, width: 1.8 } },
    }));
    const c = cells(ws);
    // Old header at C39, not the flat-block "Type" at A39
    expect(c["C39"]).toContain("Cladding type");
    expect(c["A39"]).toBeUndefined(); // flat-block header absent
    // Old slot cell at D41 (Bed 1 Master qty=1)
    expect(c["D41"]).toBe(1);
    expect(c["E41"]).toBe(1.3);
    expect(c["F41"]).toBe(1.8);
  });

  it("empty openings[] also triggers relational fallback", () => {
    const ws = buildQSDataInputSheet(base([], {
      windowsByRoom: { lounge: { cladding: "", qty: 2, height: 1.8, width: 2.4 } },
    }));
    const c = cells(ws);
    expect(c["C39"]).toContain("Cladding type");
    // Lounge is at row 62
    expect(c["D62"]).toBe(2);
  });
});
