// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyEnrichedTakeoff, type QSExportData } from "../../src/lib/iq-qs-export";
import { fv, type EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import { buildExtractedQuantityLedger } from "../../src/lib/takeoff/extracted-quantity-ledger";

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
