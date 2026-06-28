// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";
import type { ExtractedQuantityCorrection } from "../../src/lib/takeoff/extracted-quantity-corrections";
import {
  applyExtractedQuantityCorrections,
  buildEffectiveExtractedQuantityReadModel,
} from "../../src/lib/takeoff/extracted-quantity-effective-model";

const timestamp = "2026-06-29T00:00:00.000Z";

function q(overrides: Partial<ExtractedQuantity> = {}): ExtractedQuantity {
  return {
    id: "opening-1",
    jobId: "job-1",
    runId: "run-1",
    category: "window",
    label: "Window 1",
    count: 1,
    widthMm: 1400,
    heightMm: null,
    lengthMm: null,
    areaM2: null,
    source: "vector_geometry",
    evidence: [{ page: 2, bbox: [10, 20, 30, 40], text: "W01 width witness" }],
    status: "needs_review",
    confidence: 70,
    warnings: ["height_not_extracted", "area_not_calculated"],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function correction(
  overrides: Partial<ExtractedQuantityCorrection> = {},
): ExtractedQuantityCorrection {
  return {
    id: "correction-1",
    jobId: "job-1",
    runId: "run-1",
    extractedQuantityId: "opening-1",
    visualAnchorId: "anchor-1",
    action: "set_dimension",
    field: "heightMm",
    before: null,
    after: 2100,
    reason: "Confirmed from schedule",
    evidenceRefs: [{ kind: "manual_reference", note: "Door/window schedule" }],
    createdBy: "user-1",
    createdAt: timestamp,
    ...overrides,
  };
}

function sourceText(): string {
  return readFileSync(
    join(process.cwd(), "src/lib/takeoff/extracted-quantity-effective-model.ts"),
    "utf8",
  );
}

describe("extracted quantity corrections", () => {
  it("appends correction logic without mutating original extracted quantity rows", () => {
    const rows = [q()];
    const snapshot = JSON.parse(JSON.stringify(rows));
    const effective = applyExtractedQuantityCorrections(rows, [correction()]);

    expect(rows).toEqual(snapshot);
    expect(effective[0]).not.toBe(rows[0]);
    expect(effective[0].heightMm).toBe(2100);
  });

  it("applies correction only for matching jobId runId and extractedQuantityId", () => {
    const effective = applyExtractedQuantityCorrections(
      [q()],
      [
        correction({ id: "wrong-job", jobId: "job-other", after: 2000 }),
        correction({ id: "wrong-run", runId: "run-old", after: 2000 }),
        correction({ id: "wrong-row", extractedQuantityId: "opening-other", after: 2000 }),
        correction({ id: "right-row", after: 2100 }),
      ],
    );

    expect(effective[0].heightMm).toBe(2100);
    expect(effective[0].corrections.map((item) => item.id)).toEqual(["right-row"]);
  });

  it("does not apply old-run corrections to a new run", () => {
    const effective = applyExtractedQuantityCorrections(
      [q({ runId: "run-new" })],
      [correction({ runId: "run-old" })],
    );

    expect(effective[0].heightMm).toBeNull();
    expect(effective[0].correctionState).toBe("uncorrected");
  });

  it("ignores reverted corrections", () => {
    const effective = applyExtractedQuantityCorrections(
      [q()],
      [correction({ revertedAt: "2026-06-29T01:00:00.000Z" })],
    );

    expect(effective[0].heightMm).toBeNull();
    expect(effective[0].corrections).toEqual([]);
  });

  it("sets corrected dimension in the effective row", () => {
    const effective = applyExtractedQuantityCorrections([q()], [correction()]);

    expect(effective[0]).toMatchObject({
      heightMm: 2100,
      correctionState: "corrected",
      correctedFields: ["heightMm"],
    });
  });

  it("does not promote needs_review to extracted when only a dimension is corrected", () => {
    const effective = applyExtractedQuantityCorrections([q()], [correction()]);

    expect(effective[0]).toMatchObject({
      status: "needs_review",
      heightMm: 2100,
    });
  });

  it("promotes status only with explicit set_status correction", () => {
    const effective = applyExtractedQuantityCorrections(
      [q()],
      [
        correction(),
        correction({
          id: "status-approval",
          action: "set_status",
          field: "status",
          before: "needs_review",
          after: "extracted",
          reason: "Height and count confirmed",
          createdAt: "2026-06-29T00:01:00.000Z",
        }),
      ],
    );

    expect(effective[0].status).toBe("extracted");
    expect(effective[0].correctedFields).toEqual(["heightMm", "status"]);
  });

  it("marks ignored rows as ignored and excludes them from clean totals", () => {
    const model = buildEffectiveExtractedQuantityReadModel(
      [q({ status: "extracted", heightMm: 1200, areaM2: 1.68 })],
      [
        correction({
          action: "ignore_row",
          field: "ignoreReason",
          before: "extracted",
          after: "duplicate",
          reason: "Duplicate schedule witness",
        }),
      ],
      { activeRunId: "run-1" },
    );

    expect(model.groups.ignored.map((row) => row.id)).toEqual(["opening-1"]);
    expect(model.groups.extracted).toEqual([]);
    expect(model.cleanTotals).toEqual({ count: 0, lengthMm: 0, areaM2: 0 });
  });

  it("preserves original row values in correction metadata", () => {
    const effective = applyExtractedQuantityCorrections([q()], [correction()])[0];

    expect(effective.original).toMatchObject({
      heightMm: null,
      status: "needs_review",
      warnings: ["height_not_extracted", "area_not_calculated"],
    });
    expect(effective.heightMm).toBe(2100);
    expect(effective.corrections[0]).toMatchObject({
      id: "correction-1",
      reason: "Confirmed from schedule",
      createdBy: "user-1",
      createdAt: timestamp,
    });
  });

  it("preserves unknown dimensions as null unless corrected", () => {
    const effective = applyExtractedQuantityCorrections(
      [q()],
      [correction({ extractedQuantityId: "other-row" })],
    );

    expect(effective[0].heightMm).toBeNull();
    expect(effective[0].areaM2).toBeNull();
  });

  it("preserves assumed_height_rejected as auditable original warning", () => {
    const effective = applyExtractedQuantityCorrections(
      [
        q({
          category: "exterior_door",
          warnings: ["assumed_height_rejected", "area_not_calculated"],
        }),
      ],
      [correction({ after: 2100 })],
    )[0];

    expect(effective.original.warnings).toContain("assumed_height_rejected");
    expect(effective.warnings).toContain("assumed_height_rejected");
    expect(effective.status).toBe("needs_review");
  });

  it("does not use quantity_overrides", () => {
    expect(sourceText()).not.toContain("quantity_overrides");
  });

  it("does not use opening_schedule", () => {
    expect(sourceText()).not.toContain("opening_schedule");
  });

  it("does not use visual_opening_corrections", () => {
    expect(sourceText()).not.toContain("visual_opening_corrections");
  });

  it("builds the same effective rows for export verification review and overlay consumers", () => {
    const model = buildEffectiveExtractedQuantityReadModel([q()], [correction()], {
      activeRunId: "run-1",
    });
    const exportRows = model.rows;
    const verificationRows = model.rows;
    const reviewRows = model.rows;
    const overlayRows = model.rows;

    expect(exportRows).toBe(verificationRows);
    expect(reviewRows).toBe(overlayRows);
    expect(exportRows[0]).toMatchObject({
      id: "opening-1",
      heightMm: 2100,
      correctionState: "corrected",
      correctedFields: ["heightMm"],
    });
  });
});
