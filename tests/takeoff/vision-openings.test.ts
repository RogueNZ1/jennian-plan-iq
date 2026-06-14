// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyVisionWindowOpening } from "../../src/lib/takeoff/vision-openings";
import type { VisionWindow } from "../../src/lib/takeoff/vision-types";

const win = (partial: Partial<VisionWindow>): VisionWindow => ({
  label: "W1",
  width_mm: 1200,
  height_mm: 1100,
  room: "Garage",
  confidence: "high",
  source_evidence: "visible callout",
  ...partial,
});

describe("classifyVisionWindowOpening", () => {
  it("keeps a normal garage-room window as glazing", () => {
    const out = classifyVisionWindowOpening(win({ width_mm: 1200, height_mm: 1100 }));
    expect(out).toMatchObject({
      openingType: "window",
      widthMm: 1200,
      heightMm: 1100,
      counterKey: "windowItemsFound",
    });
  });

  it("promotes a garage-context standard door size out of glazing", () => {
    const out = classifyVisionWindowOpening(
      win({
        label: "GD01",
        width_mm: 2700,
        height_mm: 2110,
        room: "Garage",
        source_evidence: "garage door 2110 x 2700",
      }),
    );
    expect(out).toMatchObject({
      openingType: "garage_door",
      widthMm: 2700,
      heightMm: 2100,
      counterKey: "doorItemsFound",
    });
  });

  it("does not let an impossible garage-context read poison the glazing count", () => {
    const out = classifyVisionWindowOpening(
      win({
        label: "W103",
        width_mm: 6500,
        height_mm: 3800,
        room: "Garage",
        source_evidence: "garage opening",
      }),
    );
    expect(out).toMatchObject({
      openingType: "unknown_opening",
      widthMm: 6500,
      heightMm: 3800,
      counterKey: "doorItemsFound",
      confidence: "low",
    });
  });
});
