import { describe, it, expect } from "vitest";
import { classifyAnnotations } from "../takeoff/classify-annotations";
import type { RawAnnotations } from "../takeoff/extract-annotations";
import type { PlanContext } from "../takeoff/plan-context";
import { BUILDER_CONFIGS, UNKNOWN_BUILDER } from "../takeoff/builder-config";

const jennian = BUILDER_CONFIGS.find((b) => b.name === "Jennian Homes")!;

function makeContext(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    builder: jennian,
    scaleString: "1:100 @ A3",
    scaleFactor: null,
    dimensionFormat: "HEIGHT_x_WIDTH",
    dimensionFormatSource: "builder_default",
    studHeightMm: 2400,
    studHeightSource: "builder_default",
    sheetType: "floor_plan",
    livingAreaM2: null,
    perimeterM: null,
    ...overrides,
  };
}

function makeRaw(overrides: Partial<RawAnnotations> = {}): RawAnnotations {
  return {
    openingAnnotations: [],
    roomLabels: [],
    areaSummary: {
      livingAreaM2: null,
      garageAreaM2: null,
      alfrescoAreaM2: null,
      coverageAreaM2: null,
      perimeterM: null,
    },
    garageDoorAnnotations: [],
    internalDoorAnnotations: [],
    ...overrides,
  };
}

describe("classifyAnnotations — ceiling height", () => {
  it("uses studHeightMm from context", () => {
    const result = classifyAnnotations(makeRaw(), makeContext({ studHeightMm: 2410 }));
    expect(result.ceiling_height_m).toBe(2.41);
  });

  it("rounds to 2 decimal places", () => {
    const result = classifyAnnotations(makeRaw(), makeContext({ studHeightMm: 2400 }));
    expect(result.ceiling_height_m).toBe(2.4);
  });
});

describe("classifyAnnotations — window parsing HEIGHT_x_WIDTH", () => {
  it("assigns first number as height, second as width", () => {
    const raw = makeRaw({
      openingAnnotations: [
        { text: "1300x1800", nearestRoomLabel: "KITCHEN", nearOpening: true },
      ],
    });
    const result = classifyAnnotations(raw, makeContext({ dimensionFormat: "HEIGHT_x_WIDTH" }));
    expect(result.windows_by_room?.["Kitchen"]).toMatchObject({
      qty: 1,
      height_m: 1.3,
      width_m: 1.8,
    });
  });

  it("handles WIDTH_x_HEIGHT format", () => {
    const raw = makeRaw({
      openingAnnotations: [
        { text: "1800x1300", nearestRoomLabel: "KITCHEN", nearOpening: true },
      ],
    });
    const result = classifyAnnotations(raw, makeContext({ dimensionFormat: "WIDTH_x_HEIGHT" }));
    expect(result.windows_by_room?.["Kitchen"]).toMatchObject({
      qty: 1,
      height_m: 1.3,
      width_m: 1.8,
    });
  });

  it("skips annotations with nearOpening=false", () => {
    const raw = makeRaw({
      openingAnnotations: [
        { text: "1300x1800", nearestRoomLabel: "KITCHEN", nearOpening: false },
      ],
    });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.window_count).toBeNull();
  });

  it("skips annotations with unparseable text", () => {
    const raw = makeRaw({
      openingAnnotations: [
        { text: "N/A", nearestRoomLabel: "KITCHEN", nearOpening: true },
      ],
    });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.window_count).toBeNull();
  });

  it("accumulates qty for multiple windows in same room", () => {
    const raw = makeRaw({
      openingAnnotations: [
        { text: "1300x1800", nearestRoomLabel: "MASTER BED", nearOpening: true },
        { text: "1300x1800", nearestRoomLabel: "MASTER BED", nearOpening: true },
      ],
    });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.windows_by_room?.["Bed 1 (Master)"]?.qty).toBe(2);
    expect(result.window_count).toBe(2);
  });
});

describe("classifyAnnotations — areas from areaSummary", () => {
  it("reads living area from areaSummary", () => {
    const raw = makeRaw({ areaSummary: { livingAreaM2: 167.9, garageAreaM2: null, alfrescoAreaM2: null, coverageAreaM2: null, perimeterM: null } });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.floor_area_m2).toBe(167.9);
  });

  it("falls back to context.livingAreaM2 when areaSummary is null", () => {
    const result = classifyAnnotations(makeRaw(), makeContext({ livingAreaM2: 155 }));
    expect(result.floor_area_m2).toBe(155);
  });

  it("derives roof area as floor * 1.15", () => {
    const raw = makeRaw({ areaSummary: { livingAreaM2: 100, garageAreaM2: null, alfrescoAreaM2: null, coverageAreaM2: null, perimeterM: null } });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.roof_area_m2).toBe(115);
  });
});

