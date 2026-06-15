import { describe, expect, it } from "vitest";
import { snapPointToPlanInk } from "../verification/overlay-snap";

function blank(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return data;
}

function ink(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  data[i] = 0;
  data[i + 1] = 0;
  data[i + 2] = 0;
  data[i + 3] = 255;
}

describe("overlay marker snapping", () => {
  it("snaps a loose marker to a nearby horizontal plan line", () => {
    const width = 160;
    const height = 120;
    const data = blank(width, height);
    for (let x = 50; x <= 110; x++) ink(data, width, x, 60);

    const snapped = snapPointToPlanInk(data, width, height, 82, 78, {
      radius: 32,
      minRun: 8,
      stride: 1,
    });

    expect(snapped.snapped).toBe(true);
    expect(snapped.y).toBe(60);
    expect(snapped.x).toBeGreaterThanOrEqual(50);
    expect(snapped.x).toBeLessThanOrEqual(110);
  });

  it("leaves the marker alone when no plan line is nearby", () => {
    const data = blank(100, 100);

    const snapped = snapPointToPlanInk(data, 100, 100, 30, 40, {
      radius: 20,
      minRun: 8,
      stride: 1,
    });

    expect(snapped).toEqual({ x: 30, y: 40, snapped: false });
  });
});
