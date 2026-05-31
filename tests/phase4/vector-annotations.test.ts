// @vitest-environment node
/**
 * Phase 4, Slice 1 — vector-first seam (TWO proven fields only).
 *
 * Pure unit tests for src/lib/takeoff/vector-annotations.ts — the single place the app
 * consumes the geometry engine's additive `vector_annotations`. Pins the two fields the
 * slice ships and, just as importantly, the backward-compatible fallback contract:
 *
 *   1. GARAGE: prefer the deterministic vector garage width; fall back to the vision
 *      value when the vector layer is absent, not usable, or the pair is not a real
 *      garage door (classified via the SAME shared parser the vision path uses).
 *   2. SCHEDULE head-datum SAFEGUARD: reject (null) any schedule window height that was
 *      read AS the engine-detected head/mounting datum — never fabricate a height.
 *   3. FORCED FALLBACK: when `vector_annotations` is absent (older engine / scanned
 *      page), nothing changes — today's vision behaviour is preserved exactly.
 */
import { describe, it, expect } from "vitest";
import {
  resolveGarageDoorSize,
  preferVectorGarage,
  safeguardScheduleHeights,
  headDatumSafeguardNote,
} from "../../src/lib/takeoff/vector-annotations";
import type { VectorAnnotations } from "../../src/lib/takeoff/geometry-api";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";
import type { WindowScheduleData } from "../../src/lib/takeoff/extract-window-schedule";

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
  ...over,
});

const garageVector = (raw: string): VectorAnnotations =>
  usableVector({
    garage: { width_mm: 4800, height_mm: 2150, raw, page: 1, distance_px: 96.7 },
  });

const scheduleVector = (head: number): VectorAnnotations =>
  usableVector({
    schedule: { head_datum_mm: head, datum_repeat: 12, window_count: 13, page: 6 },
  });

// ── 1. garage: prefer vector ───────────────────────────────────────────────────

describe("resolveGarageDoorSize", () => {
  it("prefers the vector garage when usable and a valid door (Harrison 4.8×2.1)", () => {
    const r = resolveGarageDoorSize(null, garageVector("2,150 x 4,800"));
    expect(r.source).toBe("vector");
    expect(r.preferred_vector).toBe(true);
    expect(r.garage_door_size).toBe("4.8×2.1");
  });

  it("overrides a wrong vision read (2710 single) with the vector 4.8×2.1", () => {
    const r = resolveGarageDoorSize("2.7×2.1", garageVector("2,150 x 4,800"));
    expect(r.garage_door_size).toBe("4.8×2.1");
    expect(r.source).toBe("vector");
  });

  it("falls back to vision when vector_annotations is absent (forced fallback)", () => {
    const r = resolveGarageDoorSize("4.8×2.1", undefined);
    expect(r.source).toBe("vision");
    expect(r.preferred_vector).toBe(false);
    expect(r.garage_door_size).toBe("4.8×2.1");
  });

  it("falls back to vision when the page is not vector_usable", () => {
    const v = garageVector("2,150 x 4,800");
    v.vector_usable = false;
    const r = resolveGarageDoorSize("2.4×2.1", v);
    expect(r.source).toBe("vision");
    expect(r.garage_door_size).toBe("2.4×2.1");
  });

  it("falls back to vision when the vector pair is NOT a garage door (height out of band)", () => {
    // 2649×1400 — height 1400 below the garage band → classifier returns null → keep vision.
    const r = resolveGarageDoorSize("2.7×2.1", garageVector("2,649 x 1,400"));
    expect(r.source).toBe("vision");
    expect(r.garage_door_size).toBe("2.7×2.1");
  });

  it("falls back to vision for a room footprint pair (both sides room-scale)", () => {
    const r = resolveGarageDoorSize(null, garageVector("6 120 X 5 950"));
    expect(r.source).toBe("vision");
    expect(r.garage_door_size).toBeNull();
  });
});

// ── 2. garage applied onto a takeoff ───────────────────────────────────────────

