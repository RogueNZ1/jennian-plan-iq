// @vitest-environment node
/**
 * Schedule-path entry-door fold — the mirror of the route-2 entry fold.
 *
 * The Door & Window Schedule lists windows only, so on the schedule path the entry door was
 * missing from openings[] → absent from review. foldScheduleEntrance appends it ONCE from the
 * same vector entrance + shared builder the route-2 path uses. These tests pin that unresolved
 * width stays out of glazed_sqm / total_opening_sqm until a real width is confirmed, plus the
 * single-count + sectional-exclusion guarantees.
 *
 * Beddis live fixture (tests/fixtures/beddis/_render/baseline-results.json, prelim.composed):
 *   glazed_sqm 8.82 · total_opening_sqm 18.9 · external_wall_area_m2 134.22 (= 63.8 × 2.4 − 18.9).
 * The scheduleOpenings set below reproduces those totals so the before/after numbers are the
 * actual Beddis numbers; unresolved entry width must not move those totals.
 */
import { describe, it, expect } from "vitest";
import {
  foldScheduleEntrance,
  deriveOpeningTotals,
  computeExternalWallAreaM2,
} from "../../src/lib/takeoff/derive-fields";
import { adjudicateOpeningPricing } from "../../src/lib/takeoff/opening-pricing-adjudication";
import { round2 } from "../../src/lib/takeoff/utils";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";
import type { VectorEntrance } from "../../src/lib/takeoff/geometry-api";

const win = (room: string, h: number, w: number): Opening => ({
  type: "window",
  room,
  height_m: h,
  width_m: w,
  glazed: true,
  cladding: null,
  area_m2: round2(h * w) ?? 0,
  source: "vision",
  confidence: "high",
});
const sectional = (): Opening => ({
  type: "sectional_door",
  room: "Garage",
  height_m: 2.1,
  width_m: 4.8,
  glazed: false,
  cladding: null,
  area_m2: 10.08,
  source: "vision",
  confidence: "high",
});
// Beddis entry door: width is UNRESOLVED on the plan, so it is carried as review evidence
// with width 0 and quarantined from pricing. Height is the asserted building standard 2.1m.
const unresolvedEntrance: VectorEntrance = {
  type: "entry",
  width_mm: null,
  width_source: "unresolved",
  height_mm: 2100,
  height_source: "standard_assumed",
  label: "ENTRY",
  page: 0,
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

  it("fold appends the entrance ONCE — glazed:true, asserted height, unresolved width, flagged", () => {
    const after = foldScheduleEntrance(scheduleOpenings, unresolvedEntrance);
    const entrances = after.filter((o) => o.type === "entrance");
    expect(entrances).toHaveLength(1);
    const e = entrances[0];
    expect(e.glazed).toBe(true);
    expect(e.height_m).toBe(2.1);
    expect(e.width_m).toBe(0);
    expect(e.area_m2).toBe(0);
    expect((e.flags ?? []).join(" ")).toContain("width unresolved");

    const adjudicated = adjudicateOpeningPricing(after);
    expect(adjudicated.quarantinedOpenings).toContainEqual(
      expect.objectContaining({
        reasons: expect.arrayContaining(["missing_width"]),
      }),
    );
  });

  it("unresolved entrance does not change opening totals or D21 until width is confirmed", () => {
    const before = deriveOpeningTotals(scheduleOpenings);
    const after = deriveOpeningTotals(foldScheduleEntrance(scheduleOpenings, unresolvedEntrance));

    expect(round2(after.glazed_sqm! - before.glazed_sqm!)).toBe(0);
    expect(round2(after.total_opening_sqm! - before.total_opening_sqm!)).toBe(0);

    // D21 ext-wall = perimeter × stud − total_opening_sqm (Beddis 63.8 × 2.4).
    const d21Before = computeExternalWallAreaM2(63.8, 2.4, before.total_opening_sqm);
    const d21After = computeExternalWallAreaM2(63.8, 2.4, after.total_opening_sqm);
    expect(d21Before).toBe(134.22); // matches the live fixture exactly
    expect(d21After).toBe(134.22);
    expect(round2(d21Before! - d21After!)).toBe(0);
  });

  it("after the fold: unresolved entry stays out of area totals; sectional stays EXCLUDED from glass", () => {
    const t = deriveOpeningTotals(foldScheduleEntrance(scheduleOpenings, unresolvedEntrance));
    expect(t.glazed_sqm).toBe(8.82); // unresolved entry is not priced; sectional excluded from glass
    expect(t.total_opening_sqm).toBe(18.9); // includes only known-width openings
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
