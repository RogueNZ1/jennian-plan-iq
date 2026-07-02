import { describe, expect, it } from "vitest";
import { fv, type EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import { buildExtractedQuantityLedger } from "../../src/lib/takeoff/extracted-quantity-ledger";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import { buildOpeningEvidenceLedger } from "../../src/lib/takeoff/opening-evidence";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";
import type { PlanText } from "../../src/lib/takeoff/plan-text";

function planText(
  windowCode: PlanText["windowCodes"][number],
  overrides: Partial<PlanText> = {},
): PlanText {
  return {
    rooms: [
      { name: "BED 3", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 100, y: 100 },
      { name: "DINING", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 300, y: 100 },
    ],
    windowCodes: [windowCode],
    titleAreas: {},
    ...overrides,
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

  it("full-height narrow sidelight labels are green glass rows; door-leaf-like stays out of clean area", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 2150, widthMm: 400, x: 105, y: 100 }),
      planPage: 2,
    });
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");
    expect(row).toMatchObject({
      status: "extracted",
      widthMm: 400,
      heightMm: 2150,
      areaM2: 0.86,
    });

    const doorish = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 1980, widthMm: 810, x: 105, y: 100 }),
      planPage: 2,
    });
    const doorRow = extractedRows(doorish).find(
      (item) => item.id === "opening-floorplan-label-1",
    );
    expect(doorRow).toMatchObject({
      status: "needs_review",
      areaM2: null,
      warnings: ["area_not_calculated"],
    });
  });

  it("surfaces full-height narrow labels as clean extracted rows when assignment is unique", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 2150, widthMm: 600, x: 105, y: 100 }),
      planPage: 2,
    });
    const candidate = evidence.find((item) => item.id === "floorplan-label-1");
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");

    expect(candidate).toMatchObject({
      status: "extracted",
      priced: false,
      width_m: 0.6,
      height_m: 2.15,
      area_m2: 1.29,
    });
    expect(row).toMatchObject({
      status: "extracted",
      widthMm: 600,
      heightMm: 2150,
      areaM2: 1.29,
      warnings: [],
    });
  });

  it("does not create a second clean extracted row when a floor-plan label matches an existing opening", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [
        {
          type: "window",
          room: "BED 3",
          width_m: 1.5,
          height_m: 1.3,
          area_m2: 1.95,
          glazed: true,
          cladding: null,
          source: "vector",
          confidence: "high",
        },
      ],
      planText: planText({ heightMm: 1300, widthMm: 1500, x: 105, y: 100 }),
      planPage: 2,
    });
    const ledger = extractedRows(evidence);
    const cleanWindows = ledger.filter(
      (row) => row.category === "window" && row.status === "extracted",
    );
    const readModel = buildExtractedQuantityReadModel(ledger, { activeRunId: "run-1" });

    expect(evidence.find((item) => item.id === "floorplan-label-1")).toBeUndefined();
    expect(cleanWindows.map((row) => row.id)).toEqual(["opening-opening-1"]);
    expect(cleanWindows[0]).toMatchObject({
      widthMm: 1500,
      heightMm: 1300,
      areaM2: 1.95,
      source: "floorplan_symbol",
      status: "extracted",
    });
    expect(cleanWindows[0]?.evidence.map((item) => item.source)).toContain("pdf_text");
    expect(cleanWindows[0]?.evidence.map((item) => item.text).join(" ")).toContain(
      "supporting duplicate floor-plan label",
    );
    expect(readModel.cleanTotalsByCategory.window).toEqual({
      count: 1,
      lengthMm: 0,
      areaM2: 1.95,
    });
  });

  it("keeps repeated same-room same-dimension floor-plan labels as separate clean rows", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText(
        { heightMm: 1100, widthMm: 800, x: 95, y: 94 },
        {
          windowCodes: [
            { heightMm: 1100, widthMm: 800, x: 95, y: 94 },
            { heightMm: 1100, widthMm: 800, x: 112, y: 110 },
          ],
        },
      ),
      planPage: 2,
    });
    const ledger = extractedRows(evidence);
    const cleanWindows = ledger.filter(
      (row) => row.category === "window" && row.status === "extracted",
    );
    const readModel = buildExtractedQuantityReadModel(ledger, { activeRunId: "run-1" });

    expect(evidence.filter((item) => item.id.startsWith("floorplan-label-"))).toHaveLength(2);
    expect(cleanWindows.map((row) => row.id)).toEqual([
      "opening-floorplan-label-1",
      "opening-floorplan-label-2",
    ]);
    expect(cleanWindows.map((row) => row.evidence[0]?.bbox)).toEqual([
      [77, 87, 113, 101],
      [94, 103, 130, 117],
    ]);
    expect(readModel.cleanTotalsByCategory.window).toEqual({
      count: 2,
      lengthMm: 0,
      areaM2: 1.76,
    });
  });

  it("keeps same-size openings in different rooms distinct", () => {
    const opening = (room: string): Opening => ({
      type: "window",
      room,
      width_m: 1.5,
      height_m: 1.3,
      area_m2: 1.95,
      glazed: true,
      cladding: null,
      source: "vector",
      confidence: "high",
    });
    const evidence = buildOpeningEvidenceLedger({
      openings: [opening("BED 3"), opening("DINING")],
      planText: planText(
        { heightMm: 1300, widthMm: 1500, x: 105, y: 100 },
        {
          windowCodes: [
            { heightMm: 1300, widthMm: 1500, x: 105, y: 100 },
            { heightMm: 1300, widthMm: 1500, x: 300, y: 100 },
          ],
        },
      ),
      planPage: 2,
    });
    const cleanWindows = extractedRows(evidence).filter(
      (row) => row.category === "window" && row.status === "extracted",
    );

    expect(evidence.filter((item) => item.id.startsWith("floorplan-label-"))).toHaveLength(0);
    expect(cleanWindows.map((row) => row.id)).toEqual(["opening-opening-1", "opening-opening-2"]);
    expect(cleanWindows.map((row) => row.areaM2)).toEqual([1.95, 1.95]);
  });

  it("does not suppress dirty review labels when a different clean opening exists", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [
        {
          type: "window",
          room: "BED 3",
          width_m: 1.5,
          height_m: 1.3,
          area_m2: 1.95,
          glazed: true,
          cladding: null,
          source: "vector",
          confidence: "high",
        },
      ],
      planText: planText(
        { heightMm: 2150, widthMm: 400, x: 300, y: 100 },
        {
          draftingIssues: [
            {
              kind: "malformed_dimension_label",
              text: "1300x175036001300x1750",
              x: 285,
              y: 105,
            },
          ],
        },
      ),
      planPage: 2,
    });
    const row = extractedRows(evidence).find((item) => item.id === "opening-floorplan-label-1");

    expect(evidence.find((item) => item.id === "floorplan-label-1")).toMatchObject({
      status: "review",
      room: "DINING",
      width_m: 0.4,
      height_m: 2.15,
      area_m2: null,
    });
    expect(row).toMatchObject({
      status: "needs_review",
      widthMm: 400,
      heightMm: 2150,
      areaM2: null,
      warnings: ["area_not_calculated"],
    });
  });
});

