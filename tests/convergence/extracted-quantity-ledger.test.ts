// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyEnrichedTakeoff, type QSExportData } from "../../src/lib/iq-qs-export";
import { fv, type EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import { buildExtractedQuantityLedger } from "../../src/lib/takeoff/extracted-quantity-ledger";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import { buildLedgerPlanOverlayModel } from "../../src/lib/verification/plan-overlay";

function enrichedBase(overrides: Partial<EnrichedTakeoff> = {}): EnrichedTakeoff {
  return {
    floor_area_m2: fv(160, "geometry", "high"),
    garage_area_m2: fv(null, "vision"),
    alfresco_area_m2: fv(null, "vision"),
    external_wall_lm: fv(58.13, "geometry", "high"),
    internal_wall_lm: fv(null, "vision"),
    gable_span_m: fv(null, "geometry"),
    roof_area_m2: fv(null, "vision"),
    window_count: fv(null, "vector", "low", ["opening dimensions need review"]),
    external_door_count: fv(null, "vision"),
    internal_door_count: fv(null, "vision"),
    bathroom_count: fv(null, "vision"),
    ensuite_count: fv(null, "vision"),
    laundry_count: fv(null, "vision"),
    kitchen_count: fv(null, "vision"),
    ceiling_height_m: fv(2.4, "geometry", "high"),
    foundation_type: fv("TC1", "asserted"),
    windows_by_room: fv(null, "vision"),
    windows_schedule: fv(null, "vision"),
    door_breakdown: fv(null, "vision"),
    garage_door_size: fv(null, "vision"),
    external_wall_area_m2: fv(null, "derived", null, ["Opening pricing blocked: review needed"]),
    total_area_m2: fv(160, "derived"),
    notes: "",
    opening_evidence: [],
    ...overrides,
  };
}

function qsBase(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0060",
    clientName: "Test Client",
    address: "1 Test St",
    templateId: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    floorAreaM2: null,
    perimeterLm: null,
    internalWallLm: null,
    gableSpanM: null,
    firstFloorAreaM2: null,
    studHeightMm: null,
    alfrescoAreaM2: null,
    roofPitch: null,
    ridgeType: null,
    underlay: null,
    claddingType1: null,
    claddingType2: null,
    windows: [],
    garageDoors: [],
    interiorDoors: [],
    downpipes: [],
    heatPumps: [],
    extras: [],
    skylights: [],
    clientFirstName: "Test",
    clientSurname: "Client",
    streetAddress: "1 Test St",
    addressLine2: null,
    city: null,
    email: null,
    phone: null,
    jmwNumber: "JM-0060",
    planVersion: "1",
    exteriorWallLengthLm: null,
    exteriorWallHeightM: null,
    pathsPatioM2: null,
    drivewayM2: null,
    windowsByRoom: {},
    downpipesWhite: 0,
    downpipesColourSteel: 0,
    downpipesPvcColoured: 0,
    garageDoor48x21Std: 0,
    garageDoor48x21Insulated: 0,
    garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0,
    garageDoor27x21Insulated: 0,
    intDoorStandard: 0,
    intDoorUGroove: 0,
    intDoorVGroove: 0,
    intDoorBarnSlider: 0,
    intDoorDouble: 0,
    intDoorCavitySlider: 0,
    ceilingHatch: 0,
    atticStair: 0,
    letterboxUrban: 0,
    washingLine: 0,
    heatPumpWallUnit: 0,
    heatPumpDucted: 0,
    specItems: {},
    ...over,
  };
}

