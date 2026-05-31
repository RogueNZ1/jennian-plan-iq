// @vitest-environment node
/**
 * Phase 4, Slice 3 — asserted entrance door.
 *
 * Pure unit tests for the entrance additions to vector-annotations.ts and the F-022
 * entrance cross-check. The entry door has an ASSERTED height and a DATA-DRIVEN-OR-UNKNOWN
 * width (two probes proved the ~1400 frame width is not recoverable as text or geometry):
 *
 *   - HEIGHT is always the building standard (2.1m), flagged assumed.
 *   - WIDTH is the printed frame-to-frame number when the engine read one
 *     (width_source "vector_text", e.g. Harrison 1430). Otherwise it is UNRESOLVED
 *     (width_mm null, width_source "unresolved", e.g. Beddis) and flagged for confirmation
 *     — NEVER asserted to a standard, because entry widths vary (a fixed value would be an
 *     overfit to one job's QS).
 *   - The door is folded into the opening SET (windows_by_room.entrance) ONLY when the
 *     width is known; an unknown-width door is flagged and left out of the opening area.
 *     Ext-wall area is NOT recomputed either way — it stays gated on the window heights.
 *   - F-022 cross-checks the entrance width only when BOTH paths have one (vision reads no
 *     entry door, and the vector width is single-source/unresolved → uncheckable, no flag).
 */
import { describe, it, expect } from "vitest";
import {
  resolveEntrance,
  preferVectorEntrance,
  entranceAssumptionNote,
} from "../../src/lib/takeoff/vector-annotations";
import { reconcileVectorVision } from "../../src/lib/takeoff/reconcile-annotations";
import { computeOpeningAreaM2 } from "../../src/lib/takeoff/derive-fields";
import type { VectorAnnotations, VectorEntrance } from "../../src/lib/takeoff/geometry-api";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";

// ── builders ─────────────────────────────────────────────────────────────────

function takeoff(over: Partial<TakeoffData> = {}): TakeoffData {
  return {
    floor_area_m2: 165.4,
    garage_area_m2: null,
    alfresco_area_m2: null,
    external_wall_lm: 63.8,
    internal_wall_lm: null,
    roof_area_m2: null,
    window_count: null,
    external_door_count: null,
    internal_door_count: null,
    bathroom_count: null,
    ensuite_count: null,
    laundry_count: null,
    kitchen_count: null,
    ceiling_height_m: 2.4,
    foundation_type: null,
    windows_by_room: null,
    door_breakdown: null,
    garage_door_size: null,
    external_wall_area_m2: 109.2,
    notes: "",
    ...over,
  };
}

const usableVector = (over: Partial<VectorAnnotations> = {}): VectorAnnotations => ({
  vector_usable: true,
  garage: null,
  schedule: null,
  openings: null,
  entrance: null,
  ...over,
});

const entrance = (over: Partial<VectorEntrance> = {}): VectorEntrance => ({
  type: "entry",
  width_mm: null,
  width_source: "unresolved",
  height_mm: 2100,
  height_source: "standard_assumed",
  label: "ENTRY",
  page: 2,
  ...over,
});

// Beddis: no printed frame token → width UNRESOLVED (null), height asserted 2100.
const beddisVector = usableVector({ entrance: entrance() });
// Harrison: printed "Frame to Frame 1430" → data-driven width 1430, asserted height.
const harrisonVector = usableVector({
  entrance: entrance({ width_mm: 1430, width_source: "vector_text", label: "PORCH", page: 1 }),
});

// ── 1. resolveEntrance ─────────────────────────────────────────────────────────

describe("resolveEntrance", () => {
  it("leaves width unresolved (null), asserts the 2.1 height when no frame token (Beddis)", () => {
    const r = resolveEntrance(beddisVector);
    expect(r.applied).toBe(true);
    expect(r.entrance).toEqual({ qty: 1, height_m: 2.1, width_m: null });
    expect(r.widthSource).toBe("unresolved");
  });

  it("uses the printed frame-to-frame width, asserts the height (Harrison)", () => {
    const r = resolveEntrance(harrisonVector);
    expect(r.applied).toBe(true);
    expect(r.entrance).toEqual({ qty: 1, height_m: 2.1, width_m: 1.43 });
    expect(r.widthSource).toBe("vector_text");
  });

  it("does nothing when the vector layer is absent / unusable / has no entrance", () => {
    expect(resolveEntrance(undefined).applied).toBe(false);
    expect(resolveEntrance(usableVector({ entrance: null })).applied).toBe(false);
    expect(resolveEntrance({ ...beddisVector, vector_usable: false }).applied).toBe(false);
  });
});

// ── 2. preferVectorEntrance ────────────────────────────────────────────────────

