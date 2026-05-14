import * as pdfjsLib from "pdfjs-dist";

// Worker runs inline (no separate thread) — acceptable for takeoff processing.
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

export type PageType =
  | "dimension_floor_plan"
  | "floor_plan"
  | "site_plan"
  | "elevations"
  | "sections"
  | "electrical"
  | "plumbing"
  | "roofing"
  | "legends"
  | "details"
  | "unknown";

export type PageConfidence = "high" | "mid" | "low";

export type PageAnalysis = {
  pageNumber: number;
  thumbnailBlob: Blob;
  thumbnailUrl: string;
  pageType: PageType;
  confidence: PageConfidence;
  /** Higher = better candidate for primary floorplan extraction. */
  score: number;
  /** Raw lowercase title text used for classification (debug). */
  excerpt: string;
};

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  dimension_floor_plan: "Dimension Floor Plan",
  floor_plan:           "Floor Plan",
  site_plan:            "Site Plan",
  elevations:           "Elevations",
  sections:             "Sections",
  electrical:           "Electrical",
  plumbing:             "Plumbing",
  roofing:              "Roofing",
  legends:              "Legends",
  details:              "Details",
  unknown:              "Unknown",
};

/** Classification scoring per type. Floorplan-style pages outscore everything else. */
const FLOORPLAN_SCORE: Record<PageType, number> = {
  dimension_floor_plan: 100,
  floor_plan:           80,
  unknown:              5,
  site_plan:            -5,
  details:              -10,
  roofing:              -20,
  plumbing:             -25,
  electrical:           -30,
  sections:             -40,
  elevations:           -50,
  legends:              -60,
};

function classifyText(text: string, dimHits: number): { type: PageType; confidence: PageConfidence } {
  const t = text.toLowerCase();
  const has = (s: string) => t.includes(s);

  // Strong negatives first — title-heavy disqualifiers
  if ((has("legend") || has("abbreviation") || has("symbols schedule")) && !has("floor plan")) {
    return { type: "legends", confidence: "high" };
  }
  if (has("cover") && (has("sheet") || has("index"))) {
    return { type: "legends", confidence: "mid" };
  }

  // Site plan
  if (has("site plan") || has("locality plan") || has("boundary") || has("title plan")) {
    return { type: "site_plan", confidence: "high" };
  }

  // Sections / elevations
  if (has("elevation")) {
    return { type: "elevations", confidence: has("elevations") ? "high" : "mid" };
  }
  if (/\bsection\s+[a-z0-9]/.test(t) || has("cross section") || has("long section")) {
    return { type: "sections", confidence: "high" };
  }

  // Trade plans
  if (has("electrical") || has("lighting plan") || has("power plan")) {
    return { type: "electrical", confidence: "high" };
  }
  if (has("plumbing") || has("drainage") || has("waste plan")) {
    return { type: "plumbing", confidence: "high" };
  }
  if (has("roof plan") || has("roofing plan") || has("roof framing")) {
    return { type: "roofing", confidence: "high" };
  }

  // Details
  if (has("typical detail") || has("construction detail") || /\bdetails?\b/.test(t)) {
    if (!has("floor plan")) return { type: "details", confidence: "mid" };
  }

  // Floorplan family
  const floorPlanText =
    has("floor plan") ||
    has("ground floor") ||
    has("first floor") ||
    has("upper floor") ||
    has("lower floor");

  if (floorPlanText) {
    if (has("dimension") || has("dimensioned") || dimHits >= 12) {
      return { type: "dimension_floor_plan", confidence: "high" };
    }
    return { type: "floor_plan", confidence: "high" };
  }
  // Heuristic fallback: lots of dimension callouts → likely a dimensioned plan
  if (dimHits >= 18) {
    return { type: "dimension_floor_plan", confidence: "mid" };
  }
  if (dimHits >= 8) {
    return { type: "floor_plan", confidence: "low" };
  }

  return { type: "unknown", confidence: "low" };
}

async function renderPageThumbnail(
  page: pdfjsLib.PDFPageProxy,
  maxWidth: number,
  quality: number,
): Promise<Blob | null> {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
}

export type AnalyzeOptions = {
  /** Max pages to analyse (perf cap). Defaults to 24. */
  maxPages?: number;
  maxWidth?: number;
  quality?: number;
  onProgress?: (done: number, total: number) => void;
};

/** Render thumbnails + classify every page (up to maxPages). */
export async function analyzePdfPages(
  file: File,
  opts: AnalyzeOptions = {},
): Promise<PageAnalysis[]> {
  const { maxPages = 24, maxWidth = 360, quality = 0.78, onProgress } = opts;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = Math.min(pdf.numPages, maxPages);
  const out: PageAnalysis[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    let text = "";
    let dimHits = 0;
    try {
      const tc = await page.getTextContent();
      const pieces: string[] = [];
      for (const item of tc.items as Array<{ str?: string }>) {
        if (typeof item.str === "string") pieces.push(item.str);
      }
      text = pieces.join(" ");
      const dimMatches = text.match(/\b\d{2,5}\b/g);
      dimHits = dimMatches ? dimMatches.length : 0;
    } catch {
      /* ignore — image-only page */
    }

    const blob = await renderPageThumbnail(page, maxWidth, quality);
    if (!blob) continue;

    const { type, confidence } = classifyText(text, dimHits);
    const url = URL.createObjectURL(blob);
    out.push({
      pageNumber: i,
      thumbnailBlob: blob,
      thumbnailUrl: url,
      pageType: type,
      confidence,
      score: FLOORPLAN_SCORE[type] + (confidence === "high" ? 5 : confidence === "mid" ? 2 : 0),
      excerpt: text.slice(0, 240).toLowerCase(),
    });
    onProgress?.(i, total);
  }
  return out;
}

/** Pick the best primary-floorplan page index, or null if none qualifies. */
export function pickPrimaryFloorplan(pages: PageAnalysis[]): {
  index: number;
  certainty: PageConfidence;
} | null {
  if (pages.length === 0) return null;
  const ranked = pages
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score);
  const top = ranked[0];
  if (top.p.score <= 0) return null;

  const isDim = top.p.pageType === "dimension_floor_plan";
  const isFloor = top.p.pageType === "floor_plan";
  const second = ranked[1]?.p.score ?? -Infinity;
  const margin = top.p.score - second;

  let certainty: PageConfidence = "low";
  if (isDim && top.p.confidence === "high") certainty = "high";
  else if ((isDim || isFloor) && margin >= 20) certainty = "high";
  else if (isDim || isFloor) certainty = "mid";

  return { index: top.i, certainty };
}

/**
 * Render a single PDF page at high resolution for AI analysis.
 * Returns a JPEG blob suitable for base64 encoding and sending to a vision model.
 * maxWidth defaults to 1400px — a good balance between detail and payload size.
 */
export async function renderPageForAnalysis(
  file: File,
  pageNumber: number,
  maxWidth = 1400,
): Promise<Blob | null> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(pageNumber);
  return renderPageThumbnail(page, maxWidth, 0.92);
}

export function disposePageAnalyses(pages: PageAnalysis[]) {
  for (const p of pages) URL.revokeObjectURL(p.thumbnailUrl);
}

export const CONFIDENCE_LABEL: Record<PageConfidence, string> = {
  high: "High",
  mid:  "Medium",
  low:  "Low",
};