describe("width-witness door/slider recovery (Haydon doctrine 2 Jul 2026)", () => {
  const witness = (
    over: Partial<
      import("../../src/lib/takeoff/floor-opening-witnesses").PlanPhysicalOpeningWidthWitness
    > = {},
  ) => ({
    kind: "physical_opening_width" as const,
    openingKind: "wide_opening" as const,
    widthMm: 2400,
    x: 120,
    y: 90,
    vertical: false,
    text: "2 400",
    room: "MASTER BED",
    planSide: "plan_top" as const,
    evidence: { stub: true, leaf: false },
    note: "physical wall-opening width",
    ...over,
  });

  it("recovers a width-only exterior opening as a green slider at standard 2.1m height", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      planText: planText({ heightMm: 1300, widthMm: 1500, x: 105, y: 100 }),
      physicalOpeningWidthWitnesses: [witness()],
    });
    const row = extractedRows(evidence).find((item) =>
      item.id.includes("door-width-witness-1"),
    );
    expect(row).toMatchObject({
      status: "extracted",
      category: "window",
      widthMm: 2400,
      heightMm: 2100,
      areaM2: 5.04,
    });
  });

  it("recovers an entry-door witness as green exterior_door glass at 2.1m", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      physicalOpeningWidthWitnesses: [
        witness({ openingKind: "entry_door", widthMm: 1400, room: "ENTRY", text: "1 400" }),
      ],
    });
    const row = extractedRows(evidence).find((item) =>
      item.id.includes("door-width-witness-1"),
    );
    expect(row).toMatchObject({
      status: "extracted",
      category: "exterior_door",
      widthMm: 1400,
      heightMm: 2100,
      areaM2: 2.94,
    });
  });

  it("never turns a garage sectional width into glass", () => {
    const evidence = buildOpeningEvidenceLedger({
      openings: [],
      physicalOpeningWidthWitnesses: [witness({ widthMm: 4800, room: "GARAGE" })],
    });
    expect(evidence.find((item) => item.id.startsWith("door-width-witness"))).toBeUndefined();
  });

  it("does not duplicate an already-recovered opening of the same width", () => {
    const lounge: Opening = {
      type: "slider",
      room: "Lounge",
      height_m: 2.125,
      width_m: 3.6,
      glazed: true,
      cladding: null,
      area_m2: 7.65,
      source: "vector",
      confidence: "medium",
    };
    const evidence = buildOpeningEvidenceLedger({
      openings: [lounge],
      physicalOpeningWidthWitnesses: [
        witness({ widthMm: 3600, room: "LOUNGE", planSide: "plan_left" }),
      ],
    });
    expect(evidence.find((item) => item.id.startsWith("door-width-witness"))).toBeUndefined();
  });
});
