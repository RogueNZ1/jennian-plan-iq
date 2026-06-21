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

async function extract(planPath: string, pageNumber = 1): Promise<PlanText> {
  const { extractPageGeometry } = await import("../../src/lib/doors/pdf-adapter");
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(planPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const geom = await extractPageGeometry((await doc.getPage(pageNumber)) as never);
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

describe("plan-text - Harrison candidate identity", () => {
  it("keeps W-code-backed jammed labels and rejects nearby room footprints", async () => {
    const pt = await extract(resolve(__dirname, "../fixtures/harrison/concept.pdf"), 2);

    const w07 = pt.windowCodes.filter(
      (c) => c.id === "W07" && c.heightMm === 700 && c.widthMm === 1500,
    );
    expect(w07).toHaveLength(1);
    expect(pt.windowCodes.some((c) => !c.id && c.heightMm === 900 && c.widthMm === 1200)).toBe(
      false,
    );
  }, 60_000);
});

describe("window auto-routing — West Street against Haydon's hand-verified workbook", () => {
  it("routes every printed code to its room exactly as the QS ground truth", async () => {
    const { routeWindowCodes } = await import("../../src/lib/takeoff/plan-text");
    const pt = await extract(resolve(__dirname, "../doors/plans/west-street.pdf"));
    const routed = routeWindowCodes(pt);
    const find = (h: number, w: number) =>
      routed
        .filter((r) => r.heightMm === h && r.widthMm === w)
        .map((r) => r.roomName.toUpperCase());
    console.log(
      "[routing]",
      routed.map((r) => `${r.roomName}:${r.heightMm}x${r.widthMm}`).join(" | "),
    );
    // his workbook rows 41-72, verified against the plan
    expect(find(1300, 1500).sort()).toEqual(["BED2", "BED3"]);
    expect(find(1100, 600).some((n) => n.startsWith("WC"))).toBe(true);
    expect(find(1100, 600).some((n) => n.startsWith("ENSUITE"))).toBe(true);
    expect(find(1100, 1200)[0]).toContain("BATH");
    const big = find(1300, 1800);
    expect(big.some((n) => n.includes("MASTER"))).toBe(true);
    // the living-side pair: open-plan boundaries are fuzzy between KITCHEN/DINING/LOUNGE —
    // all are real QS slots and the glazing total is identical either way.
    expect(big.filter((n) => /KITCHEN|DINING|LOUNGE|FAMILY/.test(n))).toHaveLength(2);
    expect(routed).toHaveLength(8);
    const area = routed.reduce((sum, r) => sum + (r.heightMm / 1000) * (r.widthMm / 1000), 0);
    expect(area).toBeCloseTo(13.56, 2);
  }, 60_000);
});

describe("plan-text - standalone opening width witnesses", () => {
  it("collects width-only labels as evidence without turning them into window codes", async () => {
    const pt = await extract(resolve(__dirname, "../doors/plans/fenner-floorplan.pdf"));

    expect(pt.windowCodes.some((code) => code.widthMm === 3600 || code.heightMm === 3600)).toBe(
      false,
    );
    expect(pt.standaloneOpeningWidths?.some((witness) => witness.widthMm === 3600)).toBe(true);
  }, 60_000);
});
