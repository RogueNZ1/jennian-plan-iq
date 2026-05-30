// @vitest-environment node
/**
 * Phase 2b — Door & Window Schedule recognition + aggregation.
 *
 * Pure unit tests (no network, no pdfjs) covering the four pieces of the 2b fix:
 *  1. classifyText now recognises the dedicated schedule sheet as `window_schedule`
 *     (before legends, so the A501 "Legend:" block can't hijack it), while keeping
 *     the floor plan as the primary page (window_schedule scores strongly negative).
 *  2. normaliseWindowSchedule parses the AI JSON into a clean W01… list: window IDs
 *     only, deduped, number-normalised, door entries dropped.
 *  3. aggregateWindows / applyWindowAggregate reconcile the schedule against the
 *     floor-plan callouts — schedule wins the canonical set, callouts are the
 *     fallback when no schedule exists.
 *  4. pickWindowSchedule locates the schedule page independently of the primary pick.
 */
import { describe, it, expect } from "vitest";
import {
  classifyText,
  scoreFor,
  FLOORPLAN_SCORE,
  pickPrimaryFloorplan,
  pickWindowSchedule,
  type ScoredPage,
} from "../../src/lib/pdf-page-classify";
import { normaliseWindowSchedule } from "../../src/lib/takeoff/extract-window-schedule";
import { aggregateWindows, applyWindowAggregate } from "../../src/lib/takeoff/aggregate-windows";
import type { TakeoffData, WindowsByRoom } from "../../src/lib/takeoff/takeoff-types";

function scored(text: string, dimHits = 0): ScoredPage {
  const { type, confidence } = classifyText(text, dimHits);
  return { pageType: type, confidence, score: scoreFor(type, confidence) };
}

// ── 1. classifyText — schedule recognition ─────────────────────────────────
describe("classifyText — Door & Window Schedule recognition", () => {
  it("classifies a 'Door & Window Schedule' sheet as window_schedule", () => {
    const { type, confidence } = classifyText("DOOR & WINDOW SCHEDULE  W01 W02 W03  NTS", 0);
    expect(type).toBe("window_schedule");
    expect(confidence).toBe("high");
  });

  it("matches the title even when split across lines (poppler newlines)", () => {
    // Mirrors the Beddis A501 text layer, where the title wraps: "Door & Window\nSchedule".
    const { type } = classifyText("Door & Window\nSchedule\nW01\nW02\nLegend:\nNTS", 0);
    expect(type).toBe("window_schedule");
  });

  it("is not hijacked into legends by the schedule's own 'Legend:' block", () => {
    const { type } = classifyText(
      "WINDOW SCHEDULE  W01 2210 1800  Legend: panel of safety glass  Notes: double glazed",
      6,
    );
    expect(type).toBe("window_schedule");
  });

  it("recognises 'joinery schedule' and 'window and door schedule' variants", () => {
    expect(classifyText("JOINERY SCHEDULE  W01 W02", 0).type).toBe("window_schedule");
    expect(classifyText("WINDOW AND DOOR SCHEDULE  W01", 0).type).toBe("window_schedule");
  });

  it("does NOT mislabel a floor plan that merely mentions a window schedule note", () => {
    // Floor-plan family is evaluated first, so an incidental 'window schedule' mention
    // on the actual floor plan must not flip it to window_schedule.
    const { type } = classifyText("GROUND FLOOR PLAN  refer window schedule  165.4 m²", 9);
    expect(type).toMatch(/floor_plan/);
  });
});

// ── 1b. scoring — schedule never beats the floor plan ──────────────────────
describe("FLOORPLAN_SCORE — window_schedule can never win the primary pick", () => {
  it("scores window_schedule strongly negative", () => {
    expect(FLOORPLAN_SCORE.window_schedule).toBeLessThan(0);
  });

  it("a high-confidence floor plan outscores a high-confidence schedule", () => {
    expect(scoreFor("floor_plan", "high")).toBeGreaterThan(scoreFor("window_schedule", "high"));
  });

  it("pickPrimaryFloorplan picks the floor plan, not the schedule", () => {
    const pages: ScoredPage[] = [
      scored("DOOR & WINDOW SCHEDULE  W01 W02 ... W13  NTS", 0),
      scored("GROUND FLOOR PLAN  floor area 165.4 m²", 9),
    ];
    const pick = pickPrimaryFloorplan(pages)!;
    expect(pick).not.toBeNull();
    expect(pages[pick.index].pageType).toBe("floor_plan");
  });
});

// ── 4. pickWindowSchedule — independent schedule-page locate ────────────────
describe("pickWindowSchedule", () => {
  it("locates the schedule page in a Beddis-like 7-page set", () => {
    const pages: ScoredPage[] = [
      scored("SITE PLAN  boundary", 4),
      scored("LANDSCAPING PLAN", 2),
      scored("GROUND FLOOR PLAN  165.4 m²", 9),
      scored("GROUND FLOOR PLAN — DIMENSIONS ONLY  2420 3600", 20),
      scored("NORTH & SOUTH ELEVATIONS", 4),
      scored("SECTION A-A", 3),
      scored("DOOR & WINDOW SCHEDULE  W01 ... W13", 0),
    ];
    const sched = pickWindowSchedule(pages);
    expect(sched).not.toBeNull();
    expect(sched!.index).toBe(6);
  });

  it("returns null when the set has no schedule page", () => {
    const pages: ScoredPage[] = [
      scored("GROUND FLOOR PLAN", 9),
      scored("NORTH ELEVATIONS", 3),
    ];
    expect(pickWindowSchedule(pages)).toBeNull();
  });

  it("prefers the highest-confidence schedule page when several exist", () => {
    const pages: ScoredPage[] = [
      { pageType: "window_schedule", confidence: "mid", score: -43 },
      { pageType: "window_schedule", confidence: "high", score: -40 },
    ];
    expect(pickWindowSchedule(pages)!.index).toBe(1);
  });
});

