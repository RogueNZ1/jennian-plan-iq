// @vitest-environment node
/**
 * Christian / Awa Park core regression benchmark.
 *
 * This is the plan Jennian IQ has been run through repeatedly in production-like testing.
 * The first contract is deliberately narrow: prove the printed joinery codes are recovered,
 * and keep the known room-footprint gap visible as an expected failure.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePlanText, routeWindowCodes, type PlanText } from "../../src/lib/takeoff/plan-text";

const PLAN = resolve(process.cwd(), "tests/doors/plans/christian-floorplan-page6.pdf");
const TRUTH = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/fixtures/christian/ground-truth.json"), "utf8"),
) as {
  printed_code_expectations: {
    minimum_window_codes: number;
    representative_hxw_mm: [number, number][];
  };
  room_footprints: { must_recover: string[] };
};

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

describe("Christian / Awa Park benchmark", () => {
  it("reads the proposed floor-plan page's printed joinery codes", async () => {
    const pt = await extract(PLAN);
    const hasCode = (h: number, w: number) =>
      pt.windowCodes.some((c) => c.heightMm === h && c.widthMm === w);

    console.log(
      "[christian] codes:",
      pt.windowCodes.map((c) => `${c.id ?? "-"}:${c.heightMm}x${c.widthMm}`).join(" | "),
    );

    for (const [heightMm, widthMm] of TRUTH.printed_code_expectations.representative_hxw_mm) {
      expect(hasCode(heightMm, widthMm), `missing ${heightMm}x${widthMm}`).toBe(true);
    }
    expect(
      pt.windowCodes.some((c) => c.id === "W112" && c.heightMm === 2200 && c.widthMm === 1400),
      "WIR room footprint must not attach to nearby W112",
    ).toBe(false);
    expect(pt.windowCodes.length).toBeGreaterThanOrEqual(
      TRUTH.printed_code_expectations.minimum_window_codes,
    );
  }, 60_000);

  it("recovers the main room footprint labels from the proposed floor-plan page", async () => {
    const pt = await extract(PLAN);
    const names = pt.rooms.map((r) => r.name.toUpperCase());

    console.log(
      "[christian] rooms:",
      pt.rooms.map((r) => `${r.name} ${r.widthMm}x${r.depthMm}`).join(" | "),
    );

    for (const expected of TRUTH.room_footprints.must_recover) {
      expect(
        names.some((n) => n.includes(expected)),
        `missing room ${expected}`,
      ).toBe(true);
    }
  }, 60_000);

  it("routes printed joinery codes onto real room anchors", async () => {
    const pt = await extract(PLAN);
    const routed = routeWindowCodes(pt);
    const routedText = routed.map((r) => `${r.roomName}:${r.heightMm}x${r.widthMm}`).join(" | ");

    console.log("[christian] routed:", routedText);

    expect(routed.length).toBeGreaterThanOrEqual(12);
    expect(routed.some((r) => /BED ?2/i.test(r.roomName) && r.heightMm === 1100)).toBe(true);
    expect(routed.some((r) => /BED ?3/i.test(r.roomName) && r.heightMm === 1100)).toBe(true);
    expect(routed.some((r) => /BATH/i.test(r.roomName) && r.heightMm === 1100)).toBe(true);
    expect(routed.some((r) => /GARAGE/i.test(r.roomName))).toBe(true);
    expect(
      routed.some((r) => /LIVING|DINING|KITCHEN/i.test(r.roomName) && r.heightMm >= 2000),
    ).toBe(true);
  }, 60_000);
});
