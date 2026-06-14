import { describe, expect, it } from "vitest";
import { composeTakeoff } from "../takeoff/compose-takeoff";
import type { TakeoffData } from "../takeoff/takeoff-types";
import type { VisualOpeningAudit } from "../takeoff/visual-opening-audit";

const baseVision: TakeoffData = {
  floor_area_m2: 100,
  garage_area_m2: null,
  alfresco_area_m2: null,
  external_wall_lm: 40,
  internal_wall_lm: null,
  roof_area_m2: null,
  window_count: 1,
  external_door_count: null,
  internal_door_count: null,
  bathroom_count: null,
  ensuite_count: null,
  laundry_count: null,
  kitchen_count: null,
  ceiling_height_m: 2.4,
  foundation_type: null,
  windows_by_room: { bed2: { qty: 1, height_m: 1.1, width_m: 1 } },
  door_breakdown: null,
  garage_door_size: "2.7×2.1",
  notes: "",
  external_wall_area_m2: 90,
  total_area_m2: 100,
};

const visualAudit: VisualOpeningAudit = {
  pageNumber: 1,
  method: "visual_qs",
  warnings: [],
  summary: { totalOpenings: 3, qsGlazedOpenings: 2, garageDoors: 1, uncertain: 0 },
  openings: [
    {
      id: "O1",
      type: "window",
      room: "Bed 2",
      label: "1100x1000",
      height_m: 1.1,
      width_m: 1,
      x: 0.1,
      y: 0.1,
      confidence: "high",
      evidence: "",
      flags: [],
    },
    {
      id: "O2",
      type: "pa_door",
      room: "Laundry",
      label: null,
      height_m: null,
      width_m: null,
      x: 0.2,
      y: 0.2,
      confidence: "medium",
      evidence: "",
      flags: [],
    },
    {
      id: "O3",
      type: "garage_door",
      room: "Garage",
      label: "2800x2520",
      height_m: 2.52,
      width_m: 2.8,
      x: 0.3,
      y: 0.3,
      confidence: "high",
      evidence: "",
      flags: [],
    },
  ],
};

describe("composeTakeoff visual opening promotion", () => {
  it("uses Visual QS as the canonical external opening set when present", () => {
    const enriched = composeTakeoff({
      visionTakeoff: baseVision,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: visualAudit,
    }).enriched;

    expect(enriched.openings?.map((o) => o.type)).toEqual(["window", "pa_door", "sectional_door"]);
    expect(enriched.openings?.map((o) => o.glazed)).toEqual([true, true, false]);
    expect(enriched.garage_door_size.value).toBe("2.8×2.52");
    expect(enriched.total_opening_sqm).toBe(10.26);
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain("Visual QS promoted");
  });
});
