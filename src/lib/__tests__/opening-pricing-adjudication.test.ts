// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  adjudicateOpeningPricing,
  applyOpeningPricingBlock,
} from "../takeoff/opening-pricing-adjudication";
import type { Opening } from "../takeoff/takeoff-types";

function opening(overrides: Partial<Opening> = {}): Opening {
  return {
    type: "window",
    room: "Lounge",
    height_m: 1.3,
    width_m: 1.8,
    glazed: true,
    cladding: null,
    area_m2: 2.34,
    source: "vector",
    confidence: "medium",
    ...overrides,
  };
}

describe("opening pricing adjudication", () => {
  it("keeps locally valid priced openings while blocking aggregate pricing", () => {
    const adjudication = adjudicateOpeningPricing([
      opening(),
      opening({
        room: "Bad witness",
        width_m: 90,
        height_m: 1.6,
        area_m2: 144,
        source: "vision",
      }),
    ]);

    const blocked = applyOpeningPricingBlock(adjudication, {
      reason: "visual_reconciliation_error",
      flag: "Opening pricing blocked: unresolved Visual QS reconciliation error.",
    });

    expect(blocked.pricingBlocked).toBe(true);
    expect(blocked.pricedOpenings).toHaveLength(1);
    expect(blocked.pricedOpenings[0]).toMatchObject({
      room: "Lounge",
      width_m: 1.8,
      height_m: 1.3,
    });
    expect(blocked.quarantinedOpenings).toHaveLength(1);
    expect(blocked.quarantinedOpenings[0].reasons).toContain("impossible_width");
    expect(blocked.flags.join(" ")).toContain("Opening pricing blocked");
  });
});
