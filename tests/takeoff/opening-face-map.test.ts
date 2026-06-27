import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPageGeometry } from "../../src/lib/doors/pdf-adapter";
import { detectFrameOpeningSlots } from "../../src/lib/takeoff/elevation-opening-slots";
import { detectPlanSideLengthWitnesses } from "../../src/lib/takeoff/floor-side-lengths";
import { buildOpeningSignatureFloorRows } from "../../src/lib/takeoff/opening-floor-signatures";
import { buildOpeningFaceMap } from "../../src/lib/takeoff/opening-face-map";
import type {
  ElevationFaceBand,
  ElevationVectorOpening,
} from "../../src/lib/takeoff/elevation-vector-openings";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
} from "../../src/lib/takeoff/elevation-vector-openings";
import type { PlanPhysicalOpeningWidthWitness } from "../../src/lib/takeoff/floor-opening-witnesses";
import {
  detectPhysicalOpeningWidthWitnesses,
  detectPrintedWindowCodeWitnesses,
} from "../../src/lib/takeoff/floor-opening-witnesses";
import type { PlanGarageDoorWitness, PlanText } from "../../src/lib/takeoff/plan-text";
import { parsePlanText } from "../../src/lib/takeoff/plan-text";

const FIFTEEN_A_FLOORPLAN = resolve(process.cwd(), "tests/fixtures/15a/floorplan.pdf");
const FIFTEEN_A_ELEVATIONS = resolve(process.cwd(), "tests/fixtures/15a/elevations.pdf");
const itWithFifteenAPdfs =
  existsSync(FIFTEEN_A_FLOORPLAN) && existsSync(FIFTEEN_A_ELEVATIONS) ? it : it.skip;

async function pageGeometry(path: string) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(1);
    return await extractPageGeometry(page as never);
  } finally {
    await doc.destroy().catch(() => {});
  }
}

function witness(overrides: Partial<PlanGarageDoorWitness> = {}): PlanGarageDoorWitness {
  return {
    widthMm: 4800,
    x: 850,
    y: 271,
    vertical: true,
    text: "4800",
    markerText: "Insulated garage door",
    markerX: 833,
    markerY: 299,
    room: "GARAGE",
    planSide: "plan_right",
    ...overrides,
  };
}

function garageDoor(overrides: Partial<ElevationVectorOpening> = {}): ElevationVectorOpening {
  return {
    source: "sectional_garage_door",
    faceBandId: "elevation-face-5",
    face: "elevation-face-5",
    type: "garage_door",
    label: null,
    widthMm: 4873,
    heightMm: 2100,
    quantity: 1,
    cladding: null,
    confidence: "medium",
    notes: [],
    x: 405.7,
    y: 395,
    ...overrides,
  };
}

function planText(witnesses: PlanGarageDoorWitness[]): Pick<PlanText, "garageDoorWitnesses"> {
  return { garageDoorWitnesses: witnesses };
}

function faceBand(overrides: Partial<ElevationFaceBand> = {}): ElevationFaceBand {
  return {
    id: "elevation-face-5",
    x0: 100,
    x1: 370,
    y0: 320,
    y1: 427,
    widthMm: 9400,
    heightMm: 3800,
    ...overrides,
  };
}

function physicalWitness(
  overrides: Partial<PlanPhysicalOpeningWidthWitness> = {},
): PlanPhysicalOpeningWidthWitness {
  return {
    kind: "physical_opening_width",
    widthMm: 3600,
    x: 358,
    y: 436,
    vertical: true,
    text: "3600",
    room: "LOUNGE",
    planSide: "plan_left",
    evidence: { stub: true, leaf: true },
    note: "physical opening",
    ...overrides,
  };
}

function slider(overrides: Partial<ElevationVectorOpening> = {}): ElevationVectorOpening {
  return {
    source: "multi_panel_slider",
    faceBandId: "elevation-face-4",
    face: "elevation-face-4",
    type: "slider",
    label: null,
    widthMm: 3581,
    heightMm: 2125,
    quantity: 1,
    cladding: null,
    confidence: "medium",
    notes: [],
    x: 763,
    y: 392,
    ...overrides,
  };
}

