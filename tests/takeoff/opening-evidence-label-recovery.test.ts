import { describe, expect, it } from "vitest";
import { fv, type EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import { buildExtractedQuantityLedger } from "../../src/lib/takeoff/extracted-quantity-ledger";
import { buildOpeningEvidenceLedger } from "../../src/lib/takeoff/opening-evidence";
import type { PlanText } from "../../src/lib/takeoff/plan-text";

function planText(windowCode: PlanText["windowCodes"][number]): PlanText {
  return {
    rooms: [
      { name: "BED 3", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 100, y: 100 },
      { name: "DINING", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 300, y: 100 },
    ],
    windowCodes: [windowCode],
    titleAreas: {},
  };
}

function extractedRows(openingEvidence: ReturnType<typeof buildOpeningEvidenceLedger>) {
  return buildExtractedQuantityLedger({
    enriched: {
      external_wall_lm: fv(40, "geometry", "high"),
      door_counts_auto: null,
      opening_evidence: openingEvidence,
    } as unknown as EnrichedTakeoff,
    jobId: "job-1",
    runId: "run-1",
  });
}

describe("floor-plan label recovery into opening evidence", () => {
  it("surfaces clean W x H labels as extracted quantity rows without pricing them", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 1300, widthMm: 1500, x: 105, y: 100 }),
      planPage: 2,
    });
    const candidate = evidence.find((item) => item.id === "floorplan-label-1");
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");

    expect(candidate).toMatchObject({
      status: "extracted",
      priced: false,
      type: "window",
      room: "BED 3",
      width_m: 1.5,
      height_m: 1.3,
      area_m2: 1.95,
    });
    expect(candidate?.evidence[0]).toMatchObject({
      source: "floorplan_text",
      role: "dimension",
      page: 2,
      bbox: [87, 93, 123, 107],
      text: "1300 x 1500",
    });
    expect(row).toMatchObject({
      category: "window",
      status: "extracted",
      source: "pdf_text",
      widthMm: 1500,
      heightMm: 1300,
      areaM2: 1.95,
      warnings: [],
    });
  });

  it("keeps dirty/tall labels visible as needs_review and out of clean area", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 2150, widthMm: 600, x: 105, y: 100 }),
      planPage: 2,
    });
    const candidate = evidence.find((item) => item.id === "floorplan-label-1");
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");

    expect(candidate).toMatchObject({
      status: "review",
      priced: false,
      width_m: 0.6,
      height_m: 2.15,
      area_m2: null,
    });
    expect(row).toMatchObject({
      status: "needs_review",
      widthMm: 600,
      heightMm: 2150,
      areaM2: null,
      warnings: ["area_not_calculated"],
    });
  });
});
