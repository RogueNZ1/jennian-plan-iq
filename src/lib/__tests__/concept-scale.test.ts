import { describe, expect, it } from "vitest";

import { parsePrintedScaleRatio } from "../takeoff/concept.functions";

describe("concept scale gate", () => {
  it("treats clear printed scale text as usable scale evidence", () => {
    expect(parsePrintedScaleRatio("Scale: 1:100")).toBe(100);
    expect(parsePrintedScaleRatio("Found scale text '1:100' in the title block")).toBe(100);
    expect(parsePrintedScaleRatio("SCALE 1/75")).toBe(75);
  });

  it("returns null when no printed ratio exists", () => {
    expect(parsePrintedScaleRatio("paper size not stated")).toBeNull();
  });
});
