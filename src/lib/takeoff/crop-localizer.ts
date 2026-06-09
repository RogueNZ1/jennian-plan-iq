/**
 * Crop-on-anomaly — room-label crop localizer (Phase 3, step 1).
 *
 * Pure functions: given the `pdftotext -bbox` XHTML of a plan PDF, the floor-plan page
 * number, a target room label, and the room's measured footprint, produce the crop
 * rectangle (in PDF points, same space as the bbox output) for the anomaly re-read.
 * The caller scales points → render pixels with its known render DPI.
 *
 * Contracts (from the approved architecture):
 *  - Multi-token labels ("BED" "3") are joined from adjacent words on the same text line.
 *  - When the label appears more than once (floor plan + window schedule + title block),
 *    pick the FLOOR-PLAN instance: schedule/title-block duplicates are demoted by an
 *    edge-band penalty and by neighbour scoring (a floor-plan label sits among OTHER room
 *    labels; a schedule duplicate sits among W-codes/dims).
 *  - Crop size = room footprint (geometry width/depth, real mm) × pageUnitsPerPlanMm,
 *    padded by CROP_PAD_FACTOR, centred on the label, clamped to the page.
 *  - No text layer on the page → { ok:false, reason:"no_text_layer" } so the orchestrator
 *    can fall back to a vision-bbox call, else skip-crop + coverage flag. Label not found
 *    → { ok:false, reason:"label_not_found" }.
 */

/* ------------------------------------------------------------------- types */

export type BboxWord = { text: string; xMin: number; yMin: number; xMax: number; yMax: number };
export type BboxPage = { width: number; height: number; words: BboxWord[] };

export type CropRect = { x: number; y: number; width: number; height: number };

export type LocalizeResult =
  | {
      ok: true;
      crop: CropRect;
      /** Centre of the matched label run, page points. */
      anchor: { x: number; y: number };
      /** The joined text run that matched. */
      matchedText: string;
      /** How many candidate instances were considered (for diagnostics). */
      candidates: number;
    }
  | { ok: false; reason: "no_text_layer" | "label_not_found" | "page_missing" };

/* --------------------------------------------------------------- constants */

/** Crop = room footprint × this factor — enough margin to catch the room's wall callouts. */
export const CROP_PAD_FACTOR = 1.4;
/** Outer page band (fraction of page W/H) treated as title-block territory. */
export const TITLE_BLOCK_EDGE_FRACTION = 0.12;
/** Penalty applied to a candidate whose anchor sits in the title-block band. */
const TITLE_BLOCK_PENALTY = 3;
/** Neighbour search radius as a fraction of the page diagonal. */
const NEIGHBOUR_RADIUS_FRACTION = 0.18;
/** Two words join into one run when the gap between them is under this × word height. */
const MAX_TOKEN_GAP_X_HEIGHT = 1.2;
/** Words sit on the same line when their vertical centres differ by under this × height. */
const SAME_LINE_TOL_X_HEIGHT = 0.6;
/** Minimum crop edge (points) so a tiny footprint still yields a readable crop. */
const MIN_CROP_EDGE_PT = 120;

/* ---------------------------------------------------------------- parsing */

const PAGE_RE = /<page\s+width="([\d.]+)"\s+height="([\d.]+)"\s*>([\s\S]*?)<\/page>/g;
const WORD_RE = /<word\s+xMin="([\d.]+)"\s+yMin="([\d.]+)"\s+xMax="([\d.]+)"\s+yMax="([\d.]+)"\s*>([\s\S]*?)<\/word>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Parse `pdftotext -bbox` XHTML into pages of positioned words. Tolerant of namespaces. */
export function parsePdftotextBbox(xhtml: string): BboxPage[] {
  const pages: BboxPage[] = [];
  PAGE_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PAGE_RE.exec(xhtml)) !== null) {
    const [, w, h, body] = pm;
    const words: BboxWord[] = [];
    WORD_RE.lastIndex = 0;
    let wm: RegExpExecArray | null;
    while ((wm = WORD_RE.exec(body)) !== null) {
      const [, x0, y0, x1, y1, text] = wm;
      words.push({
        text: decodeEntities(text.trim()),
        xMin: Number(x0), yMin: Number(y0), xMax: Number(x1), yMax: Number(y1),
      });
    }
    pages.push({ width: Number(w), height: Number(h), words });
  }
  return pages;
}

/* ----------------------------------------------------------- run building */

export type TextRun = { text: string; xMin: number; yMin: number; xMax: number; yMax: number };