describe("classifyAnnotations — garage door", () => {
  // Phase 2c (F-003): garage_door_size is now the QS size LABEL ("4.8×2.1"), not the
  // spreadsheet cell address — the export maps the label to the H176/H178/H180 cell.
  it("classifies a 4800mm-wide garage door to the 4.8×2.1 (double) size", () => {
    const raw = makeRaw({ garageDoorAnnotations: ["2100x4800"] });
    const result = classifyAnnotations(raw, makeContext({ dimensionFormat: "HEIGHT_x_WIDTH" }));
    expect(result.garage_door_size).toBe("4.8×2.1");
  });

  it("classifies a 2700mm wide door to the 2.7×2.1 (single) size", () => {
    const raw = makeRaw({ garageDoorAnnotations: ["2100x2700"] });
    const result = classifyAnnotations(raw, makeContext({ dimensionFormat: "HEIGHT_x_WIDTH" }));
    expect(result.garage_door_size).toBe("2.7×2.1");
  });

  it("passes through raw text when width is too far from any standard (manual review)", () => {
    const raw = makeRaw({ garageDoorAnnotations: ["2100x3500"] });
    const result = classifyAnnotations(raw, makeContext({ dimensionFormat: "HEIGHT_x_WIDTH" }));
    expect(result.garage_door_size).toBe("2100x3500");
  });
});

describe("classifyAnnotations — internal door count", () => {
  it("counts internalDoorAnnotations", () => {
    const raw = makeRaw({
      internalDoorAnnotations: [
        { text: "810", nearestRoomLabel: "MASTER BED" },
        { text: "760", nearestRoomLabel: "BED 2" },
        { text: "810", nearestRoomLabel: "BATHROOM" },
      ],
    });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.internal_door_count).toBe(3);
  });

  it("returns null when no internal door annotations", () => {
    const result = classifyAnnotations(makeRaw(), makeContext());
    expect(result.internal_door_count).toBeNull();
  });
});

describe("classifyAnnotations — derived fields (Phase 2d)", () => {
  it("derives external wall area = perimeter × stud − openings (callout path)", () => {
    const raw = makeRaw({
      openingAnnotations: [
        { text: "2000x2000", nearestRoomLabel: "KITCHEN", nearOpening: true }, // 2.0×2.0 = 4.0
      ],
      garageDoorAnnotations: ["2100x4800"], // → 4.8×2.1 = 10.08
      areaSummary: { livingAreaM2: null, garageAreaM2: null, alfrescoAreaM2: null, coverageAreaM2: null, perimeterM: 50 },
    });
    // opening area = 4.0 + 10.08 = 14.08; ext wall = 50 × 2.4 − 14.08 = 105.92
    const result = classifyAnnotations(raw, makeContext({ studHeightMm: 2400 }));
    expect(result.external_wall_area_m2).toBe(105.92);
  });

  it("derives total area = floor + alfresco", () => {
    const raw = makeRaw({
      areaSummary: { livingAreaM2: 165.4, garageAreaM2: null, alfrescoAreaM2: 1.7, coverageAreaM2: null, perimeterM: null },
    });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.total_area_m2).toBe(167.1);
  });

  it("falls back to floor area for total when alfresco is not read", () => {
    const raw = makeRaw({
      areaSummary: { livingAreaM2: 170.79, garageAreaM2: null, alfrescoAreaM2: null, coverageAreaM2: null, perimeterM: null },
    });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.total_area_m2).toBe(170.79);
  });

  it("flags alfresco low-confidence in notes when read", () => {
    const raw = makeRaw({
      areaSummary: { livingAreaM2: 165.4, garageAreaM2: null, alfrescoAreaM2: 1.7, coverageAreaM2: null, perimeterM: null },
    });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.notes).toContain("low confidence");
  });

  it("nulls external wall area when perimeter is unknown", () => {
    const result = classifyAnnotations(makeRaw(), makeContext({ perimeterM: null }));
    expect(result.external_wall_area_m2).toBeNull();
  });
});

describe("classifyAnnotations — room counts from roomLabels", () => {
  it("counts bathrooms", () => {
    const raw = makeRaw({ roomLabels: ["MASTER BED", "BATHROOM", "ENSUITE"] });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.bathroom_count).toBe(1);
    expect(result.ensuite_count).toBe(1);
  });

  it("counts kitchen", () => {
    const raw = makeRaw({ roomLabels: ["KITCHEN", "LIVING"] });
    const result = classifyAnnotations(raw, makeContext());
    expect(result.kitchen_count).toBe(1);
  });
});
