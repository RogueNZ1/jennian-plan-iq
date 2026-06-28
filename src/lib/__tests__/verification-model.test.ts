import { describe, it, expect } from "vitest";

import {
  buildVerificationModel,
  nzDateTime,
  SOURCE_LEGEND,
} from "../verification/verification-model";
import type { QSExportData } from "../iq-qs-export";
import type { EnrichedTakeoff } from "../takeoff/enriched-takeoff";
import { fv } from "../takeoff/enriched-takeoff";
import type { ExtractedQuantity } from "../takeoff/extracted-quantity-ledger";
import { buildExtractedQuantityReadModel } from "../takeoff/extracted-quantity-read-model";

/* ------------------------------------------------------------------ fixtures */

function makeData(overrides: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0042",
    clientName: "Test Client",
    address: "1 Test St, Palmerston North",
    templateId: null,
    createdAt: "2026-06-10T00:00:00Z",
    specifications: null,
    floorAreaM2: 165,
    perimeterLm: 60,
    internalWallLm: 48,
    geometryStatus: null,
    gableSpanM: 9.2,
    firstFloorAreaM2: null,
    studHeightMm: 2400,
    alfrescoAreaM2: 12,
    roofPitch: "25°",
    ridgeType: null,
    underlay: null,
    claddingType1: "Brick",
    claddingType2: null,
    claddingTypeCode: 1,
    elevationSummary: null,
    windows: [
      { type: "Awning 1200×1000", qty: 6 },
      { type: "Slider 2400×2000", qty: 2 },
    ],
    garageDoors: [],
    interiorDoors: [],
    downpipes: [],
    heatPumps: [{ model: "Mitsubishi high wall", qty: 1 }],
    extras: [{ description: "Extra power points", value: 850 }],
    skylights: [],
    clientFirstName: "Test",
    clientSurname: "Client",
    streetAddress: "1 Test St",
    addressLine2: null,
    city: "Palmerston North",
    email: null,
    phone: null,
    jmwNumber: "JMW-1234",
    planVersion: "C",
    exteriorWallLengthLm: 60,
    exteriorWallHeightM: 2.4,
    pathsPatioM2: 20,
    drivewayM2: 55,
    windowsByRoom: {
      bed1: { cladding: "Brick", qty: 2, height: 1000, width: 1200 },
      kitchen: { cladding: "Brick", qty: 1, height: 600, width: 1800 },
    },
    downpipesWhite: 4,
    downpipesColourSteel: 0,
    downpipesPvcColoured: 0,
    garageDoor48x21Std: 0,
    garageDoor48x21Insulated: 1,
    garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0,
    garageDoor27x21Insulated: 0,
    doorsSource: "engine",
    intDoorVisionHint: 12,
    intDoorStandard: 9,
    intDoorUGroove: 0,
    intDoorVGroove: 0,
    intDoorBarnSlider: 1,
    intDoorDouble: 1,
    intDoorCavitySlider: 2,
    ceilingHatch: 1,
    atticStair: 0,
    letterboxUrban: 1,
    washingLine: 1,
    heatPumpWallUnit: 1,
    heatPumpDucted: 0,
    specItems: {},
    takeoffSource: "enriched",
    reviewFlags: [],
    ...overrides,
  } as QSExportData;
}

