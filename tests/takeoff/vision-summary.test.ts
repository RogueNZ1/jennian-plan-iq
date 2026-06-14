// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  mergeVisionSummaryCounts,
  VISION_RECOVERED_ROWS_WARNING,
} from "../../src/lib/takeoff/vision-summary";
import type { VisionRunSummary } from "../../src/lib/takeoff/vision-types";

function summary(overrides: Partial<VisionRunSummary> = {}): VisionRunSummary {
  return {
    kind: "vision_takeoff",
    ranAt: "2026-06-15T00:00:00.000Z",
    pagesRendered: 1,
    pagesSentToVision: 1,
    pagesSkipped: 0,
    pagesProcessed: 1,
    workingPlanReviewed: true,
    areaPerimeterValuesFound: 0,
    windowItemsFound: 0,
    doorItemsFound: 0,
    wallLengthsFound: 0,
    moduleDraftItemsCreated: 0,
    reviewRequiredItems: 0,
    visionQuantitiesCreated: 0,
    visionMeasurementsCreated: 0,
    visionOpeningsCreated: 0,
    visionModuleItemsCreated: 0,
    warningCount: 0,
    errorCount: 0,
    confidenceCounts: { high: 0, medium: 0, low: 0 },
    flattenedPlanDetected: true,
    visionReviewRequired: true,
    failedPages: 0,
    processedPages: 1,
    pageCap: 12,
    warnings: [],
    errors: [],
    pages: [
      {
        fileId: "file-1",
        fileName: "Floorplan.pdf",
        pageNumber: 1,
        storagePath: "job-files/rendered/page-1.png",
        status: "ok",
        result: {
          page_type: "floorplan",
          scale_text: "1:100 @A3",
          scale_confidence: "high",
          area_box: {
            total_area_m2: null,
            area_over_frame_m2: null,
            coverage_area_m2: null,
            cladding_area_m2: null,
            porch_area_m2: null,
            perimeter_m: null,
          },
          base_geometry: {
            external_perimeter_m: null,
            internal_wall_length_m: null,
            garage_area_m2: null,
            living_area_excluding_garage_m2: null,
          },
          rooms: [],
          windows: [],
          doors: [{ type: "garage", width_mm: 4800, height_mm: 2110, room: "Garage", confidence: "high", source_evidence: "sectional garage door" }],
          wall_lengths: {
            external_wall_length_m: null,
            internal_wall_length_m: null,
            wet_area_wall_length_m: null,
            garage_internal_wall_length_m: null,
            robe_wall_length_m: null,
          },
          cladding: { type: null, cladding_area_m2: null, brick_length_m: null, notes: null },
          roofing: { roof_pitch_degrees: null, roof_area_m2: null, notes: null },
          warnings: [],
          confidence_summary: "high",
        },
        quantitiesInserted: 0,
        quantitiesRefreshed: 0,
        openingsInserted: 0,
        openingsRefreshed: 0,
        measurementsInserted: 0,
        measurementsRefreshed: 0,
        moduleItemsInserted: 0,
        moduleItemsRefreshed: 0,
        reviewRequiredCount: 0,
        warnings: [],
      },
    ],
    ...overrides,
  };
}

const counts = {
  pages: 1,
  quantities: 5,
  openings: 16,
  windows: 15,
  measurements: 0,
  moduleItems: 0,
};

describe("mergeVisionSummaryCounts", () => {
  it("preserves raw page outcomes while reconciling counts", () => {
    const merged = mergeVisionSummaryCounts(summary(), counts);
    expect(merged.pages).toHaveLength(1);
    expect(merged.pages[0].result?.doors[0]).toMatchObject({
      type: "garage",
      width_mm: 4800,
    });
    expect(merged.visionOpeningsCreated).toBe(16);
    expect(merged.windowItemsFound).toBe(15);
    expect(merged.doorItemsFound).toBe(1);
  });

  it("does not invent a timeout warning for an already-completed run", () => {
    const merged = mergeVisionSummaryCounts(summary(), counts);
    expect(merged.warnings).not.toContain(VISION_RECOVERED_ROWS_WARNING);
    expect(merged.warnings.join(" ")).not.toMatch(/timed out/i);
  });

  it("adds a recovery warning only when reconciling an interrupted running run", () => {
    const merged = mergeVisionSummaryCounts(summary(), counts, {
      recoveredFromInterruptedRun: true,
    });
    expect(merged.warnings).toContain(VISION_RECOVERED_ROWS_WARNING);
  });
});
