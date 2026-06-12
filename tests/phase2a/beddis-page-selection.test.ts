// @vitest-environment node
/**
 * Phase 2a — deterministic re-baseline of the *page-selection* step on the real
 * Beddis prelim, offline (no AI, no geometry service).
 *
 * Drives the production page-selection path — classifyText → scoreFor →
 * pickPrimaryFloorplan — over the real poppler text layer of each prelim page
 * (tests/fixtures/beddis/_pagetext/prelim-N.txt). This mirrors what
 * analyzePdfPages feeds pickPrimaryFloorplan in production, minus the thumbnail
 * render. Proves the fix selects the floor-plan sheet (page 3) rather than the
 * dimensions-only overlay (page 4) or nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyText,
  scoreFor,
  pickPrimaryFloorplan,
  type ScoredPage,
} from "../../src/lib/pdf-page-classify";

const TEXT_DIR = resolve(process.cwd(), "tests/fixtures/beddis/_pagetext");
const PAGES = [1, 2, 3, 4, 5, 6, 7];
const hasFixtures = PAGES.every((p) => existsSync(resolve(TEXT_DIR, `prelim-${p}.txt`)));

function scoredFromText(text: string): ScoredPage & { type: string } {
  const dimHits = (text.match(/\b\d{2,5}\b/g) ?? []).length;
  const { type, confidence } = classifyText(text, dimHits);
  return { pageType: type, confidence, score: scoreFor(type, confidence), type };
}

describe.skipIf(!hasFixtures)(
  "Phase 2a — Beddis prelim page selection (offline, real text)",
  () => {
    // Guarded: the describe callback still executes during collection even when skipped,
    // so the (gitignored, client-sensitive) fixture read must not run eagerly without them.
    const pages = hasFixtures
      ? PAGES.map((p) => scoredFromText(readFileSync(resolve(TEXT_DIR, `prelim-${p}.txt`), "utf8")))
      : [];

    it("selects a floor-plan page (non-null)", () => {
      const pick = pickPrimaryFloorplan(pages);

      console.log(
        "BEDDIS_PRELIM_PAGE_CLASSES=" +
          JSON.stringify(pages.map((p, i) => ({ page: i + 1, type: p.type, score: p.score }))),
      );

      console.log(
        "BEDDIS_PRELIM_PICK=" +
          JSON.stringify(pick && { page: pick.index + 1, certainty: pick.certainty }),
      );
      expect(pick).not.toBeNull();
    });

    it("does NOT pick a non-plan page (elevations/legend/site)", () => {
      const pick = pickPrimaryFloorplan(pages)!;
      expect(["floor_plan", "dimension_floor_plan"]).toContain(pages[pick.index].pageType);
    });
  },
);
