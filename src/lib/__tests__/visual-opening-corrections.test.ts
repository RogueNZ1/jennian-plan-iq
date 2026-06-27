import { describe, expect, it } from "vitest";
import type { VisualOpeningMarker } from "@/lib/verification/plan-overlay";
import {
  buildVisualOpeningCorrectionInsert,
  latestVisualOpeningCorrectionsByMarker,
  type VisualOpeningCorrection,
} from "@/lib/verification/visual-opening-corrections";

function marker(overrides: Partial<VisualOpeningMarker> = {}): VisualOpeningMarker {
  return {
    id: "O2",
    markerLabel: "O2",
    type: "slider",
    room: "Lounge",
    label: "3600x2100",
    height_m: 2.1,
    width_m: 3.6,
    x: 0.42,
    y: 0.35,
    confidence: "medium",
    evidence: "vision says slider; deterministic proof pending",
    flags: ["review_only"],
    ...overrides,
  };
}

describe("visual opening corrections", () => {
  it("stores correction truth as review data, not pricing authority", () => {
    const payload = buildVisualOpeningCorrectionInsert(
      {
        jobId: "job-1",
        takeoffRunId: "run-1",
        marker: marker({ markerLabel: "O7", id: "vision-7" }),
        correctionType: "component_of_opening",
        reason: "gable glass belongs to the slider assembly below",
      },
      "user-1",
    );

    expect(payload).toMatchObject({
      job_id: "job-1",
      takeoff_run_id: "run-1",
      opening_id: "vision-7",
      marker_label: "O7",
      correction_type: "component_of_opening",
      reason: "gable glass belongs to the slider assembly below",
      created_by: "user-1",
    });
    expect(payload.context).toMatchObject({
      source: "verification_plan_overlay",
      doctrine: "vision_review_only_geometry_prices",
    });
    expect(payload.marker_snapshot).toMatchObject({
      markerLabel: "O7",
      type: "slider",
      width_m: 3.6,
      height_m: 2.1,
    });
    expect(payload).not.toHaveProperty("priced");
    expect(payload).not.toHaveProperty("area_m2");
  });

  it("keeps the latest correction per visual marker", () => {
    const oldRow = {
      marker_label: "O2",
      correction_type: "confirm_opening",
      created_at: "2026-06-28T09:00:00Z",
    } as VisualOpeningCorrection;
    const newRow = {
      marker_label: "O2",
      correction_type: "box_too_large",
      created_at: "2026-06-28T09:02:00Z",
    } as VisualOpeningCorrection;

    expect(latestVisualOpeningCorrectionsByMarker([oldRow, newRow]).O2.correction_type).toBe(
      "box_too_large",
    );
  });
});
