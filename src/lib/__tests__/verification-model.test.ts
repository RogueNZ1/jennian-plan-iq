import { describe, it, expect } from "vitest";

import {
  buildVerificationModel,
  nzDateTime,
  SOURCE_LEGEND,
} from "../verification/verification-model";
import type { QSExportData } from "../iq-qs-export";
import type { EnrichedTakeoff } from "../takeoff/enriched-takeoff";
import { fv } from "../takeoff/enriched-takeoff";

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
        garage_area_m2: fv(null, "vision", null),
        alfresco_area_m2: fv(null, "vision", null),
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

  it("doors: interior rows with engine source label, totals, garage filtered to non-zero", () => {
    const m = buildVerificationModel(makeData(), makeEnriched(), RUN);
    expect(m.doors.interiorTotal).toBe(13);
    expect(m.doors.sourceLabel).toBe("Deterministic door engine");
    expect(m.doors.visionHint).toBe(12);
    expect(m.doors.garage).toEqual([{ label: "4.8 × 2.1 insulated", qty: 1 }]);
    expect(m.doors.garageDoorSize).toBe("4.8 × 2.1");
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
});

describe("planOverlay in the model", () => {
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
