// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPageGeometry } from "../../src/lib/doors/pdf-adapter";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
} from "../../src/lib/takeoff/elevation-vector-openings";

const FENNER_ELEVATIONS = resolve(process.cwd(), "tests/doors/plans/fenner-elevations.pdf");

async function fennerSegments() {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(FENNER_ELEVATIONS)),
    disableFontFace: true,
  } as never).promise;
  try {
    const geom = await extractPageGeometry((await doc.getPage(1)) as never);
    return geom.segments;
  } finally {
    await doc.destroy().catch(() => {});
  }
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

    expect(openings.length).toBeGreaterThan(15);
    expect(openings.length).toBeLessThan(60);
    expect(openings.every((opening) => opening.confidence === "medium")).toBe(true);
    expect(openings.every((opening) => opening.source === "vector_face_band")).toBe(true);

    expect(
      openings.some(
        (opening) => opening.type === "garage_door" && near(opening.widthMm, 4800, 350),
      ),
    ).toBe(true);
    expect(
      openings.some((opening) => opening.type === "slider" && near(opening.widthMm, 2400, 250)),
    ).toBe(true);
    expect(openings.some((opening) => near(opening.widthMm, 1500, 250))).toBe(true);
    expect(openings.some((opening) => near(opening.heightMm, 2100, 250))).toBe(true);
  }, 60_000);
});
