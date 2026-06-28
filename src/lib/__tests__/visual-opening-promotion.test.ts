import { describe, expect, it } from "vitest";
import { promoteVisualOpenings } from "../takeoff/visual-opening-promotion";
import {
  VISUAL_OPENING_NOT_COUNTED_FLAG,
  type VisualOpeningAudit,
  type VisualOpeningAuditItem,
} from "../takeoff/visual-opening-audit";

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
  it("keeps visual openings as evidence-only and does not promote them into QS openings", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({ id: "O1", type: "window", room: "Bed 2", height_m: 1.1, width_m: 1 }),
        item({ id: "O2", type: "external_door", room: "Entry", height_m: null, width_m: null }),
        item({ id: "O3", type: "pa_door", room: "Laundry", height_m: null, width_m: null }),
        item({ id: "O4", type: "garage_door", room: "Garage", height_m: 2.11, width_m: 2.8 }),
      ]),
    );

    expect(promoted?.openings).toEqual([]);
    expect(promoted?.garageDoorSize).toBe("2.8x2.11");
    expect(promoted?.flags.join(" ")).toContain("review evidence only");
    expect(promoted?.flags.join(" ")).toContain("O1: visual opening retained as evidence only");
    expect(promoted?.flags.join(" ")).not.toContain("assumed 2.1m high");
  });

  it("still records visual dimension corrections as review flags", () => {
    const promoted = promoteVisualOpenings(
      audit([item({ id: "O9", type: "slider", room: "Dining", height_m: 3.95, width_m: 2.5 })]),
    );

    expect(promoted?.openings).toEqual([]);
    expect(promoted?.flags.join(" ")).toContain("dimensions swapped");
  });

  it("does not promote from prose that merely looks like deterministic proof", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({
          id: "O10",
          type: "slider",
          room: "Family",
          height_m: 2.1,
          width_m: 3.6,
          evidence:
            "physical floor-plan width 3600mm with stub+leaf evidence selects North elevation RS2 at 3600x2100mm",
        }),
      ]),
    );

    expect(promoted?.openings).toEqual([]);
    expect(promoted?.flags.join(" ")).toContain("review evidence only");
  });

  it("promotes only when structured physical-elevation proof is present", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({
          id: "O11",
          type: "slider",
          room: "Family",
          height_m: 2.1,
          width_m: 3.6,
          recoveryProof: {
            kind: "physical_elevation",
            floorWidthMm: 3600,
            elevationFace: "North",
            elevationLabel: "RS2",
            elevationWidthMm: 3600,
            elevationHeightMm: 2100,
          },
        }),
      ]),
    );

    expect(promoted?.openings).toHaveLength(1);
    expect(promoted?.openings[0]).toMatchObject({
      type: "slider",
      room: "Family",
      source: "vector",
      height_source: "vector",
      width_m: 3.6,
      height_m: 2.1,
    });
  });

  it("does not promote a visual marker rejected by floor-plan validation", () => {
    const promoted = promoteVisualOpenings(
      audit([
        item({
          id: "O20",
          type: "slider",
          room: "Laundry/Mudroom",
          height_m: 0.7,
          width_m: 3,
          flags: [VISUAL_OPENING_NOT_COUNTED_FLAG],
          recoveryProof: {
            kind: "physical_elevation",
            floorWidthMm: 3000,
            elevationFace: "East",
            elevationLabel: "W20",
            elevationWidthMm: 3000,
            elevationHeightMm: 700,
          },
        }),
      ]),
    );

    expect(promoted?.openings).toEqual([]);
    expect(promoted?.flags.join(" ")).toContain("rejected by floor-plan validation");
  });

  it("uses a plausible printed garage label as a garage-size witness only", () => {
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

    expect(promoted?.openings).toEqual([]);
    expect(promoted?.garageDoorSize).toBe("2.7x2.11");
  });

  it("rejects elevation/level reads as garage-door size witnesses", () => {
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

    expect(promoted?.openings).toEqual([]);
    expect(promoted?.garageDoorSize).toBeNull();
    expect(promoted?.flags.join(" ")).toContain("outside the garage-door plausibility band");
  });

  it("retains rejected garage-door reads as review evidence", () => {
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

    expect(promoted?.openings).toEqual([]);
    expect(promoted?.garageDoorSize).toBeNull();
    expect(promoted?.flags.join(" ")).toContain("outside the garage-door plausibility band");
  });
});
