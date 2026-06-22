import { describe, expect, it } from "vitest";
import type { Segment } from "../../src/lib/doors/door-engine";
import { traceExteriorWallEvidence } from "../../src/lib/takeoff/exterior-wall-trace";

const PT_PER_MM = 72 / 25.4;
const mmToPt = (mm: number, scale: number) => (mm / scale) * PT_PER_MM;

function h(x0: number, x1: number, y: number): Segment {
  return { x0, y0: y, x1, y1: y };
}

function v(x: number, y0: number, y1: number): Segment {
  return { x0: x, y0, x1: x, y1 };
}

describe("exterior wall trace evidence", () => {
  it("measures thick exterior wall ribbons against the scale ruler", () => {
    const scale = 100;
    const x0 = 100;
    const y0 = 100;
    const width = mmToPt(10_000, scale);
    const depth = mmToPt(6_000, scale);
    const thickness = mmToPt(200, scale);

    const trace = traceExteriorWallEvidence({
      scale,
      printedPerimeterM: 32,
      rooms: [{ name: "LIVING", x: x0 + width / 2, y: y0 + depth / 2 }],
      segments: [
        h(x0, x0 + width, y0),
        h(x0, x0 + width, y0 + thickness),
        h(x0, x0 + width, y0 + depth - thickness),
        h(x0, x0 + width, y0 + depth),
        v(x0, y0, y0 + depth),
        v(x0 + thickness, y0, y0 + depth),
        v(x0 + width - thickness, y0, y0 + depth),
        v(x0 + width, y0, y0 + depth),
      ],
    });

    expect(trace.tracedExteriorEvidenceM).toBeCloseTo(32, 1);
    expect(trace.shortfallM).toBeCloseTo(0, 1);
    expect(trace.runs).toHaveLength(4);
    expect(trace.breaks).toHaveLength(0);
  });

  it("reports collinear breaks on traced exterior wall evidence", () => {
    const scale = 100;
    const x0 = 100;
    const y0 = 100;
    const width = mmToPt(10_000, scale);
    const depth = mmToPt(6_000, scale);
    const thickness = mmToPt(200, scale);
    const gapLo = x0 + mmToPt(4_000, scale);
    const gapHi = gapLo + mmToPt(2_000, scale);

    const trace = traceExteriorWallEvidence({
      scale,
      printedPerimeterM: 32,
      rooms: [{ name: "LIVING", x: x0 + width / 2, y: y0 + depth / 2 }],
      segments: [
        h(x0, gapLo, y0),
        h(gapHi, x0 + width, y0),
        h(x0, gapLo, y0 + thickness),
        h(gapHi, x0 + width, y0 + thickness),
        h(x0, x0 + width, y0 + depth - thickness),
        h(x0, x0 + width, y0 + depth),
        v(x0, y0, y0 + depth),
        v(x0 + thickness, y0, y0 + depth),
        v(x0 + width - thickness, y0, y0 + depth),
        v(x0 + width, y0, y0 + depth),
      ],
    });

    expect(trace.tracedExteriorEvidenceM).toBeCloseTo(30, 1);
    expect(trace.shortfallM).toBeCloseTo(2, 1);
    expect(trace.breaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vertical: false,
          widthMm: 2000,
        }),
      ]),
    );
  });
});
