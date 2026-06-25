// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parsePair } from "../../scripts/vision-floorplan-measure.mts";

describe("vision floorplan diagnostic dimension parsing", () => {
  it("parses contiguous printed opening dimensions", () => {
    expect(parsePair("1100x600")).toEqual({ a: 1100, b: 600, qty: 1 });
    expect(parsePair("W12 1300x1800")).toEqual({ a: 1300, b: 1800, qty: 1 });
  });

  it("parses spaced thousands in vision text", () => {
    expect(parsePair("1 000x600")).toEqual({ a: 1000, b: 600, qty: 1 });
    expect(parsePair("1 850 x 700")).toEqual({ a: 1850, b: 700, qty: 1 });
    expect(parsePair("W12 1 300 x 1 800")).toEqual({ a: 1300, b: 1800, qty: 1 });
  });

  it("preserves quantity prefixes without treating run dimensions as openings", () => {
    expect(parsePair("2/1 100x600")).toEqual({ a: 1100, b: 600, qty: 2 });
    expect(parsePair("12370")).toBeNull();
  });
});
