/**
 * Plan-text cross-checks at the compose seam — the three JM-0032 vision faults,
 * each locked: (1) title-block garage grab corrected from printed room dims,
 * (2) window dims matching no printed code flagged, (3) a printed BED room with
 * no routed window flagged. Plus the golden-safety negative: no planText →
 * behaviour identical to before the pass existed.
 */
import { describe, it, expect } from "vitest";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import type { TakeoffData } from "../../src/lib/takeoff/extract-concept";

const baseVision = {
  floor_area_m2: 139.4,
  garage_area_m2: 46.7, // the title-block CLADDING AREA grab
  windows_by_room: {
    "Bed 1 (Master)": { qty: 2, height_m: 1.3, width_m: 1.5 },
    Ensuite: { qty: 1, height_m: 1.8, width_m: 0.6 }, // vision misread; plan prints 1100x600
    Kitchen: { qty: 1, height_m: 1.3, width_m: 1.8 },
  },
} as unknown as TakeoffData;

const planText = {
  rooms: [
    { name: "GARAGE", widthMm: 4000, depthMm: 5950, areaM2: 23.8, x: 0, y: 0 },
    { name: "BED 3", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 0, y: 0 },
    { name: "BED 2", widthMm: 3000, depthMm: 3300, areaM2: 9.9, x: 0, y: 0 },
  ],
  windowCodes: [
    { heightMm: 1300, widthMm: 1500, x: 0, y: 0 },
    { heightMm: 1100, widthMm: 600, x: 0, y: 0 },
    { heightMm: 1300, widthMm: 1800, x: 0, y: 0 },
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
} as never;

function compose(de: unknown) {
  return composeTakeoff({
    visionTakeoff: baseVision,
    geometry: null,
    schedule: null,
    geometryPageIndex: undefined,
    doorEngine: de as never,
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

  it("Ensuite 1.8×0.6 matches no printed code → flagged on windows_by_room", () => {
    const w = compose(doorEngine).enriched.windows_by_room;
    const all = w.discrepancy_flags.join(" | ");
    expect(all).toContain("Ensuite");
    expect(all).toContain("NO printed joinery code");
    // rooms whose dims DO match a code are not flagged
    expect(all).not.toContain("Kitchen window");
  });

  it("BED 3 printed on the plan with no routed window → flagged; BED 2... also unrouted here → both named", () => {
    const w = compose(doorEngine).enriched.windows_by_room;
    const all = w.discrepancy_flags.join(" | ");
    expect(all).toContain("BED 3");
    expect(all).toContain("NO routed window");
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
    expect(e.plan_text?.windowCodes).toHaveLength(3);
    expect(e.plan_text?.titleAreas.claddingAreaM2).toBeCloseTo(46.7, 1);
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
