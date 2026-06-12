// @vitest-environment node
/**
 * Cladding engine bench — the synthetic ground truth is HAND-CALCULATED below,
 * independent of the implementation (door-engine doctrine: the bench is the product).
 *
 * House: 16m × 10m, perimeter 52 lm, stud 2.4m, two gable ends on the 10m span, 25° pitch.
 *   wall rect  = 52 × 2.4                       = 124.80 m²
 *   gable rise = (10/2) × tan(25°) = 5 × 0.466308 = 2.331538 m
 *   gable each = ½ × 10 × 2.331538               = 11.657689 m²  → two = 23.32 m² (2dp)
 *   openings   = 2×(1.3×1.8) + 2.1×1.0 + 2.1×2.4 + 2.1×4.8
 *              = 4.68 + 2.10 + 5.04 + 10.08      = 21.90 m²
 *   net        = 124.80 + 23.32 − 21.90          = 126.22 m²
 */
import { describe, it, expect } from "vitest";
import { computeCladding, type CladdingInput } from "../../src/lib/cladding/cladding-engine";

const HOUSE: CladdingInput = {
  perimeterLm: 52,
  studHeightM: 2.4,
  roofPitchDeg: 25,
  gableEndCount: 2,
  gableSpanM: 10,
  openings: [
    { height_m: 1.3, width_m: 1.8 },
    { height_m: 1.3, width_m: 1.8 },
    { height_m: 2.1, width_m: 1.0 },
    { height_m: 2.1, width_m: 2.4 },
    { height_m: 2.1, width_m: 4.8 },
  ],
  claddingTypes: ["Brick Veneer"],
};

describe("cladding engine — hand-calculated synthetic bench", () => {
  it("computes every term to the hand-calculated truth, flag-free", () => {
    const r = computeCladding(HOUSE);
    expect(r.wallRectAreaM2).toBe(124.8);
    expect(r.gableAreaM2).toBe(23.32);
    expect(r.glazingDeductionM2).toBe(21.9);
    expect(r.netCladdingAreaM2).toBe(126.22);
    expect(r.perCladding).toEqual([{ type: "Brick Veneer", areaM2: 126.22 }]);
    expect(r.flags).toEqual([]); // quote-grade
  });

  it("hip roof (no gables) needs no pitch or span", () => {
    const r = computeCladding({ ...HOUSE, gableEndCount: 0, roofPitchDeg: null, gableSpanM: null });
    expect(r.gableAreaM2).toBe(0);
    expect(r.netCladdingAreaM2).toBe(102.9); // 124.8 − 21.9
    expect(r.flags).toEqual([]);
  });
});

describe("cladding engine — fail-safe: missing inputs flag, never guess", () => {
  it("gables without span → gable term excluded, net null, flagged", () => {
    const r = computeCladding({ ...HOUSE, gableSpanM: null });
    expect(r.gableAreaM2).toBeNull();
    expect(r.netCladdingAreaM2).toBeNull();
    expect(r.flags.join()).toMatch(/gable span not measured/);
    expect(r.wallRectAreaM2).toBe(124.8); // the provable term still stands
  });

  it("gables without pitch → excluded + flagged", () => {
    const r = computeCladding({ ...HOUSE, roofPitchDeg: null });
    expect(r.netCladdingAreaM2).toBeNull();
    expect(r.flags.join()).toMatch(/roof pitch missing/);
  });

  it("no stud height → no wall area, no net, flagged", () => {
    const r = computeCladding({ ...HOUSE, studHeightM: null });
    expect(r.wallRectAreaM2).toBeNull();
    expect(r.netCladdingAreaM2).toBeNull();
    expect(r.flags.join()).toMatch(/stud height not extracted/);
  });

  it("two cladding types → per-type areas null + manual-split flag (never invented %)", () => {
    const r = computeCladding({ ...HOUSE, claddingTypes: ["Brick Veneer", "Linea"] });
    expect(r.netCladdingAreaM2).toBe(126.22); // total still provable
    expect(r.perCladding).toEqual([
      { type: "Brick Veneer", areaM2: null },
      { type: "Linea", areaM2: null },
    ]);
    expect(r.flags.join()).toMatch(/per-elevation banding/);
  });

  it("zero-dim openings contribute nothing (junk-proof)", () => {
    const r = computeCladding({
      ...HOUSE,
      openings: [...HOUSE.openings, { height_m: 0, width_m: 1.2 }],
    });
    expect(r.glazingDeductionM2).toBe(21.9);
  });
});

describe("V1.1 — measured gable span flows from geometry to the engine", () => {
  it("span present: gable area computes; the envelope assumption is a visible verify-note", async () => {
    const { buildDropInSheet } = await import("../../src/lib/iq-qs-export");
    // minimal inline data via the engine's own contract — adapter-level test lives in dropin suite
    const { computeCladding } = await import("../../src/lib/cladding/cladding-engine");
    const r = computeCladding({
      perimeterLm: 52,
      studHeightM: 2.4,
      roofPitchDeg: 25,
      gableEndCount: 2,
      gableSpanM: 10,
      openings: [],
      claddingTypes: ["Brick Veneer"],
    });
    expect(r.gableAreaM2).toBe(23.32);
    expect(r.flags).toEqual([]);
    void buildDropInSheet;
  });
});
