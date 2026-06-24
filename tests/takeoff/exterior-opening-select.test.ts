import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  selectExteriorWidthCandidates,
  oppositeFace,
  MIN_OPENING_WIDTH_MM,
  type GapCandidate,
} from "../../src/lib/takeoff/exterior-opening-select";

// The REAL 24 floor-plan gap candidates IQ produced from the Fenner (JM-0052) plan.
// Captured from the live diagnostic run, so this is a regression against real noise.
const FENNER_GAPS = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/fixtures/fenner/floorplan-gaps.json"), "utf8"),
) as GapCandidate[];

describe("envelope-first width selection (real Fenner JM-0052 gaps)", () => {
  it("starts from the real 24-marker mess (15 interior, 9 exterior)", () => {
    expect(FENNER_GAPS.length).toBe(24);
    expect(FENNER_GAPS.filter((g) => g.envelopeSide === "exterior").length).toBe(9);
  });

  it("splits the 24 markers into supported / review / noise — width-only, never priced", () => {
    const { supportedWidthCandidates, reviewWidthCandidates, rejected } =
      selectExteriorWidthCandidates(FENNER_GAPS);

    // 2 confident exterior widths; 4 uncertain widths held for review; 18 noise dropped.
    expect(supportedWidthCandidates.length).toBe(2);
    expect(reviewWidthCandidates.length).toBe(4);
    expect(rejected.length).toBe(18);
    expect(supportedWidthCandidates.length + reviewWidthCandidates.length + rejected.length).toBe(
      FENNER_GAPS.length,
    );

    // The noise is gone: every interior marker + every sub-600mm jog is dropped.
    expect(rejected.filter((r) => r.reason.includes("interior")).length).toBe(15);
    expect(rejected.filter((r) => r.reason.includes("sliver")).length).toBe(3);

    // These are WIDTH candidates — there is no height anywhere, so nothing is priceable.
    const all = [...supportedWidthCandidates, ...reviewWidthCandidates];
    expect(all.every((c) => !("height_m" in c) && !("heightMm" in c))).toBe(true);
    expect(supportedWidthCandidates.every((c) => c.widthMm >= MIN_OPENING_WIDTH_MM)).toBe(true);
    expect(supportedWidthCandidates.every((c) => c.confidence !== "low")).toBe(true);

    // The two supported widths are the confident ones: Pantry slider + Ensuite window.
    expect(supportedWidthCandidates.some((c) => c.widthMm === 2747 && c.room === "PANTRY")).toBe(
      true,
    );
    expect(supportedWidthCandidates.some((c) => c.widthMm === 1994 && c.room === "ENSUITE")).toBe(
      true,
    );

    // The 4 low-confidence real windows are NOT lost — they're held for confirmation.
    expect(reviewWidthCandidates.map((c) => c.room).sort()).toEqual([
      "BATH",
      "BED2",
      "BED3",
      "LAUNDRY/MUDROOM",
    ]);

    // The 381mm Ensuite wall-jog never reaches supported or review.
    expect(all.some((c) => c.widthMm === 381)).toBe(false);
  });

  it("derives the exterior face as the side OPPOSITE the room (not roomSide itself)", () => {
    // Pantry's room sits on the west of its wall -> the exterior face is EAST.
    const pantry = FENNER_GAPS.find(
      (g) => g.roomLabel === "PANTRY" && g.envelopeSide === "exterior",
    )!;
    expect(pantry.roomSide).toBe("west");
    const { supportedWidthCandidates } = selectExteriorWidthCandidates([pantry]);
    expect(supportedWidthCandidates[0].exteriorFace).toBe("east");

    expect(oppositeFace("north")).toBe("south");
    expect(oppositeFace("east")).toBe("west");
    expect(oppositeFace(null)).toBe(null);
  });

  it("is fail-safe: no candidates in, nothing out", () => {
    const out = selectExteriorWidthCandidates([]);
    expect(out.supportedWidthCandidates).toEqual([]);
    expect(out.reviewWidthCandidates).toEqual([]);
  });
});
