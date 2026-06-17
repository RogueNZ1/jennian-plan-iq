import { describe, expect, it } from "vitest";
import type { ElevationData } from "../takeoff/extract-elevations";
import type { VisualOpeningAudit, VisualOpeningAuditItem } from "../takeoff/visual-opening-audit";
import { recoverVisualAuditFromElevationLedger } from "../takeoff/visual-opening-elevation-recovery";

function visualOpening(overrides: Partial<VisualOpeningAuditItem> = {}): VisualOpeningAuditItem {
  return {
    id: "O1",
    type: "slider",
    room: "Family",
    label: "1300x175036001300x1750",
    height_m: null,
    width_m: null,
    x: 0.5,
    y: 0.5,
    confidence: "low",
    evidence: "malformed floor-plan label",
    flags: ["malformed dimension label - verify against elevations/schedule"],
    ...overrides,
  };
}

function audit(openings: VisualOpeningAuditItem[]): VisualOpeningAudit {
  return {
    pageNumber: 1,
    method: "visual_qs",
    openings,
    warnings: [],
    summary: {
      totalOpenings: openings.length,
      qsGlazedOpenings: openings.filter((opening) => opening.type !== "garage_door").length,
      garageDoors: openings.filter((opening) => opening.type === "garage_door").length,
      uncertain: openings.filter(
        (opening) => opening.type === "uncertain" || opening.confidence === "low",
      ).length,
    },
  };
}

const elevations: ElevationData = {
  claddingTypes: [],
  claddingTypeCode: null,
  roofType: null,
  roofPitchDegrees: null,
  wallHeightMm: null,
  studHeightMm: null,
  facesPresent: ["North"],
  windowCountPerFace: {},
  externalDoorCount: 0,
  gableEndCount: 0,
  garageDoorsPresent: false,
  elevationOpenings: [
    {
      face: "North",
      type: "slider",
      label: null,
      widthMm: 3600,
      heightMm: 2100,
      quantity: 1,
      cladding: null,
      confidence: "high",
      notes: [],
    },
  ],
};

describe("recoverVisualAuditFromElevationLedger", () => {
  it("recovers a single malformed visual opening from one compatible elevation candidate", () => {
    const recovered = recoverVisualAuditFromElevationLedger(audit([visualOpening()]), elevations)!;

    expect(recovered.openings[0]).toMatchObject({
      height_m: 2.1,
      width_m: 3.6,
      confidence: "high",
      flags: [],
    });
    expect(recovered.openings[0].evidence).toContain("resolved from North elevation ledger");
    expect(recovered.summary.uncertain).toBe(0);
  });

  it("does not guess when there are multiple unresolved malformed openings", () => {
    const original = audit([visualOpening({ id: "O1" }), visualOpening({ id: "O2" })]);
    const recovered = recoverVisualAuditFromElevationLedger(original, elevations);

    expect(recovered).toBe(original);
  });

  it("does not guess when compatible elevation candidates are ambiguous", () => {
    const ambiguous: ElevationData = {
      ...elevations,
      elevationOpenings: [
        ...elevations.elevationOpenings!,
        { ...elevations.elevationOpenings![0], face: "South" },
      ],
    };

    const original = audit([visualOpening()]);
    const recovered = recoverVisualAuditFromElevationLedger(original, ambiguous);

    expect(recovered).toBe(original);
  });
});
