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

  it("2400x3600 (room-height, large width) with nearOpening=true is now KEPT — Phase 2e", () => {
    // Contract change (Phase 2e): the reliable opening/room-box discriminator is
    // Pass-1's nearOpening flag, NOT a crude >2000×2000 size heuristic — a 2.4m-high
    // opening can be a wide stacker slider, and size alone cannot tell it apart from a
    // 2.4×3.6m room. Only a genuine room *footprint* (both dims ≥ 3000mm) is dropped,
    // so an opening flagged nearOpening:true at this size is trusted and counted.
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [{ text: "2400x3600", nearestRoomLabel: "KITCHEN", nearOpening: true }],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Kitchen"]).toMatchObject({
      qty: 1,
      height_m: 2.4,
      width_m: 3.6,
    });
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
        openingAnnotations: [{ text: "1500x1300", nearestRoomLabel: "LOUNGE", nearOpening: true }],
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

describe("window-extraction — room-footprint backstop (Phase 2e: ≥3000mm both dims)", () => {
  it("2000x1200 is a window (well under room scale)", () => {
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [{ text: "2000x1200", nearestRoomLabel: "KITCHEN", nearOpening: true }],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Kitchen"]?.qty).toBe(1);
  });

  it("2001x2001 with nearOpening=true is now KEPT — below room-footprint scale, nearOpening trusted", () => {
    // Old behaviour dropped this on the >2000×2000 heuristic; the new contract trusts
    // nearOpening below room-footprint scale (both dims must reach 3000mm to be a box).
    const result = classifyAnnotations(
      raw({
        openingAnnotations: [{ text: "2001x2001", nearestRoomLabel: "KITCHEN", nearOpening: true }],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(result.windows_by_room?.["Kitchen"]?.qty).toBe(1);
  });

  it("2999x2999 is kept; 3000x3000 (room footprint) is dropped — the ≥3000 boundary", () => {
    const kept = classifyAnnotations(
      raw({
        openingAnnotations: [{ text: "2999x2999", nearestRoomLabel: "KITCHEN", nearOpening: true }],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(kept.windows_by_room?.["Kitchen"]?.qty).toBe(1);

    const dropped = classifyAnnotations(
      raw({
        openingAnnotations: [{ text: "3000x3000", nearestRoomLabel: "KITCHEN", nearOpening: true }],
      }),
      ctx("HEIGHT_x_WIDTH"),
    );
    expect(dropped.windows_by_room?.["Kitchen"]).toBeUndefined();
  });
});
