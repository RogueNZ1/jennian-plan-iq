// @vitest-environment node
/**
 * Phase 4, Slice 2 — vector widths + counts (ungated).
 *
 * Pure unit tests for the Slice 2 additions to src/lib/takeoff/vector-annotations.ts:
 * opening WIDTHS and window COUNT, both vector-preferred with a working vision
 * fallback, plus the ext-wall heights-incomplete flag that must ride on real output.
 *
 *   1. COUNT: prefer the deterministic vector W-code count (schedule W-codes first,
 *      else floor-plan W-codes — the only vector count on a no-schedule template);
 *      fall back to the vision count when the vector layer is absent/unusable.
 *   2. WIDTHS: prefer the vector opening widths, each parsed through the SAME shared
 *      parseDimsMm (comma/space tolerant); fall back to the vision widths when absent.
 *   3. FORCED FALLBACK: when `vector_annotations` is absent (older engine / scan),
 *      nothing changes — today's vision behaviour is preserved exactly.
 *   4. EXT-WALL GATING: ext-wall area is NOT recomputed by the count override (heights
 *      gated), and applyWindowAggregate flags ext-wall incomplete whenever a glazed
 *      height is unresolved.
 */
import { describe, it, expect } from "vitest";
import {
  resolveWindowCount,
  resolveOpeningWidths,
  visionOpeningWidthsMm,
  preferVectorOpenings,
} from "../../src/lib/takeoff/vector-annotations";
import { aggregateWindows, applyWindowAggregate } from "../../src/lib/takeoff/aggregate-windows";
import type { VectorAnnotations, VectorOpenings } from "../../src/lib/takeoff/geometry-api";
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
    notes: "",
    ...over,
  };
}

const usableVector = (over: Partial<VectorAnnotations> = {}): VectorAnnotations => ({
  vector_usable: true,
  garage: null,
  schedule: null,
  openings: null,
  ...over,
});

const openings = (over: Partial<VectorOpenings> = {}): VectorOpenings => ({
  window_count: 14,
  widths_raw: ["2,400", "1,030", "4,800"],
  datum_mm: 2150,
  page: 1,
  ...over,
});

const openingsVector = (over: Partial<VectorOpenings> = {}): VectorAnnotations =>
  usableVector({ openings: openings(over) });

const scheduleVector = (count: number): VectorAnnotations =>
  usableVector({ schedule: { head_datum_mm: 2210, datum_repeat: 12, window_count: count, page: 6 } });

// ── 1. window count ─────────────────────────────────────────────────────────────

describe("resolveWindowCount", () => {
  it("prefers the schedule W-code count when a schedule is present (Beddis 13)", () => {
    const r = resolveWindowCount(11, scheduleVector(13));
    expect(r.window_count).toBe(13);
    expect(r.source).toBe("vector_schedule");
    expect(r.preferred_vector).toBe(true);
  });

  it("prefers the floor-plan W-code count on a no-schedule template (Harrison 14)", () => {
    const r = resolveWindowCount(9, openingsVector({ window_count: 14 }));
    expect(r.window_count).toBe(14);
    expect(r.source).toBe("vector_openings");
    expect(r.preferred_vector).toBe(true);
  });

  it("prefers the schedule count over the floor-plan count when both exist", () => {
    const v = scheduleVector(13);
    v.openings = openings({ window_count: 11 });
    expect(resolveWindowCount(5, v).source).toBe("vector_schedule");
    expect(resolveWindowCount(5, v).window_count).toBe(13);
  });

  it("falls back to vision when vector_annotations is absent (forced fallback)", () => {
    const r = resolveWindowCount(9, undefined);
    expect(r.window_count).toBe(9);
    expect(r.source).toBe("vision");
    expect(r.preferred_vector).toBe(false);
  });

  it("falls back to vision when the page is not vector_usable", () => {
    const v = openingsVector({ window_count: 14 });
    v.vector_usable = false;
    const r = resolveWindowCount(9, v);
    expect(r.window_count).toBe(9);
    expect(r.source).toBe("vision");
  });

  it("falls back to vision when no vector count is present (openings null, schedule null)", () => {
    const r = resolveWindowCount(7, usableVector());
    expect(r.window_count).toBe(7);
    expect(r.source).toBe("vision");
  });
});

// ── 2. opening widths ───────────────────────────────────────────────────────────

