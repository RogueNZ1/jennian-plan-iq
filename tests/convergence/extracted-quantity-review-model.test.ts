// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantityAuthority } from "../../src/lib/takeoff/extracted-quantity-authority";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";
import { buildExtractedQuantityReviewModel } from "../../src/lib/review/extracted-quantity-review-model";

const timestamp = "2026-06-28T00:00:00.000Z";

function q(overrides: Partial<ExtractedQuantity>): ExtractedQuantity {
  return {
    id: "row-1",
    jobId: "JM-0060",
    runId: "run-active",
    category: "window",
    label: "Window W01",
    count: 1,
    widthMm: 1400,
    heightMm: 1200,
    lengthMm: null,
    areaM2: 1.68,
    status: "extracted",
    confidence: 95,
    warnings: [],
    source: "window_schedule",
    evidence: [{ page: 7, bbox: [10, 20, 30, 40], text: "W01 1400 x 1200" }],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function authority(rows: ExtractedQuantity[]): ExtractedQuantityAuthority {
  return {
    source: "persisted_current_run",
    runId: "run-active",
    quantities: rows,
    readModel: buildExtractedQuantityReadModel(rows, { activeRunId: "run-active" }),
    warnings: [],
    enriched: null,
    run: { id: "run-active", started_at: timestamp },
  };
}

describe("Extracted Quantity Review model", () => {
  it("uses the active extracted quantity read model grouped for Review", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "perimeter",
          category: "exterior_perimeter",
          label: "Exterior perimeter",
          widthMm: null,
          heightMm: null,
          lengthMm: 89100,
          areaM2: null,
          source: "vector_geometry",
        }),
        q({
          id: "interior-doors",
          category: "interior_door",
          label: "Interior doors",
          count: 20,
          widthMm: null,
          heightMm: null,
          areaM2: null,
          source: "door_schedule",
        }),
        q({
          id: "window-review",
          status: "needs_review",
          heightMm: null,
          areaM2: null,
          warnings: ["height_not_extracted", "area_not_calculated"],
        }),
      ]),
    );

    expect(review.source).toBe("persisted_current_run");
    expect(review.activeRunId).toBe("run-active");
    expect(review.sections.find((s) => s.status === "extracted")?.rows.map((r) => r.id)).toEqual([
      "perimeter",
      "interior-doors",
    ]);
    expect(review.sections.find((s) => s.status === "needs_review")?.rows[0]).toMatchObject({
      id: "window-review",
      heightMm: null,
      areaM2: null,
      warnings: ["height_not_extracted", "area_not_calculated"],
      evidence: [{ page: 7, bbox: [10, 20, 30, 40], text: "W01 1400 x 1200" }],
    });
  });

  it("clean totals exclude needs_review while perimeter and interior doors survive opening uncertainty", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "perimeter",
          category: "exterior_perimeter",
          count: 1,
          widthMm: null,
          heightMm: null,
          lengthMm: 89100,
          areaM2: null,
        }),
        q({
          id: "interior-doors",
          category: "interior_door",
          count: 20,
          widthMm: null,
          heightMm: null,
          areaM2: null,
        }),
        q({
          id: "opening-assumed-height",
          category: "exterior_door",
          status: "needs_review",
          widthMm: 860,
          heightMm: null,
          areaM2: null,
          warnings: ["assumed_height_rejected", "area_not_calculated"],
        }),
      ]),
    );

    expect(review.cleanTotals).toEqual({ count: 21, lengthMm: 89100, areaM2: 0 });
    expect(review.readModel?.cleanTotalsByCategory.exterior_door).toBeUndefined();
    expect(review.sections.find((s) => s.status === "needs_review")?.rows[0]).toMatchObject({
      id: "opening-assumed-height",
      heightMm: null,
      areaM2: null,
      warnings: expect.arrayContaining(["assumed_height_rejected"]),
    });
  });

  it("keeps stale rows rejected by the shared activeRunId selector before Review renders them", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        q({ id: "stale-window", runId: "run-stale" }),
        q({ id: "active-window", runId: "run-active" }),
      ],
      { activeRunId: "run-active" },
    );
    const review = buildExtractedQuantityReviewModel({
      ...authority([]),
      quantities: readModel.rows as unknown as ExtractedQuantity[],
      readModel,
    });

    expect(review.readModel?.rows.map((row) => row.id)).toEqual(["active-window"]);
    expect(review.runId).toBe("run-active");
  });

  it("surfaces selector warnings instead of falling back to raw opening_schedule authority", () => {
    const review = buildExtractedQuantityReviewModel({
      source: "unavailable",
      runId: null,
      quantities: [],
      readModel: null,
      warnings: ["current takeoff runId unavailable"],
      enriched: null,
      run: null,
    });

    expect(review.readModel).toBeNull();
    expect(review.sections.every((section) => section.rows.length === 0)).toBe(true);
    expect(review.warnings).toEqual(["current takeoff runId unavailable"]);
  });
});