function makeEnriched(overrides: Partial<EnrichedTakeoff> = {}): EnrichedTakeoff {
  return {
    floor_area_m2: fv(165, "geometry", "high"),
    garage_area_m2: fv(36, "geometry", "high"),
    alfresco_area_m2: fv(12, "vision", "mid"),
    external_wall_lm: fv(60, "geometry", "high"),
    internal_wall_lm: fv(48, "geometry", "low", [
      "internal walls suppressed in export until P2 ribbon-trace",
    ]),
    gable_span_m: fv(9.2, "geometry", "mid"),
    roof_area_m2: fv(210, "derived", null),
    window_count: fv(8, "schedule", "high"),
    external_door_count: fv(2, "vector", "high"),
    internal_door_count: fv(13, "vision", "mid"),
    bathroom_count: fv(1, "vision", "mid"),
    ensuite_count: fv(1, "vision", "mid"),
    laundry_count: fv(1, "vision", "mid"),
    kitchen_count: fv(1, "vision", "high"),
    ceiling_height_m: fv(2.4, "asserted", null),
    foundation_type: fv("Concrete slab", "vision", "mid"),
    windows_by_room: fv({}, "vision", "mid"),
    windows_schedule: fv(
      [
        { id: "W1", height_m: 1.0, width_m: 1.2 },
        { id: "W2", height_m: 2.0, width_m: 2.4 },
      ],
      "schedule",
      "high",
    ),
    door_breakdown: fv(
      { standard: 9, cavity_sliders: 2, double_doors: 1, barn_sliders: 1 },
      "vision",
      "mid",
    ),
    garage_door_size: fv("4.8 × 2.1", "vector", "high"),
    external_wall_area_m2: fv(144, "derived", null),
    total_area_m2: fv(213, "derived", null),
    notes: "",
    glazed_sqm: 18.4,
    total_opening_sqm: 24.1,
    ...overrides,
  };
}

const RUN = { id: "abcd1234-ffff-0000-9999-aaaaaaaaaaaa", started_at: "2026-06-12T01:32:00Z" };

