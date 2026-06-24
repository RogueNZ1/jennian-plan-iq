import { describe, expect, it } from "vitest";
import { composeTakeoff } from "../takeoff/compose-takeoff";
import type { TakeoffData } from "../takeoff/takeoff-types";
import type { VisualOpeningAudit } from "../takeoff/visual-opening-audit";

const baseVision: TakeoffData = {
  floor_area_m2: 100,
  garage_area_m2: null,
  alfresco_area_m2: null,
  external_wall_lm: 40,
  internal_wall_lm: null,
  roof_area_m2: null,
  window_count: 1,
  external_door_count: null,
  internal_door_count: null,
  bathroom_count: null,
  ensuite_count: null,
  laundry_count: null,
  kitchen_count: null,
  ceiling_height_m: 2.4,
  foundation_type: null,
  windows_by_room: { bed2: { qty: 1, height_m: 1.1, width_m: 1 } },
  door_breakdown: null,
  garage_door_size: "2.7×2.1",
  notes: "",
  external_wall_area_m2: 90,
  total_area_m2: 100,
};

const visualAudit: VisualOpeningAudit = {
  pageNumber: 1,
  method: "visual_qs",
  warnings: [],
  summary: { totalOpenings: 3, qsGlazedOpenings: 2, garageDoors: 1, uncertain: 0 },
  openings: [
    {
      id: "O1",
      type: "window",
      room: "Bed 2",
      label: "1100x1000",
      height_m: 1.1,
      width_m: 1,
      x: 0.1,
      y: 0.1,
      confidence: "high",
      evidence: "",
      flags: [],
    },
    {
      id: "O2",
      type: "pa_door",
      room: "Laundry",
      label: null,
      height_m: null,
      width_m: null,
      x: 0.2,
      y: 0.2,
      confidence: "medium",
      evidence: "",
      flags: [],
    },
    {
      id: "O3",
      type: "garage_door",
      room: "Garage",
      label: "2800x2520",
      height_m: 2.52,
      width_m: 2.8,
      x: 0.3,
      y: 0.3,
      confidence: "high",
      evidence: "",
      flags: [],
    },
  ],
};

