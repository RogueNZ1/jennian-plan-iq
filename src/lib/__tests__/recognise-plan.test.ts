import { describe, it, expect, vi, beforeEach } from "vitest";
import { recognisePlan } from "../takeoff/recognise-plan";
import * as anthropicClient from "../takeoff/anthropic-client";

vi.mock("../takeoff/anthropic-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../takeoff/anthropic-client")>();
  return {
    ...actual,
    getAnthropicApiKey: () => "test-key",
    callVisionModel: vi.fn(),
  };
});

const mockVision = () => vi.mocked(anthropicClient.callVisionModel);

beforeEach(() => { vi.clearAllMocks(); });

describe("recognisePlan — Jennian floor plan", () => {
  it("detects Jennian builder and applies builder-default dimension format", async () => {
    mockVision().mockResolvedValue(JSON.stringify({
      builderName: "Jennian Homes",
      sheetType: "floor_plan",
      scaleString: "1:100 @ A3",
      scaleFactor: null,
      dimensionFormat: null,
      studHeightMm: null,
      livingAreaM2: null,
      perimeterM: null,
    }));
    const ctx = await recognisePlan("fake-b64", "floor-plan.pdf");
    expect(ctx.builder.name).toBe("Jennian Homes");
    expect(ctx.sheetType).toBe("floor_plan");
    expect(ctx.dimensionFormat).toBe("HEIGHT_x_WIDTH");
    expect(ctx.dimensionFormatSource).toBe("builder_default");
    expect(ctx.studHeightMm).toBe(2400);
    expect(ctx.studHeightSource).toBe("builder_default");
    expect(ctx.scaleString).toBe("1:100 @ A3");
  });
});

describe("recognisePlan — G.J. Gardner plan with stated dimension format", () => {
  it("uses stated dimension format over builder default", async () => {
    mockVision().mockResolvedValue(JSON.stringify({
      builderName: "G.J. Gardner Homes",
      sheetType: "dimension_plan",
      scaleString: "1:100 @ A3",
      scaleFactor: null,
      dimensionFormat: "WIDTH_x_HEIGHT",
      studHeightMm: 2410,
      livingAreaM2: null,
      perimeterM: null,
    }));
    const ctx = await recognisePlan("fake-b64", "gjg-plan.pdf");
    expect(ctx.builder.name).toBe("G.J. Gardner");
    expect(ctx.sheetType).toBe("dimension_plan");
    expect(ctx.dimensionFormat).toBe("WIDTH_x_HEIGHT");
    expect(ctx.dimensionFormatSource).toBe("stated_on_plan");
    expect(ctx.studHeightMm).toBe(2410);
    expect(ctx.studHeightSource).toBe("stated_on_plan");
  });
});

describe("recognisePlan — site plan (auto-stop)", () => {
  it("returns sheetType site_plan so extractConceptTakeoffs can skip", async () => {
    mockVision().mockResolvedValue(JSON.stringify({
      builderName: null,
      sheetType: "site_plan",
      scaleString: null,
      scaleFactor: null,
      dimensionFormat: null,
      studHeightMm: null,
      livingAreaM2: null,
      perimeterM: null,
    }));
    const ctx = await recognisePlan("fake-b64", "site-plan.pdf");
    expect(ctx.sheetType).toBe("site_plan");
    // auto-stop: sheetType is neither floor_plan nor dimension_plan
    expect(ctx.sheetType).not.toBe("floor_plan");
    expect(ctx.sheetType).not.toBe("dimension_plan");
  });
});

describe("recognisePlan — elevation (auto-stop)", () => {
  it("returns sheetType elevation so extractConceptTakeoffs can skip", async () => {
    mockVision().mockResolvedValue(JSON.stringify({
      builderName: "Jennian Homes",
      sheetType: "elevation",
      scaleString: null,
      scaleFactor: null,
      dimensionFormat: null,
      studHeightMm: null,
      livingAreaM2: null,
      perimeterM: null,
    }));
    const ctx = await recognisePlan("fake-b64", "elevation.pdf");
    expect(ctx.sheetType).toBe("elevation");
    expect(ctx.sheetType).not.toBe("floor_plan");
    expect(ctx.sheetType).not.toBe("dimension_plan");
  });
});

describe("recognisePlan — fail-loud (F-014)", () => {
  it("throws (does not return a fallback) when the AI call fails", async () => {
    mockVision().mockRejectedValue(new Error("AI rate-limited."));
    await expect(recognisePlan("fake-b64", "floor-plan.pdf")).rejects.toThrow(/rate-limited/i);
  });

  it("throws (does not return a fallback) when the AI response is not parseable JSON", async () => {
    mockVision().mockResolvedValue("Sorry, I can't read this plan — not JSON at all.");
    await expect(recognisePlan("fake-b64", "floor-plan.pdf")).rejects.toThrow(/parse/i);
  });
});
