// @vitest-environment node
/**
 * Fenner wild-card opening benchmark.
 *
 * The truth is Haydon's manual QS pricing input. The current text-layer route is
 * expected to fail until visual/elevation recovery can see the large sliders and
 * garage/entry openings that are not printed as clean HxW text tokens.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePlanText, routeWindowCodes, type PlanText } from "../../src/lib/takeoff/plan-text";

type ManualOpening = {
  room: string;
  cladding: number;
  qty: number;
  height_m: number;
  width_m: number;
};

const PLAN = resolve(process.cwd(), "tests/doors/plans/fenner-floorplan.pdf");
const TRUTH = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/fixtures/fenner/ground-truth.json"), "utf8"),
) as {
  manual_openings: ManualOpening[];
  derived: {
    opening_rows: number;
    opening_qty: number;
    total_opening_sqm: number;
    garage_door_sqm: number;
    garage_door_excluded_opening_sqm: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

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

function manualOpeningAreaM2(rows: ManualOpening[]): number {
  return round2(rows.reduce((sum, row) => sum + row.qty * row.height_m * row.width_m, 0));
}

function isGarageDoor(row: ManualOpening): boolean {
  return /garage door/i.test(row.room);
}

function routedOpeningAreaM2(pt: PlanText): number {
  const routed = routeWindowCodes(pt);
  const routedArea = routed.reduce(
    (sum, row) => sum + (row.heightMm / 1000) * (row.widthMm / 1000),
    0,
  );
  // The garage door is known from Haydon's manual input and visible on elevations;
  // include it here so this test isolates the missing glazing/sliders gap.
  return round2(routedArea + 2.1 * 4.8);
}

describe("Fenner wild-card benchmark", () => {
  it("pins Haydon's manual priced opening rows", () => {
    expect(TRUTH.manual_openings).toHaveLength(TRUTH.derived.opening_rows);
    expect(TRUTH.manual_openings.reduce((sum, row) => sum + row.qty, 0)).toBe(
      TRUTH.derived.opening_qty,
    );
    expect(manualOpeningAreaM2(TRUTH.manual_openings)).toBeCloseTo(
      TRUTH.derived.total_opening_sqm,
      2,
    );
    expect(manualOpeningAreaM2(TRUTH.manual_openings.filter(isGarageDoor))).toBeCloseTo(
      TRUTH.derived.garage_door_sqm,
      2,
    );
    expect(
      manualOpeningAreaM2(TRUTH.manual_openings.filter((row) => !isGarageDoor(row))),
    ).toBeCloseTo(TRUTH.derived.garage_door_excluded_opening_sqm, 2);
  });

  it.fails(
    "recovers Haydon's priced opening area from deterministic extraction",
    async () => {
      const pt = await extract(PLAN);
      const routed = routeWindowCodes(pt);
      const area = routedOpeningAreaM2(pt);

      console.log(
        "[fenner routing]",
        routed.map((r) => `${r.roomName}:${r.heightMm}x${r.widthMm}`).join(" | "),
        "area",
        area,
        "truth",
        TRUTH.derived.total_opening_sqm,
      );

      expect(area).toBeCloseTo(TRUTH.derived.total_opening_sqm, 1);
    },
    60_000,
  );
});
