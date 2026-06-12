// @vitest-environment node
/**
 * Crop-on-anomaly — crop localizer (Phase 3, step 1).
 *
 * Synthetic pdftotext-bbox fixtures: a floor-plan page where "BED" + "3" are separate
 * adjacent words mid-page surrounded by other room labels, plus a "BED 3" duplicate
 * inside a schedule column of W-codes near the page edge, plus a title-block duplicate.
 * The localizer must pick the floor-plan instance, join multi-token labels, expand the
 * crop by the room footprint, clamp to the page, and degrade per contract when the page
 * has no text layer or the label is absent.
 */
import { describe, it, expect } from "vitest";
import {
  parsePdftotextBbox,
  buildTextRuns,
  localizeRoomCrop,
  CROP_PAD_FACTOR,
} from "../../src/lib/takeoff/crop-localizer";

function word(text: string, x: number, y: number, w = 30, h = 10): string {
  return `<word xMin="${x}" yMin="${y}" xMax="${x + w}" yMax="${y + h}">${text}</word>`;
}

const PAGE_W = 1190; // ~A3 landscape points
const PAGE_H = 842;

/** Floor-plan page: BED 3 mid-left among room labels; schedule column right; title block bottom-right. */
function floorPlanPage(): string {
  const words = [
    // floor-plan labels (centre-ish cluster)
    word("BED", 300, 300),
    word("3", 335, 300), // multi-token target
    word("BED", 300, 180),
    word("2", 335, 180),
    word("LOUNGE", 500, 320, 60),
    word("ENSUITE", 250, 420, 55),
    word("DINING", 520, 200, 50),
    // window-schedule duplicate (right column, W-codes around it, inside the edge band)
    word("W07", 1100, 200),
    word("BED 3", 1100, 215, 45),
    word("1500x1300", 1100, 230, 60),
    word("W08", 1100, 260),
    word("BATH", 1100, 275, 40),
    word("1200x1100", 1100, 290, 60),
    // title block (bottom-right corner)
    word("BED 3 RESIDENCE", 1050, 800, 90),
  ].join("\n");
  return `<page width="${PAGE_W}" height="${PAGE_H}">\n${words}\n</page>`;
}

const XHTML = `<?xml version="1.0"?><html><body><doc>${floorPlanPage()}</doc></body></html>`;

const BASE_ARGS = {
  bboxXhtml: XHTML,
  pageNumber: 1,
  roomLabel: "Bed 3",
  allRoomLabels: ["Bed 1", "Bed 2", "Bed 3", "Lounge", "Ensuite", "Dining", "Bath"],
  footprint: { width_mm: 3500, depth_mm: 3000 },
  pageUnitsPerPlanMm: 0.0283, // 1:100 plan → 72/25.4/100 pt per plan-mm
};

describe("parsePdftotextBbox / buildTextRuns", () => {
  it("parses pages + words with boxes", () => {
    const pages = parsePdftotextBbox(XHTML);
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(PAGE_W);
    expect(pages[0].words.length).toBeGreaterThan(8);
  });

  it("joins same-line adjacent tokens so 'BED'+'3' yields a 'BED 3' run", () => {
    const runs = buildTextRuns(parsePdftotextBbox(XHTML)[0].words);
    expect(runs.some((r) => r.text === "BED 3")).toBe(true);
  });

  it("does NOT join across wide gaps (separate columns stay separate)", () => {
    const twoCols = `<page width="800" height="600">${word("BED", 100, 100)}${word("3", 600, 100)}</page>`;
    const runs = buildTextRuns(parsePdftotextBbox(twoCols)[0].words);
    expect(runs.some((r) => r.text === "BED 3")).toBe(false);
  });
});

describe("localizeRoomCrop — instance selection", () => {
  it("picks the FLOOR-PLAN instance, not the schedule or title-block duplicate", () => {
    const r = localizeRoomCrop(BASE_ARGS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidates).toBeGreaterThanOrEqual(2);
    // The floor-plan BED+3 sits at ~(300-345, 300-310) → anchor mid-left, NOT x>1000.
    expect(r.anchor.x).toBeLessThan(600);
    expect(r.anchor.y).toBeLessThan(500);
  });

  it("crop is footprint × pad, centred on the anchor, clamped to the page", () => {
    const r = localizeRoomCrop(BASE_ARGS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expW = BASE_ARGS.footprint.width_mm * BASE_ARGS.pageUnitsPerPlanMm * CROP_PAD_FACTOR;
    expect(r.crop.width).toBeCloseTo(expW, 0);
    expect(r.crop.x).toBeGreaterThanOrEqual(0);
    expect(r.crop.x + r.crop.width).toBeLessThanOrEqual(PAGE_W);
    expect(r.crop.y + r.crop.height).toBeLessThanOrEqual(PAGE_H);
    // Roughly centred on the anchor (allowing clamping slack).
    expect(Math.abs(r.crop.x + r.crop.width / 2 - r.anchor.x)).toBeLessThan(expW);
  });

  it("a tiny footprint still yields a readable minimum crop", () => {
    const r = localizeRoomCrop({ ...BASE_ARGS, footprint: { width_mm: 200, depth_mm: 200 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.crop.width).toBeGreaterThanOrEqual(120);
  });
});

describe("localizeRoomCrop — degradation contract", () => {
  it("no text layer → { ok:false, reason:'no_text_layer' } (orchestrator falls back to vision-bbox)", () => {
    const empty = `<page width="800" height="600"></page>`;
    const r = localizeRoomCrop({ ...BASE_ARGS, bboxXhtml: empty });
    expect(r).toEqual({ ok: false, reason: "no_text_layer" });
  });

  it("label absent from the page → label_not_found", () => {
    const r = localizeRoomCrop({ ...BASE_ARGS, roomLabel: "Bed 4" });
    expect(r).toEqual({ ok: false, reason: "label_not_found" });
  });

  it("page out of range → page_missing", () => {
    const r = localizeRoomCrop({ ...BASE_ARGS, pageNumber: 9 });
    expect(r).toEqual({ ok: false, reason: "page_missing" });
  });
});
