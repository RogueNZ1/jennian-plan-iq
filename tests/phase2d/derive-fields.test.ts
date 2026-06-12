// @vitest-environment node
/**
 * Phase 2d — derived QS fields (ext wall area D21, total area D14).
 *
 * Pure unit tests against src/lib/takeoff/derive-fields.ts. The formulas are
 * validated by hand against BOTH ground-truth jobs, so these tests pin the exact
 * landings: Beddis 109.2 / 167.1 and Harrison 98.07 / 171.99.
 */
import { describe, it, expect } from "vitest";
import {
  computeOpeningAreaM2,
  computeExternalWallAreaM2,
  computeTotalAreaM2,
} from "../../src/lib/takeoff/derive-fields";

describe("computeExternalWallAreaM2 — perimeter × stud − openings (QS D21)", () => {
  it("lands exactly on Beddis 109.2", () => {
    expect(computeExternalWallAreaM2(63.8, 2.4, 43.92)).toBe(109.2);
  });

  it("lands exactly on Harrison 98.07", () => {
    expect(computeExternalWallAreaM2(60.4, 2.4, 46.89)).toBe(98.07);
  });

  it("uses the takeoff stud (2.4), not a raw OCR read (2.42) — 2.42 overshoots", () => {
    // The QS uses the rounded stud. 2.42 would give 110.51 ≠ 109.2, which is why the
    // caller must pass the takeoff stud height, not the raw OCR value.
    expect(computeExternalWallAreaM2(63.8, 2.4, 43.92)).toBe(109.2);
    expect(computeExternalWallAreaM2(63.8, 2.42, 43.92)).not.toBe(109.2);
  });

  it("excludes gable ends — it is purely perimeter × stud, no gable triangles added", () => {
    // 50 × 2.4 = 120 gross; minus 10 of openings = 110. No extra gable area.
    expect(computeExternalWallAreaM2(50, 2.4, 10)).toBe(110);
  });

  it("treats a missing opening area as 0 (gross wall area), still lands", () => {
    expect(computeExternalWallAreaM2(60.4, 2.4, null)).toBe(144.96);
  });

  it("returns null when perimeter or stud is missing", () => {
    expect(computeExternalWallAreaM2(null, 2.4, 43.92)).toBeNull();
    expect(computeExternalWallAreaM2(63.8, null, 43.92)).toBeNull();
  });
});

describe("computeTotalAreaM2 — floor + alfresco (QS D14)", () => {
  it("lands exactly on Beddis 167.1", () => {
    expect(computeTotalAreaM2(165.4, 1.7)).toBe(167.1);
  });

  it("lands exactly on Harrison 171.99", () => {
    expect(computeTotalAreaM2(170.79, 1.2)).toBe(171.99);
  });

  it("falls back to floor area when alfresco is not read", () => {
    expect(computeTotalAreaM2(165.4, null)).toBe(165.4);
  });

  it("returns null when floor area is missing", () => {
    expect(computeTotalAreaM2(null, 1.7)).toBeNull();
  });
});

describe("computeOpeningAreaM2 — sum of every extracted opening", () => {
  it("sums a schedule window set plus the garage door", () => {
    const windowsSchedule = [
      { id: "W01", height_m: 1.3, width_m: 1.8 }, // 2.34
      { id: "W02", height_m: 2.0, width_m: 2.1 }, // 4.20
    ];
    // garage "4.8×2.1" → 4.8 × 2.1 = 10.08. Total = 2.34 + 4.20 + 10.08 = 16.62.
    expect(computeOpeningAreaM2({ windowsSchedule, garageDoorSize: "4.8×2.1" })).toBe(16.62);
  });

  it("prefers the schedule over floor-plan callouts when both are present", () => {
    const windowsSchedule = [{ id: "W01", height_m: 1.0, width_m: 1.0 }]; // 1.00
    const windowsByRoom = { Kitchen: { qty: 5, height_m: 2.0, width_m: 2.0 } }; // would be 20
    expect(computeOpeningAreaM2({ windowsSchedule, windowsByRoom })).toBe(1);
  });

  it("falls back to floor-plan callouts (qty × h × w) when no schedule", () => {
    const windowsByRoom = {
      "Bed 1 (Master)": { qty: 2, height_m: 1.3, width_m: 1.8 }, // 2 × 2.34 = 4.68
      Kitchen: { qty: 1, height_m: 1.5, width_m: 1.3 }, // 1.95
    };
    expect(computeOpeningAreaM2({ windowsByRoom })).toBe(6.63);
  });

  it("skips schedule entries with null dimensions", () => {
    const windowsSchedule = [
      { id: "W01", height_m: 2.0, width_m: 2.0 }, // 4.0
      { id: "W02", height_m: null, width_m: 1.5 }, // skipped
    ];
    expect(computeOpeningAreaM2({ windowsSchedule })).toBe(4);
  });

  it("ignores an unclassified raw garage value (non-standard width → manual review)", () => {
    // "2100x3500" snaps to nothing within tolerance → garage not added; no windows → null.
    expect(computeOpeningAreaM2({ garageDoorSize: "2100x3500" })).toBeNull();
  });

  it("returns null when there are no openings at all", () => {
    expect(computeOpeningAreaM2({})).toBeNull();
    expect(computeOpeningAreaM2({ windowsByRoom: null, garageDoorSize: null })).toBeNull();
  });

  it("recovers the garage area from the Beddis-style raw annotation too", () => {
    // "2,210 x 4,800" → 4.8 × 2.1 (height snapped to 2.1) = 10.08.
    expect(computeOpeningAreaM2({ garageDoorSize: "2,210 x 4,800" })).toBe(10.08);
  });
});

describe("end-to-end formula on both jobs (opening area → ext wall area)", () => {
  it("Beddis: schedule windows summing to 33.84 + garage 10.08 → 43.92 → 109.2", () => {
    // A schedule whose window areas sum to 33.84 (so + garage 10.08 = the QS 43.92).
    const windowsSchedule = [
      { id: "W01", height_m: 2.0, width_m: 2.1 }, // 4.20
      { id: "W02", height_m: 2.0, width_m: 2.1 }, // 4.20
      { id: "W03", height_m: 2.0, width_m: 2.1 }, // 4.20
      { id: "W04", height_m: 2.0, width_m: 2.1 }, // 4.20
      { id: "W05", height_m: 2.4, width_m: 2.1 }, // 5.04
      { id: "W06", height_m: 2.4, width_m: 2.1 }, // 5.04
      { id: "W07", height_m: 1.6, width_m: 1.8 }, // 2.88
      { id: "W08", height_m: 2.0, width_m: 2.04 }, // 4.08
    ]; // sum = 33.84
    const opening = computeOpeningAreaM2({ windowsSchedule, garageDoorSize: "4.8×2.1" });
    expect(opening).toBe(43.92);
    expect(computeExternalWallAreaM2(63.8, 2.4, opening)).toBe(109.2);
  });
});