function quantity(overrides: Partial<ExtractedQuantity>): ExtractedQuantity {
  return {
    id: "q",
    jobId: "job-1",
    runId: RUN.id,
    category: "window",
    label: "Window",
    count: 1,
    widthMm: 1200,
    heightMm: 1000,
    lengthMm: null,
    areaM2: 1.2,
    source: "vector_geometry",
    evidence: [{ page: 2, bbox: [1, 2, 3, 4], text: "W01 1200x1000" }],
    status: "extracted",
    confidence: 95,
    warnings: [],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ tests */

describe("buildVerificationModel", () => {
  it("header carries job identity, short run id, and NZT stamps", () => {
    const m = buildVerificationModel(
      makeData(),
      makeEnriched(),
      RUN,
      new Date("2026-06-12T06:00:00Z"),
    );
    expect(m.header.jobNumber).toBe("JM-0042");
    expect(m.header.jmwNumber).toBe("JMW-1234");
    expect(m.header.runIdShort).toBe("abcd1234");
    // 01:32 UTC on 12 Jun = 13:32 NZST same day — the bug the NZT fix exists for.
    expect(m.header.runStartedNzt).toContain("12/06/2026");
    expect(m.header.runStartedNzt).toContain("13:32");
    expect(m.header.generatedNzt).toContain("12/06/2026");
    expect(m.header.takeoffSource).toBe("enriched");
  });

  it("measures show export values with enriched provenance, confidence, and flag state", () => {
    const m = buildVerificationModel(makeData(), makeEnriched(), RUN);
    const floor = m.measures.find((r) => r.label.startsWith("Floor area"))!;
    expect(floor.value).toBe("165");
    expect(floor.source).toBe("GEO");
    expect(floor.confidence).toBe("high");
    expect(floor.flagged).toBe(false);

    const internal = m.measures.find((r) => r.label.startsWith("Internal walls"))!;
    expect(internal.flagged).toBe(true);
    // Suppressed identically to the export (P2 ribbon-trace pending): never the raw number.
    expect(internal.value).toBe("—");
    expect(internal.label).toContain("measure manually");

    const ceiling = m.measures.find((r) => r.label === "Ceiling height")!;
    expect(ceiling.source).toBe("AST");
  });

  it("renders '—' for missing values and survives a null enriched payload (relational fallback)", () => {
    const m = buildVerificationModel(
      makeData({ floorAreaM2: null, takeoffSource: "relational" }),
      null,
      null,
    );
    const floor = m.measures.find((r) => r.label.startsWith("Floor area"))!;
    expect(floor.value).toBe("—");
    expect(floor.source).toBeNull();
    expect(m.header.runIdShort).toBeNull();
    expect(m.windows.schedule).toEqual([]);
    expect(m.exceptions).toEqual([]);
  });

  it("prints explicit N/A/manual-review semantics for non-applicable or unmeasured areas", () => {
    const m = buildVerificationModel(
      makeData({
        alfrescoAreaM2: null,
        firstFloorAreaM2: null,
        garageDoor27x21Std: 1,
      }),
      makeEnriched({
        garage_area_m2: fv<number>(null, "vision", null),
        alfresco_area_m2: fv<number>(null, "vision", null),
      }),
      RUN,
    );
    expect(m.measures.find((r) => r.label === "Garage area")).toMatchObject({
      value: "Measure manually",
      source: "MAN",
      flagged: true,
    });
    expect(m.measures.find((r) => r.label === "Alfresco area")?.value).toBe("N/A");
    expect(m.measures.find((r) => r.label === "First-floor area")?.value).toBe("N/A");
  });

  it("windows: per-room rows, schedule entries, QS rows, and totals all present", () => {
    const m = buildVerificationModel(makeData(), makeEnriched(), RUN);
    expect(m.windows.byRoom).toHaveLength(2);
    expect(m.windows.byRoom[0]).toMatchObject({ room: "Bed 1", qty: 2, height: 1000, width: 1200 });
    expect(m.windows.schedule.map((s) => s.id)).toEqual(["W1", "W2"]);
    expect(m.windows.qsRows).toEqual([
      { label: "Awning 1200×1000", qty: 6 },
      { label: "Slider 2400×2000", qty: 2 },
    ]);
    expect(m.windows.totals).toMatchObject({
      windowCount: 8,
      qsGlazedOpeningCount: null,
      garageDoorCount: null,
      glazedSqm: 18.4,
      totalOpeningSqm: 24.1,
    });
  });

  it("windows: canonical openings print as flat QS opening rows when present", () => {
    const m = buildVerificationModel(
      makeData({
        openings: [
          {
            type: "window",
            room: "Bed 1",
            height_m: 1,
            width_m: 0.6,
            glazed: true,
            cladding: null,
            area_m2: 0.6,
            source: "vision",
            confidence: "high",
          },
          {
            type: "pa_door",
            room: "Laundry",
            height_m: 2.1,
            width_m: 1,
            glazed: true,
            cladding: null,
            area_m2: 2.1,
            source: "asserted",
            flags: ["confirm size"],
            confidence: "medium",
          },
          {
            type: "sectional_door",
            room: "Garage",
            height_m: 2.52,
            width_m: 2.8,
            glazed: false,
            cladding: null,
            area_m2: 7.06,
            source: "vision",
            confidence: "high",
          },
        ],
      }),
      makeEnriched(),
      RUN,
    );
    expect(m.windows.openings).toEqual([
      {
        id: "O1",
        type: "Window",
        room: "Bed 1",
        height: 1,
        width: 0.6,
        area: 0.6,
        source: "VIS",
        flags: [],
      },
      {
        id: "O2",
        type: "PA / laundry door",
        room: "Laundry",
        height: 2.1,
        width: 1,
        area: 2.1,
        source: "AST",
        flags: ["confirm size"],
      },
    ]);
    expect(m.windows.totals.qsGlazedOpeningCount).toBe(2);
    expect(m.windows.totals.garageDoorCount).toBe(1);
  });

  it("windows: blocked opening pricing is loud and suppresses fallback/visual totals", () => {
    const m = buildVerificationModel(
      makeData({
        openingPricingBlocked: true,
        openings: [],
        garageDoor48x21Insulated: 0,
        windowsByRoom: {
          lounge: { cladding: "Linea", qty: 2, height: 2100, width: 2400 },
        },
      }),
      makeEnriched({
        garage_door_size: fv("5.4 Ã— 2.4", "vision", "low"),
        external_wall_area_m2: fv<number>(null, "derived", null, [
          "Opening pricing blocked: unresolved Visual QS reconciliation error. Visual QS found 17 QS-glazed external openings, but the composed opening set has 20. Reconcile before pricing.",
        ]),
        total_opening_sqm: null,
        glazed_sqm: null,
        visual_opening_audit: {
          pageNumber: 1,
          method: "visual_qs",
          summary: { totalOpenings: 18, qsGlazedOpenings: 17, garageDoors: 1, uncertain: 1 },
          warnings: [],
          openings: [],
        },
        visual_opening_reconciliation: {
          method: "visual_qs_reconciliation",
          status: "review",
          summary: {
            visualQsGlazedOpenings: 17,
            composedGlazedOpenings: 20,
            visualGarageDoors: 1,
            composedGarageDoorSize: "5.4x2.4",
          },
          issues: [
            {
              severity: "error",
              field: "windows_by_room",
              message:
                "Visual QS found 17 QS-glazed external openings, but the composed opening set has 20. Reconcile before pricing.",
              visual: "17",
              composed: "20",
              openingIds: ["O1"],
            },
          ],
        },
      }),
      RUN,
    );

    expect(m.windows.pricingBlocked).toBe(true);
    expect(m.windows.pricingBlockFlags.join(" ")).toContain("OPENING PRICING BLOCKED");
    expect(m.windows.pricingBlockFlags.join(" ")).toContain("do not price windows");
    expect(m.windows.byRoom).toEqual([]);
    expect(m.windows.qsRows).toEqual([]);
    expect(m.windows.totals.qsGlazedOpeningCount).toBeNull();
    expect(m.windows.totals.garageDoorCount).toBeNull();
    expect(m.windows.totals.totalOpeningSqm).toBeNull();
    expect(m.integrityAlerts).toEqual([]);
    expect(m.windows.reviewOnlyTotals).toMatchObject({
      visualOpeningCount: 18,
      qsGlazedOpeningCount: 17,
      garageDoorCount: 1,
    });
    expect(m.doors.garageDoorSize).toBe("Blocked - verify manually");
    expect(m.doors.garageDoorFlags.join(" ")).toContain("review-only until reconciled");
  });

  it("windows: canonical rows keep visual O labels when a garage-door exception is excluded", () => {
    const m = buildVerificationModel(
      makeData({
        openings: [
          {
            type: "garage_window",
            room: "Garage",
            height_m: 0.6,
            width_m: 1.8,
            glazed: true,
            cladding: null,
            area_m2: 1.08,
            source: "vision",
            confidence: "high",
          },
          {
            type: "slider",
            room: "Dining",
            height_m: 2.055,
            width_m: 2.1,
            glazed: true,
            cladding: null,
            area_m2: 4.33,
            source: "vision",
            confidence: "high",
          },
          {
            type: "sectional_door",
            room: "Garage",
            height_m: 2.52,
            width_m: 2.8,
            glazed: false,
            cladding: null,
            area_m2: 7.06,
            source: "vision",
            confidence: "high",
          },
        ],
      }),
      makeEnriched({
        visual_opening_audit: {
          pageNumber: 1,
          method: "visual_qs",
          summary: { totalOpenings: 3, qsGlazedOpenings: 2, garageDoors: 1, uncertain: 0 },
          warnings: [],
          openings: [
            {
              id: "O6",
              type: "garage_door",
              room: "Garage",
              label: "2800x2520",
              height_m: 2.52,
              width_m: 2.8,
              confidence: "high",
              evidence: "garage door",
              flags: [],
              x: 0.8,
              y: 0.2,
            },
            {
              id: "O7",
              type: "window",
              room: "Garage",
              label: "1800x600 W141",
              height_m: 0.6,
              width_m: 1.8,
              confidence: "high",
              evidence: "garage window",
              flags: [],
              x: 0.8,
              y: 0.28,
            },
            {
              id: "O8",
              type: "slider",
              room: "Dining",
              label: "2100x2055",
              height_m: 2.055,
              width_m: 2.1,
              confidence: "high",
              evidence: "dining slider",
              flags: [],
              x: 0.72,
              y: 0.35,
            },
          ],
        },
      }),
      RUN,
    );
    expect(m.windows.openings.map((o) => [o.id, o.type, o.room])).toEqual([
      ["O7", "Garage window", "Garage"],
      ["O8", "Slider", "Dining"],
    ]);
  });

  it("surfaces unplaced window flags from the enriched fields", () => {
    const e = makeEnriched({
      windows_by_room: fv({}, "vision", "mid", ["⚑ UNPLACED: W7 1200×1000 — no room match"]),
    });
    const m = buildVerificationModel(makeData(), e, RUN);
    expect(m.windows.unplacedFlags).toHaveLength(1);
    expect(m.windows.unplacedFlags[0]).toContain("W7");
  });

  it("windows: unreadable external-door markers keep their visual O label after a garage exception", () => {
    const m = buildVerificationModel(
      makeData({
        openings: [
          {
            type: "window",
            room: "Entry",
            height_m: 1.69,
            width_m: 1.2,
            glazed: true,
            cladding: null,
            area_m2: 2.03,
            source: "vision",
            confidence: "high",
          },
          {
            type: "entrance",
            room: "Entry",
            height_m: 2.1,
            width_m: 1,
            glazed: true,
            cladding: null,
            area_m2: 2.1,
            source: "vision",
            confidence: "medium",
            flags: ["size not readable"],
          },
        ],
      }),
      makeEnriched({
        visual_opening_audit: {
          pageNumber: 6,
          method: "visual_qs",
          summary: { totalOpenings: 3, qsGlazedOpenings: 2, garageDoors: 1, uncertain: 0 },
          warnings: [],
          openings: [
            {
              id: "O7",
              type: "garage_door",
              room: "Garage",
              label: "2800x2520",
              height_m: 2.52,
              width_m: 2.8,
              confidence: "high",
              evidence: "garage door",
              flags: [],
              x: 0.8,
              y: 0.2,
            },
            {
              id: "O18",
              type: "window",
              room: "Entry",
              label: "W107 1685x1200",
              height_m: 1.69,
              width_m: 1.2,
              confidence: "high",
              evidence: "entry window",
              flags: [],
              x: 0.52,
              y: 0.27,
            },
            {
              id: "O19",
              type: "external_door",
              room: "Entry",
              label: null,
              height_m: null,
              width_m: null,
              confidence: "medium",
              evidence: "entry door symbol",
              flags: ["size not readable"],
              x: 0.56,
              y: 0.32,
            },
          ],
        },
      }),
      RUN,
    );

    expect(m.windows.openings.map((o) => [o.id, o.type, o.room])).toEqual([
      ["O18", "Window", "Entry"],
      ["O19", "Entrance door", "Entry"],
    ]);
  });

  it("doors: interior rows with engine source label, totals, garage filtered to non-zero", () => {
    const m = buildVerificationModel(makeData(), makeEnriched(), RUN);
    expect(m.doors.interiorTotal).toBe(13);
    expect(m.doors.sourceLabel).toBe("Deterministic door engine");
    expect(m.doors.visionHint).toBe(12);
    expect(m.doors.garage).toEqual([{ label: "4.8 × 2.1 insulated", qty: 1 }]);
    expect(m.doors.garageDoorSize).toBe("4.8 × 2.1");
  });

  it("doors: garage visual reconciliation warning is printed beside the garage size", () => {
    const m = buildVerificationModel(
      makeData(),
      makeEnriched({
        visual_opening_reconciliation: {
          method: "visual_qs_reconciliation",
          status: "review",
          summary: {
            visualQsGlazedOpenings: 19,
            composedGlazedOpenings: 19,
            visualGarageDoors: 1,
            composedGarageDoorSize: "2.7x2.1",
          },
          issues: [
            {
              severity: "warning",
              field: "garage_door_size",
              message:
                "Visual QS garage door read 2520x2800 is outside the garage-door plausibility band; keeping composed garage door size 2700x2100.",
              visual: "2520x2800",
              composed: "2700x2100",
              openingIds: ["O7"],
            },
          ],
        },
      }),
      RUN,
    );

    expect(m.doors.garageDoorFlags).toHaveLength(1);
    expect(m.doors.garageDoorFlags[0]).toContain("Visual QS garage door read");
  });

  it("doors with NO source print the fail-safe warning, never a quiet zero", () => {
    const m = buildVerificationModel(makeData({ doorsSource: null }), makeEnriched(), RUN);
    expect(m.doors.sourceLabel).toContain("⚑ NO SOURCE");
    expect(m.doors.sourceLabel).toContain("do not price");
  });

  it("geometry offline is detected from either the export field or the enriched status", () => {
    const fromExport = buildVerificationModel(
      makeData({ geometryStatus: "unavailable" }),
      makeEnriched(),
      RUN,
    );
    expect(fromExport.geometryOffline).toBe(true);

    const fromEnriched = buildVerificationModel(
      makeData(),
      makeEnriched({ geometry_status: fv("unavailable", "flagged-unknown", null) }),
      RUN,
    );
    expect(fromEnriched.geometryOffline).toBe(true);

    const healthy = buildVerificationModel(makeData(), makeEnriched(), RUN);
    expect(healthy.geometryOffline).toBe(false);
  });

  it("specs resolve to human option labels via the contract schema (heating code 2 = high wall)", () => {
    const m = buildVerificationModel(
      makeData({ specifications: { heating: 2, services: 1 } }),
      makeEnriched(),
      RUN,
    );
    const heating = m.specs.flatMap((g) => g.rows).find((r) => r.label === "Heating")!;
    expect(heating.answer).toBe("High wall heat pump");
    const services = m.specs.flatMap((g) => g.rows).find((r) => r.label === "Services")!;
    expect(services.answer).toBe("Residential");
    // Unanswered specs print as not set, never invented.
    const unset = m.specs.flatMap((g) => g.rows).filter((r) => r.answer === "— not set");
    expect(unset.length).toBeGreaterThan(0);
  });

  it("exceptions carry every review flag, grouped by field", () => {
    const m = buildVerificationModel(
      makeData({
        reviewFlags: [
          {
            field: "Garage door size",
            flags: ["vector 4.8m vs vision 2.4m — vector won (sectional callout)"],
          },
          { field: "Window count", flags: [] },
        ],
      }),
      makeEnriched(),
      RUN,
    );
    expect(m.exceptions).toHaveLength(1);
    expect(m.exceptions[0].field).toBe("Garage door size");
  });

  it("integrity guard fires when export and takeoff headline values diverge", () => {
    const m = buildVerificationModel(
      makeData({ floorAreaM2: 180 }),
      makeEnriched(), // enriched says 165
      RUN,
    );
    expect(m.integrityAlerts).toHaveLength(1);
    expect(m.integrityAlerts[0]).toContain("Floor area diverges");
  });

  it("integrity guard stays silent when values agree", () => {
    const m = buildVerificationModel(makeData(), makeEnriched(), RUN);
    expect(m.integrityAlerts).toEqual([]);
  });

  it("nzDateTime renders Pacific/Auckland regardless of runtime TZ", () => {
    // 2026-06-11T23:30Z = 2026-06-12 11:30 NZST
    expect(nzDateTime(new Date("2026-06-11T23:30:00Z"))).toContain("12/06/2026");
    expect(nzDateTime(new Date("2026-06-11T23:30:00Z"))).toContain("11:30");
  });

  it("source legend covers every tag the mapper can emit", () => {
    const tags = SOURCE_LEGEND.map((l) => l.tag);
    expect(tags).toEqual(["GEO", "VEC", "VIS", "SCH", "DRV", "AST", "FLG", "MAN"]);
  });

  it("verification reads active extracted quantity ledger rows", () => {
    const readModel = buildExtractedQuantityReadModel([
      quantity({
        id: "perimeter",
        category: "exterior_perimeter",
        label: "Exterior perimeter",
        count: 1,
        lengthMm: 60000,
        areaM2: null,
      }),
      quantity({
        id: "doors",
        category: "interior_door",
        label: "Interior doors - standard",
        count: 9,
        areaM2: null,
      }),
    ]);
    const m = buildVerificationModel(
      makeData({ extractedQuantityReadModel: readModel }),
      makeEnriched(),
      RUN,
    );
    expect(m.extractedQuantities.readModel?.rows.map((row) => row.id)).toEqual([
      "perimeter",
      "doors",
    ]);
    expect(
      m.extractedQuantities.categories.find((c) => c.category === "exterior_perimeter")?.cleanTotals
        .lengthMm,
    ).toBe(60000);
    expect(m.doors.interiorTotal).toBe(9);
  });

  it("verification clean totals include only extracted rows and shows needs_review separately", () => {
    const readModel = buildExtractedQuantityReadModel([
      quantity({ id: "clean", category: "window", status: "extracted", areaM2: 1.2 }),
      quantity({
        id: "review",
        category: "window",
        status: "needs_review",
        widthMm: null,
        heightMm: null,
        areaM2: null,
        warnings: ["height_not_extracted"],
      }),
    ]);
    const m = buildVerificationModel(
      makeData({ extractedQuantityReadModel: readModel }),
      makeEnriched(),
      RUN,
    );
    const windows = m.extractedQuantities.categories.find((c) => c.category === "window")!;
    expect(windows.cleanTotals.count).toBe(1);
    expect(windows.cleanTotals.areaM2).toBe(1.2);
    expect(windows.statusCounts.needs_review).toBe(1);
    expect(windows.rows.needs_review[0]).toMatchObject({
      widthMm: null,
      heightMm: null,
      areaM2: null,
    });
  });

  it("verification preserves assumed-height rows as needs_review with null height and null area", () => {
    const readModel = buildExtractedQuantityReadModel([
      quantity({
        id: "assumed-height",
        status: "needs_review",
        heightMm: null,
        areaM2: null,
        warnings: ["assumed_height_rejected"],
      }),
    ]);
    const m = buildVerificationModel(
      makeData({ extractedQuantityReadModel: readModel }),
      makeEnriched(),
      RUN,
    );
    const row = m.extractedQuantities.categories.find((c) => c.category === "window")!.rows
      .needs_review[0];
    expect(row.status).toBe("needs_review");
    expect(row.heightMm).toBeNull();
    expect(row.areaM2).toBeNull();
    expect(row.warnings).toContain("assumed_height_rejected");
  });

  it("verification includes warnings and evidence page, bbox, and text where available", () => {
    const readModel = buildExtractedQuantityReadModel([
      quantity({ id: "evidence-row", warnings: ["possible_duplicate"] }),
    ]);
    const m = buildVerificationModel(
      makeData({ extractedQuantityReadModel: readModel }),
      makeEnriched(),
      RUN,
    );
    const row = m.extractedQuantities.categories.find((c) => c.category === "window")!.rows
      .extracted[0];
    expect(row.warnings).toEqual(["possible_duplicate"]);
    expect(row.evidence[0]).toMatchObject({
      page: 2,
      bbox: [1, 2, 3, 4],
      text: "W01 1200x1000",
    });
  });

  it("verification category counts match the extracted quantity read model", () => {
    const readModel = buildExtractedQuantityReadModel([
      quantity({ id: "window-1", category: "window", count: 2, areaM2: 2.4 }),
      quantity({ id: "garage-1", category: "garage_door", count: 1, areaM2: 10.08 }),
      quantity({ id: "exterior-door-1", category: "exterior_door", count: 1, areaM2: 2.1 }),
    ]);
    const m = buildVerificationModel(
      makeData({ extractedQuantityReadModel: readModel }),
      makeEnriched(),
      RUN,
    );
    expect(m.windows.totals.qsGlazedOpeningCount).toBe(3);
    expect(m.windows.totals.garageDoorCount).toBe(1);
    expect(m.windows.totals.totalOpeningSqm).toBeCloseTo(14.58);
  });

  it("verification does not compute independent opening totals from raw composed openings", () => {
    const readModel = buildExtractedQuantityReadModel([
      quantity({ id: "ledger-window", category: "window", count: 1, areaM2: 1.2 }),
    ]);
    const m = buildVerificationModel(
      makeData({
        extractedQuantityReadModel: readModel,
        openings: [
          {
            type: "window",
            room: "Bed 1",
            height_m: 1,
            width_m: 1,
            area_m2: 1,
            glazed: true,
            source: "vision",
            cladding: "Brick",
            confidence: "high",
          },
          {
            type: "window",
            room: "Bed 2",
            height_m: 1,
            width_m: 1,
            area_m2: 1,
            glazed: true,
            source: "vision",
            cladding: "Brick",
            confidence: "high",
          },
          {
            type: "sectional_door",
            room: "Garage",
            height_m: 2.1,
            width_m: 4.8,
            area_m2: 10.08,
            glazed: false,
            source: "vision",
            cladding: "Brick",
            confidence: "high",
          },
        ],
      }),
      makeEnriched(),
      RUN,
    );
    expect(m.windows.totals.qsGlazedOpeningCount).toBe(1);
    expect(m.windows.openings).toEqual([]);
  });
});

describe("planOverlay in the model", () => {
  it("builds ledger overlay rows and quarantines legacy visual evidence", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        quantity({
          id: "ledger-marker",
          evidence: [{ page: 1, bbox: [10, 20, 30, 40], text: "W01" }],
        }),
        quantity({ id: "ledger-no-marker", evidence: [{ text: "no bbox evidence" }] }),
      ],
      { activeRunId: RUN.id },
    );
    const m = buildVerificationModel(
      makeData({ extractedQuantityReadModel: readModel }),
      makeEnriched({
        door_hits: [{ type: "hinged", widthMm: 810, x: 10, y: 20, confidence: "confirmed" }],
        visual_opening_audit: {
          pageNumber: 1,
          method: "visual_qs",
          openings: [
            {
              id: "legacy-visual",
              type: "window",
              room: "Bed 1",
              label: "1200x1000",
              height_m: 1,
              width_m: 1.2,
              x: 0.5,
              y: 0.5,
              confidence: "high",
              evidence: "legacy visual marker",
              flags: [],
            },
          ],
          summary: { totalOpenings: 1, qsGlazedOpenings: 1, garageDoors: 0, uncertain: 0 },
          warnings: [],
        },
      }),
      RUN,
    );

    expect(m.planOverlay.ledgerOverlay.totalLedgerRows).toBe(2);
    expect(m.planOverlay.ledgerOverlay.markedRows.map((row) => row.extractedQuantityId)).toEqual([
      "ledger-marker",
    ]);
    expect(m.planOverlay.ledgerOverlay.unmarkedRows.map((row) => row.extractedQuantityId)).toEqual([
      "ledger-no-marker",
    ]);
    expect(m.planOverlay.ledgerOverlay.legacyEvidence).toMatchObject({
      doorHitCount: 1,
      visualOpeningCount: 1,
    });
    expect(m.planOverlay.ledgerOverlay.legacyEvidence.warning).toContain(
      "not active extracted quantity authority",
    );
  });

  it("builds numbered markers and summary from persisted door hits", () => {
    const m = buildVerificationModel(
      makeData(),
      makeEnriched({
        door_hits: [
          { type: "hinged", widthMm: 810, x: 607, y: 387, confidence: "confirmed" },
          { type: "double", widthMm: 1620, x: 100, y: 100, confidence: "confirmed" },
          { type: "cavity", widthMm: 760, x: 300, y: 500, confidence: "flag", note: "ambiguous" },
        ],
        door_page: {
          pageNumber: 1,
          view: [0, 0, 1191, 842],
          width: 1191,
          height: 842,
          scaleText: "1:100",
        },
      }),
      RUN,
    );
    expect(m.planOverlay.markers.map((x) => x.label)).toEqual(["D1", "D2", "D3"]);
    expect(m.planOverlay.markers[0]).toMatchObject({ type: "double", x: 100, y: 100 });
    expect(m.planOverlay.summary).toEqual({
      confirmed: 2,
      flagged: 1,
      byType: { hinged: 1, double: 1, cavity: 1 },
    });
    expect(m.planOverlay.page?.pageNumber).toBe(1);
  });

  it("is empty-safe for pre-overlay payloads and relational fallback", () => {
    const withOld = buildVerificationModel(makeData(), makeEnriched(), RUN);
    expect(withOld.planOverlay.markers).toEqual([]);
    expect(withOld.planOverlay.page).toBeNull();
    const noEnriched = buildVerificationModel(makeData(), null, null);
    expect(noEnriched.planOverlay.markers).toEqual([]);
  });
});
