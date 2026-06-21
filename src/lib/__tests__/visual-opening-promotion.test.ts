import { describe, expect, it } from "vitest";
import { promoteVisualOpenings } from "../takeoff/visual-opening-promotion";
import type { VisualOpeningAudit, VisualOpeningAuditItem } from "../takeoff/visual-opening-audit";

function item(over: Partial<VisualOpeningAuditItem>): VisualOpeningAuditItem {
  return {
    id: "O1",
    type: "window",
    room: "Living",
    label: null,
    height_m: 1,
    width_m: 1,
    x: 0.5,
    y: 0.5,
    confidence: "high",
    evidence: "",
    flags: [],
    ...over,
  };
}

function audit(openings: VisualOpeningAuditItem[]): VisualOpeningAudit {
  return {
    pageNumber: 1,
    method: "visual_qs",
    openings,
    warnings: [],
    summary: { totalOpenings: openings.length, qsGlazedOpenings: 0, garageDoors: 0, uncertain: 0 },
  };
}

describe("visual-opening-promotion", () => {
  it("promotes external wall openings with the garage door as the only non-glazed exception", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({ id: "O1", type: "window", room: "Bed 2", height_m: 1.1, width_m: 1 }),
        item({ id: "O2", type: "external_door", room: "Entry", height_m: null, width_m: null }),
        item({ id: "O3", type: "pa_door", room: "Laundry", height_m: null, width_m: null }),
        item({ id: "O4", type: "garage_door", room: "Garage", height_m: 2.11, width_m: 2.8 }),
      ]),
    );

    expect(promoted?.openings.map((o) => [o.type, o.glazed])).toEqual([
      ["window", true],
      ["entrance", true],
      ["pa_door", true],
      ["sectional_door", false],
    ]);
    expect(promoted?.garageDoorSize).toBe("2.8x2.11");
    expect(promoted?.openings[1]).toMatchObject({
      height_m: 2.1,
      width_m: 1,
      source: "vision",
    });
    expect(promoted?.flags.join(" ")).toContain("promoted 4 external-wall openings");
    expect(promoted?.flags.join(" ")).toContain("assumed 2.1m high");
  });

  it("swaps impossible visual slider dimensions and flags the correction", () => {
    const promoted = promoteVisualOpenings(
      audit([item({ id: "O9", type: "slider", room: "Dining", height_m: 3.95, width_m: 2.5 })]),
    );

    expect(promoted?.openings[0]).toMatchObject({ height_m: 2.5, width_m: 3.95 });
    expect(promoted?.flags.join(" ")).toContain("dimensions swapped");
  });

  it("uses the printed garage label before visual dimensions", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({
          id: "O8",
          type: "garage_door",
          room: "Garage",
          label: "2110x2700",
          height_m: 2.8,
          width_m: 5.7,
        }),
      ]),
    );

    expect(promoted?.openings[0]).toMatchObject({
      type: "sectional_door",
      width_m: 2.7,
      height_m: 2.11,
      glazed: false,
    });
    expect(promoted?.garageDoorSize).toBe("2.7x2.11");
  });

  it("rejects elevation/level reads as garage doors", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({
          id: "O8",
          type: "garage_door",
          room: "Garage",
          label: "2800x5700",
          height_m: 2.8,
          width_m: 5.7,
        }),
        item({ id: "O9", type: "window", room: "Garage", height_m: 1.1, width_m: 1.3 }),
      ]),
    );

    expect(promoted?.openings.map((o) => o.type)).toEqual(["window"]);
    expect(promoted?.garageDoorSize).toBeNull();
    expect(promoted?.flags.join(" ")).toContain("outside the garage-door plausibility band");
  });

  it("rejects JM-0041's 2800x2520 visual misread as too tall for a garage door", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({
          id: "O7",
          type: "garage_door",
          room: "Garage",
          label: "2800x2520",
          height_m: 2.52,
          width_m: 2.8,
        }),
      ]),
    );

    expect(promoted).toBeNull();
  });
});
