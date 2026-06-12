// @vitest-environment node
/**
 * Plan-text parsers against BOTH committed fixture plans — real PDFs, real labels.
 * West Street assertions are the JM-0032 ground truth (the job this module exists
 * to make impossible to misread again).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePlanText, type PlanText } from "../../src/lib/takeoff/plan-text";

async function extract(planPath: string): Promise<PlanText> {
  const { extractPageGeometry } = await import("../../src/lib/doors/pdf-adapter");
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(planPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const geom = await extractPageGeometry((await doc.getPage(1)) as never);
    return parsePlanText(geom.labels);
  } finally {
    await doc.destroy().catch(() => {});
  }
}

describe("plan-text — West Street (JM-0032 ground truth)", () => {
  let pt: PlanText;
  beforeAll(async () => {
    pt = await extract(resolve(__dirname, "../doors/plans/west-street.pdf"));
  }, 60_000);

  it("GARAGE room = 4.0 × 5.95 = 23.8 m² (NOT the title block's 46.7)", () => {
    const g = pt.rooms.find((r) => /^GARAGE$/i.test(r.name));
    expect(g).toBeDefined();
    expect(g!.widthMm).toBe(4000);
    expect(g!.depthMm).toBe(5950);
    expect(g!.areaM2).toBeCloseTo(23.8, 1);
  });

  it("BED 3 exists with its footprint — the room vision lost", () => {
    const b = pt.rooms.find((r) => /^BED ?3$/i.test(r.name));
    expect(b).toBeDefined();
    expect(b!.widthMm).toBe(3000);
    expect(b!.depthMm).toBe(3000);
  });

  it("finds the full room set", () => {
    const names = pt.rooms.map((r) => r.name.toUpperCase());
    for (const expected of [
      "GARAGE",
      "LOUNGE",
      "KITCHEN",
      "DINING",
      "ENSUITE",
      "WIR",
      "STORE",
      "LINEN",
      "HWC",
      "ENTRY",
      "BATH",
    ])
      expect(
        names.some((n) => n.includes(expected)),
        `missing room ${expected}`,
      ).toBe(true);
  });

  it("window codes include 1100x600 (the printed Ensuite/WC size vision misread as 1.8 high)", () => {
    const has = (h: number, w: number) =>
      pt.windowCodes.some((c) => c.heightMm === h && c.widthMm === w);
    expect(has(1100, 600)).toBe(true);
    expect(has(1300, 1500)).toBe(true);
    expect(has(1300, 1800)).toBe(true);
    expect(has(1100, 1200)).toBe(true);
  });

  it("title areas: total 139.4 / cladding 46.7 / perimeter 56.2 — the grab-detection table", () => {
    expect(pt.titleAreas.totalAreaM2).toBeCloseTo(139.4, 1);
    expect(pt.titleAreas.claddingAreaM2).toBeCloseTo(46.7, 1);
    expect(pt.titleAreas.perimeterM).toBeCloseTo(56.2, 1);
  });
});

describe("plan-text — Alexandra (no false rooms from a different plan style)", () => {
  it("parses without inventing: every room has plausible dims", async () => {
    const pt = await extract(resolve(__dirname, "../doors/plans/alexandra.pdf"));
    console.log(
      "[alexandra] rooms:",
      pt.rooms.map((r) => `${r.name} ${r.widthMm}x${r.depthMm}`).join(" | "),
    );
    console.log(
      "[alexandra] codes:",
      pt.windowCodes.length,
      "titleAreas:",
      JSON.stringify(pt.titleAreas),
    );
    for (const r of pt.rooms) {
      expect(r.widthMm).toBeGreaterThanOrEqual(400);
      expect(r.depthMm).toBeGreaterThanOrEqual(400);
      expect(r.areaM2).toBeLessThan(120);
    }
  }, 60_000);
});
