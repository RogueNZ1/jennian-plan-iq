// @vitest-environment node
/**
 * Unify the opening-write path — buildComposedOpeningRows (pure seam).
 *
 * Proves the fix for the "tab shows 0 / workbook shows N" disconnect on a no-schedule plan:
 * the composed enriched openings[] (the slider-inclusive set the flat-block QS export reads)
 * maps cleanly onto relational opening_schedule rows, with the slider landing as a "window"
 * so the relational QS count + Windows & Doors tab match the workbook's glazed set.
 *
 * The fixture is the ACTUAL JM-0010 (Young plan) openings[] read from takeoff_runs.takeoff_json
 * on 2026-06-04: 9 windows + 1 slider (Dining 2.40×2.10) + 1 entrance (Entry w=0). On that job
 * windows_schedule is NULL and opening_schedule had 0 rows — the old windows_schedule bridge
 * was inert. This is the set that must now flow through.
 */
import { describe, it, expect } from "vitest";
import { buildComposedOpeningRows, openingRowKey } from "../../src/lib/takeoff/extract-openings";
import type { Opening, OpeningType } from "../../src/lib/takeoff/takeoff-types";

function op(type: OpeningType, room: string | null, width_m: number, height_m: number): Opening {
  return {
    type,
    room,
    width_m,
    height_m,
    glazed: type === "window" || type === "slider" || type === "garage_window",
    cladding: null,
    area_m2: Math.round(width_m * height_m * 100) / 100,
    source: "vision",
    confidence: "high",
  };
}

// JM-0010 (Young plan) — the real openings[], verbatim from the stored takeoff.
const JM0010: Opening[] = [
  op("window", "Bed 1 (Master)", 1.8, 1.3),
  op("window", "Bed 1 (Master)", 1.8, 1.3), // genuine duplicate — must be preserved
  op("window", "Bed 2", 1.5, 1.3),
  op("window", "Kitchen", 0.6, 1.8),
  op("window", "Lounge", 1.3, 1.4),
  op("window", "Lounge", 1.3, 1.4), // genuine duplicate
  op("window", "Wc", 0.7, 1.1),
  op("window", "Bathroom", 0.7, 1.1),
  op("window", "Laundry", 0.6, 1.8),
  op("slider", "Dining", 2.4, 2.1), // the opening chased all session
  op("entrance", "Entry", 0.0, 2.1), // w=0 — unresolved, never priced
];

describe("buildComposedOpeningRows — JM-0010 (no-schedule) bridge", () => {
  it("produces openings for a fresh no-schedule job, slider included", () => {
    const { rows, skipped } = buildComposedOpeningRows(JM0010, new Set());

    // 9 windows + slider written; only the w=0 entrance skipped.
    expect(rows.length).toBe(10);
    expect(skipped).toBe(1);
  });

  it("lands the slider in opening_schedule AS A WINDOW (the fix)", () => {
    const { rows } = buildComposedOpeningRows(JM0010, new Set());
    const slider = rows.find((r) => r.notes === "slider");
    expect(slider).toBeDefined();
    expect(slider!.opening_type).toBe("window"); // counts in the relational window cell + tab
    expect(slider!.room_name).toBe("Dining");
    expect(slider!.width_mm).toBe(2400);
    expect(slider!.height_mm).toBe(2100);
  });

  it("the relational glazed-window count matches the workbook (10)", () => {
    const { rows } = buildComposedOpeningRows(JM0010, new Set());
    const windows = rows.filter((r) => r.opening_type === "window");
    // 9 plan windows + the slider — the same 10 the flat-block export counts as glazed.
    expect(windows.length).toBe(10);
  });

  it("never fabricates: the w=0 entrance is skipped, not written", () => {
    const { rows } = buildComposedOpeningRows(JM0010, new Set());
    expect(rows.some((r) => r.notes === "entrance")).toBe(false);
  });

  it("preserves genuine within-set duplicates", () => {
    const { rows } = buildComposedOpeningRows(JM0010, new Set());
    const bed1 = rows.filter((r) => r.width_mm === 1800 && r.height_mm === 1300);
    const lounge = rows.filter((r) => r.width_mm === 1300 && r.height_mm === 1400);
    expect(bed1.length).toBe(2);
    expect(lounge.length).toBe(2);
  });

  it("dedupes against rows already in the table (no double-count vs vision/text)", () => {
    // The slider already persisted by an earlier pass → must not be written again.
    const existing = new Set([openingRowKey("window", 2400, 2100)]);
    const { rows, skipped } = buildComposedOpeningRows(JM0010, existing);
    expect(rows.some((r) => r.notes === "slider")).toBe(false);
    expect(skipped).toBe(2); // entrance (w=0) + the pre-existing slider
  });

  it("re-running with the prior drafts in the snapshot is idempotent (inserts nothing new)", () => {
    const first = buildComposedOpeningRows(JM0010, new Set());
    const snapshot = new Set(first.rows.map((r) => openingRowKey(r.opening_type, r.width_mm, r.height_mm)));
    const second = buildComposedOpeningRows(JM0010, snapshot);
    expect(second.rows.length).toBe(0);
  });

  it("maps the non-window exterior types per the chosen vocabulary", () => {
    const openings: Opening[] = [
      op("sectional_door", "Garage", 4.8, 2.1),
      op("pa_door", "Garage", 0.9, 2.0),
      op("garage_window", "Garage", 1.0, 0.6),
    ];
    const { rows } = buildComposedOpeningRows(openings, new Set());
    expect(rows.find((r) => r.notes === "sectional_door")!.opening_type).toBe("garage_door");
    expect(rows.find((r) => r.notes === "pa_door")!.opening_type).toBe("external_door");
    expect(rows.find((r) => r.notes === "garage_window")!.opening_type).toBe("window");
  });
});
