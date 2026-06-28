/**
 * Plan-text cross-checks at the compose seam — the three JM-0032 vision faults,
 * each locked: (1) title-block garage grab corrected from printed room dims,
 * (2) window dims matching no printed code flagged, (3) a printed BED room with
 * no routed window flagged. Plus the golden-safety negative: no planText →
 * behaviour identical to before the pass existed.
 */
import { describe, it, expect } from "vitest";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import { buildLedgerPlanOverlayModel } from "../../src/lib/verification/plan-overlay";
import type { TakeoffData } from "../../src/lib/takeoff/extract-concept";

const baseVision = {
  floor_area_m2: 139.4,
  garage_area_m2: 46.7, // the title-block CLADDING AREA grab
  windows_by_room: {
    "Bed 1 (Master)": { qty: 2, height_m: 1.3, width_m: 1.5 }, // phantom qty + wrong width
    "Bed 2": { qty: 1, height_m: 1.3, width_m: 1.5 },
    Ensuite: { qty: 1, height_m: 1.8, width_m: 0.6 }, // vision misread; plan prints 1100x600
    Kitchen: { qty: 1, height_m: 1.3, width_m: 1.8 },
  },
} as unknown as TakeoffData;

const planText = {
  rooms: [
    { name: "GARAGE", widthMm: 4000, depthMm: 5950, areaM2: 23.8, x: 100, y: 500 },
    { name: "BED 3", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 300, y: 100 },
    { name: "BED 2", widthMm: 3000, depthMm: 3300, areaM2: 9.9, x: 300, y: 500 },
    { name: "MASTER BEDROOM", widthMm: 3700, depthMm: 3300, areaM2: 12.2, x: 600, y: 500 },
    { name: "ENSUITE", widthMm: 1900, depthMm: 2482, areaM2: 4.7, x: 700, y: 300 },
    { name: "KITCHEN", widthMm: 2650, depthMm: 3700, areaM2: 9.8, x: 500, y: 100 },
  ],
  windowCodes: [
    { heightMm: 1300, widthMm: 1500, x: 310, y: 90 }, // bed 3
    { heightMm: 1300, widthMm: 1500, x: 310, y: 530 }, // bed 2
    { heightMm: 1100, widthMm: 600, x: 705, y: 290 }, // ensuite — the printed truth
    { heightMm: 1300, widthMm: 1800, x: 610, y: 540 }, // master ×1
    { heightMm: 1300, widthMm: 1800, x: 505, y: 90 }, // kitchen
  ],
  draftingIssues: [
    { kind: "malformed_dimension_label", text: "1300x175036001300x1750", x: 100, y: 200 },
  ],
  titleAreas: { totalAreaM2: 139.4, claddingAreaM2: 46.7, perimeterM: 56.2 },
};

const doorEngine = {
  hinged: [],
  doubles: [],
  cavity: [],
  flags: [],
  counts: { singles: 0, doubles: 0, cavitySliders: 0, barn: 0 },
  planText,
  floorPlanGaps: [
    {
      id: "floorplan-gap-1",
      widthMm: 1800,
      x: 120,
      y: 220,
      page: 1,
      bbox: [100, 210, 140, 230],
      orientation: "horizontal",
      wallFaceId: "H-37",
      wallThicknessMm: 190,
      envelopeSide: "exterior",
      confidence: "medium",
      roomLabel: "LOUNGE",
      roomSide: "south",
      alternateRoomLabels: [],
      routing: {
        confidence: "medium",
        ambiguous: false,
        reason: "gap routed to LOUNGE on the south side of the wall",
      },
      note: "measured floor-plan wall gap near LOUNGE; height still needs text/elevation/schedule confirmation",
    },
  ],
} as never;

function compose(
  de: unknown,
  elevationOpening: Record<string, unknown> = {},
  inputOverrides: Partial<Parameters<typeof composeTakeoff>[0]> = {},
) {
  return composeTakeoff({
    visionTakeoff: baseVision,
    geometry: null,
    schedule: null,
    geometryPageIndex: undefined,
    doorEngine: de as never,
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
          type: "window",
          label: "W99",
          widthMm: 1810,
          heightMm: 1300,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
          ...elevationOpening,
        },
      ],
    },
    ...inputOverrides,
  });
}