describe("composeTakeoff visual opening promotion", () => {
  it("uses Visual QS for openings but preserves the canonical sectional when visual garage is rejected", () => {
    const enriched = composeTakeoff({
      visionTakeoff: baseVision,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: visualAudit,
    }).enriched;

    expect(enriched.openings?.map((o) => o.type)).toEqual(["window", "pa_door", "sectional_door"]);
    expect(enriched.openings?.map((o) => o.glazed)).toEqual([true, true, false]);
    expect(enriched.garage_door_size.value).toBe("2.7x2.1");
    expect(enriched.total_opening_sqm).toBe(8.87);
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain("Visual QS promoted");
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain(
      "outside the garage-door plausibility band",
    );
  });

  it("keeps printed plan-text window dimensions ahead of disagreeing visual QS windows", () => {
    const enriched = composeTakeoff({
      visionTakeoff: {
        ...baseVision,
        windows_by_room: {
          "Bed 2": { qty: 1, height_m: 1.1, width_m: 1.2 },
          Family: { qty: 1, height_m: 1.4, width_m: 0.79 },
        },
      },
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      doorEngine: {
        counts: { singles: 0, doubles: 0, cavitySliders: 0, barn: 0 },
        hinged: [],
        doubles: [],
        cavity: [],
        flags: [],
        planText: {
          rooms: [
            { name: "BED 2", widthMm: 3000, depthMm: 3400, areaM2: 10.2, x: 10, y: 10 },
            { name: "FAMILY", widthMm: 4000, depthMm: 4000, areaM2: 16, x: 100, y: 10 },
            { name: "LAUNDRY", widthMm: 2000, depthMm: 2000, areaM2: 4, x: 180, y: 10 },
          ],
          windowCodes: [
            { heightMm: 1300, widthMm: 1500, x: 12, y: 12 },
            { heightMm: 1300, widthMm: 2400, x: 102, y: 12 },
          ],
          frameOpenings: [],
          titleAreas: {},
        },
      } as never,
      visualOpeningAudit: {
        pageNumber: 1,
        method: "visual_qs",
        warnings: [],
        summary: { totalOpenings: 3, qsGlazedOpenings: 3, garageDoors: 0, uncertain: 0 },
        openings: [
          {
            id: "O1",
            type: "window",
            room: "Bed 2",
            label: "1100x1200",
            height_m: 1.1,
            width_m: 1.2,
            x: 0.1,
            y: 0.1,
            confidence: "high",
            evidence: "visual disagrees with printed plan text",
            flags: [],
          },
          {
            id: "O2",
            type: "window",
            room: "Family",
            label: "790x1400",
            height_m: 1.4,
            width_m: 0.79,
            x: 0.2,
            y: 0.2,
            confidence: "high",
            evidence: "visual disagrees with printed plan text",
            flags: [],
          },
          {
            id: "O3",
            type: "pa_door",
            room: "Laundry",
            label: "2100x1000",
            height_m: 2.1,
            width_m: 1,
            x: 0.3,
            y: 0.3,
            confidence: "medium",
            evidence: "visual-only external opening",
            flags: [],
          },
        ],
      },
    }).enriched;

    expect(enriched.openings?.map((o) => [o.type, o.room, o.height_m, o.width_m])).toEqual([
      ["window", "BED 2", 1.3, 1.5],
      ["window", "FAMILY", 1.3, 2.4],
      ["sectional_door", "Garage", 2.1, 2.7],
      ["pa_door", "Laundry", 2.1, 1],
    ]);
    expect(enriched.total_opening_sqm).toBe(12.84);
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain("Visual QS promoted");
  });

  it("recovers a malformed visual opening from a single compatible elevation ledger row", () => {
    const enriched = composeTakeoff({
      visionTakeoff: { ...baseVision, windows_by_room: null, window_count: null },
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: {
        pageNumber: 1,
        method: "visual_qs",
        warnings: [],
        summary: { totalOpenings: 1, qsGlazedOpenings: 1, garageDoors: 0, uncertain: 1 },
        openings: [
          {
            id: "O1",
            type: "slider",
            room: "Family",
            label: "1300x175036001300x1750",
            height_m: null,
            width_m: null,
            x: 0.2,
            y: 0.2,
            confidence: "low",
            evidence: "malformed floor-plan label",
            flags: ["malformed dimension label - verify against elevations/schedule"],
          },
        ],
      },
      elevationData: {
        claddingTypes: [],
        claddingTypeCode: null,
        roofType: null,
        roofPitchDegrees: null,
        wallHeightMm: null,
        studHeightMm: null,
        facesPresent: ["North"],
        windowCountPerFace: {},
        externalDoorCount: 0,
        gableEndCount: 0,
        garageDoorsPresent: false,
        elevationOpenings: [
          {
            face: "North",
            type: "slider",
            label: null,
            widthMm: 3600,
            heightMm: 2100,
            quantity: 1,
            cladding: null,
            confidence: "high",
            notes: [],
          },
        ],
      },
    }).enriched;

    expect(enriched.openings?.[0]).toMatchObject({
      type: "slider",
      room: "Family",
      height_m: 2.1,
      width_m: 3.6,
      confidence: "high",
      flags: [],
    });
    expect(enriched.total_opening_sqm).toBe(13.23);
  });

  it("uses confirmed physical floor-plan width to choose between ambiguous elevation openings", () => {
    const enriched = composeTakeoff({
      visionTakeoff: { ...baseVision, windows_by_room: null, window_count: null },
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      doorEngine: {
        hinged: [],
        doubles: [],
        cavity: [],
        flags: [],
        counts: { singles: 0, doubles: 0, cavitySliders: 0, barn: 0 },
        planText: {
          rooms: [],
          windowCodes: [],
          frameOpenings: [],
          standaloneOpeningWidths: [
            { widthMm: 3600, x: 505, y: 410, vertical: true, text: "3600" },
          ],
          draftingIssues: [],
          titleAreas: {},
        },
        floorPlanGaps: [],
        physicalOpeningWidthWitnesses: [
          {
            kind: "physical_opening_width",
            widthMm: 3600,
            x: 505,
            y: 410,
            vertical: true,
            text: "3600",
            room: "Family",
            planSide: "plan_left",
            evidence: { stub: true, leaf: true },
            note: "standalone floor-plan width 3600mm with physical opening stub+leaf near Family",
          },
        ],
        pageMeta: {
          pageNumber: 1,
          view: [0, 0, 1000, 800],
          width: 1000,
          height: 800,
          scaleText: "1:100",
        },
      },
      visualOpeningAudit: {
        pageNumber: 1,
        method: "visual_qs",
        warnings: [],
        summary: { totalOpenings: 1, qsGlazedOpenings: 1, garageDoors: 0, uncertain: 1 },
        openings: [
          {
            id: "O1",
            type: "slider",
            room: "Family",
            label: "1300x175036001300x1750",
            height_m: null,
            width_m: null,
            x: 0.5,
            y: 0.5,
            confidence: "low",
            evidence: "visual opening symbol on exterior wall; malformed floor-plan label",
            flags: ["malformed dimension label - verify against elevations/schedule"],
          },
        ],
      },
      elevationData: {
        claddingTypes: [],
        claddingTypeCode: null,
        roofType: null,
        roofPitchDegrees: null,
        wallHeightMm: null,
        studHeightMm: null,
        facesPresent: ["North"],
        windowCountPerFace: {},
        externalDoorCount: 0,
        gableEndCount: 0,
        garageDoorsPresent: false,
        elevationOpenings: [
          {
            face: "North",
            type: "slider",
            label: "RS1",
            widthMm: 3000,
            heightMm: 2100,
            quantity: 1,
            cladding: null,
            confidence: "high",
            notes: [],
          },
          {
            face: "North",
            type: "slider",
            label: "RS2",
            widthMm: 3600,
            heightMm: 2100,
            quantity: 1,
            cladding: null,
            confidence: "high",
            notes: [],
          },
        ],
      },
    }).enriched;

    expect(enriched.openings?.[0]).toMatchObject({
      type: "slider",
      room: "Family",
      width_m: 3.6,
      height_m: 2.1,
      confidence: "high",
      flags: [],
    });
    expect(enriched.openings?.[0]?.area_m2).toBe(7.56);
    expect(enriched.total_opening_sqm).toBeGreaterThan(7.56);
  });

  it("quarantines impossible visual witnesses before they become priced opening totals", () => {
    const enriched = composeTakeoff({
      visionTakeoff: baseVision,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: {
        pageNumber: 1,
        method: "visual_qs",
        warnings: [],
        summary: { totalOpenings: 2, qsGlazedOpenings: 2, garageDoors: 0, uncertain: 0 },
        openings: [
          {
            id: "O1",
            type: "window",
            room: "Entrance",
            label: null,
            height_m: 1.6,
            width_m: 90,
            x: 0.1,
            y: 0.1,
            confidence: "medium",
            evidence: "JM-0055-style poisoned visual witness",
            flags: [],
          },
          {
            id: "O2",
            type: "window",
            room: "Bed 2",
            label: "1100x1000",
            height_m: 1.1,
            width_m: 1,
            x: 0.2,
            y: 0.2,
            confidence: "high",
            evidence: "sane visual witness",
            flags: [],
          },
        ],
      },
    }).enriched;

    expect(enriched.openings?.map((o) => [o.room, o.height_m, o.width_m])).toEqual([
      ["Bed 2", 1.1, 1],
      ["Garage", 2.1, 2.7],
    ]);
    expect(enriched.total_opening_sqm).toBe(6.77);
    expect(enriched.glazed_sqm).toBe(1.1);
    expect(enriched.external_wall_area_m2.value).toBe(89.23);
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain(
      "Entrance: window 90m x 1.6m quarantined from pricing",
    );
    const quarantined = enriched.opening_evidence?.find((e) => e.id === "quarantined-opening-1");
    expect(quarantined).toMatchObject({
      priced: false,
      status: "review",
      room: "Entrance",
      width_m: 90,
      height_m: 1.6,
    });
    expect(quarantined?.conflicts).toEqual(
      expect.arrayContaining(["impossible_width", "impossible_area", "impossible_ratio"]),
    );
  });

  it("blocks opening-derived pricing when Visual QS reconciliation has unresolved errors", () => {
    const enriched = composeTakeoff({
      visionTakeoff: baseVision,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: {
        pageNumber: 1,
        method: "visual_qs",
        warnings: [],
        summary: { totalOpenings: 4, qsGlazedOpenings: 4, garageDoors: 0, uncertain: 0 },
        openings: [
          {
            id: "O1",
            type: "window",
            room: "Bed 2",
            label: "1100x1000",
            height_m: 1.1,
            width_m: 1,
            x: 0.2,
            y: 0.2,
            confidence: "high",
            evidence: "only one priced visual opening was confidently recovered",
            flags: [],
          },
        ],
      },
    }).enriched;

    expect(enriched.openings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "window",
          room: "Bed 2",
          width_m: 1,
          height_m: 1.1,
        }),
      ]),
    );
    expect(enriched.total_opening_sqm).toBeNull();
    expect(enriched.glazed_sqm).toBeNull();
    expect(enriched.external_wall_area_m2.value).toBeNull();
    expect(enriched.visual_opening_reconciliation?.issues[0]).toMatchObject({
      severity: "error",
      field: "windows_by_room",
    });
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain(
      "Opening pricing blocked: unresolved Visual QS reconciliation error",
    );
    expect(enriched.external_wall_area_m2.discrepancy_flags.join(" ")).toContain(
      "Opening pricing blocked: unresolved Visual QS reconciliation error",
    );
    expect(enriched.opening_evidence?.some((candidate) => candidate.priced === true)).toBe(true);
    expect(
      enriched.opening_evidence?.every(
        (candidate) => !candidate.conflicts.includes("visual_reconciliation_error"),
      ),
    ).toBe(true);
  });

  it("prefers elevation vector garage-door evidence over a disagreeing visual garage size", () => {
    const enriched = composeTakeoff({
      visionTakeoff: {
        ...baseVision,
        windows_by_room: null,
        window_count: null,
        garage_door_size: "5.4Ã—2.4",
      },
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: {
        pageNumber: 1,
        method: "visual_qs",
        warnings: [],
        summary: { totalOpenings: 1, qsGlazedOpenings: 0, garageDoors: 1, uncertain: 0 },
        openings: [
          {
            id: "O18",
            type: "garage_door",
            room: "Garage",
            label: "2400x5400",
            height_m: 2.4,
            width_m: 5.4,
            x: 0.2,
            y: 0.2,
            confidence: "medium",
            evidence: "visual garage read",
            flags: [],
          },
        ],
      },
      elevationData: {
        claddingTypes: [],
        claddingTypeCode: null,
        roofType: null,
        roofPitchDegrees: null,
        wallHeightMm: null,
        studHeightMm: null,
        facesPresent: ["North"],
        windowCountPerFace: {},
        externalDoorCount: 0,
        gableEndCount: 0,
        garageDoorsPresent: true,
        elevationOpenings: [
          {
            face: "North",
            type: "garage_door",
            label: null,
            widthMm: 4741,
            heightMm: 2049,
            quantity: 1,
            cladding: null,
            confidence: "medium",
            notes: [],
          },
          {
            face: "Rear",
            type: "garage_door",
            label: null,
            widthMm: 4487,
            heightMm: 2049,
            quantity: 1,
            cladding: null,
            confidence: "medium",
            notes: [],
          },
        ],
      },
    }).enriched;

    expect(enriched.garage_door_size.value).toBe("4.8x2.1");
    expect(enriched.garage_door_size.source).toBe("vector");
    expect(enriched.garage_door_size.discrepancy_flags.join(" ")).toContain(
      "Garage door recovered from North elevation vector candidate 4741x2049mm",
    );
    expect(enriched.openings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "sectional_door",
          source: "vector",
          room: "Garage",
          width_m: 4.8,
          height_m: 2.1,
          area_m2: 10.08,
        }),
      ]),
    );
    expect(enriched.total_opening_sqm).toBe(10.08);
    expect(enriched.glazed_sqm).toBe(0);
    expect(enriched.external_wall_area_m2.value).toBe(85.92);
    expect(enriched.external_wall_area_m2.discrepancy_flags.join(" ")).not.toContain(
      "Opening pricing blocked",
    );
    const garageEvidence = enriched.opening_evidence?.find(
      (candidate) => candidate.type === "sectional_door",
    );
    expect(garageEvidence).toMatchObject({
      priced: true,
      status: "priced",
      room: "Garage",
      width_m: 4.8,
      height_m: 2.1,
      area_m2: 10.08,
    });
  });
});
