import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractAnnotations } from "../takeoff/extract-annotations";
import * as anthropicClient from "../takeoff/anthropic-client";
import { UNKNOWN_BUILDER } from "../takeoff/builder-config";
import type { PlanContext } from "../takeoff/plan-context";

vi.mock("../takeoff/anthropic-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../takeoff/anthropic-client")>();
  return {
    ...actual,
    getAnthropicApiKey: () => "test-key",
    callVisionModel: vi.fn(),
  };
});

const mockVision = () => vi.mocked(anthropicClient.callVisionModel);

const CTX: PlanContext = {
  builder: UNKNOWN_BUILDER,
  scaleString: "1:100 @ A3",
  scaleFactor: 100,
  dimensionFormat: "HEIGHT_x_WIDTH",
  dimensionFormatSource: "nz_default",
  studHeightMm: 2400,
  studHeightSource: "nz_default",
  sheetType: "floor_plan",
  livingAreaM2: null,
  perimeterM: null,
};

beforeEach(() => { vi.clearAllMocks(); });

describe("extractAnnotations — fail-loud (F-014)", () => {
  it("throws (does not return EMPTY_ANNOTATIONS) when the AI call fails", async () => {
    mockVision().mockRejectedValue(new Error("Anthropic API overloaded."));
    await expect(extractAnnotations("fake-b64", CTX)).rejects.toThrow(/overloaded/i);
  });

  it("throws (does not return EMPTY_ANNOTATIONS) when the AI response is not parseable JSON", async () => {
    mockVision().mockResolvedValue("No annotations found — this is prose, not JSON.");
    await expect(extractAnnotations("fake-b64", CTX)).rejects.toThrow(/parse/i);
  });

  it("returns parsed annotations on a normal response", async () => {
    mockVision().mockResolvedValue(JSON.stringify({
      openingAnnotations: [{ text: "1300x1800", nearestRoomLabel: "BED 1", nearOpening: true }],
      roomLabels: ["BED 1"],
      areaSummary: { livingAreaM2: 136.3, garageAreaM2: null, alfrescoAreaM2: null, coverageAreaM2: null, perimeterM: 54.8 },
      garageDoorAnnotations: [],
      internalDoorAnnotations: [],
    }));
    const out = await extractAnnotations("fake-b64", CTX);
    expect(out.openingAnnotations).toHaveLength(1);
    expect(out.openingAnnotations[0].text).toBe("1300x1800");
    expect(out.areaSummary.livingAreaM2).toBe(136.3);
  });
});
