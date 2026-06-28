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

function faceBand(id: string, widthMm: number) {
  return { id, x0: 0, x1: widthMm / 100, y0: 0, y1: 140, widthMm, heightMm: 2600 };
}

function openingSlot(args: {
  id: string;
  faceBandId: string;
  x: number;
  widthMm: number;
  heightMm: number;
}) {
  const rect = {
    widthMm: args.widthMm,
    heightMm: args.heightMm,
    x: args.x,
    y: 80,
    x0: args.x - 8,
    x1: args.x + 8,
    y0: 20,
    y1: 120,
    areaPt2: 1600,
  };
  return {
    ...rect,
    id: args.id,
    groupId: `group-${args.id}`,
    faceBandId: args.faceBandId,
    groupWidthMm: 5000,
    groupHeightMm: 1800,
    groupMemberRects: 1,
    groupLikelyMultiOpening: false,
    slotMemberRects: 1,
    nestedSlotMemberRects: 0,
    members: [{ ...rect, faceBandId: args.faceBandId, containingRects: 0, childRects: 0 }],
  };
}

describe("composeTakeoff visual opening promotion", () => {
  it("fails opening pricing closed when the required AI opening check is missing", () => {
    const enriched = composeTakeoff({
      visionTakeoff: baseVision,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: null,
      visualOpeningAuditRequired: true,
    }).enriched;

    expect(enriched.openings).toEqual([]);
    expect(enriched.total_opening_sqm).toBeNull();
    expect(enriched.glazed_sqm).toBeNull();
    expect(enriched.external_wall_area_m2.value).toBeNull();
    expect(enriched.opening_ai_check).toMatchObject({
      required: true,
      visualAuditPresent: false,
      status: "blocked",
    });
    expect(enriched.external_wall_area_m2.discrepancy_flags.join(" ")).toContain(
      "AI opening check did not complete",
    );
    expect(
      enriched.opening_evidence?.some((candidate) =>
        candidate.conflicts.includes("ai_opening_check_missing"),
      ),
    ).toBe(true);
  });

  it("keeps raw Visual QS openings as review evidence and preserves canonical priced rows", () => {
    const enriched = composeTakeoff({
      visionTakeoff: baseVision,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      visualOpeningAudit: visualAudit,
    }).enriched;

    expect(enriched.openings?.map((o) => o.type)).toEqual(["window", "sectional_door"]);
    expect(enriched.openings?.map((o) => o.glazed)).toEqual([true, false]);
    expect(enriched.garage_door_size.value).toBe("2.7x2.1");
    expect(enriched.total_opening_sqm).toBe(6.77);
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain("review evidence only");
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain(
      "outside the garage-door plausibility band",
    );
    expect(
      enriched.opening_evidence?.some(
        (candidate) => candidate.id === "visual-opening-2" && candidate.priced === false,
      ),
    ).toBe(true);
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
    ]);
    expect(enriched.total_opening_sqm).toBe(10.74);
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain("review evidence only");
    expect(
      enriched.opening_evidence?.some(
        (candidate) =>
          candidate.id === "visual-opening-3" &&
          candidate.type === "pa_door" &&
          candidate.priced === false,
      ),
    ).toBe(true);
  });

  it("does not price a malformed visual opening from elevation-only recovery", () => {
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

    expect(enriched.openings).toEqual([]);
    expect(enriched.total_opening_sqm).toBeNull();
    expect(enriched.opening_ai_check?.status).toBe("blocked");
    expect(
      enriched.opening_evidence?.some(
        (candidate) =>
          candidate.id === "visual-opening-1" &&
          candidate.type === "slider" &&
          candidate.priced === false,
      ),
    ).toBe(true);
    expect(
      enriched.opening_evidence?.some(
        (candidate) =>
          candidate.status === "held_blocked" &&
          candidate.type === "sectional_door" &&
          candidate.priced === false,
      ),
    ).toBe(true);
  });

  it("promotes ordered face-signature slots only when floor side length and ordered slots agree", () => {
    const enriched = composeTakeoff({
      visionTakeoff: {
        ...baseVision,
        windows_by_room: null,
        window_count: null,
        garage_door_size: null,
      },
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
          standaloneOpeningWidths: [],
          garageDoorWitnesses: [],
          draftingIssues: [],
          titleAreas: {},
        },
        floorSignatureRows: [
          {
            source: "printed_code",
            room: "MASTERBED",
            widthMm: 1800,
            heightMm: 1300,
            planSide: "plan_right",
            x: 100,
            y: 40,
            note: "printed floor-plan opening code 1300x1800 near MASTERBED",
          },
          {
            source: "printed_code",
            room: "DINING",
            widthMm: 1500,
            heightMm: 1300,
            planSide: "plan_right",
            x: 300,
            y: 40,
            note: "printed floor-plan opening code 1300x1500 near DINING",
          },
        ],
        floorSideLengthWitnesses: [{ planSide: "plan_right", lengthMm: 5000 }],
        floorPlanGaps: [],
      },
      elevationData: {
        claddingTypes: [],
        claddingTypeCode: null,
        roofType: null,
        roofPitchDegrees: null,
        wallHeightMm: null,
        studHeightMm: null,
        facesPresent: ["elevation-face-1", "elevation-face-2"],
        windowCountPerFace: {},
        externalDoorCount: 0,
        gableEndCount: 0,
        garageDoorsPresent: false,
        elevationOpenings: [],
        elevationFaceBands: [
          faceBand("elevation-face-1", 5000),
          faceBand("elevation-face-2", 7000),
        ],
        elevationOpeningSlots: [
          openingSlot({
            id: "slot-1",
            faceBandId: "elevation-face-1",
            x: 100,
            widthMm: 1820,
            heightMm: 1320,
          }),
          openingSlot({
            id: "slot-2",
            faceBandId: "elevation-face-1",
            x: 300,
            widthMm: 1505,
            heightMm: 1310,
          }),
          openingSlot({
            id: "slot-3",
            faceBandId: "elevation-face-2",
            x: 100,
            widthMm: 1820,
            heightMm: 1320,
          }),
        ],
      },
    }).enriched;

    expect(
      enriched.openings?.map((opening) => [opening.room, opening.width_m, opening.height_m]),
    ).toEqual([
      ["MASTERBED", 1.8, 1.32],
      ["DINING", 1.5, 1.31],
    ]);
    expect(enriched.total_opening_sqm).toBe(4.35);
    expect(enriched.openings?.[0]?.flags?.join(" ")).toContain("ordered face signature");
  });

  it("does not promote ordered face slots when the measured side length disagrees", () => {
    const enriched = composeTakeoff({
      visionTakeoff: {
        ...baseVision,
        windows_by_room: null,
        window_count: null,
        garage_door_size: null,
      },
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
          standaloneOpeningWidths: [],
          garageDoorWitnesses: [],
          draftingIssues: [],
          titleAreas: {},
        },
        floorSignatureRows: [
          {
            source: "printed_code",
            room: "MASTERBED",
            widthMm: 1800,
            heightMm: 1300,
            planSide: "plan_right",
            x: 100,
            y: 40,
            note: "printed floor-plan opening code 1300x1800 near MASTERBED",
          },
          {
            source: "printed_code",
            room: "DINING",
            widthMm: 1500,
            heightMm: 1300,
            planSide: "plan_right",
            x: 300,
            y: 40,
            note: "printed floor-plan opening code 1300x1500 near DINING",
          },
        ],
        floorSideLengthWitnesses: [{ planSide: "plan_right", lengthMm: 5000 }],
        floorPlanGaps: [],
      },
      elevationData: {
        claddingTypes: [],
        claddingTypeCode: null,
        roofType: null,
        roofPitchDegrees: null,
        wallHeightMm: null,
        studHeightMm: null,
        facesPresent: ["elevation-face-1"],
        windowCountPerFace: {},
        externalDoorCount: 0,
        gableEndCount: 0,
        garageDoorsPresent: false,
        elevationOpenings: [],
        elevationFaceBands: [faceBand("elevation-face-1", 7000)],
        elevationOpeningSlots: [
          openingSlot({
            id: "slot-1",
            faceBandId: "elevation-face-1",
            x: 100,
            widthMm: 1820,
            heightMm: 1320,
          }),
          openingSlot({
            id: "slot-2",
            faceBandId: "elevation-face-1",
            x: 300,
            widthMm: 1505,
            heightMm: 1310,
          }),
        ],
      },
    }).enriched;

    expect(enriched.openings ?? []).toEqual([]);
    expect(enriched.total_opening_sqm).toBeNull();
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
    });
    expect(enriched.openings?.[0]?.flags?.join(" ")).toContain(
      "visual locator promoted only after physical floor-plan width and elevation proof agreed",
    );
    expect(enriched.openings?.[0]?.area_m2).toBe(7.56);
    expect(enriched.total_opening_sqm).toBeGreaterThan(7.56);
    expect(
      enriched.opening_evidence?.some(
        (candidate) => candidate.id === "opening-1" && candidate.priced,
      ),
    ).toBe(true);
    expect(
      enriched.opening_evidence?.some((candidate) => candidate.id === "visual-opening-1"),
    ).toBe(false);
  });

  it("keeps impossible visual witnesses as review evidence before they become priced opening totals", () => {
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
      ["bed2", 1.1, 1],
      ["Garage", 2.1, 2.7],
    ]);
    expect(enriched.total_opening_sqm).toBe(6.77);
    expect(enriched.glazed_sqm).toBe(1.1);
    expect(enriched.external_wall_area_m2.value).toBe(89.23);
    expect(enriched.windows_by_room.discrepancy_flags.join(" ")).toContain("review evidence only");
    const visual = enriched.opening_evidence?.find((e) => e.id === "visual-opening-1");
    expect(visual).toMatchObject({
      priced: false,
      status: "review",
      room: "Entrance",
      width_m: 90,
      height_m: 1.6,
    });
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

    expect(enriched.openings).toEqual([]);
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
    expect(
      enriched.opening_evidence?.some((candidate) => candidate.status === "held_blocked"),
    ).toBe(true);
    expect(enriched.opening_evidence?.some((candidate) => candidate.priced === true)).toBe(false);
    expect(
      enriched.opening_evidence?.some((candidate) =>
        candidate.conflicts.includes("visual_reconciliation_error"),
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
