// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantityAuthority } from "../../src/lib/takeoff/extracted-quantity-authority";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";
import {
  buildExtractedQuantityReviewModel,
  classifyOpeningTriageRow,
  legacyActionPolicy,
  reviewHasLegacyDataBesideLedger,
} from "../../src/lib/review/extracted-quantity-review-model";

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
  it("review defaults to Extracted Quantities as the active quantity view", () => {
    const review = buildExtractedQuantityReviewModel(authority([q({ id: "active-window" })]));

    expect(review.readModel?.rows.map((row) => row.id)).toEqual(["active-window"]);
    expect(review.source).toBe("persisted_current_run");
  });

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

  it("review clean totals still include only extracted rows", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({ id: "clean-window", count: 1, status: "extracted" }),
        q({
          id: "review-window",
          count: 99,
          status: "needs_review",
          heightMm: null,
          areaM2: null,
        }),
      ]),
    );

    expect(review.cleanTotals.count).toBe(1);
  });

  it("review needs_review rows remain visible and separate", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({ id: "clean-window", status: "extracted" }),
        q({ id: "review-window", status: "needs_review", heightMm: null, areaM2: null }),
      ]),
    );

    expect(review.sections.find((s) => s.status === "extracted")?.rows.map((r) => r.id)).toEqual([
      "clean-window",
    ]);
    expect(review.sections.find((s) => s.status === "needs_review")?.rows.map((r) => r.id)).toEqual(
      ["review-window"],
    );
  });

  it("review assumed-height rows remain needs_review with null height and null area", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "assumed-height-opening",
          status: "needs_review",
          heightMm: null,
          areaM2: null,
          warnings: ["assumed_height_rejected", "area_not_calculated"],
        }),
      ]),
    );

    expect(review.sections.find((s) => s.status === "needs_review")?.rows[0]).toMatchObject({
      status: "needs_review",
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

  it("review marks legacy opening schedule data as legacy or compatibility-only", () => {
    expect(legacyActionPolicy("opening_schedule_add_update_delete_confirm_push")).toMatchObject({
      classification: "LEGACY_AUTHORITY_RISK",
      contained: true,
    });
  });

  it("review does not present opening_schedule totals as active ledger totals", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([q({ id: "ledger-window", category: "window", count: 1 })]),
    );

    expect(review.cleanTotals.count).toBe(1);
    expect(review.cleanTotals.count).not.toBe(12);
  });

  it("review legacy Windows & Doors actions cannot mutate active extracted quantity ledger rows", () => {
    const policy = legacyActionPolicy("opening_schedule_add_update_delete_confirm_push");

    expect(policy?.contained).toBe(true);
    expect(policy?.reason).toContain("opening_schedule");
  });

  it("review ledger rows are read-only in this slice", () => {
    expect(legacyActionPolicy("base_geometry_quantity_override")).toMatchObject({
      classification: "LEGACY_AUTHORITY_RISK",
      contained: true,
    });
    expect(legacyActionPolicy("printed_reference_quantity_upsert")).toMatchObject({
      classification: "VALIDATION_RISK",
      contained: true,
    });
    expect(legacyActionPolicy("module_item_assumption_confirm")).toMatchObject({
      classification: "APPROVAL_WORKFLOW",
      contained: true,
    });
  });

  it("review displays authority source and runId", () => {
    const review = buildExtractedQuantityReviewModel(authority([q({ id: "active-window" })]));

    expect(review.source).toBe("persisted_current_run");
    expect(review.runId).toBe("run-active");
    expect(review.activeRunId).toBe("run-active");
  });

  it("review shows a warning when legacy review data exists beside active ledger rows", () => {
    expect(
      reviewHasLegacyDataBesideLedger({
        activeLedgerRows: 1,
        legacyOpeningRows: 1,
        legacyQuantityRows: 0,
        legacyModuleItems: 0,
        printedReferenceRows: 0,
      }),
    ).toBe(true);
    expect(
      reviewHasLegacyDataBesideLedger({
        activeLedgerRows: 0,
        legacyOpeningRows: 1,
        legacyQuantityRows: 1,
        legacyModuleItems: 1,
        printedReferenceRows: 1,
      }),
    ).toBe(false);
  });

  it("triages clean extracted opening rows as Clean without mutating status or totals", () => {
    const clean = q({ id: "clean-window", status: "extracted", areaM2: 1.68 });
    const review = buildExtractedQuantityReviewModel(authority([clean]));

    expect(review.openingTriage.groups.find((group) => group.id === "clean")?.rows).toHaveLength(1);
    expect(review.openingTriage.summary.clean).toBe(1);
    expect(review.openingTriage.rows[0]).toMatchObject({
      id: "clean-window",
      status: "extracted",
      widthMm: 1400,
      heightMm: 1200,
      areaM2: 1.68,
      hasOverlayMarker: true,
    });
    expect(review.cleanTotals).toEqual({ count: 1, lengthMm: 0, areaM2: 1.68 });
  });

  it("triages malformed and assembly evidence as Dirty assembly", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "family-overlight",
          status: "needs_review",
          widthMm: null,
          heightMm: null,
          areaM2: null,
          evidence: [
            {
              page: 1,
              bbox: [10, 20, 30, 40],
              text: "malformed assembly 1300x175036001300x1750 overlight",
            },
          ],
        }),
      ]),
    );

    expect(review.openingTriage.summary.dirty_assembly).toBe(1);
    expect(
      review.openingTriage.groups.find((group) => group.id === "dirty_assembly")?.rows[0].id,
    ).toBe("family-overlight");
  });

  it("triages width-only and height-missing rows without filling unknowns", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "width-only-slider",
          status: "needs_review",
          widthMm: 2400,
          heightMm: null,
          areaM2: null,
          warnings: ["height_not_extracted", "area_not_calculated"],
        }),
      ]),
    );
    const row = review.openingTriage.rows[0];

    expect(row.triageGroups).toEqual(expect.arrayContaining(["width_only", "height_missing"]));
    expect(row).toMatchObject({
      status: "needs_review",
      widthMm: 2400,
      heightMm: null,
      areaM2: null,
    });
    expect(review.readModel?.cleanTotalsByCategory.window).toBeUndefined();
  });

  it("triages face, elevation, order, garage, and slider review rows", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "face-check",
          status: "needs_review",
          widthMm: 3600,
          heightMm: null,
          areaM2: null,
          warnings: ["height_not_extracted"],
          evidence: [
            {
              page: 1,
              bbox: [1, 2, 3, 4],
              text: "slider needs face/elevation check; room/order assignment ambiguous",
            },
          ],
        }),
      ]),
    );

    expect(review.openingTriage.summary.face_elevation_check).toBe(1);
    expect(
      review.openingTriage.groups.find((group) => group.id === "face_elevation_check")?.rows[0].id,
    ).toBe("face-check");
  });

  it("triages rows without page and bbox as No overlay marker", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "missing-bbox",
          status: "needs_review",
          evidence: [{ text: "width witness without page bbox" }],
        }),
      ]),
    );

    expect(review.summary.rowsWithOverlayMarkers).toBe(0);
    expect(review.summary.rowsWithoutOverlayMarkers).toBe(1);
    expect(review.openingTriage.summary.missing_bbox).toBe(1);
    expect(review.openingTriage.rows[0]).toMatchObject({
      id: "missing-bbox",
      hasOverlayMarker: false,
      evidencePage: null,
      evidenceBbox: null,
    });
  });

  it("triages conflict rows as Conflict", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "source-conflict",
          status: "conflict",
          warnings: ["source_conflict"],
        }),
      ]),
    );

    expect(review.openingTriage.summary.conflict).toBe(1);
    expect(classifyOpeningTriageRow(review.readModel!.rows[0])).toContain("conflict");
  });

  it("triages unknown review rows as Other review", () => {
    const review = buildExtractedQuantityReviewModel(
      authority([
        q({
          id: "unknown-review",
          status: "needs_review",
          widthMm: null,
          heightMm: 1200,
          areaM2: null,
          warnings: [],
          evidence: [{ page: 1, bbox: [1, 2, 3, 4], text: "review manually" }],
        }),
      ]),
    );

    expect(review.openingTriage.summary.other_review).toBe(1);
    expect(
      review.openingTriage.groups.find((group) => group.id === "other_review")?.rows[0],
    ).toMatchObject({
      id: "unknown-review",
      status: "needs_review",
      areaM2: null,
    });
  });

  it("triage classification preserves clean totals and null unknowns", () => {
    const rows = [
      q({ id: "clean-window", status: "extracted", areaM2: 1.68 }),
      q({
        id: "review-window",
        status: "needs_review",
        widthMm: 1400,
        heightMm: null,
        areaM2: null,
        warnings: ["height_not_extracted", "area_not_calculated"],
      }),
    ];
    const before = buildExtractedQuantityReadModel(rows, { activeRunId: "run-active" });
    const review = buildExtractedQuantityReviewModel(authority(rows));

    expect(review.cleanTotals).toEqual(before.cleanTotals);
    expect(review.readModel?.rows.find((row) => row.id === "review-window")).toMatchObject({
      status: "needs_review",
      heightMm: null,
      areaM2: null,
    });
    expect(review.openingTriage.summary.height_missing).toBe(1);
  });
});
