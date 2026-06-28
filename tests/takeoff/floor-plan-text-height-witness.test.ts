import { describe, expect, it } from "vitest";
import type { TextLabel } from "../../src/lib/doors/door-engine";
import type { FloorPlanGapCandidate } from "../../src/lib/takeoff/floor-plan-gaps";
import {
  matchPlanTextDimensionsToFloorPlanGaps,
  type FloorPlanTextDimensionMatch,
} from "../../src/lib/takeoff/floor-plan-text-height-witness";
import { parsePlanText, type PlanText } from "../../src/lib/takeoff/plan-text";

function labels(items: Array<Partial<TextLabel> & { text: string }>): TextLabel[] {
  return items.map((item) => ({
    x: 0,
    y: 0,
    vertical: false,
    ...item,
  }));
}

function gap(overrides: Partial<FloorPlanGapCandidate> = {}): FloorPlanGapCandidate {
  return {
    id: "floorplan-gap-1",
    widthMm: 1500,
    x: 120,
    y: 220,
    page: 2,
    bbox: [100, 200, 140, 240],
    orientation: "horizontal",
    wallFaceId: "H-37",
    wallThicknessMm: 190,
    envelopeSide: "exterior",
    confidence: "medium",
    roomLabel: "BED 3",
    roomSide: "south",
    alternateRoomLabels: [],
    routing: {
      confidence: "medium",
      ambiguous: false,
      reason: "gap routed to BED 3 on the south side of the wall",
    },
    note: "measured floor-plan exterior wall gap near BED 3",
    ...overrides,
  };
}

function planText(overrides: Partial<PlanText> = {}): PlanText {
  return {
    rooms: [],
    windowCodes: [{ heightMm: 1300, widthMm: 1500, x: 120, y: 220 }],
    titleAreas: {},
    ...overrides,
  };
}

function onlyMatch(matches: Map<string, FloorPlanTextDimensionMatch>) {
  return matches.get("floorplan-gap-1");
}

describe("floor-plan text height witnesses for floor gaps", () => {
  it("parses floor-plan text dimension as width and height witness", () => {
    const parsed = parsePlanText(labels([{ text: "1300x1500", x: 120, y: 220 }]));

    expect(parsed.windowCodes).toEqual([{ heightMm: 1300, widthMm: 1500, x: 120, y: 220 }]);
  });

  it("matches text dimension to floor-gap row when one dimension matches measured width", () => {
    const matches = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [gap()],
      planText: planText(),
      page: 2,
    });

    expect(onlyMatch(matches)).toMatchObject({
      source: "pdf_text_dimension",
      page: 2,
      text: "1300 x 1500",
      matchedDimension: "second",
      matchedWidthMm: 1500,
      widthMatchDeltaMm: 0,
    });
  });

  it("uses the other dimension as height", () => {
    const match = onlyMatch(
      matchPlanTextDimensionsToFloorPlanGaps({
        gaps: [gap({ widthMm: 1300 })],
        planText: planText(),
        page: 2,
      }),
    );

    expect(match).toMatchObject({
      matchedDimension: "first",
      matchedWidthMm: 1300,
      heightMm: 1500,
      widthMatchDeltaMm: 0,
    });
  });

  it("does not use text dimension when width does not match floor gap", () => {
    const matches = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [gap({ widthMm: 1700 })],
      planText: planText(),
      page: 2,
    });

    expect(matches.size).toBe(0);
  });

  it("does not use text dimension when multiple nearby candidates are ambiguous", () => {
    const matches = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [gap()],
      planText: planText({
        windowCodes: [
          { heightMm: 1300, widthMm: 1500, x: 120, y: 220 },
          { heightMm: 1100, widthMm: 1500, x: 130, y: 225 },
        ],
      }),
      page: 2,
    });

    expect(matches.size).toBe(0);
  });

  it("does not use text dimension when a conflicting nearby dimension is present", () => {
    const matches = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [gap()],
      planText: planText({
        windowCodes: [
          { heightMm: 1300, widthMm: 1500, x: 120, y: 220 },
          { heightMm: 1100, widthMm: 900, x: 130, y: 225 },
        ],
      }),
      page: 2,
    });

    expect(matches.size).toBe(0);
  });


  it("does not use text dimension from another page", () => {
    const matches = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [gap({ page: 1 })],
      planText: planText(),
      page: 2,
    });

    expect(matches.size).toBe(0);
  });

  it("does not use ambiguous or interior floor-gap rows", () => {
    const ambiguous = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [
        gap({
          routing: {
            confidence: "low",
            ambiguous: true,
            reason: "gap could belong to BED 3 or ROBE",
          },
          alternateRoomLabels: ["ROBE"],
        }),
      ],
      planText: planText(),
      page: 2,
    });
    const interior = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [gap({ envelopeSide: "interior" })],
      planText: planText(),
      page: 2,
    });

    expect(ambiguous.size).toBe(0);
    expect(interior.size).toBe(0);
  });

  it("does not assume 2100 when text is missing", () => {
    const matches = matchPlanTextDimensionsToFloorPlanGaps({
      gaps: [gap()],
      planText: planText({ windowCodes: [] }),
      page: 2,
    });

    expect(matches.size).toBe(0);
  });
});