describe("opening face map", () => {
  it("anchors a unique floor garage-door witness to a unique sectional elevation object", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [garageDoor()],
    });

    expect(map.garageDoorAnchor).toMatchObject({
      kind: "unique_garage_door",
      planSide: "plan_right",
      elevationFace: "elevation-face-5",
      elevationFaceBandId: "elevation-face-5",
      widthDeltaMm: 73,
    });
    expect(map.byElevationFace.get("elevation-face-5")?.planSide).toBe("plan_right");
    expect(map.byPlanSide.get("plan_right")?.elevationFace).toBe("elevation-face-5");
  });

  it("fails closed when the floor has more than one garage-door witness", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness(), witness({ x: 700, planSide: "plan_left" })]),
      elevationOpenings: [garageDoor()],
    });

    expect(map.garageDoorAnchor).toBeNull();
    expect(map.byElevationFace.size).toBe(0);
  });

  it("fails closed when the elevation has more than one sectional garage-door object", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [garageDoor(), garageDoor({ face: "elevation-face-8" })],
    });

    expect(map.garageDoorAnchor).toBeNull();
    expect(map.byPlanSide.size).toBe(0);
  });

  it("fails closed when the unique objects disagree on width", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [garageDoor({ widthMm: 3600 })],
    });

    expect(map.garageDoorAnchor).toBeNull();
  });

  it("anchors the opposite face only when layout and opening signature both agree", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [garageDoor(), slider()],
      faceBands: [
        faceBand(),
        faceBand({ id: "elevation-face-4", x0: 800, x1: 1060, widthMm: 9200 }),
      ],
      physicalOpeningWitnesses: [physicalWitness()],
    });

    expect(map.oppositeFaceAnchor).toMatchObject({
      kind: "opposite_layout_signature",
      planSide: "plan_left",
      elevationFace: "elevation-face-4",
      widthDeltaMm: 19,
    });
    expect(map.byElevationFace.get("elevation-face-4")?.planSide).toBe("plan_left");
    expect(map.byPlanSide.get("plan_left")?.elevationFace).toBe("elevation-face-4");
  });

  it("does not anchor the opposite face when the signature is also present on another face", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [garageDoor(), slider(), slider({ face: "elevation-face-1" })],
      faceBands: [
        faceBand(),
        faceBand({ id: "elevation-face-4", x0: 800, x1: 1060, widthMm: 9200 }),
      ],
      physicalOpeningWitnesses: [physicalWitness()],
    });

    expect(map.oppositeFaceAnchor).toBeNull();
    expect(map.byPlanSide.has("plan_left")).toBe(false);
  });

  it("does not anchor the opposite face when same-row layout is ambiguous", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [garageDoor(), slider()],
      faceBands: [
        faceBand(),
        faceBand({ id: "elevation-face-4", x0: 800, x1: 1060, widthMm: 9200 }),
        faceBand({ id: "elevation-face-9", x0: 200, x1: 460, widthMm: 9100 }),
      ],
      physicalOpeningWitnesses: [physicalWitness()],
    });

    expect(map.oppositeFaceAnchor).toBeNull();
    expect(map.byPlanSide.has("plan_left")).toBe(false);
  });

  it("does not use the wide-opening face bootstrap for window-sized witnesses", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [garageDoor(), slider({ widthMm: 1800, heightMm: 1300, type: "window" })],
      faceBands: [
        faceBand(),
        faceBand({ id: "elevation-face-4", x0: 800, x1: 1060, widthMm: 9200 }),
      ],
      physicalOpeningWitnesses: [physicalWitness({ widthMm: 1800 })],
    });

    expect(map.oppositeFaceAnchor).toBeNull();
    expect(map.byPlanSide.has("plan_left")).toBe(false);
  });

  it("anchors a long face when two physical side witnesses uniquely match the same long elevation band", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [
        garageDoor(),
        slider(),
        slider({ face: "elevation-face-1", faceBandId: "elevation-face-1", widthMm: 2400 }),
        slider({
          face: "elevation-face-1",
          faceBandId: "elevation-face-1",
          widthMm: 2600,
          heightMm: 1300,
          type: "window",
        }),
        slider({ face: "elevation-face-10", faceBandId: "elevation-face-10", widthMm: 3100 }),
      ],
      faceBands: [
        faceBand(),
        faceBand({ id: "elevation-face-4", x0: 800, x1: 1060, widthMm: 9200 }),
        faceBand({
          id: "elevation-face-1",
          x0: 250,
          x1: 890,
          y0: 150,
          y1: 216,
          widthMm: 22200,
        }),
        faceBand({
          id: "elevation-face-10",
          x0: 250,
          x1: 890,
          y0: 560,
          y1: 685,
          widthMm: 22200,
        }),
      ],
      physicalOpeningWitnesses: [
        physicalWitness(),
        physicalWitness({ widthMm: 2400, room: "MASTERBED", planSide: "plan_top" }),
        physicalWitness({ widthMm: 2600, room: "BED3", planSide: "plan_top" }),
      ],
    });

    expect(map.longFaceAnchors).toHaveLength(1);
    expect(map.longFaceAnchors[0]).toMatchObject({
      kind: "long_face_signature",
      planSide: "plan_top",
      elevationFace: "elevation-face-1",
    });
    expect(map.byPlanSide.get("plan_top")?.elevationFace).toBe("elevation-face-1");
  });

  it("does not anchor a long face from a single matching witness", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [
        garageDoor(),
        slider(),
        slider({ face: "elevation-face-1", faceBandId: "elevation-face-1", widthMm: 2400 }),
      ],
      faceBands: [
        faceBand(),
        faceBand({ id: "elevation-face-4", x0: 800, x1: 1060, widthMm: 9200 }),
        faceBand({
          id: "elevation-face-1",
          x0: 250,
          x1: 890,
          y0: 150,
          y1: 216,
          widthMm: 22200,
        }),
        faceBand({
          id: "elevation-face-10",
          x0: 250,
          x1: 890,
          y0: 560,
          y1: 685,
          widthMm: 22200,
        }),
      ],
      physicalOpeningWitnesses: [
        physicalWitness(),
        physicalWitness({ widthMm: 2400, room: "MASTERBED", planSide: "plan_top" }),
      ],
    });

    expect(map.longFaceAnchors).toHaveLength(0);
    expect(map.byPlanSide.has("plan_top")).toBe(false);
  });

  it("does not use a narrow/internal-looking witness as the second long-face signature", () => {
    const map = buildOpeningFaceMap({
      planText: planText([witness()]),
      elevationOpenings: [
        garageDoor(),
        slider(),
        slider({ face: "elevation-face-1", faceBandId: "elevation-face-1", widthMm: 2400 }),
        slider({
          face: "elevation-face-1",
          faceBandId: "elevation-face-1",
          widthMm: 1846,
          heightMm: 1300,
          type: "window",
        }),
      ],
      faceBands: [
        faceBand(),
        faceBand({ id: "elevation-face-4", x0: 800, x1: 1060, widthMm: 9200 }),
        faceBand({
          id: "elevation-face-1",
          x0: 250,
          x1: 890,
          y0: 150,
          y1: 216,
          widthMm: 22200,
        }),
        faceBand({
          id: "elevation-face-10",
          x0: 250,
          x1: 890,
          y0: 560,
          y1: 685,
          widthMm: 22200,
        }),
      ],
      physicalOpeningWitnesses: [
        physicalWitness(),
        physicalWitness({ widthMm: 2400, room: "MASTERBED", planSide: "plan_top" }),
        physicalWitness({ widthMm: 1820, room: "BED3", planSide: "plan_top" }),
      ],
    });

    expect(map.longFaceAnchors).toHaveLength(0);
    expect(map.byPlanSide.has("plan_top")).toBe(false);
  });

  itWithFifteenAPdfs(
    "anchors 15a plan_right from ordered slots plus measured side length",
    async () => {
      const floorGeom = await pageGeometry(FIFTEEN_A_FLOORPLAN);
      const planTextEvidence = parsePlanText(floorGeom.labels);
      const physicalWitnesses = detectPhysicalOpeningWidthWitnesses({
        planText: planTextEvidence,
        segments: floorGeom.segments,
        labels: floorGeom.labels,
        scale: 100,
      });
      const elevationGeom = await pageGeometry(FIFTEEN_A_ELEVATIONS);
      const faceBands = detectElevationFaceBands(elevationGeom.segments);
      const openingSlots = detectFrameOpeningSlots({
        segments: elevationGeom.segments,
        faceBands,
      });

      const map = buildOpeningFaceMap({
        planText: planTextEvidence,
        elevationOpenings: detectElevationVectorOpenings(elevationGeom.segments),
        faceBands,
        physicalOpeningWitnesses: physicalWitnesses,
        openingSlots,
        floorSignatureRows: buildOpeningSignatureFloorRows({
          planText: planTextEvidence,
          physicalWitnesses,
          printedCodeWitnesses: detectPrintedWindowCodeWitnesses(planTextEvidence),
        }),
        floorSideLengthWitnesses: detectPlanSideLengthWitnesses(floorGeom.labels),
      });

      expect(map.byPlanSide.get("plan_right")).toMatchObject({
        kind: "ordered_length_signature",
        elevationFace: "elevation-face-4",
        orientation: "reverse",
        lengthDeltaMm: 259,
      });
      const planRightAnchor = map.orderedLengthAnchors.find(
        (anchor) => anchor.planSide === "plan_right",
      );
      expect(planRightAnchor).toBeDefined();
      expect(planRightAnchor?.rowMatches).toHaveLength(4);
      expect(
        planRightAnchor?.rowMatches.map((match) => ({
          room: match.row.room,
          recovered: `${match.member.widthMm}x${match.member.heightMm}`,
        })),
      ).toEqual([
        { room: "MASTERBED", recovered: "1842x1317" },
        { room: "BED3", recovered: "1549x1317" },
        { room: "KITCHEN", recovered: "838x1317" },
        { room: "DINING", recovered: "1549x1317" },
      ]);
      expect(
        Math.round(
          planRightAnchor!.rowMatches.reduce(
            (sum, match) => sum + (match.row.widthMm / 1000) * (match.member.heightMm / 1000),
            0,
          ) * 100,
        ) / 100,
      ).toBe(7.38);
      expect(map.byPlanSide.has("plan_top")).toBe(false);
    },
    60_000,
  );

  itWithFifteenAPdfs(
    "anchors a partial ordered side only when printed-code side evidence is uniquely length-compatible",
    async () => {
      const floorGeom = await pageGeometry(FIFTEEN_A_FLOORPLAN);
      const planTextEvidence = parsePlanText(floorGeom.labels);
      const physicalWitnesses = detectPhysicalOpeningWidthWitnesses({
        planText: planTextEvidence,
        segments: floorGeom.segments,
        labels: floorGeom.labels,
        scale: 100,
      });
      const elevationGeom = await pageGeometry(FIFTEEN_A_ELEVATIONS);
      const faceBands = detectElevationFaceBands(elevationGeom.segments);
      const openingSlots = detectFrameOpeningSlots({
        segments: elevationGeom.segments,
        faceBands,
      });

      const map = buildOpeningFaceMap({
        planText: planTextEvidence,
        elevationOpenings: detectElevationVectorOpenings(elevationGeom.segments),
        faceBands,
        physicalOpeningWitnesses: physicalWitnesses,
        openingSlots,
        floorSignatureRows: buildOpeningSignatureFloorRows({
          planText: planTextEvidence,
          physicalWitnesses,
          printedCodeWitnesses: detectPrintedWindowCodeWitnesses(planTextEvidence),
        }),
        floorSideLengthWitnesses: detectPlanSideLengthWitnesses(floorGeom.labels),
      });

      expect(map.byPlanSide.get("plan_bottom")).toMatchObject({
        kind: "ordered_length_signature",
        elevationFace: "elevation-face-10",
        lengthDeltaMm: 262,
      });
      expect(map.byPlanSide.has("plan_left")).toBe(false);
      expect(
        map.byPlanSide
          .get("plan_bottom")
          ?.rowMatches.map((match) => [match.row.source, match.row.room, match.row.widthMm]),
      ).toEqual([
        ["printed_code", "BATH", 1200],
        ["printed_code", "ENAUITE", 600],
      ]);
    },
    60_000,
  );

  itWithFifteenAPdfs(
    "does not anchor the 15a ordered sequence when the side length disagrees",
    async () => {
      const floorGeom = await pageGeometry(FIFTEEN_A_FLOORPLAN);
      const planTextEvidence = parsePlanText(floorGeom.labels);
      const physicalWitnesses = detectPhysicalOpeningWidthWitnesses({
        planText: planTextEvidence,
        segments: floorGeom.segments,
        labels: floorGeom.labels,
        scale: 100,
      });
      const elevationGeom = await pageGeometry(FIFTEEN_A_ELEVATIONS);
      const faceBands = detectElevationFaceBands(elevationGeom.segments);
      const openingSlots = detectFrameOpeningSlots({
        segments: elevationGeom.segments,
        faceBands,
      });

      const map = buildOpeningFaceMap({
        planText: planTextEvidence,
        elevationOpenings: detectElevationVectorOpenings(elevationGeom.segments),
        faceBands,
        openingSlots,
        floorSignatureRows: buildOpeningSignatureFloorRows({
          planText: planTextEvidence,
          physicalWitnesses,
          printedCodeWitnesses: detectPrintedWindowCodeWitnesses(planTextEvidence),
        }).filter((row) => row.planSide === "plan_right"),
        floorSideLengthWitnesses: [{ planSide: "plan_right", lengthMm: 12370 }],
      });

      expect(map.orderedLengthAnchors).toHaveLength(0);
      expect(map.byPlanSide.has("plan_right")).toBe(false);
    },
    60_000,
  );
});
