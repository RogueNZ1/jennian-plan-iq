import { describe, expect, it } from "vitest";
import { promoteFloorPlanGapOpenings } from "../../src/lib/takeoff/floor-plan-gap-promotion";
import type { FloorPlanGapElevationMatch } from "../../src/lib/takeoff/elevation-gap-match";
import type { FloorPlanGapCandidate } from "../../src/lib/takeoff/floor-plan-gaps";

const gap: FloorPlanGapCandidate = {
  id: "gap-1",
  widthMm: 1800,
  x: 100,
  y: 100,
  orientation: "horizontal",
  wallFaceId: "H-17",
  wallThicknessMm: 190,
  confidence: "medium",
  roomLabel: "LOUNGE",
  roomSide: "south",
  alternateRoomLabels: [],
  routing: {
    confidence: "medium",
    ambiguous: false,
    reason: "gap routed to LOUNGE on the south side of the wall",
  },
  note: "measured floor-plan wall gap near LOUNGE",
};

function match(deltaMm: number): FloorPlanGapElevationMatch {
  return {
    source: "elevation_measurement",
    face: "North",
    expectedFace: "north",
    faceCheck: "matched",
    measurementCheck: deltaMm <= 50 ? "confirmed" : "supporting",
    type: "window",
    label: "W01",
    widthMm: gap.widthMm + deltaMm,
    heightMm: 1300,
    widthDeltaMm: deltaMm,
    confidence: "high",
    note: "elevation measurement",
  };
}

describe("floor-plan gap promotion", () => {
  it("prices a measured gap only when the elevation width confirms within 50mm", () => {
    const promoted = promoteFloorPlanGapOpenings({
      openings: [],
      floorPlanGaps: [gap],
      elevationMatches: new Map([[gap.id, match(50)]]),
    });

    expect(promoted.openings).toHaveLength(1);
    expect(promoted.openings[0]).toMatchObject({
      type: "window",
      room: "LOUNGE",
      width_m: 1.8,
      height_m: 1.3,
    });
  });

  it("leaves a same-face elevation near-match review-only when width delta exceeds 50mm", () => {
    const promoted = promoteFloorPlanGapOpenings({
      openings: [],
      floorPlanGaps: [gap],
      elevationMatches: new Map([[gap.id, match(51)]]),
    });

    expect(promoted.openings).toHaveLength(0);
    expect(promoted.promotedByGapId.has(gap.id)).toBe(false);
  });
});
