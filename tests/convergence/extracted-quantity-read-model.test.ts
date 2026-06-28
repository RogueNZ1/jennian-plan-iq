// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildExtractedQuantityReadModel,
  type ExtractedQuantityReadModel,
} from "../../src/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";

const timestamp = "2026-06-28T00:00:00.000Z";

function q(over: Partial<ExtractedQuantity>): ExtractedQuantity {
  return {
    id: "q-1",
    jobId: "job-60",
    runId: "run-1",
    category: "window",
    label: "Window",
    count: 1,
    widthMm: 1400,
    heightMm: 1200,
    lengthMm: null,
    areaM2: 1.68,
    source: "vector_geometry",
    evidence: [{ page: 2, bbox: [10, 20, 30, 40], text: "W01 1400x1200" }],
    status: "extracted",
    confidence: 95,
    warnings: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...over,
  };
}

function model(): ExtractedQuantityReadModel {
  return buildExtractedQuantityReadModel([
    q({
      id: "external-perimeter",
      category: "exterior_perimeter",
      label: "Exterior perimeter",
      count: 1,
      widthMm: null,
      heightMm: null,
      lengthMm: 58130,
      areaM2: null,
    }),
    q({
      id: "interior-door-standard",
      category: "interior_door",
      label: "Interior doors - standard",
      count: 11,
      widthMm: null,
      heightMm: null,
      areaM2: null,
    }),
    q({
      id: "window-needs-review",
      status: "needs_review",
      widthMm: 1400,
      heightMm: null,
      areaM2: null,
      warnings: ["height_not_extracted", "area_not_calculated"],
    }),
    q({
      id: "pa-assumed-height",
      category: "exterior_door",
      label: "PA door - Laundry",
      status: "needs_review",
      widthMm: 1030,
      heightMm: null,
      areaM2: null,
      warnings: ["assumed_height_rejected", "area_not_calculated"],
    }),
    q({
      id: "garage-conflict",
      category: "garage_door",
      status: "conflict",
      widthMm: 4800,
      heightMm: 2100,
      areaM2: 10.08,
      warnings: ["source_conflict"],
    }),
    q({
      id: "ignored-marker",
      category: "opening",
      status: "ignored",
      count: null,
      widthMm: null,
      heightMm: null,
      areaM2: null,
      warnings: ["possible_false_positive"],
    }),
  ]);
}

describe("Extracted Quantity read model", () => {
  it("groups extracted quantities by status", () => {
    const readModel = model();

    expect(readModel.groups.extracted.map((row) => row.id)).toEqual([
      "external-perimeter",
      "interior-door-standard",
    ]);
    expect(readModel.groups.needs_review.map((row) => row.id)).toEqual([
      "window-needs-review",
      "pa-assumed-height",
    ]);
    expect(readModel.groups.conflict.map((row) => row.id)).toEqual(["garage-conflict"]);
    expect(readModel.groups.ignored.map((row) => row.id)).toEqual(["ignored-marker"]);
  });

  it("clean totals include only extracted rows", () => {
    const readModel = model();

    expect(readModel.cleanTotals).toEqual({
      count: 12,
      lengthMm: 58130,
      areaM2: 0,
    });
    expect(readModel.cleanTotalsByCategory.window).toBeUndefined();
    expect(readModel.cleanTotalsByCategory.exterior_perimeter).toEqual({
      count: 1,
      lengthMm: 58130,
      areaM2: 0,
    });
    expect(readModel.cleanTotalsByCategory.interior_door).toEqual({
      count: 11,
      lengthMm: 0,
      areaM2: 0,
    });
  });

  it("needs_review rows remain visible but are excluded from clean totals", () => {
    const readModel = model();

    expect(readModel.groups.needs_review).toHaveLength(2);
    expect(readModel.rows.find((row) => row.id === "window-needs-review")).toMatchObject({
      widthMm: 1400,
      heightMm: null,
      areaM2: null,
      warnings: expect.arrayContaining(["height_not_extracted"]),
    });
    expect(readModel.cleanTotalsByCategory.window).toBeUndefined();
  });

  it("unknown dimensions remain null", () => {
    const readModel = model();
    const window = readModel.rows.find((row) => row.id === "window-needs-review");

    expect(window).toMatchObject({
      widthMm: 1400,
      heightMm: null,
      areaM2: null,
    });
  });

  it("assumed-height rows keep heightMm null and areaM2 null", () => {
    const readModel = model();
    const paDoor = readModel.rows.find((row) => row.id === "pa-assumed-height");

    expect(paDoor).toMatchObject({
      status: "needs_review",
      widthMm: 1030,
      heightMm: null,
      areaM2: null,
      warnings: expect.arrayContaining(["assumed_height_rejected"]),
    });
  });

  it("exterior perimeter exports even when openings need review", () => {
    const readModel = model();

    expect(readModel.rows.find((row) => row.id === "external-perimeter")).toMatchObject({
      category: "exterior_perimeter",
      lengthMm: 58130,
      status: "extracted",
    });
    expect(readModel.groups.needs_review.some((row) => row.category === "window")).toBe(true);
  });

  it("interior doors export even when openings need review", () => {
    const readModel = model();

    expect(readModel.rows.find((row) => row.id === "interior-door-standard")).toMatchObject({
      category: "interior_door",
      count: 11,
      status: "extracted",
    });
    expect(readModel.groups.needs_review.some((row) => row.category === "exterior_door")).toBe(
      true,
    );
  });

  it("filters rows by activeRunId", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        q({ id: "old-perimeter", runId: "run-old", category: "exterior_perimeter" }),
        q({ id: "active-perimeter", runId: "run-active", category: "exterior_perimeter" }),
      ],
      { activeRunId: "run-active" },
    );

    expect(readModel.activeRunId).toBe("run-active");
    expect(readModel.rows.map((row) => row.id)).toEqual(["active-perimeter"]);
    expect(readModel.runIds).toEqual(["run-active"]);
  });

  it("does not silently mix multiple runIds", () => {
    expect(() =>
      buildExtractedQuantityReadModel([
        q({ id: "old-perimeter", runId: "run-old", category: "exterior_perimeter" }),
        q({ id: "new-perimeter", runId: "run-new", category: "exterior_perimeter" }),
      ]),
    ).toThrow(/multiple runIds without activeRunId/);
  });
});
