/**
 * Page classification for Automatic Takeoff. Text-keyword heuristic only —
 * no visual analysis. Confidence reflects that honestly.
 */
import type { ExtractedPage } from "./pdf-text";

export type TakeoffPageType =
  | "Dimension Floorplan"
  | "Floorplan"
  | "Site Plan"
  | "Elevations"
  | "Sections"
  | "Roof Plan"
  | "Electrical Plan"
  | "Plumbing Plan"
  | "Specification"
  | "Schedule"
  | "Legend"
  | "Cover Page"
  | "Unknown";

export type TakeoffConfidence = "high" | "mid" | "low";

export type ClassifiedPage = {
  pageNumber: number;
  pageType: TakeoffPageType;
  confidence: TakeoffConfidence;
  reason: string;
};

const FLOOR_RE = /\b(floor\s*plan|ground\s*floor|first\s*floor|upper\s*floor|lower\s*floor)\b/i;
const DIM_RE  = /\b\d{3,5}\b/g;

export function classifyPage(p: ExtractedPage): ClassifiedPage {
  const t = p.text.toLowerCase();
  const has = (s: string) => t.includes(s);
  const dimMatches = p.text.match(DIM_RE);
  const dimHits = dimMatches ? dimMatches.length : 0;
  const reason = (txt: string) => `${txt} (page ${p.pageNumber})`;

  if ((has("legend") || has("symbols schedule") || has("abbreviation")) && !FLOOR_RE.test(p.text)) {
    return { pageNumber: p.pageNumber, pageType: "Legend", confidence: "high", reason: reason("legend keywords") };
  }
  if ((has("cover sheet") || has("title sheet") || has("drawing index"))) {
    return { pageNumber: p.pageNumber, pageType: "Cover Page", confidence: "high", reason: reason("cover/title keywords") };
  }
  if (has("specification") || has("specifications") || has("m3 schedule") || has("master spec")) {
    return { pageNumber: p.pageNumber, pageType: "Specification", confidence: "high", reason: reason("specification keywords") };
  }
  if (has("schedule") && (has("door") || has("window") || has("joinery") || has("opening"))) {
    return { pageNumber: p.pageNumber, pageType: "Schedule", confidence: "high", reason: reason("schedule keywords") };
  }
  if (has("site plan") || has("locality plan") || has("title plan") || has("boundary")) {
    return { pageNumber: p.pageNumber, pageType: "Site Plan", confidence: "high", reason: reason("site keywords") };
  }
  if (has("electrical") || has("lighting plan") || has("power plan")) {
    return { pageNumber: p.pageNumber, pageType: "Electrical Plan", confidence: "high", reason: reason("electrical keywords") };
  }
  if (has("plumbing") || has("drainage") || has("waste plan")) {
    return { pageNumber: p.pageNumber, pageType: "Plumbing Plan", confidence: "high", reason: reason("plumbing keywords") };
  }
  if (has("roof plan") || has("roofing plan") || has("roof framing")) {
    return { pageNumber: p.pageNumber, pageType: "Roof Plan", confidence: "high", reason: reason("roof keywords") };
  }
  if (/\bsection\s+[a-z0-9]/i.test(p.text) || has("cross section") || has("long section")) {
    return { pageNumber: p.pageNumber, pageType: "Sections", confidence: "high", reason: reason("section keywords") };
  }
  if (has("elevation")) {
    return { pageNumber: p.pageNumber, pageType: "Elevations", confidence: "mid", reason: reason("elevation keywords") };
  }
  if (FLOOR_RE.test(p.text)) {
    if (has("dimensioned") || has("dimensions") || dimHits >= 12) {
      return { pageNumber: p.pageNumber, pageType: "Dimension Floorplan", confidence: "high", reason: reason(`floor plan + ${dimHits} dim callouts`) };
    }
    return { pageNumber: p.pageNumber, pageType: "Floorplan", confidence: "mid", reason: reason("floor plan keyword") };
  }
  if (dimHits >= 18) {
    return { pageNumber: p.pageNumber, pageType: "Dimension Floorplan", confidence: "low", reason: reason(`${dimHits} dim-like numbers, no title`) };
  }
  return { pageNumber: p.pageNumber, pageType: "Unknown", confidence: "low", reason: reason("no recognised keywords") };
}

/** Score: higher = better candidate for the working floorplan. */
const SCORE: Record<TakeoffPageType, number> = {
  "Dimension Floorplan": 100,
  "Floorplan": 80,
  "Unknown": 5,
  "Site Plan": -10,
  "Roof Plan": -20,
  "Plumbing Plan": -25,
  "Electrical Plan": -30,
  "Schedule": -35,
  "Sections": -40,
  "Elevations": -50,
  "Specification": -55,
  "Legend": -60,
  "Cover Page": -65,
};

export function pickWorkingPage(
  classifications: Array<{ fileId: string; fileName: string; pages: ClassifiedPage[] }>,
): {
  fileId: string;
  fileName: string;
  page: ClassifiedPage;
} | null {
  type Candidate = { fileId: string; fileName: string; page: ClassifiedPage; score: number };
  const all: Candidate[] = [];
  for (const f of classifications) {
    for (const p of f.pages) {
      const conf = p.confidence === "high" ? 5 : p.confidence === "mid" ? 2 : 0;
      all.push({ fileId: f.fileId, fileName: f.fileName, page: p, score: SCORE[p.pageType] + conf });
    }
  }
  if (all.length === 0) return null;
  all.sort((a, b) => b.score - a.score);
  const top = all[0];
  if (top.score <= 0) return null;
  return { fileId: top.fileId, fileName: top.fileName, page: top.page };
}