describe("Extracted Quantity Ledger doctrine", () => {
  it("exports exterior perimeter even when openings need review", () => {
    const enriched = enrichedBase({
      opening_evidence: [
        {
          id: "visual-opening-1",
          status: "review",
          priced: false,
          type: "window",
          room: "Lounge",
          width_m: 1.4,
          height_m: null,
          area_m2: null,
          evidence: [
            {
              source: "vision",
              role: "candidate",
              confidence: "medium",
              width_m: 1.4,
              room: "Lounge",
            },
          ],
          review_flags: ["height not extracted"],
          conflicts: [],
        },
      ],
    });
    const ledger = buildExtractedQuantityLedger({ enriched, jobId: "job-60", runId: "run-1" });

    expect(ledger.find((row) => row.category === "exterior_perimeter")).toMatchObject({
      lengthMm: 58130,
      status: "extracted",
      runId: "run-1",
    });
    expect(ledger.find((row) => row.category === "window")).toMatchObject({
      widthMm: 1400,
      heightMm: null,
      areaM2: null,
      status: "missing_evidence",
      warnings: expect.arrayContaining(["height_not_extracted", "area_not_calculated"]),
    });
  });

  it("exports interior door count independently of exterior opening uncertainty", () => {
    const enriched = enrichedBase({
      door_counts_auto: { singles: 11, doubles: 2, cavitySliders: 3, barn: 0 },
      opening_evidence: [
        {
          id: "uncertain-pa",
          status: "review",
          priced: false,
          type: "pa_door",
          room: "Laundry",
          width_m: 1.03,
          height_m: 2.1,
          area_m2: 2.16,
          evidence: [
            {
              source: "floorplan_text",
              role: "width",
              confidence: "medium",
              width_m: 1.03,
              room: "Laundry",
            },
            {
              source: "asserted",
              role: "height",
              confidence: "low",
              height_m: 2.1,
              room: "Laundry",
            },
          ],
          review_flags: ["height assumed standard 2.1m - confirm against elevation"],
          conflicts: [],
        },
      ],
    });
    const ledger = buildExtractedQuantityLedger({ enriched, jobId: "job-60" });

    expect(ledger.find((row) => row.id === "interior-door-standard")).toMatchObject({
      category: "interior_door",
      count: 11,
      status: "extracted",
    });
    expect(ledger.find((row) => row.id === "interior-door-double")).toMatchObject({
      count: 2,
      status: "extracted",
    });
    expect(ledger.find((row) => row.id === "opening-uncertain-pa")).toMatchObject({
      category: "exterior_door",
      widthMm: 1030,
      heightMm: null,
      areaM2: null,
      status: "needs_review",
      warnings: expect.arrayContaining(["assumed_height_rejected", "area_not_calculated"]),
    });
  });

  it("projects page and bbox from a safe source into extracted quantity evidence", () => {
    const enriched = enrichedBase({
      opening_evidence: [
        {
          id: "safe-floorplan-text",
          status: "priced",
          priced: true,
          type: "window",
          room: "Bed 1",
          width_m: 1.5,
          height_m: 1.2,
          area_m2: 1.8,
          evidence: [
            {
              source: "floorplan_text",
              role: "dimension",
              confidence: "high",
              width_m: 1.5,
              height_m: 1.2,
              area_m2: 1.8,
              room: "Bed 1",
              page: 2,
              bbox: [100, 200, 140, 230],
              text: "W01 1200x1500",
            },
          ],
          review_flags: [],
          conflicts: [],
        },
      ],
    });

    const row = buildExtractedQuantityLedger({
      enriched,
      jobId: "job-60",
      runId: "run-safe",
    }).find((item) => item.id === "opening-safe-floorplan-text");

    expect(row).toMatchObject({
      source: "pdf_text",
      status: "extracted",
      widthMm: 1500,
      heightMm: 1200,
      areaM2: 1.8,
    });
    expect(row?.evidence[0]).toMatchObject({
      source: "pdf_text",
      page: 2,
      bbox: [100, 200, 140, 230],
      text: expect.stringContaining("floorplan_text"),
    });
  });

  it("does not add bbox when the source has no bbox", () => {
    const enriched = enrichedBase({
      opening_evidence: [
        {
          id: "text-no-bbox",
          status: "priced",
          priced: true,
          type: "window",
          room: "Bed 2",
          width_m: 1.5,
          height_m: 1.2,
          area_m2: 1.8,
          evidence: [
            {
              source: "floorplan_text",
              role: "dimension",
              confidence: "high",
              width_m: 1.5,
              height_m: 1.2,
              area_m2: 1.8,
              room: "Bed 2",
            },
          ],
          review_flags: [],
          conflicts: [],
        },
      ],
    });

    const row = buildExtractedQuantityLedger({ enriched, jobId: "job-60", runId: "run-safe" }).find(
      (item) => item.id === "opening-text-no-bbox",
    );

    expect(row?.evidence[0].page).toBeUndefined();
    expect(row?.evidence[0].bbox).toBeUndefined();
  });

  it("does not invent bbox from legacy visual_opening_audit", () => {
    const enriched = enrichedBase({
      visual_opening_audit: {
        pageNumber: 1,
        method: "visual_qs",
        openings: [
          {
            id: "O1",
            type: "window",
            room: "Bed 1",
            label: "1200x1500",
            height_m: 1.2,
            width_m: 1.5,
            x: 0.4,
            y: 0.5,
            confidence: "high",
            evidence: "visual marker only",
            flags: [],
          },
        ],
        warnings: [],
        summary: { totalOpenings: 1, qsGlazedOpenings: 1, garageDoors: 0, uncertain: 0 },
      },
      opening_evidence: [
        {
          id: "visual-review",
          status: "review",
          priced: false,
          type: "window",
          room: "Bed 1",
          width_m: 1.5,
          height_m: 1.2,
          area_m2: 1.8,
          evidence: [
            {
              source: "vision",
              role: "dimension",
              confidence: "high",
              width_m: 1.5,
              height_m: 1.2,
              area_m2: 1.8,
              room: "Bed 1",
            },
          ],
          review_flags: ["visual opening is review evidence only"],
          conflicts: [],
        },
      ],
    });

    const row = buildExtractedQuantityLedger({ enriched, jobId: "job-60", runId: "run-safe" }).find(
      (item) => item.id === "opening-visual-review",
    );

    expect(row?.source).toBe("visual_detection");
    expect(row?.evidence[0].bbox).toBeUndefined();
  });

  it("does not invent bbox from door_hits", () => {
    const enriched = enrichedBase({
      door_counts_auto: { singles: 1, doubles: 0, cavitySliders: 0, barn: 0 },
      door_page: {
        pageNumber: 1,
        view: [0, 0, 1000, 700],
        width: 1000,
        height: 700,
        scaleText: null,
      },
      door_hits: [{ type: "hinged", widthMm: 810, x: 120, y: 240, confidence: "confirmed" }],
    });

    const row = buildExtractedQuantityLedger({ enriched, jobId: "job-60", runId: "run-safe" }).find(
      (item) => item.id === "interior-door-standard",
    );

    expect(row?.evidence).toEqual([{ text: "deterministic interior-door engine confirmed count" }]);
  });

  it("does not use opening_schedule as active bbox source", () => {
    const enriched = enrichedBase({
      opening_evidence: [
        {
          id: "schedule-row",
          status: "priced",
          priced: true,
          type: "window",
          room: "Schedule only",
          width_m: 1.5,
          height_m: 1.2,
          area_m2: 1.8,
          evidence: [
            {
              source: "schedule",
              role: "dimension",
              confidence: "high",
              width_m: 1.5,
              height_m: 1.2,
              area_m2: 1.8,
              room: "Schedule only",
            },
          ],
          review_flags: [],
          conflicts: [],
        },
      ],
    });

    const row = buildExtractedQuantityLedger({ enriched, jobId: "job-60", runId: "run-safe" }).find(
      (item) => item.id === "opening-schedule-row",
    );

    expect(row?.source).toBe("window_schedule");
    expect(row?.evidence[0].bbox).toBeUndefined();
  });

  it("preserves bbox through ledger read model into runtime visual anchors", () => {
    const enriched = enrichedBase({
      opening_evidence: [
        {
          id: "anchored-row",
          status: "review",
          priced: false,
          type: "window",
          room: "Bed 3",
          width_m: 1.5,
          height_m: null,
          area_m2: null,
          evidence: [
            {
              source: "floorplan_text",
              role: "width",
              confidence: "medium",
              width_m: 1.5,
              room: "Bed 3",
              page: 3,
              bbox: [10, 20, 30, 40],
              text: "W03 width witness",
            },
          ],
          review_flags: ["height not extracted"],
          conflicts: [],
        },
      ],
    });
    const ledger = buildExtractedQuantityLedger({ enriched, jobId: "job-60", runId: "run-safe" });
    const readModel = buildExtractedQuantityReadModel(ledger, { activeRunId: "run-safe" });
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(
      readModel.rows.find((row) => row.id === "opening-anchored-row")?.evidence[0],
    ).toMatchObject({
      page: 3,
      bbox: [10, 20, 30, 40],
    });
    expect(
      overlay.markedRows.find((row) => row.extractedQuantityId === "opening-anchored-row"),
    ).toMatchObject({
      status: "missing_evidence",
      visualAnchor: expect.objectContaining({
        page: 3,
        bbox: [10, 20, 30, 40],
      }),
    });
  });

  it("keeps assumed-height rows as needs_review even when upstream pricing evidence carried conflicts", () => {
    const enriched = enrichedBase({
      opening_evidence: [
        {
          id: "held-pa-conflict",
          status: "held_blocked",
          priced: false,
          type: "pa_door",
          room: "Laundry",
          width_m: 1.03,
          height_m: 2.1,
          area_m2: 2.16,
          evidence: [
            {
              source: "floorplan_text",
              role: "dimension",
              confidence: "medium",
              width_m: 1.03,
              height_m: 2.1,
              area_m2: 2.16,
              room: "Laundry",
            },
            {
              source: "asserted",
              role: "height",
              confidence: "low",
              height_m: 2.1,
              room: "Laundry",
            },
          ],
          review_flags: ["height assumed standard 2.1m - confirm against elevation"],
          conflicts: ["visual_reconciliation_error"],
        },
      ],
    });
    const ledger = buildExtractedQuantityLedger({ enriched, jobId: "job-60" });

    expect(ledger.find((row) => row.id === "opening-held-pa-conflict")).toMatchObject({
      status: "needs_review",
      heightMm: null,
      areaM2: null,
      warnings: expect.arrayContaining([
        "assumed_height_rejected",
        "area_not_calculated",
        "source_conflict",
      ]),
    });
  });

  it("threads extracted quantities through EnrichedTakeoff export read model without changing pricing gates", () => {
    const enriched = enrichedBase({
      extracted_quantities: [
        {
          id: "external-perimeter",
          jobId: "job-60",
          runId: "run-1",
          category: "exterior_perimeter",
          label: "Exterior perimeter",
          count: 1,
          lengthMm: 58130,
          areaM2: null,
          source: "vector_geometry",
          evidence: [{ text: "geometry perimeter" }],
          status: "extracted",
          confidence: 95,
          warnings: [],
          createdAt: "2026-06-28T00:00:00.000Z",
          updatedAt: "2026-06-28T00:00:00.000Z",
        },
      ],
    });
    const out = applyEnrichedTakeoff(qsBase(), enriched);

    expect(out.extractedQuantities).toEqual(enriched.extracted_quantities);
    expect(out.extractedQuantityReadModel?.groups.extracted).toHaveLength(1);
    expect(out.extractedQuantityReadModel?.cleanTotalsByCategory.exterior_perimeter).toEqual({
      count: 1,
      lengthMm: 58130,
      areaM2: 0,
    });
    expect(out.openingPricingBlocked).toBe(true);
    expect(out.perimeterLm).toBe(58.13);
  });
});
