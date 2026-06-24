import { describe, expect, it } from "vitest";
import type { ElevationData } from "../takeoff/extract-elevations";
import type { PlanPhysicalOpeningWidthWitness } from "../takeoff/floor-opening-witnesses";
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

const page = { width: 1000, height: 800 };

function physicalWidthWitness(
  overrides: Partial<PlanPhysicalOpeningWidthWitness> = {},
): PlanPhysicalOpeningWidthWitness {
  return {
    kind: "physical_opening_width",
    widthMm: 3600,
    x: 505,
    y: 410,
    vertical: true,
    text: "3600",
    room: "Family",
    planSide: "plan_left",
    evidence: { stub: true, leaf: true },
    note: "standalone floor-plan width 3600mm with physical opening stub+leaf near Family",
    ...overrides,
  };
}

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

  it("does not let raw standalone width text choose between ambiguous elevation openings", () => {
    const ambiguousByElevationOnly: ElevationData = {
      ...elevations,
      elevationOpenings: [
        {
          face: "North",
          type: "slider",
          label: "RS1",
          widthMm: 3000,
          heightMm: 2100,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
        {
          face: "North",
          type: "slider",
          label: "RS2",
          widthMm: 3600,
          heightMm: 2100,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
      ],
    };
    const legacyRawWidthOptions = {
      planText: {
        standaloneOpeningWidths: [{ widthMm: 3600, x: 505, y: 410, vertical: true, text: "3600" }],
      },
      page,
    } as unknown as Parameters<typeof recoverVisualAuditFromElevationLedger>[2];

    const original = audit([visualOpening({ x: 0.5, y: 0.5 })]);
    const recovered = recoverVisualAuditFromElevationLedger(
      original,
      ambiguousByElevationOnly,
      legacyRawWidthOptions,
    );

    expect(recovered).toBe(original);
  });

  it("uses a nearby physical opening width witness to select the matching elevation opening", () => {
    const ambiguousByElevationOnly: ElevationData = {
      ...elevations,
      elevationOpenings: [
        {
          face: "North",
          type: "slider",
          label: "RS1",
          widthMm: 3000,
          heightMm: 2100,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
        {
          face: "North",
          type: "slider",
          label: "RS2",
          widthMm: 3600,
          heightMm: 2100,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
      ],
    };

    const recovered = recoverVisualAuditFromElevationLedger(
      audit([visualOpening({ x: 0.5, y: 0.5 })]),
      ambiguousByElevationOnly,
      { physicalOpeningWidthWitnesses: [physicalWidthWitness()], page },
    )!;

    expect(recovered.openings[0]).toMatchObject({
      height_m: 2.1,
      width_m: 3.6,
      confidence: "high",
      flags: [],
    });
    expect(recovered.openings[0].evidence).toContain("physical floor-plan width 3600mm");
    expect(recovered.openings[0].evidence).toContain("RS2");
    expect(recovered.summary.uncertain).toBe(0);
  });

  it("does not use a standalone width witness unless an elevation opening agrees", () => {
    const disagreeingElevation: ElevationData = {
      ...elevations,
      elevationOpenings: [
        {
          face: "North",
          type: "slider",
          label: "RS1",
          widthMm: 3000,
          heightMm: 2100,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
      ],
    };

    const original = audit([visualOpening({ x: 0.5, y: 0.5 })]);
    const recovered = recoverVisualAuditFromElevationLedger(original, disagreeingElevation, {
      physicalOpeningWidthWitnesses: [physicalWidthWitness()],
      page,
    });

    expect(recovered).toBe(original);
  });

  it("still recovers a single compatible elevation when physical width evidence is elsewhere", () => {
    const recovered = recoverVisualAuditFromElevationLedger(
      audit([visualOpening({ x: 0.1, y: 0.75 })]),
      elevations,
      { physicalOpeningWidthWitnesses: [physicalWidthWitness({ x: 900, y: 100 })], page },
    )!;

    expect(recovered.openings[0]).toMatchObject({
      height_m: 2.1,
      width_m: 3.6,
      confidence: "high",
      flags: [],
    });
    expect(recovered.openings[0].evidence).toContain(
      "malformed floor-plan label resolved from North elevation ledger",
    );
  });
});
