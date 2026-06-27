// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPageGeometry } from "../../src/lib/doors/pdf-adapter";
import {
  detectPhysicalOpeningWidthWitnesses,
  detectPrintedWindowCodeWitnesses,
} from "../../src/lib/takeoff/floor-opening-witnesses";
import { buildOpeningSignatureFloorRows } from "../../src/lib/takeoff/opening-floor-signatures";
import { parsePlanText } from "../../src/lib/takeoff/plan-text";

const FENNER_FLOORPLAN = resolve(process.cwd(), "tests/doors/plans/fenner-floorplan.pdf");
const FIFTEEN_A_FLOORPLAN = resolve(process.cwd(), "tests/fixtures/15a/floorplan.pdf");
const itWithFifteenAFloorplan = existsSync(FIFTEEN_A_FLOORPLAN) ? it : it.skip;

async function floorGeometry(path: string) {
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

async function fennerFloorGeometry() {
  return floorGeometry(FENNER_FLOORPLAN);
}

describe("floor opening width witnesses", () => {
  it("promotes Fenner standalone widths only when physical opening geometry is present", async () => {
    const geom = await fennerFloorGeometry();
    const planText = parsePlanText(geom.labels);
    const witnesses = detectPhysicalOpeningWidthWitnesses({
      planText,
      segments: geom.segments,
      labels: geom.labels,
      scale: 100,
    });

    expect(witnesses).toContainEqual(
      expect.objectContaining({
        widthMm: 3600,
        room: "LOUNGE",
        planSide: "plan_left",
      }),
    );
    expect(witnesses).not.toContainEqual(
      expect.objectContaining({
        room: "FAMILY",
        widthMm: 3600,
        text: "1300x175036001300x1750",
      }),
    );
    expect(witnesses.some((witness) => witness.text === "1300x175036001300x1750")).toBe(false);
    expect(witnesses).toContainEqual(
      expect.objectContaining({
        widthMm: 2400,
        room: "MASTERBED",
        planSide: "plan_top",
      }),
    );
    expect(witnesses).toContainEqual(
      expect.objectContaining({
        openingKind: "entry_door",
        widthMm: 1400,
        room: "ENTRY",
      }),
    );
    const signatureRows = buildOpeningSignatureFloorRows({
      planText,
      printedCodeWitnesses: detectPrintedWindowCodeWitnesses(planText),
      physicalWitnesses: witnesses,
    });
    expect(signatureRows).not.toContainEqual(
      expect.objectContaining({
        room: "ENTRY",
        widthMm: 1400,
      }),
    );
    expect(
      witnesses.some((witness) => witness.widthMm === 3600 && Math.abs(witness.y - 702.6) < 3),
    ).toBe(false);
  }, 60_000);

  it("routes Fenner printed HxW window codes as separate floor evidence", async () => {
    const geom = await fennerFloorGeometry();
    const planText = parsePlanText(geom.labels);
    const witnesses = detectPrintedWindowCodeWitnesses(planText);

    const masterBed800 = witnesses.filter(
      (witness) =>
        witness.room === "MASTERBED" && witness.widthMm === 800 && witness.heightMm === 1100,
    );
    expect(masterBed800).toHaveLength(2);
    expect(new Set(masterBed800.map((witness) => witness.planSide))).toEqual(
      new Set(["plan_left", "plan_bottom"]),
    );
    expect(witnesses).toContainEqual(
      expect.objectContaining({
        room: "BED3",
        widthMm: 2400,
        heightMm: 1300,
      }),
    );
  }, 60_000);

  itWithFifteenAFloorplan(
    "does not promote exterior dimension-chain labels as physical opening widths",
    async () => {
      const geom = await floorGeometry(FIFTEEN_A_FLOORPLAN);
      const planText = parsePlanText(geom.labels);
      const witnesses = detectPhysicalOpeningWidthWitnesses({
        planText,
        segments: geom.segments,
        labels: geom.labels,
        scale: 100,
      });

      expect(witnesses).not.toContainEqual(expect.objectContaining({ widthMm: 2205 }));
      expect(witnesses).not.toContainEqual(expect.objectContaining({ widthMm: 3030 }));
      expect(witnesses).not.toContainEqual(expect.objectContaining({ widthMm: 4132 }));
      expect(witnesses).toContainEqual(
        expect.objectContaining({
          widthMm: 2700,
        }),
      );
    },
    60_000,
  );
});
