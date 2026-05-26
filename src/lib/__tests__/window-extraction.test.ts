/**
 * Window extraction tests for classifyAnnotations.
 *
 * Covers dimension format parsing, room-dim filtering, multi-window grouping,
 * and large-width validation. Uses the real windows_by_room API shape.
 */
import { describe, it, expect } from "vitest";
import { classifyAnnotations } from "../takeoff/classify-annotations";
import type { RawAnnotations } from "../takeoff/extract-annotations";
import type { PlanContext } from "../takeoff/plan-context";
import { BUILDER_CONFIGS } from "../takeoff/builder-config";

const jennian = BUILDER_CONFIGS.find((b) => b.name === "Jennian Homes")!;

function ctx(format: PlanContext["dimensionFormat"] = "HEIGHT_x_WIDTH"): PlanContext {
  return {
    builder: jennian,
    scaleString: "1:100 @ A3",
    scaleFactor: null,
    dimensionFormat: format,
    dimensionFormatSource: "builder_default",
    studHeightMm: 2400,
    studHeightSource: "builder_default",
    sheetType: "floor_plan",
    livingAreaM2: 135,
    perimeterM: 57.1,
  };
}

function raw(overrides: Partial<RawAnnotations> = {}): RawAnnotations {
  return {
    openingAnnotations: [],
    roomLabels: [],
    areaSummary: {
      livingAreaM2: 135,
      garageAreaM2: null,
      alfrescoAreaM2: null,
      coverageAreaM2: null,
      perimeterM: 57.1,
    },
    garageDoorAnnotations: [],
    internalDoorAnnotations: [],
    ...overrides,
  };
}

describe("window-extraction — HEIGHT_x_WIDTH dimension parsing", () => {
  it("1300x1500 → height=1.3m, width=1.5m in Bed 1 (Master)", () => {
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "1300x1500", nearestRoomLabel: "MASTER BED", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Bed 1 (Master)"]).toMatchObject({
      qty: 1,
      height_m: 1.3,
      width_m: 1.5,
    });
  });

  it("1300x1800 large width — must not be substituted with a smaller default", () => {
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "1300x1800", nearestRoomLabel: "MASTER BED", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    // Width must be exactly 1.8, not rounded down or substituted
    expect(result.windows_by_room?.["Bed 1 (Master)"]?.width_m).toBe(1.8);
  });

  it("2400x3600 room-scale annotation with nearOpening=true is NOT classified as a window", () => {
    // Both dimensions > 2000mm → this is a room dimension box, not a window.
    // The guard in classifyAnnotations must reject it even if nearOpening is true.
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "2400x3600", nearestRoomLabel: "KITCHEN", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Kitchen"]).toBeUndefined();
    expect(result.window_count).toBeNull();
  });

  it("4131x3250 room dim (Master Bed ground truth) with nearOpening=true is rejected", () => {
    // 15A Russell St Master Bed actual dimensions — must never appear as a window
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "4131x3250", nearestRoomLabel: "MASTER BED", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Bed 1 (Master)"]).toBeUndefined();
  });

  it("two different-dimension windows in the same room → qty=2", () => {
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "1300x1500", nearestRoomLabel: "MASTER BED", nearOpening: true },
          { text: "1300x1200", nearestRoomLabel: "MASTER BED", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    // Both annotations are valid windows; they accumulate into one room entry with qty 2
    expect(result.windows_by_room?.["Bed 1 (Master)"]?.qty).toBe(2);
    expect(result.window_count).toBe(2);
  });

  it("windows across two rooms are tracked separately", () => {
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "1300x1500", nearestRoomLabel: "MASTER BED", nearOpening: true },
          { text: "1200x1000", nearestRoomLabel: "BED 2", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Bed 1 (Master)"]?.qty).toBe(1);
    expect(result.windows_by_room?.["Bed 2"]?.qty).toBe(1);
    expect(result.window_count).toBe(2);
  });
});

describe("window-extraction — WIDTH_x_HEIGHT format", () => {
  it("1500x1300 in WIDTH_x_HEIGHT → height=1.3m, width=1.5m in Lounge", () => {
    // In WIDTH_x_HEIGHT: first number is width, second is height
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "1500x1300", nearestRoomLabel: "LOUNGE", nearOpening: true },
        ],
      }),
      ctx("WIDTH_x_HEIGHT"),
    );
    expect(result.windows_by_room?.["Lounge"]).toMatchObject({
      qty: 1,
      height_m: 1.3,
      width_m: 1.5,
    });
  });

  it("same text in HEIGHT_x_WIDTH vs WIDTH_x_HEIGHT produces swapped dimensions", () => {
    const text = "1800x1300";
    const heightFirst = classifyAnnotations(
      raw({ openingAnnotations: [{ text, nearestRoomLabel: "LOUNGE", nearOpening: true }] }),
      ctx("HEIGHT_x_WIDTH"),
    );
    const widthFirst = classifyAnnotations(
      raw({ openingAnnotations: [{ text, nearestRoomLabel: "LOUNGE", nearOpening: true }] }),
      ctx("WIDTH_x_HEIGHT"),
    );
    const hfw = heightFirst.windows_by_room?.["Lounge"];
    const wfh = widthFirst.windows_by_room?.["Lounge"];
    expect(hfw?.height_m).toBe(1.8);
    expect(hfw?.width_m).toBe(1.3);
    expect(wfh?.height_m).toBe(1.3);
    expect(wfh?.width_m).toBe(1.8);
  });
});

describe("window-extraction — boundary guards", () => {
  it("exactly 2000mm dimension is treated as window (boundary: > 2000 is room)", () => {
    // 2000x1200: one dim is exactly 2000 → not both > 2000 → IS a window
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "2000x1200", nearestRoomLabel: "KITCHEN", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Kitchen"]?.qty).toBe(1);
  });

  it("2001x2001 is rejected as room scale (both > 2000)", () => {
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [
          { text: "2001x2001", nearestRoomLabel: "KITCHEN", nearOpening: true },
        ],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Kitchen"]).toBeUndefined();
  });
});
