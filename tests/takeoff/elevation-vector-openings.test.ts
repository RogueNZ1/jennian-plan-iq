// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPageGeometry } from "../../src/lib/doors/pdf-adapter";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
  mergeElevationVectorOpenings,
} from "../../src/lib/takeoff/elevation-vector-openings";
import { runElevationVectorOpenings } from "../../src/lib/takeoff/run-elevation-vector-openings";

const FENNER_ELEVATIONS = resolve(process.cwd(), "tests/doors/plans/fenner-elevations.pdf");

async function pageSegments(pdfPath: string) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const geom = await extractPageGeometry((await doc.getPage(1)) as never);
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

describe("elevation vector opening detector", () => {
  it("segments Fenner elevations into bounded face bands before opening detection", async () => {
    const bands = detectElevationFaceBands(await fennerSegments());

    expect(bands.length).toBeGreaterThan(4);
    expect(bands.length).toBeLessThan(30);
    expect(bands.every((band) => band.y0 > 120)).toBe(true);
    expect(bands.some((band) => band.widthMm > 18_000 && band.heightMm > 2_000)).toBe(true);
  }, 60_000);

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
    expect(
      openings.filter(
        (opening) =>
          opening.source === "multi_panel_slider" &&
          opening.face === "elevation-face-4" &&
          near(opening.widthMm, 3600, 250) &&
          near(opening.heightMm, 2100, 180),
      ),
    ).toHaveLength(2);
    expect(
      openings.some(
        (opening) => opening.source === "multi_panel_slider" && opening.face === "elevation-face-5",
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
});
