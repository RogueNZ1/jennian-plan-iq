import { describe, expect, it } from "vitest";
import type { ElevationData } from "../takeoff/extract-elevations";
import type { PlanPhysicalOpeningWidthWitness } from "../takeoff/floor-opening-witnesses";
import {
  summariseVisualOpeningAudit,
  VISUAL_OPENING_NOT_COUNTED_FLAG,
  type VisualOpeningAudit,
  type VisualOpeningAuditItem,
} from "../takeoff/visual-opening-audit";
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
    summary: summariseVisualOpeningAudit(openings),
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
  it("does not count a dimensionless duplicate beside a dimensioned visual opening", () => {
    const recovered = recoverVisualAuditFromElevationLedger(
      audit([
        visualOpening({
          id: "O8",
          type: "window",
          room: "Laundry/Mudroom",
          label: "700x3000",
          height_m: 0.7,
          width_m: 3,
          x: 0.58,
          y: 0.42,
          confidence: "medium",
          evidence: "printed 700x3000; marker placed on Laundry/Mudroom window line",
          flags: [],
        }),
        visualOpening({
          id: "O20",
          type: "pa_door",
          room: "Laundry/Mudroom",
          label: null,
          height_m: null,
          width_m: null,
          x: 0.62,
          y: 0.38,
          confidence: "medium",
          evidence: "duplicate marker on the same Laundry/Mudroom opening",
          flags: ["dimension not labelled"],
        }),
      ]),
      null,
      {
        page,
      },
    )!;

    expect(recovered.openings.find((opening) => opening.id === "O20")?.flags).toEqual(
      expect.arrayContaining([VISUAL_OPENING_NOT_COUNTED_FLAG]),
    );
    expect(recovered.summary.qsGlazedOpenings).toBe(1);
  });

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
    expect(recovered.openings[0].recoveryProof).toEqual({
      kind: "physical_elevation",
      floorWidthMm: 3600,
      elevationFace: "North",
      elevationLabel: "RS2",
      elevationWidthMm: 3600,
      elevationHeightMm: 2100,
    });
    expect(recovered.summary.uncertain).toBe(0);
  });

  it("uses a visual locator to attach deterministic physical/elevation proof to an ordinary opening", () => {
    const recovered = recoverVisualAuditFromElevationLedger(
      audit([
        visualOpening({
          label: "2125x3600",
          height_m: 2.1,
          width_m: 3.6,
          confidence: "medium",
          flags: [],
        }),
      ]),
      {
        ...elevations,
        elevationOpenings: [
          {
            face: "North",
            type: "slider",
            label: "RS2",
            widthMm: 3581,
            heightMm: 2125,
            quantity: 1,
            cladding: null,
            confidence: "high",
            notes: [],
          },
        ],
      },
      { physicalOpeningWidthWitnesses: [physicalWidthWitness()], page },
    )!;

    expect(recovered.openings[0]).toMatchObject({
      width_m: 3.6,
      height_m: 2.13,
      confidence: "high",
    });
    expect(recovered.openings[0].evidence).toContain("visual locator confirmed");
    expect(recovered.openings[0].recoveryProof).toEqual({
      kind: "physical_elevation",
      floorWidthMm: 3600,
      elevationFace: "North",
      elevationLabel: "RS2",
      elevationWidthMm: 3581,
      elevationHeightMm: 2125,
    });
  });

  it("ignores nearby physical width witnesses from the wrong room", () => {
    const recovered = recoverVisualAuditFromElevationLedger(
      audit([
        visualOpening({
          room: "Lounge",
          label: null,
          height_m: null,
          width_m: null,
          confidence: "medium",
          flags: ["dimension not readable"],
        }),
      ]),
      elevations,
      {
        physicalOpeningWidthWitnesses: [
          physicalWidthWitness({ widthMm: 2400, room: "Bed 1", x: 500, y: 400 }),
          physicalWidthWitness({ room: "Lounge", x: 505, y: 410 }),
        ],
        page,
      },
    )!;

    expect(recovered.openings[0]).toMatchObject({
      room: "Lounge",
      width_m: 3.6,
      height_m: 2.1,
    });
    expect(recovered.openings[0].recoveryProof).toMatchObject({
      floorWidthMm: 3600,
    });
  });

  it("does not recover duplicate visual locators that claim the same physical/elevation proof", () => {
    const original = audit([
      visualOpening({ id: "O1", label: "2100x3600", height_m: 2.1, width_m: 3.6, flags: [] }),
      visualOpening({
        id: "O2",
        label: "2100x3600",
        height_m: 2.1,
        width_m: 3.6,
        x: 0.51,
        y: 0.51,
        flags: [],
      }),
    ]);
    const recovered = recoverVisualAuditFromElevationLedger(original, elevations, {
      physicalOpeningWidthWitnesses: [physicalWidthWitness()],
      page,
    });

    expect(recovered).toBe(original);
  });

  it("does not recover when visual dimensions disagree with deterministic proof", () => {
    const original = audit([
      visualOpening({
        label: "2100x3000",
        height_m: 2.1,
        width_m: 3,
        confidence: "medium",
        flags: [],
      }),
    ]);
    const recovered = recoverVisualAuditFromElevationLedger(original, elevations, {
      physicalOpeningWidthWitnesses: [physicalWidthWitness()],
      page,
    });

    expect(recovered).toBe(original);
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