describe("preferVectorGarage", () => {
  it("overrides garage_door_size with the vector value and re-derives ext-wall area", () => {
    const t = takeoff({ garage_door_size: "2.7×2.1", external_wall_area_m2: 100 });
    const out = preferVectorGarage(t, garageVector("2,150 x 4,800"));
    expect(out.garage_door_size).toBe("4.8×2.1");
    // ext-wall area re-derived: 63.8×2.4 − openingArea(garage 4.8×2.1 only) = 153.12 − 10.08 = 143.04
    expect(out.external_wall_area_m2).toBeCloseTo(143.04, 2);
  });

  it("is a no-op when vector and vision agree on the value (only provenance differs)", () => {
    const t = takeoff({ garage_door_size: "4.8×2.1", external_wall_area_m2: 109.2 });
    const out = preferVectorGarage(t, garageVector("2,150 x 4,800"));
    expect(out).toEqual(t); // value unchanged → derived fields untouched
  });

  it("returns the takeoff unchanged when vector is absent (forced fallback)", () => {
    const t = takeoff({ garage_door_size: "2.4×2.1" });
    expect(preferVectorGarage(t, undefined)).toEqual(t);
  });

  it("returns the takeoff unchanged when the vector pair is not a garage door", () => {
    const t = takeoff({ garage_door_size: "2.7×2.1" });
    expect(preferVectorGarage(t, garageVector("2,649 x 1,400"))).toEqual(t);
  });
});

// ── 3. schedule head-datum safeguard ───────────────────────────────────────────

const sched = (windows: WindowScheduleData["windows"]): WindowScheduleData => ({ windows });

describe("safeguardScheduleHeights", () => {
  it("rejects a window height read AS the head datum and flags it", () => {
    const s = sched([
      { id: "W01", heightMm: 2210, widthMm: 1030 }, // mis-read as the datum
      { id: "W02", heightMm: 900, widthMm: 600 }, // genuine glazed height
    ]);
    const r = safeguardScheduleHeights(s, scheduleVector(2210));
    expect(r.flaggedIds).toEqual(["W01"]);
    expect(r.headDatumMm).toBe(2210);
    expect(r.schedule!.windows[0].heightMm).toBeNull(); // rejected, not fabricated
    expect(r.schedule!.windows[0].widthMm).toBe(1030); // width untouched
    expect(r.schedule!.windows[1].heightMm).toBe(900); // genuine height preserved
  });

  it("tolerates a near-datum read within the band (2200 ≈ 2210)", () => {
    const r = safeguardScheduleHeights(sched([{ id: "W01", heightMm: 2200, widthMm: 1030 }]), scheduleVector(2210));
    expect(r.flaggedIds).toEqual(["W01"]);
  });

  it("does NOT flag a tall slider that is clearly below the datum band (2150 vs 2210)", () => {
    const r = safeguardScheduleHeights(sched([{ id: "W01", heightMm: 2150, widthMm: 2400 }]), scheduleVector(2210));
    expect(r.flaggedIds).toEqual([]);
    expect(r.schedule!.windows[0].heightMm).toBe(2150);
  });

  it("is a no-op when no schedule datum was detected (vector schedule null)", () => {
    const s = sched([{ id: "W01", heightMm: 2210, widthMm: 1030 }]);
    const r = safeguardScheduleHeights(s, usableVector());
    expect(r.flaggedIds).toEqual([]);
    expect(r.schedule).toEqual(s);
  });

  it("is a no-op when vector_annotations is absent (forced fallback)", () => {
    const s = sched([{ id: "W01", heightMm: 2210, widthMm: 1030 }]);
    const r = safeguardScheduleHeights(s, undefined);
    expect(r.flaggedIds).toEqual([]);
    expect(r.schedule).toEqual(s);
  });

  it("handles a null schedule (no schedule page read)", () => {
    const r = safeguardScheduleHeights(null, scheduleVector(2210));
    expect(r.schedule).toBeNull();
    expect(r.flaggedIds).toEqual([]);
  });
});

// ── 4. safeguard note ──────────────────────────────────────────────────────────

describe("headDatumSafeguardNote", () => {
  it("is empty when nothing was flagged", () => {
    const r = safeguardScheduleHeights(sched([{ id: "W01", heightMm: 900, widthMm: 600 }]), scheduleVector(2210));
    expect(headDatumSafeguardNote(r)).toBe("");
  });

  it("names the flagged windows and the datum when it fired", () => {
    const r = safeguardScheduleHeights(sched([{ id: "W01", heightMm: 2210, widthMm: 1030 }]), scheduleVector(2210));
    const note = headDatumSafeguardNote(r);
    expect(note).toContain("W01");
    expect(note).toContain("2210");
  });
});
