// @vitest-environment node
/**
 * F-022 — vector ↔ vision cross-check (reconciliation slice).
 *
 * Pure unit tests for src/lib/takeoff/reconcile-annotations.ts. The reconciliation layer
 * does NOT change which value the app uses (the prefer-vector seam already chose vector);
 * it adds the missing SIGNAL — a flag wherever the two paths materially disagree, on the
 * same takeoff.notes channel a live reviewer reads.
 *
 * The two canonical fixture cases are pinned here directly (without live calls):
 *   - TRUE POSITIVE  — Harrison garage: vision 2710 vs vector 4800 → flagged.
 *   - TRUE NEGATIVE  — Beddis garage:   vision 4800 vs vector 4800 → not flagged.
 * plus the tolerance boundary (rounding-level diffs absorbed; gross diffs tripped),
 * count reconciliation, and the absent-layer fallback (nothing flagged).
 */
import { describe, it, expect } from "vitest";
import {
  reconcileScalar,
  reconcileVectorVision,
  garageWidthMm,
  MATERIAL_REL_TOLERANCE,
} from "../../src/lib/takeoff/reconcile-annotations";
import type { VectorAnnotations } from "../../src/lib/takeoff/geometry-api";

// ── builders ─────────────────────────────────────────────────────────────────

const usableVector = (over: Partial<VectorAnnotations> = {}): VectorAnnotations => ({
  vector_usable: true,
  garage: null,
  schedule: null,
  openings: null,
  ...over,
});

const garage = (width_mm: number, height_mm = 2100): VectorAnnotations["garage"] => ({
  width_mm,
  height_mm,
  raw: `${height_mm} x ${width_mm}`,
  page: 1,
  distance_px: 95,
});

// ── garageWidthMm (shared parser, larger side = width) ──────────────────────────

describe("garageWidthMm", () => {
  it("reads the width (larger side) from a canonical W×2.1 label", () => {
    expect(garageWidthMm("4.8×2.1")).toBe(4800);
    expect(garageWidthMm("2.7×2.1")).toBe(2700);
  });
  it("reads a raw lone/paired annotation via the shared parseDimsMm", () => {
    expect(garageWidthMm("2,710")).toBe(2710);
    expect(garageWidthMm("2,210 x 4,800")).toBe(4800);
  });
  it("returns null when there is no dimension (vision found no garage)", () => {
    expect(garageWidthMm(null)).toBeNull();
    expect(garageWidthMm("")).toBeNull();
    expect(garageWidthMm("GARAGE")).toBeNull();
  });
});

// ── reconcileScalar (proportional, field-agnostic) ──────────────────────────────

describe("reconcileScalar", () => {
  it("flags a material (gross) disagreement and names both values", () => {
    const r = reconcileScalar("garage_door_width", 2700, 4800, "mm");
    expect(r.status).toBe("disagree");
    expect(r.flag).toContain("2700mm");
    expect(r.flag).toContain("4800mm");
    expect(r.flag).toContain("vector value was preferred");
  });

  it("does NOT flag a rounding-level diff (2210 vs 2200 ≈ 0.5%)", () => {
    const r = reconcileScalar("head_datum", 2210, 2200, "mm");
    expect(r.status).toBe("agree");
    expect(r.flag).toBeNull();
  });

  it("does NOT flag a ±1 count on ~15 (6.7% < 10%)", () => {
    const r = reconcileScalar("window_count", 15, 14, " windows");
    expect(r.status).toBe("agree");
    expect(r.flag).toBeNull();
  });

  it("treats the threshold as proportional, not a hard literal", () => {
    // Same absolute gap (200) is below tolerance at large scale, above it at small scale.
    expect(reconcileScalar("w", 4800, 4600, "mm").status).toBe("agree"); // 4.2%
    expect(reconcileScalar("w", 1000, 800, "mm").status).toBe("disagree"); // 20%
    // The boundary itself: <= tolerance agrees.
    expect(MATERIAL_REL_TOLERANCE).toBeGreaterThan(0);
    expect(reconcileScalar("w", 1000, 1000 * (1 - MATERIAL_REL_TOLERANCE), "mm").status).toBe(
      "agree",
    );
  });

  it("is uncheckable (never flagged) when either value is missing", () => {
    expect(reconcileScalar("w", null, 4800, "mm").status).toBe("uncheckable");
    expect(reconcileScalar("w", 4800, null, "mm").status).toBe("uncheckable");
    expect(reconcileScalar("w", null, 4800, "mm").flag).toBeNull();
  });
});

// ── reconcileVectorVision (the seam) ────────────────────────────────────────────

describe("reconcileVectorVision", () => {
  it("TRUE POSITIVE — Harrison garage: vision 2.7×2.1 vs vector 4800 → flagged", () => {
    const v = usableVector({
      garage: garage(4800, 2150),
      openings: { window_count: 14, widths_raw: ["4,800"], datum_mm: 2150, page: 1 },
    });
    // Vision count 15 vs vector 14 is within tolerance → only the garage disagrees.
    const r = reconcileVectorVision("2.7×2.1", 15, v);
    const gd = r.fields.find((f) => f.field === "garage_door_width")!;
    expect(gd.status).toBe("disagree");
    expect(gd.visionValue).toBe(2700);
    expect(gd.vectorValue).toBe(4800);
    expect(r.flags.length).toBe(1);
    expect(r.note).toContain("garage_door_width");
    // window_count agreed (15 vs 14) — not flagged.
    expect(r.fields.find((f) => f.field === "window_count")!.status).toBe("agree");
  });

  it("TRUE NEGATIVE — Beddis garage: vision 4.8×2.1 vs vector 4800 → no flag", () => {
    const v = usableVector({
      garage: garage(4800, 2210),
      schedule: { head_datum_mm: 2210, datum_repeat: 12, window_count: 13, page: 6 },
    });
    const r = reconcileVectorVision("4.8×2.1", 13, v);
    expect(r.flags).toEqual([]);
    expect(r.note).toBe("");
    expect(r.fields.find((f) => f.field === "garage_door_width")!.status).toBe("agree");
    expect(r.fields.find((f) => f.field === "window_count")!.status).toBe("agree");
  });

  it("flags a materially divergent window count", () => {
    const v = usableVector({
      garage: garage(4800),
      openings: { window_count: 14, widths_raw: ["4,800"], datum_mm: 2150, page: 1 },
    });
    const r = reconcileVectorVision("4.8×2.1", 9, v); // 9 vs 14 = 36% → flag
    expect(r.fields.find((f) => f.field === "window_count")!.status).toBe("disagree");
    expect(r.note).toContain("window_count");
  });

  it("FORCED FALLBACK — absent vector layer cross-checks nothing", () => {
    expect(reconcileVectorVision("2.7×2.1", 15, undefined).fields).toEqual([]);
    expect(reconcileVectorVision("2.7×2.1", 15, null).note).toBe("");
    expect(reconcileVectorVision("2.7×2.1", 15, usableVector({ vector_usable: false })).flags).toEqual(
      [],
    );
  });

  it("does not flag a field the vision path never produced (uncheckable)", () => {
    const v = usableVector({ garage: garage(4800) }); // no schedule/openings → no vector count
    const r = reconcileVectorVision(null, null, v); // vision had no garage and no count
    expect(r.flags).toEqual([]);
    expect(r.fields.every((f) => f.status === "uncheckable")).toBe(true);
  });
});
