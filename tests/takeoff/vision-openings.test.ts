// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyVisionDoorOpening,
  classifyVisionWindowOpening,
} from "../../src/lib/takeoff/vision-openings";
import type { VisionDoor, VisionWindow } from "../../src/lib/takeoff/vision-types";

const win = (partial: Partial<VisionWindow>): VisionWindow => ({
  label: "W1",
  width_mm: 1200,
  height_mm: 1100,
  room: "Garage",
  confidence: "high",
  source_evidence: "visible callout",
  ...partial,
});

const door = (partial: Partial<VisionDoor>): VisionDoor => ({
  type: "external",
  width_mm: 860,
  height_mm: 2110,
  room: "Entry",
  confidence: "high",
  source_evidence: "entry door 2110x860",
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

  it("treats external-wall doors as glazing, not a separate external-door bucket", () => {
    const out = classifyVisionDoorOpening(door({ type: "external" }));
    expect(out).toMatchObject({
      openingType: "window",
      widthMm: 860,
      heightMm: 2110,
      counterKey: "windowItemsFound",
    });
  });

  it("keeps the garage door out of glazing when Vision returns it as a door", () => {
    const out = classifyVisionDoorOpening(
      door({
        type: "garage",
        width_mm: 4800,
        height_mm: 2110,
        room: "Garage",
        source_evidence: "sectional garage door 2110x4800",
      }),
    );
    expect(out).toMatchObject({
      openingType: "garage_door",
      widthMm: 4800,
      heightMm: 2100,
      counterKey: "doorItemsFound",
    });
  });

  it("defers internal doors to the internal-door pass", () => {
    expect(classifyVisionDoorOpening(door({ type: "internal" }))).toBeNull();
  });
});