// ── 2. normaliseWindowSchedule — pure parse ─────────────────────────────────
describe("normaliseWindowSchedule", () => {
  it("parses a clean 13-window schedule", () => {
    const raw = JSON.stringify({
      windows: Array.from({ length: 13 }, (_, i) => ({
        id: "W" + String(i + 1).padStart(2, "0"),
        heightMm: 2210,
        widthMm: 1800,
      })),
    });
    const out = normaliseWindowSchedule(raw);
    expect(out.windows).toHaveLength(13);
    expect(out.windows[0]).toEqual({ id: "W01", heightMm: 2210, widthMm: 1800 });
  });

  it("drops door entries (D01, GD) and keeps only window IDs", () => {
    const raw = JSON.stringify({
      windows: [
        { id: "W01", heightMm: 2210, widthMm: 1800 },
        { id: "D01", heightMm: 1980, widthMm: 810 },
        { id: "GD", heightMm: 2100, widthMm: 4800 },
        { id: "W02", heightMm: 1200, widthMm: 900 },
      ],
    });
    const out = normaliseWindowSchedule(raw);
    expect(out.windows.map((w) => w.id)).toEqual(["W01", "W02"]);
  });

  it("dedupes a repeated ID but keeps same-size distinct IDs", () => {
    const raw = JSON.stringify({
      windows: [
        { id: "W04", heightMm: 2210, widthMm: 2210 },
        { id: "W05", heightMm: 2210, widthMm: 2210 },
        { id: "W04", heightMm: 2210, widthMm: 2210 },
      ],
    });
    const out = normaliseWindowSchedule(raw);
    expect(out.windows.map((w) => w.id)).toEqual(["W04", "W05"]);
  });

  it("normalises comma/space number strings and sorts by numeric ID", () => {
    const raw = JSON.stringify({
      windows: [
        { id: "W10", heightMm: "2,210", widthMm: "1 030" },
        { id: "W02", heightMm: "2210", widthMm: "1800" },
      ],
    });
    const out = normaliseWindowSchedule(raw);
    expect(out.windows.map((w) => w.id)).toEqual(["W02", "W10"]);
    expect(out.windows[1]).toEqual({ id: "W10", heightMm: 2210, widthMm: 1030 });
  });

  it("returns null dims for unreadable values without dropping the window", () => {
    const raw = JSON.stringify({ windows: [{ id: "W07", heightMm: null, widthMm: "?" }] });
    const out = normaliseWindowSchedule(raw);
    expect(out.windows).toEqual([{ id: "W07", heightMm: null, widthMm: null }]);
  });

  it("tolerates markdown fences / trailing commas and bad JSON", () => {
    const fenced = "```json\n{ \"windows\": [ { \"id\": \"W01\", \"heightMm\": 2210, \"widthMm\": 1800 }, ] }\n```";
    expect(normaliseWindowSchedule(fenced).windows).toHaveLength(1);
    expect(normaliseWindowSchedule("not json at all").windows).toEqual([]);
  });
});

// ── 3. aggregateWindows / applyWindowAggregate — reconciliation ─────────────
describe("aggregateWindows — schedule wins, callouts are fallback", () => {
  const callouts: WindowsByRoom = {
    living: { qty: 2 },
    kitchen: { qty: 1 },
  } as unknown as WindowsByRoom;

  it("uses the schedule count + list when a schedule is present", () => {
    const schedule = {
      windows: [
        { id: "W01", heightMm: 2210, widthMm: 1800 },
        { id: "W02", heightMm: 1200, widthMm: 900 },
      ],
    };
    const agg = aggregateWindows(schedule, callouts);
    expect(agg.source).toBe("schedule");
    expect(agg.window_count).toBe(2);
    expect(agg.windows_schedule).toHaveLength(2);
  });

  it("falls back to the floor-plan callout sum when no schedule", () => {
    const agg = aggregateWindows(null, callouts);
    expect(agg.source).toBe("floor_plan_callouts");
    expect(agg.window_count).toBe(3);
    expect(agg.windows_schedule).toBeNull();
  });

  it("reports 'none' when there is neither a schedule nor callouts", () => {
    const agg = aggregateWindows(null, null);
    expect(agg.source).toBe("none");
    expect(agg.window_count).toBeNull();
  });

  it("treats an empty schedule as no schedule (falls back to callouts)", () => {
    const agg = aggregateWindows({ windows: [] }, callouts);
    expect(agg.source).toBe("floor_plan_callouts");
    expect(agg.window_count).toBe(3);
  });
});

describe("applyWindowAggregate", () => {
  const base = {
    floor_area_m2: 165.4,
    window_count: 3,
    windows_by_room: { living: { qty: 2 }, kitchen: { qty: 1 } },
  } as unknown as TakeoffData;

  it("overwrites window_count with the schedule count and attaches the mm→m list", () => {
    const agg = aggregateWindows(
      { windows: [{ id: "W01", heightMm: 2210, widthMm: 1800 }] },
      base.windows_by_room,
    );
    const out = applyWindowAggregate(base, agg);
    expect(out.window_count).toBe(1);
    expect(out.windows_schedule).toEqual([{ id: "W01", height_m: 2.21, width_m: 1.8 }]);
    // floor-plan room context is left intact.
    expect(out.windows_by_room).toBe(base.windows_by_room);
  });

  it("leaves the takeoff unchanged when there is no schedule", () => {
    const agg = aggregateWindows(null, base.windows_by_room);
    const out = applyWindowAggregate(base, agg);
    expect(out.window_count).toBe(3);
    expect(out).toBe(base);
  });
});
