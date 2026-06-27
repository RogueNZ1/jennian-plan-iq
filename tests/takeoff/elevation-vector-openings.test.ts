// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Segment } from "../../src/lib/doors/door-engine";
import { extractPageGeometry } from "../../src/lib/doors/pdf-adapter";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
  mergeElevationVectorOpenings,
} from "../../src/lib/takeoff/elevation-vector-openings";
import { runElevationVectorOpenings } from "../../src/lib/takeoff/run-elevation-vector-openings";

const FENNER_ELEVATIONS = resolve(process.cwd(), "tests/doors/plans/fenner-elevations.pdf");
const BEDDIS_PRELIM = resolve(process.cwd(), "tests/fixtures/beddis/prelim.pdf");
const BEDDIS_TRUTH = resolve(process.cwd(), "tests/fixtures/beddis/ground-truth.json");

async function pageSegments(pdfPath: string, pageNumber = 1) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const geom = await extractPageGeometry((await doc.getPage(pageNumber)) as never);
    return geom.segments;
  } finally {
    await doc.destroy().catch(() => {});
  }
}

async function fennerSegments() {
  return pageSegments(FENNER_ELEVATIONS);
}

const near = (value: number | null | undefined, target: number, tolerance: number) =>
  value != null && Math.abs(value - target) <= tolerance;

function beddisTruthOpenings(): Array<{ widthMm: number; heightMm: number }> {
  const truth = JSON.parse(readFileSync(BEDDIS_TRUTH, "utf8")) as {
    joinery_bench: { openings: Array<{ width_m: number; height_m: number }> };
  };
  return truth.joinery_bench.openings.map((opening) => ({
    widthMm: Math.round(opening.width_m * 1000),
    heightMm: Math.round(opening.height_m * 1000),
  }));
}

function dimensionMatchCount(
  truthRows: readonly { widthMm: number; heightMm: number }[],
  openings: readonly { widthMm: number | null; heightMm: number | null }[],
): number {
  const unused = openings.filter((opening) => opening.widthMm != null && opening.heightMm != null);
  let count = 0;
  for (const row of truthRows) {
    const index = unused.findIndex(
      (opening) =>
        opening.widthMm != null &&
        opening.heightMm != null &&
        Math.abs(opening.widthMm - row.widthMm) <= 250 &&
        Math.abs(opening.heightMm - row.heightMm) <= 250,
    );
    if (index < 0) continue;
    count += 1;
    unused.splice(index, 1);
  }
  return count;
}

const PT_PER_MM = 72 / 25.4;
const ELEVATION_SCALE = 100;
const mmToPt = (mm: number) => (mm / ELEVATION_SCALE) * PT_PER_MM;

function segment(x0: number, y0: number, x1: number, y1: number): Segment {
  return { x0, y0, x1, y1 };
}

function syntheticSectionalDoorSegments(args: {
  pageY: number;
  doorWidthMm: number;
  doorHeightMm?: number;
}): Segment[] {
  const doorHeight = mmToPt(args.doorHeightMm ?? 2100);
  const doorWidth = mmToPt(args.doorWidthMm);
  const faceX0 = 20;
  const faceX1 = 420;
  const faceY0 = args.pageY;
  const faceY1 = args.pageY + doorHeight + 18;
  const doorX0 = 150;
  const doorX1 = doorX0 + doorWidth;
  const doorY0 = args.pageY + 6;
  const doorY1 = doorY0 + doorHeight;
  const railYs = [
    doorY0,
    doorY0 + doorHeight * 0.25,
    doorY0 + doorHeight * 0.5,
    doorY0 + doorHeight * 0.75,
    doorY1,
  ];

  return [
    segment(faceX0, faceY0, faceX1, faceY0),
    segment(faceX0, faceY1, faceX1, faceY1),
    segment(doorX0, doorY0, doorX0, doorY1),
    segment(doorX1, doorY0, doorX1, doorY1),
    ...railYs.map((y) => segment(doorX0, y, doorX1, y)),
  ];
}

