import { describe, expect, it } from "vitest";
import { createScaleRuler } from "../../src/lib/takeoff/scale-ruler";

describe("scale ruler", () => {
  it("measures a 1:100 plan gap from PDF points into real millimetres", () => {
    const ruler = createScaleRuler(100);
    const tenPaperMmInPdfPoints = (10 / 25.4) * 72;

    expect(ruler.measureGapWidthMm(tenPaperMmInPdfPoints)).toBe(1000);
  });

  it("round-trips real opening widths through the plan scale", () => {
    const ruler = createScaleRuler(100);
    const pdfWidth = ruler.mmToPdfPoints(1800);

    expect(ruler.pdfPointsToMm(pdfWidth)).toBeCloseTo(1800, 6);
  });

  it("rejects invalid plan scales", () => {
    expect(() => createScaleRuler(0)).toThrow("positive finite");
    expect(() => createScaleRuler(Number.NaN)).toThrow("positive finite");
  });
});
