import { describe, expect, it } from "vitest";
import { detectFloorPlanGaps } from "../../src/lib/takeoff/floor-plan-gaps";
import type { Segment } from "../../src/lib/doors/door-engine";

const PT_PER_MM = 72 / 25.4;
const mmToPt = (mm: number, scale: number) => (mm / scale) * PT_PER_MM;

function horizontal(x0: number, x1: number, y: number): Segment {
  return { x0, y0: y, x1, y1: y };
}

describe("floor-plan gap extraction", () => {
  it("measures a drawn wall gap across paired wall faces without text labels", () => {
    const scale = 100;
    const widthPt = mmToPt(1200, scale);
    const wallFaceGap = mmToPt(190, scale);
    const start = 100;
    const end = start + widthPt;
    const segments: Segment[] = [
      horizontal(20, start, 100),
      horizontal(end, 240, 100),
      horizontal(20, start, 100 + wallFaceGap),
      horizontal(end, 240, 100 + wallFaceGap),
    ];

    const gaps = detectFloorPlanGaps({
      segments,
      scale,
      rooms: [{ name: "LOUNGE", x: 130, y: 135 }],
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      widthMm: 1200,
      orientation: "horizontal",
      roomLabel: "LOUNGE",
      confidence: "medium",
    });
  });

  it("does not treat a single broken annotation line as a wall gap", () => {
    const scale = 100;
    const widthPt = mmToPt(1200, scale);
    const start = 100;
    const end = start + widthPt;
    const segments: Segment[] = [horizontal(20, start, 100), horizontal(end, 240, 100)];

    expect(detectFloorPlanGaps({ segments, scale })).toHaveLength(0);
  });
});