describe("preferVectorEntrance", () => {
  it("folds the door into the opening set when the width is known (Harrison)", () => {
    const out = preferVectorEntrance(takeoff(), harrisonVector);
    expect(out.windows_by_room?.entrance).toEqual({ qty: 1, height_m: 2.1, width_m: 1.43 });
  });

  it("does NOT fold an unknown-width door into the opening set (Beddis no-op)", () => {
    const base = takeoff();
    const out = preferVectorEntrance(base, beddisVector);
    expect(out).toBe(base); // unresolved width → returned untouched, no fabricated entry
    expect(out.windows_by_room?.entrance).toBeUndefined();
  });

  it("preserves existing windows_by_room rooms", () => {
    const base = takeoff({ windows_by_room: { bed1: { qty: 1, height_m: 1.2, width_m: 1.8 } } });
    const out = preferVectorEntrance(base, harrisonVector);
    expect(out.windows_by_room?.bed1).toEqual({ qty: 1, height_m: 1.2, width_m: 1.8 });
    expect(out.windows_by_room?.entrance).toEqual({ qty: 1, height_m: 2.1, width_m: 1.43 });
  });

  it("does NOT recompute external_wall_area_m2 even when it folds (ext-wall stays gated)", () => {
    const out = preferVectorEntrance(takeoff({ external_wall_area_m2: 109.2 }), harrisonVector);
    expect(out.external_wall_area_m2).toBe(109.2); // unchanged — heights still gate it
  });

  it("is a no-op (returns the same object) when there is no usable entrance", () => {
    const base = takeoff();
    expect(preferVectorEntrance(base, undefined)).toBe(base);
    expect(preferVectorEntrance(base, usableVector({ entrance: null }))).toBe(base);
  });

  it("the known-width entrance area lands in computeOpeningAreaM2 once applied", () => {
    const out = preferVectorEntrance(takeoff(), harrisonVector);
    const area = computeOpeningAreaM2({ windowsByRoom: out.windows_by_room });
    expect(area).toBe(3); // round2(1.43 × 2.1 = 3.003) = 3.00 m²
  });
});

// ── 3. entranceAssumptionNote ──────────────────────────────────────────────────

describe("entranceAssumptionNote", () => {
  it("flags the height assumption and the UNRESOLVED width (Beddis)", () => {
    const note = entranceAssumptionNote(beddisVector);
    expect(note).toContain("height assumed standard 2.1m");
    expect(note).toContain("width not found on the plan"); // honest unknown, not asserted
    expect(note).not.toContain("assumed standard 1.4"); // never fabricates a width
    expect(note).toContain("not recomputed"); // ext-wall honesty rail
  });

  it("flags the height assumption but credits the printed width (Harrison)", () => {
    const note = entranceAssumptionNote(harrisonVector);
    expect(note).toContain("height assumed standard 2.1m");
    expect(note).toContain("width 1.43m read from the printed frame-to-frame dimension");
  });

  it("is empty when there is no usable entrance (filterable away)", () => {
    expect(entranceAssumptionNote(undefined)).toBe("");
    expect(entranceAssumptionNote(usableVector({ entrance: null }))).toBe("");
  });
});

// ── 4. F-022 entrance cross-check ───────────────────────────────────────────────

describe("reconcileVectorVision — entrance width", () => {
  it("is uncheckable when vision read no entry door (single-source, no false flag)", () => {
    const r = reconcileVectorVision(null, null, harrisonVector, null);
    const f = r.fields.find((x) => x.field === "entrance_door_width");
    expect(f?.status).toBe("uncheckable");
    expect(r.flags).toHaveLength(0);
  });

  it("agrees when a vision entrance width matches the vector width within tolerance", () => {
    // vision 1400 vs vector printed 1430 = 2.1% apart → agree (under 10%).
    const r = reconcileVectorVision(null, null, harrisonVector, 1400);
    const f = r.fields.find((x) => x.field === "entrance_door_width");
    expect(f?.status).toBe("agree");
    expect(r.flags).toHaveLength(0);
  });

  it("disagrees + flags when the two paths materially diverge (printed vector width)", () => {
    // vision read the 900 leaf, vector printed the 1430 frame = 37% apart → flag.
    const r = reconcileVectorVision(null, null, harrisonVector, 900);
    const f = r.fields.find((x) => x.field === "entrance_door_width");
    expect(f?.status).toBe("disagree");
    expect(r.note).toContain("entrance_door_width");
  });

  it("is uncheckable when the vector width is unresolved, even if vision read one (Beddis)", () => {
    // Beddis vector width is null (unresolved) → no comparison possible → no false flag.
    const r = reconcileVectorVision(null, null, beddisVector, 900);
    const f = r.fields.find((x) => x.field === "entrance_door_width");
    expect(f?.status).toBe("uncheckable");
    expect(f?.vectorValue).toBeNull();
    expect(r.flags).toHaveLength(0);
  });

  it("adds no entrance field when the vector layer carries no entrance", () => {
    const r = reconcileVectorVision(null, null, usableVector({ entrance: null }), 1400);
    expect(r.fields.find((x) => x.field === "entrance_door_width")).toBeUndefined();
  });
});