describe("elevation vector opening detector", () => {
  it("segments Fenner elevations into bounded face bands before opening detection", async () => {
    const bands = detectElevationFaceBands(await fennerSegments());

    expect(bands.length).toBeGreaterThan(4);
    expect(bands.length).toBeLessThan(30);
    expect(Math.min(...bands.map((band) => band.y0))).toBeGreaterThan(80);
    expect(bands.some((band) => band.widthMm > 18_000 && band.heightMm > 2_000)).toBe(true);
  }, 60_000);

  it("detects sectional doors from vector-relative bounds instead of fixed page y bands", () => {
    const openings = detectElevationVectorOpenings(
      syntheticSectionalDoorSegments({ pageY: 35, doorWidthMm: 4800 }),
    );

    expect(
      openings.some(
        (opening) =>
          opening.source === "sectional_garage_door" &&
          opening.type === "garage_door" &&
          near(opening.widthMm, 4800, 80),
      ),
    ).toBe(true);
  });

  it("can detect a single sectional door when panel rails prove the object", () => {
    const openings = detectElevationVectorOpenings(
      syntheticSectionalDoorSegments({ pageY: 180, doorWidthMm: 3000 }),
    );

    expect(
      openings.some(
        (opening) =>
          opening.source === "sectional_garage_door" &&
          opening.type === "garage_door" &&
          near(opening.widthMm, 3000, 80),
      ),
    ).toBe(true);
  });

  it("finds Fenner-sized elevation opening candidates without flooding low-confidence noise", async () => {
    const openings = detectElevationVectorOpenings(await fennerSegments());
    const garageDoors = openings.filter((opening) => opening.type === "garage_door");

    expect(openings.length).toBeGreaterThan(15);
    expect(openings.length).toBeLessThan(60);
    expect(openings.every((opening) => opening.confidence === "medium")).toBe(true);
    expect(
      openings.every((opening) =>
        ["vector_face_band", "multi_panel_slider", "sectional_garage_door"].includes(
          opening.source,
        ),
      ),
    ).toBe(true);

    expect(garageDoors).toHaveLength(1);
    expect(garageDoors[0].source).toBe("sectional_garage_door");
    expect(near(garageDoors[0].widthMm, 4800, 120)).toBe(true);
    expect(near(garageDoors[0].heightMm, 2100, 120)).toBe(true);
    expect(
      openings.some((opening) => opening.type === "slider" && near(opening.widthMm, 2400, 250)),
    ).toBe(true);
    expect(
      openings.some(
        (opening) =>
          opening.source === "multi_panel_slider" &&
          opening.type === "slider" &&
          near(opening.widthMm, 3600, 250) &&
          near(opening.heightMm, 2100, 180),
      ),
    ).toBe(true);
    const fennerLargeSliders = openings.filter(
      (opening) =>
        opening.source === "multi_panel_slider" &&
        near(opening.widthMm, 3600, 250) &&
        near(opening.heightMm, 2100, 180),
    );
    expect(fennerLargeSliders).toHaveLength(2);
    expect(new Set(fennerLargeSliders.map((opening) => opening.face)).size).toBe(1);
    expect(
      openings.some(
        (opening) =>
          opening.source === "multi_panel_slider" && opening.face === garageDoors[0].face,
      ),
    ).toBe(false);
    expect(openings.some((opening) => near(opening.widthMm, 1500, 250))).toBe(true);
    expect(openings.some((opening) => near(opening.heightMm, 2100, 250))).toBe(true);
  }, 60_000);

  it("runner extracts the same vector candidates from the elevation PDF", async () => {
    const openings = await runElevationVectorOpenings(readFileSync(FENNER_ELEVATIONS), 1);

    expect(openings.length).toBeGreaterThan(15);
    expect(openings.length).toBeLessThan(60);
    expect(openings.some((opening) => opening.source === "vector_face_band")).toBe(true);
  }, 60_000);

  it("keeps Beddis vector evidence bounded while preserving signed-dimension coverage", async () => {
    const segments = await pageSegments(BEDDIS_PRELIM, 5);
    const bands = detectElevationFaceBands(segments);
    const openings = detectElevationVectorOpenings(segments);

    expect(bands.length).toBeGreaterThan(4);
    expect(bands.length).toBeLessThanOrEqual(24);
    expect(openings.length).toBeGreaterThanOrEqual(11);
    expect(openings.length).toBeLessThanOrEqual(20);
    expect(dimensionMatchCount(beddisTruthOpenings(), openings)).toBeGreaterThanOrEqual(6);
  }, 60_000);

  it("merges vector candidates into elevation data without duplicating matching AI openings", async () => {
    const [candidate] = detectElevationVectorOpenings(await fennerSegments()).filter(
      (opening) => opening.type === "garage_door",
    );
    const merged = mergeElevationVectorOpenings(
      {
        claddingTypes: [],
        claddingTypeCode: null,
        roofType: null,
        roofPitchDegrees: null,
        wallHeightMm: null,
        studHeightMm: null,
        facesPresent: ["AI Face"],
        windowCountPerFace: {},
        externalDoorCount: 0,
        gableEndCount: 0,
        garageDoorsPresent: false,
        elevationOpenings: [
          {
            face: "AI Face",
            type: "garage_door",
            label: "GD",
            widthMm: candidate.widthMm,
            heightMm: candidate.heightMm,
            quantity: 1,
            cladding: null,
            confidence: "high",
            notes: [],
          },
        ],
      },
      [candidate],
    );

    expect(merged?.garageDoorsPresent).toBe(true);
    expect(merged?.elevationOpenings).toHaveLength(1);

    const created = mergeElevationVectorOpenings(null, [candidate]);
    expect(created?.facesPresent).toContain(candidate.face);
    expect(created?.elevationOpenings).toHaveLength(1);
  }, 60_000);

  it("preserves rich vector face evidence even when no opening rectangles are selected", () => {
    const slotMember = {
      widthMm: 1200,
      heightMm: 1100,
      x: 42,
      y: 80,
      x0: 36,
      x1: 48,
      y0: 40,
      y1: 120,
      areaPt2: 960,
      faceBandId: "elevation-face-empty",
      containingRects: 0,
      childRects: 0,
    };
    const merged = mergeElevationVectorOpenings(null, {
      elevationOpenings: [],
      elevationFaceBands: [
        {
          id: "elevation-face-empty",
          x0: 10,
          x1: 210,
          y0: 20,
          y1: 150,
          widthMm: 5000,
          heightMm: 2600,
        },
      ],
      elevationOpeningSlots: [
        {
          ...slotMember,
          id: "opening-slot-empty",
          groupId: "assembly-group-empty",
          groupWidthMm: 1300,
          groupHeightMm: 1200,
          groupMemberRects: 1,
          groupLikelyMultiOpening: false,
          slotMemberRects: 1,
          nestedSlotMemberRects: 0,
          members: [slotMember],
        },
      ],
    });

    expect(merged?.elevationOpenings).toEqual([]);
    expect(merged?.facesPresent).toEqual(["elevation-face-empty"]);
    expect(merged?.elevationFaceBands).toHaveLength(1);
    expect(merged?.elevationOpeningSlots).toHaveLength(1);
  });
});
