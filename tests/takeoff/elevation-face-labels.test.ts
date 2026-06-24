// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPageGeometry } from "../../src/lib/doors/pdf-adapter";
import {
  detectElevationFaceBands,
  type ElevationFaceBand,
} from "../../src/lib/takeoff/elevation-vector-openings";
import { detectElevationFaceLabels } from "../../src/lib/takeoff/elevation-face-labels";
import type { TextLabel } from "../../src/lib/doors/door-engine";

async function pageGeometry(pdfPath: string, pageNumber = 1) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    return await extractPageGeometry((await doc.getPage(pageNumber)) as never);
  } finally {
    await doc.destroy().catch(() => {});
  }
}

async function labelsAndBands(
  path: string,
  pageNumber = 1,
): Promise<{ labels: TextLabel[]; bands: ElevationFaceBand[] }> {
  const geom = await pageGeometry(resolve(process.cwd(), path), pageNumber);
  return { labels: geom.labels, bands: detectElevationFaceBands(geom.segments) };
}

describe("elevation face labels", () => {
  it("reads explicit compass labels from 15a and ties them to nearby vector bands", async () => {
    const { labels, bands } = await labelsAndBands("tests/fixtures/15a/elevations.pdf");
    const faceLabels = detectElevationFaceLabels(labels, bands);

    expect(faceLabels.filter((label) => label.kind === "compass")).toHaveLength(4);
    expect(faceLabels.map((label) => label.direction).sort()).toEqual([
      "NORTHEASTERN",
      "NORTHWESTERN",
      "SOUTHEASTERN",
      "SOUTHWESTERN",
    ]);
    expect(faceLabels.every((label) => label.nearestBand != null)).toBe(true);
  }, 60_000);

  it("still reads O'Neil compass labels when vector banding is not available", async () => {
    const { labels, bands } = await labelsAndBands("tests/fixtures/oneil/elevations.pdf");
    const faceLabels = detectElevationFaceLabels(labels, bands);

    expect(bands).toHaveLength(0);
    expect(faceLabels.filter((label) => label.kind === "compass")).toHaveLength(4);
    expect(faceLabels.map((label) => label.direction).sort()).toEqual([
      "EASTERN",
      "NORTHERN",
      "SOUTHERN",
      "WESTERN",
    ]);
    expect(faceLabels.every((label) => label.nearestBand == null)).toBe(true);
  }, 60_000);

  it("reads Beddis lettered elevations for convention audit without assigning compass faces", async () => {
    const { labels, bands } = await labelsAndBands("tests/fixtures/beddis/prelim.pdf", 5);
    const faceLabels = detectElevationFaceLabels(labels, bands);

    expect(faceLabels.filter((label) => label.kind === "letter")).toHaveLength(4);
    expect(faceLabels.map((label) => label.letter).sort()).toEqual(["A", "B", "C", "D"]);
    expect(faceLabels.every((label) => label.direction == null)).toBe(true);
  }, 60_000);
});
