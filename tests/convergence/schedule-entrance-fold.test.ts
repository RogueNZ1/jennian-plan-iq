// @vitest-environment node
/**
 * Schedule-path entry-door fold — the mirror of the route-2 entry fold.
 *
 * The Door & Window Schedule lists windows only, so on the schedule path the entry door was
 * missing from openings[] → absent from glazed_sqm / total_opening_sqm / the ext-wall deduction.
 * foldScheduleEntrance appends it ONCE from the same vector entrance + shared builder the route-2
 * path uses. These tests pin the numeric DELTA the fix introduces (fixture-independent, so they
 * survive a live baseline regeneration) and the single-count + sectional-exclusion guarantees.
 *
 * Beddis live fixture (tests/fixtures/beddis/_render/baseline-results.json, prelim.composed):
 *   glazed_sqm 8.82 · total_opening_sqm 18.9 · external_wall_area_m2 134.22 (= 63.8 × 2.4 − 18.9).
 * The scheduleOpenings set below reproduces those totals so the before/after numbers are the
 * actual Beddis numbers; the assertions are on the +2.10 / −2.10 delta the spec requires.
 */
import { describe, it, expect } from "vitest";
import {
  foldScheduleEntrance,
  deriveOpeningTotals,
  computeExternalWallAreaM2,
} from "../../src/lib/takeoff/derive-fields";
import { round2 } from "../../src/lib/takeoff/utils";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";
import type { VectorEntrance } from "../../src/lib/takeoff/geometry-api";

const win = (room: string, h: number, w: number): Opening => ({
  type: "window", room, height_m: h, width_m: w, glazed: true, cladding: null,
  area_m2: round2(h * w) ?? 0, source: "vision", confidence: "high",
});
const sectional = (): Opening => ({
  type: "sectional_door", room: "Garage", height_m: 2.1, width_m: 4.8, glazed: false,
  cladding: null, area_m2: 10.08, source: "vision", confidence: "high",
});
// Beddis entry door: width is UNRESOLVED on the plan → the fix uses ASSUMED_OPENING_WIDTH_M (1.0),
// flagged. Height is the asserted building standard 2.1m. Single source for both paths.
const unresolvedEntrance: VectorEntrance = {
  type: "entry", width_mm: null, width_source: "unresolved",
  height_mm: 2100, height_source: "standard_assumed", label: "ENTRY", page: 0,
};

// Windows + the sectional garage door, NO entrance — the schedule-path bug state.
// 2 × (2.1 × 2.1)=8.82 glazed; + sectional 10.08 → total 18.90 (the Beddis fixture totals).
const scheduleOpenings: Opening[] = [win("W01", 2.1, 2.1), win("W02", 2.1, 2.1), sectional()];

describe("schedule-path entry-door fold", () => {
  it("baseline reproduces the Beddis fixture totals (glazed 8.82 / total 18.9), entrance absent", () => {
    const t = deriveOpeningTotals(scheduleOpenings);
    expect(t.glazed_sqm).toBe(8.82);
    expect(t.total_opening_sqm).toBe(18.9);
    expect(scheduleOpenings.some((o) => o.type === "entrance")).toBe(false);
  });

  it("fold appends the entrance ONCE — glazed:true, asserted height × assumed 1.0m width, flagged", () => {
    const after = foldScheduleEntrance(scheduleOpenings, unresolvedEntrance);
    const entrances = after.filter((o) => o.type === "entrance");
    expect(entrances).toHaveLength(1);
    const e = entrances[0];
    expect(e.glazed).toBe(true);
    expect(e.height_m).toBe(2.1);
    expect(e.width_m).toBe(1.0);
    expect(e.area_m2).toBe(2.1);
    expect((e.flags ?? []).join(" ")).toContain("width assumed 1.0m");
  });

  it("delta is EXACTLY +2.10 glazed_sqm / +2.10 total_opening_sqm and −2.10 on D21", () => {
    const before = deriveOpeningTotals(scheduleOpenings);
    const after = deriveOpeningTotals(foldScheduleEntrance(scheduleOpenings, unresolvedEntrance));

    expect(round2(after.glazed_sqm! - before.glazed_sqm!)).toBe(2.1);
    expect(round2(after.total_opening_sqm! - before.total_opening_sqm!)).toBe(2.1);

    // D21 ext-wall = perimeter × stud − total_opening_sqm (Beddis 63.8 × 2.4).
    const d21Before = computeExternalWallAreaM2(63.8, 2.4, before.total_opening_sqm);
    const d21After = computeExternalWallAreaM2(63.8, 2.4, after.total_opening_sqm);
    expect(d21Before).toBe(134.22); // matches the live fixture exactly
    expect(d21After).toBe(132.12);
    expect(round2(d21Before! - d21After!)).toBe(2.1);
  });

  it("after the fold: glazed 8.82→10.92, total 18.9→21.0; sectional stays EXCLUDED from glass", () => {
    const t = deriveOpeningTotals(foldScheduleEntrance(scheduleOpenings, unresolvedEntrance));
    expect(t.glazed_sqm).toBe(10.92);   // 8.82 windows + 2.10 entrance; sectional 10.08 excluded
    expect(t.total_opening_sqm).toBe(21.0); // includes the sectional
  });

  it("NO double-count: a set already carrying an entrance is returned untouched", () => {
    const once = foldScheduleEntrance(scheduleOpenings, unresolvedEntrance);
    const twice = foldScheduleEntrance(once, unresolvedEntrance);
    expect(twice).toBe(once); // same reference — guard fired, no second entrance
    expect(twice.filter((o) => o.type === "entrance")).toHaveLength(1);
  });

  it("dedup also catches a route-2-shaped entry-room opening (Harrison guard)", () => {
    // windows_by_room can already yield an entry-room opening; the guard must not add another.
    const withEntryRoom = [...scheduleOpenings, win("Entry", 2.1, 1.4)];
    expect(foldScheduleEntrance(withEntryRoom, unresolvedEntrance)).toBe(withEntryRoom);
  });

  it("no vector entrance → strict no-op (same reference)", () => {
    expect(foldScheduleEntrance(scheduleOpenings, null)).toBe(scheduleOpenings);
  });
});
