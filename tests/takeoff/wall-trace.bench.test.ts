// @vitest-environment node
/**
 * Ribbon-trace v1 bench — deterministic, locked EXACT on both committed plans.
 * These are REGRESSION LOCKS with a stated bias, not gospel: v1 over-counts
 * ~25% from kitchen joinery + shower boxes (visually audited 13 Jun 2026,
 * /tmp overlay series). West Street hand-estimate ≈ 50-55 lm true interior.
 * The QS export suppression on internal walls REMAINS until live validation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function trace(plan: string) {
  const { extractPageGeometry } = await import("../../src/lib/doors/pdf-adapter");
  const { traceInteriorWalls } = await import("../../src/lib/takeoff/wall-trace");
  const { parsePlanText } = await import("../../src/lib/takeoff/plan-text");
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(resolve(__dirname, plan))),
  } as never).promise;
  try {
    const geom = await extractPageGeometry((await doc.getPage(1)) as never);
    const pt = parsePlanText(geom.labels);
    return traceInteriorWalls(
      geom.segments,
      100,
      pt.rooms.map((r) => ({ x: r.x, y: r.y })),
    );
  } finally {
    await doc.destroy().catch(() => {});
  }
}

describe("ribbon-trace v1 bench", () => {
  it("West Street: 68.7 lm / 32 ribbons (true ≈50-55; +joinery bias documented)", async () => {
    const wt = await trace("../doors/plans/west-street.pdf");
    expect(wt.internalWallLm).toBe(68.7);
    expect(wt.ribbonCount).toBe(32);
  }, 60_000);

  it("Alexandra: deterministic and plausible for a ~200 m² plan", async () => {
    const wt = await trace("../doors/plans/alexandra.pdf");
    expect(wt.internalWallLm).toBe(89.1);
    expect(wt.ribbonCount).toBe(31);
  }, 60_000);
});