describe("resolveOpeningWidths", () => {
  it("prefers the vector widths, parsed (comma-tolerant) and sorted ascending", () => {
    const r = resolveOpeningWidths([1800, 1800], openingsVector({ widths_raw: ["4,800", "1,030", "2,400"] }));
    expect(r.source).toBe("vector");
    expect(r.preferred_vector).toBe(true);
    expect(r.widths_mm).toEqual([1030, 2400, 4800]);
  });

  it("scales a metre-format vector width through the shared parseDimsMm (4.8 → 4800)", () => {
    const r = resolveOpeningWidths([], openingsVector({ widths_raw: ["4.8", "1.03"] }));
    expect(r.widths_mm).toEqual([1030, 4800]);
  });

  it("falls back to the vision widths when vector_annotations is absent (forced fallback)", () => {
    const r = resolveOpeningWidths([2400, 1030], undefined);
    expect(r.source).toBe("vision");
    expect(r.preferred_vector).toBe(false);
    expect(r.widths_mm).toEqual([1030, 2400]);
  });

  it("falls back to vision when the page is not vector_usable", () => {
    const v = openingsVector();
    v.vector_usable = false;
    const r = resolveOpeningWidths([1200], v);
    expect(r.source).toBe("vision");
    expect(r.widths_mm).toEqual([1200]);
  });

  it("falls back to vision when openings carries no widths", () => {
    const r = resolveOpeningWidths([1200, 900], openingsVector({ widths_raw: [] }));
    expect(r.source).toBe("vision");
    expect(r.widths_mm).toEqual([900, 1200]);
  });
});

describe("visionOpeningWidthsMm", () => {
  it("reads the schedule widths (m → mm) when a schedule is present", () => {
    const t = takeoff({
      windows_schedule: [
        { id: "W01", height_m: 0.9, width_m: 1.03 },
        { id: "W02", height_m: null, width_m: 2.4 },
      ],
    });
    expect(visionOpeningWidthsMm(t)).toEqual([1030, 2400]);
  });

  it("expands floor-plan callouts by qty when there is no schedule", () => {
    const t = takeoff({
      windows_by_room: {
        living: { qty: 2, height_m: 1.2, width_m: 1.8 },
        kitchen: { qty: 1, height_m: 1.0, width_m: 0.9 },
      },
    });
    expect(visionOpeningWidthsMm(t)).toEqual([900, 1800, 1800]);
  });
});

// ── 3. apply count onto a takeoff ───────────────────────────────────────────────

describe("preferVectorOpenings", () => {
  it("overrides window_count with the vector count (Harrison 9 → 14)", () => {
    const t = takeoff({ window_count: 9 });
    const out = preferVectorOpenings(t, openingsVector({ window_count: 14 }));
    expect(out.window_count).toBe(14);
  });

  it("is a no-op when vector and vision agree on the count", () => {
    const t = takeoff({ window_count: 13 });
    const out = preferVectorOpenings(t, scheduleVector(13));
    expect(out).toBe(t);
  });

  it("returns the takeoff unchanged when vector is absent (forced fallback)", () => {
    const t = takeoff({ window_count: 9 });
    expect(preferVectorOpenings(t, undefined)).toBe(t);
  });

  it("does NOT recompute external_wall_area_m2 (ext-wall stays gated on heights)", () => {
    const t = takeoff({ window_count: 9, external_wall_area_m2: 134.22 });
    const out = preferVectorOpenings(t, openingsVector({ window_count: 14 }));
    expect(out.window_count).toBe(14);
    expect(out.external_wall_area_m2).toBe(134.22); // untouched — heights still unresolved
  });
});

// ── 4. ext-wall heights-incomplete flag rides on the field ──────────────────────

describe("applyWindowAggregate — heights-incomplete flag", () => {
  const base = takeoff({ external_wall_lm: 63.8, ceiling_height_m: 2.4, garage_door_size: "4.8×2.1" });

  it("flags ext-wall incomplete when a schedule height is unresolved (null)", () => {
    const agg = aggregateWindows(
      {
        windows: [
          { id: "W01", heightMm: null, widthMm: 1030 }, // height rejected by the safeguard
          { id: "W02", heightMm: 900, widthMm: 600 },
        ],
      },
      null,
    );
    const out = applyWindowAggregate(base, agg);
    expect(out.notes).toContain("external_wall_area_m2 is incomplete");
    expect(out.external_wall_area_m2).not.toBeNull();
  });

  it("does NOT add the heights flag when every schedule height is resolved", () => {
    const agg = aggregateWindows(
      { windows: [{ id: "W01", heightMm: 900, widthMm: 1030 }] },
      null,
    );
    const out = applyWindowAggregate(base, agg);
    expect(out.notes).not.toContain("heights are unresolved");
    expect(out.notes).not.toContain("external_wall_area_m2 is incomplete");
  });
});