function norm(s: string): string {
  return s.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Join adjacent words on the same line into runs, so "BED" + "3" matches "Bed 3".
 * Every suffix-run starting at each word is emitted up to a few tokens long, so a label
 * embedded in a longer line ("BED 3 ROBE") still yields the exact "BED 3" run.
 */
export function buildTextRuns(words: BboxWord[], maxTokens = 4): TextRun[] {
  const sorted = [...words].sort((a, b) => (a.yMin - b.yMin) || (a.xMin - b.xMin));
  // Group into lines.
  const lines: BboxWord[][] = [];
  for (const w of sorted) {
    const h = Math.max(w.yMax - w.yMin, 1);
    const cy = (w.yMin + w.yMax) / 2;
    const line = lines.find((l) => {
      const ref = l[l.length - 1];
      const refCy = (ref.yMin + ref.yMax) / 2;
      return Math.abs(refCy - cy) <= SAME_LINE_TOL_X_HEIGHT * h;
    });
    if (line) line.push(w);
    else lines.push([w]);
  }
  const runs: TextRun[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.xMin - b.xMin);
    for (let i = 0; i < line.length; i++) {
      let text = line[i].text;
      let xMin = line[i].xMin, yMin = line[i].yMin, xMax = line[i].xMax, yMax = line[i].yMax;
      runs.push({ text, xMin, yMin, xMax, yMax });
      for (let j = i + 1; j < Math.min(line.length, i + maxTokens); j++) {
        const prev = line[j - 1];
        const cur = line[j];
        const h = Math.max(prev.yMax - prev.yMin, 1);
        if (cur.xMin - prev.xMax > MAX_TOKEN_GAP_X_HEIGHT * h) break; // gap too wide — separate columns
        text = `${text} ${cur.text}`;
        xMax = Math.max(xMax, cur.xMax);
        yMin = Math.min(yMin, cur.yMin);
        yMax = Math.max(yMax, cur.yMax);
        runs.push({ text, xMin, yMin, xMax, yMax });
      }
    }
  }
  return runs;
}

/* -------------------------------------------------------------- localizer */

export type LocalizeArgs = {
  /** Raw `pdftotext -bbox` XHTML for the whole PDF. */
  bboxXhtml: string;
  /** 1-based page number of the primary floor plan (from pickPrimaryFloorplan). */
  pageNumber: number;
  /** Target room label as extracted (e.g. "Bed 3"). */
  roomLabel: string;
  /** ALL known room labels on the plan — used to score floor-plan vs schedule instances. */
  allRoomLabels: ReadonlyArray<string>;
  /** Room footprint from the geometry rooms (real-world mm). */
  footprint: { width_mm: number; depth_mm: number };
  /** Page points per real-world plan mm (caller derives from the plan scale: e.g. a 1:100
   * plan on A3 → paperMm = planMm / 100 → points = paperMm × 72 / 25.4). */
  pageUnitsPerPlanMm: number;
};

export function localizeRoomCrop(args: LocalizeArgs): LocalizeResult {
  const pages = parsePdftotextBbox(args.bboxXhtml);
  const page = pages[args.pageNumber - 1];
  if (!page) return { ok: false, reason: "page_missing" };
  if (page.words.length === 0) return { ok: false, reason: "no_text_layer" };

  const target = norm(args.roomLabel);
  if (!target) return { ok: false, reason: "label_not_found" };
  const runs = buildTextRuns(page.words);
  const matches = runs.filter((r) => norm(r.text) === target);
  if (matches.length === 0) return { ok: false, reason: "label_not_found" };

  // Score each instance: floor-plan labels sit among OTHER room labels; schedule/title-
  // block duplicates sit among codes/dims or in the edge band.
  const otherLabels = args.allRoomLabels.map(norm).filter((l) => l && l !== target);
  const diag = Math.hypot(page.width, page.height);
  const radius = NEIGHBOUR_RADIUS_FRACTION * diag;
  const bandX = TITLE_BLOCK_EDGE_FRACTION * page.width;
  const bandY = TITLE_BLOCK_EDGE_FRACTION * page.height;

  function centre(r: TextRun): { x: number; y: number } {
    return { x: (r.xMin + r.xMax) / 2, y: (r.yMin + r.yMax) / 2 };
  }

  let best: { run: TextRun; score: number } | null = null;
  for (const m of matches) {
    const c = centre(m);
    let score = 0;
    // Neighbour room-label diversity within the radius.
    const seen = new Set<string>();
    for (const r of runs) {
      const rn = norm(r.text);
      if (!otherLabels.includes(rn) || seen.has(rn)) continue;
      const rc = centre(r);
      if (Math.hypot(rc.x - c.x, rc.y - c.y) <= radius) {
        seen.add(rn);
        score += 1;
      }
    }
    // Title-block band demotion.
    const inBand =
      c.x < bandX || c.x > page.width - bandX || c.y < bandY || c.y > page.height - bandY;
    if (inBand) score -= TITLE_BLOCK_PENALTY;
    if (!best || score > best.score) best = { run: m, score };
  }
  const anchor = centre(best!.run);

  // Footprint-expanded crop, centred on the label, padded, floored, clamped.
  const wPt = Math.max(args.footprint.width_mm * args.pageUnitsPerPlanMm * CROP_PAD_FACTOR, MIN_CROP_EDGE_PT);
  const hPt = Math.max(args.footprint.depth_mm * args.pageUnitsPerPlanMm * CROP_PAD_FACTOR, MIN_CROP_EDGE_PT);
  let x = anchor.x - wPt / 2;
  let y = anchor.y - hPt / 2;
  const width = Math.min(wPt, page.width);
  const height = Math.min(hPt, page.height);
  x = Math.max(0, Math.min(x, page.width - width));
  y = Math.max(0, Math.min(y, page.height - height));

  return {
    ok: true,
    crop: { x, y, width, height },
    anchor,
    matchedText: best!.run.text,
    candidates: matches.length,
  };
}