describe("plan-text cross-checks at compose", () => {
  it("garage title-block grab → corrected to printed room dims, vector source, loud flag", () => {
    const g = compose(doorEngine).enriched.garage_area_m2;
    expect(g.value).toBeCloseTo(23.8, 1);
    expect(g.source).toBe("vector");
    expect(g.discrepancy_flags.join(" ")).toContain("TITLE-BLOCK");
    expect(g.discrepancy_flags.join(" ")).toContain("4000×5950");
  });

  it("Ensuite 1.8×0.6 → AUTO-CORRECTED to the printed 1.1×0.6, loudly", () => {
    const e = compose(doorEngine).enriched.windows_by_room;
    expect(e.value?.Ensuite?.height_m).toBeCloseTo(1.1, 2);
    expect(e.value?.Ensuite?.width_m).toBeCloseTo(0.6, 2);
    expect(e.source).toBe("vector");
    const all = e.discrepancy_flags.join(" | ");
    expect(all).toContain("FIXED");
    expect(all).toContain("Ensuite");
    expect(all).toContain("vision read");
  });

  it("Master phantom qty 2 → corrected to the one printed code", () => {
    const e = compose(doorEngine).enriched.windows_by_room;
    expect(e.value?.["Bed 1 (Master)"]?.qty).toBe(1);
    expect(e.discrepancy_flags.join(" | ")).toContain("Bed 1 (Master)");
  });

  it("BED 3 — the missing window is ADDED from the printed code, not just flagged", () => {
    const e = compose(doorEngine).enriched.windows_by_room;
    const bed3 = e.value?.["Bed 3"];
    expect(bed3?.qty).toBe(1);
    expect(bed3?.height_m).toBeCloseTo(1.3, 2);
    expect(bed3?.width_m).toBeCloseTo(1.5, 2);
    const all = e.discrepancy_flags.join(" | ");
    expect(all).toContain("ADDED from the plan's printed code");
    // the bedroom-without-window alarm must NOT fire once the window exists
    expect(all).not.toContain("NO routed window");
  });

  it("unanchored Unknown vision window is dropped when it matches no printed code", () => {
    const withUnknown = {
      ...baseVision,
      windows_by_room: {
        ...baseVision.windows_by_room,
        Unknown: { qty: 1, height_m: 0.6, width_m: 0.9 },
      },
    } as unknown as TakeoffData;
    const e = composeTakeoff({
      visionTakeoff: withUnknown,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
      doorEngine,
    }).enriched;

    expect(e.windows_by_room.value?.Unknown).toBeUndefined();
    expect(e.openings?.some((o) => o.room === "Unknown")).toBe(false);
    expect(e.windows_by_room.discrepancy_flags.join(" | ")).toContain("DROPPED");
  });

  it("Master matches Bed 1 routing — no false bedroom flag for the master", () => {
    const de2 = {
      ...(doorEngine as Record<string, unknown>),
      planText: {
        ...planText,
        rooms: [{ name: "MASTERBED", widthMm: 3700, depthMm: 3300, areaM2: 12.2, x: 0, y: 0 }],
      },
    };
    const all = compose(de2).enriched.windows_by_room.discrepancy_flags.join(" | ");
    expect(all).not.toContain("MASTERBED");
  });

  it("plan_text persisted additively on the enriched takeoff", () => {
    const e = compose(doorEngine).enriched;
    expect(e.plan_text?.rooms.find((r) => r.name === "GARAGE")?.areaM2).toBeCloseTo(23.8, 1);
    expect(e.plan_text?.windowCodes).toHaveLength(5);
    expect(e.plan_text?.draftingIssues?.[0]?.text).toBe("1300x175036001300x1750");
    expect(e.plan_text?.titleAreas.claddingAreaM2).toBeCloseTo(46.7, 1);
  });

  it("malformed drafting labels are surfaced as review flags, not priced silently", () => {
    const all = compose(doorEngine).enriched.windows_by_room.discrepancy_flags.join(" | ");
    expect(all).toContain("Drafting issue");
    expect(all).toContain("1300x175036001300x1750");
  });

  it("opening evidence ledger keeps priced rows separate from review-only drafting conflicts", () => {
    const e = compose(doorEngine).enriched;
    const priced = e.opening_evidence?.filter((candidate) => candidate.priced) ?? [];
    const review = e.opening_evidence?.find((candidate) => candidate.id === "drafting-issue-1");
    const gap = e.opening_evidence?.find((candidate) => candidate.id === "floorplan-gap-1");

    expect(priced.length).toBeGreaterThan(0);
    expect(priced[0]?.status).toBe("priced");
    expect(priced[0]?.evidence[0]?.role).toBe("dimension");
    expect(priced[0]?.evidence[0]?.area_m2).toBeGreaterThan(0);

    expect(review?.priced).toBe(false);
    expect(review?.status).toBe("review");
    expect(review?.conflicts).toContain("1300x175036001300x1750");
    expect(review?.evidence[0]).toMatchObject({
      source: "floorplan_text",
      role: "conflict",
      confidence: "low",
      text: "1300x175036001300x1750",
    });

    expect(gap).toMatchObject({
      priced: true,
      status: "priced",
      type: "window",
      room: "LOUNGE",
      width_m: 1.8,
      height_m: 1.3,
      area_m2: 2.34,
    });
    expect(gap?.evidence[0]).toMatchObject({
      source: "floorplan_gap",
      role: "width",
      confidence: "medium",
      page: 1,
      bbox: [100, 210, 140, 230],
      wall_face_id: "H-37",
      room_side: "south",
    });
    expect(gap?.evidence[1]).toMatchObject({
      source: "elevation_measurement",
      role: "height",
      confidence: "high",
      width_m: 1.81,
      height_m: 1.3,
    });
    expect(gap?.review_flags.join(" ")).toContain("promoted into QS openings as window");
  });

  it("floor-plan gap page+bbox reaches extracted quantity evidence and runtime anchors", () => {
    const e = compose(
      {
        ...(doorEngine as Record<string, unknown>),
        counts: { singles: 0, doubles: 0, cavitySliders: 0, barn: 0 },
      },
      {},
      { jobId: "job-1", runId: "run-1" },
    ).enriched;
    const row = e.extracted_quantities?.find(
      (quantity) => quantity.id === "opening-floorplan-gap-1",
    );
    const readModel = buildExtractedQuantityReadModel(e.extracted_quantities, {
      activeRunId: "run-1",
    });
    const overlay = buildLedgerPlanOverlayModel(readModel);

    expect(row).toMatchObject({
      source: "vector_geometry",
      status: "extracted",
      widthMm: 1800,
      heightMm: 1300,
      areaM2: 2.34,
    });
    expect(row?.evidence[0]).toMatchObject({
      source: "vector_geometry",
      page: 1,
      bbox: [100, 210, 140, 230],
    });
    expect(
      overlay.markedRows.find((marked) => marked.extractedQuantityId === "opening-floorplan-gap-1"),
    ).toMatchObject({
      markerState: "drawable",
      visualAnchor: expect.objectContaining({
        page: 1,
        bbox: [100, 210, 140, 230],
      }),
    });
  });

  it("does not create floor-plan gap bbox when the gap source lacks bbox", () => {
    const sourceGap = {
      ...(doorEngine as { floorPlanGaps: Array<Record<string, unknown>> }).floorPlanGaps[0],
    };
    delete sourceGap.page;
    delete sourceGap.bbox;
    const e = compose(
      {
        ...(doorEngine as Record<string, unknown>),
        floorPlanGaps: [sourceGap],
      },
      {},
      { jobId: "job-1", runId: "run-1" },
    ).enriched;
    const row = e.extracted_quantities?.find(
      (quantity) => quantity.id === "opening-floorplan-gap-1",
    );
    const overlay = buildLedgerPlanOverlayModel(
      buildExtractedQuantityReadModel(e.extracted_quantities, { activeRunId: "run-1" }),
    );

    expect(row?.evidence[0].page).toBeUndefined();
    expect(row?.evidence[0].bbox).toBeUndefined();
    expect(
      overlay.unmarkedRows.find(
        (unmarked) => unmarked.extractedQuantityId === "opening-floorplan-gap-1",
      ),
    ).toMatchObject({
      markerState: "no_marker",
      visualAnchor: null,
    });
  });

  it("strict floor-plan gap promotion changes opening totals only when unique elevation support exists", () => {
    const promoted = compose(doorEngine).enriched;
    const withoutGap = compose({
      ...(doorEngine as Record<string, unknown>),
      floorPlanGaps: [],
    }).enriched;

    const promotedOpening = promoted.openings?.find((opening) => opening.room === "LOUNGE");
    expect(promotedOpening).toMatchObject({
      type: "window",
      width_m: 1.8,
      height_m: 1.3,
      area_m2: 2.34,
      confidence: "medium",
    });
    expect(promotedOpening?.flags?.join(" ")).toContain("PROMOTED from measured floor-plan gap");
    expect(promoted.total_opening_sqm).toBeCloseTo((withoutGap.total_opening_sqm ?? 0) + 2.34, 2);
    expect(promoted.glazed_sqm).toBeCloseTo((withoutGap.glazed_sqm ?? 0) + 2.34, 2);
    expect(promoted.window_count.value).toBe(
      promoted.openings?.filter((opening) =>
        ["window", "slider", "garage_window"].includes(opening.type),
      ).length,
    );
  });

  it("ambiguous routed gaps stay review-only and do not change opening totals", () => {
    const ambiguousGap = {
      ...(doorEngine as { floorPlanGaps: Array<Record<string, unknown>> }).floorPlanGaps[0],
      routing: {
        confidence: "medium",
        ambiguous: true,
        reason: "gap could belong to LOUNGE or DINING",
      },
      alternateRoomLabels: ["DINING"],
    };
    const ambiguous = compose({
      ...(doorEngine as Record<string, unknown>),
      floorPlanGaps: [ambiguousGap],
    }).enriched;
    const withoutGap = compose({
      ...(doorEngine as Record<string, unknown>),
      floorPlanGaps: [],
    }).enriched;

    expect(ambiguous.total_opening_sqm).toBe(withoutGap.total_opening_sqm);
    const gap = ambiguous.opening_evidence?.find((candidate) => candidate.id === "floorplan-gap-1");
    expect(gap?.priced).toBe(false);
    expect(gap?.conflicts).toContain("DINING");
  });

  it("unknown elevation opening type stays review-only and does not change opening totals", () => {
    const unknown = compose(doorEngine, { type: "unknown" }).enriched;
    const withoutGap = compose({
      ...(doorEngine as Record<string, unknown>),
      floorPlanGaps: [],
    }).enriched;

    expect(unknown.total_opening_sqm).toBe(withoutGap.total_opening_sqm);
    const gap = unknown.opening_evidence?.find((candidate) => candidate.id === "floorplan-gap-1");
    expect(gap?.priced).toBe(false);
    expect(gap?.review_flags.join(" ")).toContain(
      "not priced until height/type/face are confirmed",
    );
  });

  it("generated elevation face support stays review-only instead of pricing a floor-plan gap", () => {
    const generatedFace = compose(doorEngine, { face: "elevation-face-1" }).enriched;
    const withoutGap = compose({
      ...(doorEngine as Record<string, unknown>),
      floorPlanGaps: [],
    }).enriched;

    expect(generatedFace.total_opening_sqm).toBe(withoutGap.total_opening_sqm);
    const gap = generatedFace.opening_evidence?.find(
      (candidate) => candidate.id === "floorplan-gap-1",
    );
    expect(gap?.priced).toBe(false);
    expect(gap?.evidence.some((item) => item.source === "elevation_measurement")).toBe(true);
    expect(gap?.review_flags.join(" ")).toContain("face is not matched");
    expect(gap?.review_flags.join(" ")).toContain(
      "not priced until height/type/face are confirmed",
    );
  });

  it("printed ENSUITE + missing vision count => ERROR flag on the ensuite count", () => {
    const e = compose(doorEngine).enriched.ensuite_count;
    expect(e.value).toBeNull();
    expect(e.confidence).toBe("low");
    expect(e.discrepancy_flags.join(" ")).toContain("ERROR: Ensuite is printed on the plan");
  });

  it("flags internal door counts when no-arc fallback singles are counted", () => {
    const de = {
      ...(doorEngine as Record<string, unknown>),
      hinged: [
        {
          type: "hinged",
          widthMm: 810,
          x: 100,
          y: 100,
          confidence: "confirmed",
          note: "single-leaf opening; swing arc not vector-recovered",
        },
      ],
      counts: { singles: 1, doubles: 0, cavitySliders: 0, barn: 0 },
    };
    const e = compose(de).enriched.internal_door_count;
    expect(e.confidence).toBe("low");
    expect(e.discrepancy_flags.join(" ")).toContain("swing arcs were not vector-recovered");
  });

  it("GOLDEN SAFETY: no planText → garage stays vision, no plan_text field, no new flags", () => {
    const de3 = { ...(doorEngine as Record<string, unknown>), planText: undefined };
    const e = compose(de3).enriched;
    expect(e.garage_area_m2.value).toBeCloseTo(46.7, 1);
    expect(e.garage_area_m2.source).toBe("vision");
    expect("plan_text" in e).toBe(false);
    expect(e.windows_by_room.discrepancy_flags.join(" ")).not.toContain("joinery code");
  });
});
