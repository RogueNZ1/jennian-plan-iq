import { describe, expect, it } from "vitest";
import { deriveOpenings } from "../takeoff/derive-fields";
import { adjudicateOpeningPricing } from "../takeoff/opening-pricing-adjudication";

describe("deriveOpenings unresolved width doctrine", () => {
  it("keeps schedule rows with missing width out of priced openings", () => {
    const openings = deriveOpenings({
      windowsSchedule: [{ id: "W01", height_m: 1.3, width_m: null }],
    });

    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({
      room: "W01",
      width_m: 0,
      height_m: 1.3,
      area_m2: 0,
      source: "schedule",
    });
    expect(openings[0].flags?.join(" ")).toContain("width unresolved");

    const adjudicated = adjudicateOpeningPricing(openings);
    expect(adjudicated.pricedOpenings).toHaveLength(0);
    expect(adjudicated.quarantinedOpenings).toContainEqual(
      expect.objectContaining({
        reasons: expect.arrayContaining(["missing_width"]),
      }),
    );
  });

  it("keeps room callout rows with missing width out of priced openings", () => {
    const openings = deriveOpenings({
      windowsByRoom: {
        bed1: { qty: 2, height_m: 1.3, width_m: 0 },
      },
    });

    expect(openings).toHaveLength(2);
    for (const opening of openings) {
      expect(opening).toMatchObject({
        room: "bed1",
        width_m: 0,
        height_m: 1.3,
        area_m2: 0,
      });
      expect(opening.flags?.join(" ")).toContain("width unresolved");
    }

    const adjudicated = adjudicateOpeningPricing(openings);
    expect(adjudicated.pricedOpenings).toHaveLength(0);
    expect(adjudicated.quarantinedOpenings).toHaveLength(2);
    expect(adjudicated.quarantinedOpenings.map((q) => q.reasons)).toEqual([
      ["missing_width"],
      ["missing_width"],
    ]);
  });

  it("does not change rows whose width is actually known", () => {
    const openings = deriveOpenings({
      windowsSchedule: [{ id: "W02", height_m: 1.3, width_m: 1.5 }],
    });

    expect(openings[0]).toMatchObject({
      room: "W02",
      width_m: 1.5,
      height_m: 1.3,
      area_m2: 1.95,
      source: "schedule",
    });
    expect(openings[0].flags).toBeUndefined();
    expect(adjudicateOpeningPricing(openings).pricedOpenings).toHaveLength(1);
  });
});
