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

/**
 * Specification / product schedule indicators. If a page contains many of
 * these terms it is a Specification document, even if it mentions
 * "floor plan" / "drawings" / "plans included" in passing.
 */
const SPEC_INDICATORS: RegExp[] = [
  /preliminary\s*&\s*general/i, /\bfoundation\b/i, /\bexterior\b/i,
  /aluminium\s+joinery/i, /\binsulation\b/i, /interior\s+linings?/i,
  /\belectrical\b/i, /\blighting\b/i, /\bplumbing\b/i, /\bkitchen\b/i,
  /\blaundry\b/i, /\bexclusions?\b/i, /included\s+in\s+cost/i,
  /no\s+allowance/i, /roof\s+pitch/i, /stud\s+height/i, /area\s+over\s+frame/i,
  /\bperimeter\b/i, /garage\s+door/i, /cladding\s+type/i, /wall\s+linings?/i,
  /ceiling\s+linings?/i, /\bskirting\b/i, /\bscotia\b/i, /\barchitraves?\b/i,
  /standard\s+inclusions/i, /plan\s+version/i,
];

/**
 * Strong drawing-only signals — only present on actual floorplan sheets.
 * The presence of "floor plan" alone is NOT enough.
 */
const FLOOR_STRONG_INDICATORS: RegExp[] = [
  /\b(bed(?:room)?\s*\d?|lounge|kitchen|bathroom|ensuite|wc|laundry|dining|living|family|hall|entry|garage|study|office|pantry|master)\b/i,
  /\b1\s*[:/]\s*\d{2,4}\b/,            // scale e.g. 1:100
  /\btitle\s*block\b/i,
  /drawing\s*(?:sheet\s*)?number/i,
  /\barea\s*box\b/i, /\bperimeter\s*box\b/i,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) if (p.test(text)) n++;
  return n;
}

export function classifyPage(p: ExtractedPage): ClassifiedPage {
  return classifyPageWithType(p, "plan");
}

/**
 * File-type aware classifier. When `fileType === "specification"`, every
 * page is treated as part of a specification document — drawing categories
 * (Plumbing/Electrical/Floorplan/Site/Roof/Sections/Elevations) are
 * suppressed even when the keyword appears, because spec schedules often
 * mention "plumbing", "electrical", "floor plan" in section headings.
 * Page-level subtype is encoded in the reason for transparency.
 */
export function classifyPageWithType(
  p: ExtractedPage,
  fileType: "plan" | "specification",
): ClassifiedPage {
  const t = p.text.toLowerCase();
  const has = (s: string) => t.includes(s);
  const dimMatches = p.text.match(DIM_RE);
  const dimHits = dimMatches ? dimMatches.length : 0;
  const reason = (txt: string) => `${txt} (page ${p.pageNumber})`;

  const specCount = countMatches(p.text, SPEC_INDICATORS);
  const floorStrong = countMatches(p.text, FLOOR_STRONG_INDICATORS);

  // ----- File is a specification PDF: clamp to Specification family -----
  if (fileType === "specification") {
    // Detect a likely section subtype to record in the reason, but the
    // pageType stays Specification so downstream picks/scoring don't treat
    // it as a drawing.
    let subtype = "general";
    if (/\bplumbing\b/i.test(p.text)) subtype = "plumbing";
    else if (/\belectrical\b/i.test(p.text) || /\blighting\b/i.test(p.text)) subtype = "electrical";
    else if (/interior\s+linings?|\bskirting|\bscotia|architraves?/i.test(p.text)) subtype = "linings";
    else if (/cladding|fascia|spouting|soffit|downpipes?/i.test(p.text)) subtype = "exterior";
    else if (/roof\s+(?:pitch|type|profile|underlay)/i.test(p.text)) subtype = "roofing";
    else if (/preliminary|exclusions?|standard\s+inclusions/i.test(p.text)) subtype = "general";

    if (has("schedule") && (has("door") || has("window") || has("joinery") || has("opening"))) {
      return {
        pageNumber: p.pageNumber, pageType: "Schedule", confidence: "high",
        reason: reason("schedule keywords (in specification file)"),
      };
    }
    if (has("legend") || has("symbols schedule") || has("abbreviation")) {
      return {
        pageNumber: p.pageNumber, pageType: "Legend", confidence: "high",
        reason: reason("legend keywords (in specification file)"),
      };
    }
    if (has("cover sheet") || has("title sheet") || has("drawing index")) {
      return {
        pageNumber: p.pageNumber, pageType: "Cover Page", confidence: "high",
        reason: reason("cover/title keywords (in specification file)"),
      };
    }
    return {
      pageNumber: p.pageNumber, pageType: "Specification",
      confidence: specCount >= 3 ? "high" : specCount >= 1 ? "mid" : "low",
      reason: reason(`Specification — ${subtype} (file_type=specification, ${specCount} indicators)`),
    };
  }

  // Strong specification signal beats a passing "floor plan" mention.
  if (specCount >= 3 && floorStrong < 2) {
    return {
      pageNumber: p.pageNumber, pageType: "Specification",
      confidence: specCount >= 6 ? "high" : "mid",
      reason: reason(`${specCount} specification indicators, ${floorStrong} floorplan signals`),
    };
  }

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
  if (FLOOR_RE.test(p.text) && floorStrong >= 1) {
    if (has("dimensioned") || has("dimensions") || dimHits >= 12) {
      return { pageNumber: p.pageNumber, pageType: "Dimension Floorplan", confidence: "high",
        reason: reason(`floor plan + ${dimHits} dim callouts + ${floorStrong} drawing signals`) };
    }
    return { pageNumber: p.pageNumber, pageType: "Floorplan", confidence: "mid",
      reason: reason(`floor plan keyword + ${floorStrong} drawing signals`) };
  }
  if (FLOOR_RE.test(p.text)) {
    // "floor plan" mentioned but no real drawing signals — likely prose.
    return { pageNumber: p.pageNumber, pageType: "Unknown", confidence: "low",
      reason: reason("'floor plan' mentioned but no drawing signals") };
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

// ── Room name normalisation ───────────────────────────────────────────────────

/**
 * Fuzzy-match a raw room label (from AI output or plan text) to a canonical QS name.
 * Rules are ordered — first match wins. Returns title-cased input unchanged if no rule matches,
 * so no room name is ever silently dropped.
 */
export function normaliseRoomName(raw: string): string {
  const s = raw.toLowerCase().trim();

  if (s.includes("master") || s.includes("primary") || s.includes("mbdr")) return "Bed 1 (Master)";
  if ((s.includes("bed") || s.includes("bdr")) && s.includes("1")) return "Bed 1 (Master)";
  if ((s.includes("bed") || s.includes("bdr")) && s.includes("2")) return "Bed 2";
  if ((s.includes("bed") || s.includes("bdr")) && s.includes("3")) return "Bed 3";
  if ((s.includes("bed") || s.includes("bdr")) && s.includes("4")) return "Bed 4";
  if (s.includes("ensuite") || s.includes(" ens") || s === "ens") return "Ensuite";
  if (s.includes("bath")) return "Bathroom";
  if (s.includes("kitchen") || s.includes("kitch")) return "Kitchen";
  if (s.includes("family") || s.includes("living") || s.includes("lounge/dining") || s.includes("open plan")) return "Family/Living";
  if (s.includes("dining")) return "Dining";
  if (s.includes("lounge")) return "Lounge";
  if (s.includes("garage") && (s.includes("window") || s.includes("win"))) return "Garage Window";
  if (s.includes("entry") || s.includes("entrance")) return "Entrance";
  if (s.includes("laundry") || s.includes(" wm") || s === "wm" || s.includes("utility")) return "Laundry";
  if (s.includes("wir") || s.includes("wardrobe") || s.includes("robe")) return "WIR";
  if (s.includes("hall") || s.includes("corridor")) return "Hall";

  // No match — return title-cased original so nothing is silently dropped
  return raw.trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Garage door classification ────────────────────────────────────────────────

/**
 * Map a garage door width in mm to its QS cell address.
 * Returns null if the width doesn't match any known size band.
 */
export function classifyGarageDoor(widthMm: number): "H176" | "H178" | "H180" | null {
  if (widthMm >= 4500) return "H176";
  if (widthMm >= 2600 && widthMm <= 2800) return "H180";
  if (widthMm >= 2300 && widthMm <= 2500) return "H178";
  return null;
}

/**
 * Garage-door classification by the height + width combination (F-003).
 *
 * Domain fact (Haydon, corroborated by the QS): garage doors are normal door
 * height — ~2.1m, very rarely taller — and are distinguished by WIDTH, not height.
 * The QS recognises three sizes, all 2.1m high:
 *   2.4×2.1 (single) · 2.7×2.1 (single) · 4.8×2.1 (double).
 *
 * So we classify by the combination, never a single literal:
 *   - height in a tolerant ~2.0–2.4m band (covers 2100 and 2210-style reads; kept
 *     tight because a taller garage door is rare, to avoid false positives), AND
 *   - width in the garage ~2.4–5.4m range (single 2.4/2.7 → double 4.8 + headroom).
 * Garage proximity is already established upstream: Pass 1 returns the dimension
 * text *near the garage-door opening* (extract-annotations task #4), so the
 * annotation fed here is garage-proximate by construction.
 */
const GARAGE_HEIGHT_MIN_MM = 2000;
const GARAGE_HEIGHT_MAX_MM = 2400;
const GARAGE_WIDTH_MIN_MM = 2400;
const GARAGE_WIDTH_MAX_MM = 5400;
const GARAGE_DEFAULT_HEIGHT_MM = 2100;
/**
 * How far a measured width may sit from a standard before we refuse to guess. A
 * width inside the garage band but not near any standard (e.g. 3500mm — 800mm off
 * 2.7 and 1300mm off 4.8) is genuinely ambiguous: pass it through raw for manual
 * review rather than snapping it to the wrong door. Tight enough to reject 3500,
 * loose enough to absorb real read noise (2681→2.7, 4400/4900→4.8).
 */
const GARAGE_SNAP_MAX_MM = 600;

/** Standard QS garage widths (mm) → canonical label + QS cell. Measured width snaps to nearest. */
const GARAGE_STANDARD_WIDTHS: ReadonlyArray<{
  widthMm: number;
  label: string;
  cell: "H176" | "H178" | "H180";
}> = [
  { widthMm: 2400, label: "2.4×2.1", cell: "H178" },
  { widthMm: 2700, label: "2.7×2.1", cell: "H180" },
  { widthMm: 4800, label: "4.8×2.1", cell: "H176" },
];

export interface GarageDoorClass {
  /** Canonical "W×2.1" QS label, e.g. "4.8×2.1". */
  label: string;
  widthMm: number;
  heightMm: number;
  cell: "H176" | "H178" | "H180";
}

/**
 * Pull every dimension number out of an annotation string in millimetres,
 * tolerant of thousands separators, spaces and metre units:
 *   "2,210 x 4,800" → [2210, 4800]   "4.8 x 2.1" → [4800, 2100]   "4800" → [4800]
 *   "2,150 x 2,100" → [2150, 2100]   "1300x1800" → [1300, 1800]
 *
 * Shared NZ-dimension reader: this is the single place that knows how to read a
 * dimension string. The garage path (classifyGarageDoorAnnotation) and the window
 * path (parseWindowDimension in classify-annotations) both call it, so comma/space
 * tolerance is identical across both — no second, divergent parser.
 */
export function parseDimsMm(text: string): number[] {
  const cleaned = text.replace(/,/g, ""); // thousands separators: "2,210" → "2210"
  const matches = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((m) => {
    const v = parseFloat(m);
    return v < 100 ? Math.round(v * 1000) : Math.round(v); // metres → mm
  });
}

/**
 * Classify a garage-door annotation regardless of format — with or without an `x`
 * separator, with or without thousands separators ("2,210 x 4,800", "4800x2210",
 * "4800", "4.8 x 2.1"). Garage doors are always wider than they are tall, so the
 * larger number is the width and the smaller is the height; a lone number is the
 * width (height defaults to the standard 2.1m). Returns null when the dimensions
 * fall outside the garage band, so non-garage annotations never false-positive.
 */
export function classifyGarageDoorAnnotation(text: string): GarageDoorClass | null {
  const dims = parseDimsMm(text);
  if (dims.length === 0) return null;

  let widthMm: number;
  let heightMm: number;
  if (dims.length === 1) {
    widthMm = dims[0];
    heightMm = GARAGE_DEFAULT_HEIGHT_MM;
  } else {
    widthMm = Math.max(dims[0], dims[1]);
    heightMm = Math.min(dims[0], dims[1]);
  }

  // Combination gate: width in the garage range AND height in the tolerant band.
  if (widthMm < GARAGE_WIDTH_MIN_MM || widthMm > GARAGE_WIDTH_MAX_MM) return null;
  if (heightMm < GARAGE_HEIGHT_MIN_MM || heightMm > GARAGE_HEIGHT_MAX_MM) return null;

  // Snap the measured width to the nearest standard QS garage width — but refuse to
  // guess when it sits too far from every standard (return null → caller keeps the
  // raw text for manual review).
  let best = GARAGE_STANDARD_WIDTHS[0];
  for (const s of GARAGE_STANDARD_WIDTHS) {
    if (Math.abs(s.widthMm - widthMm) < Math.abs(best.widthMm - widthMm)) best = s;
  }
  if (Math.abs(best.widthMm - widthMm) > GARAGE_SNAP_MAX_MM) return null;
  return { label: best.label, widthMm: best.widthMm, heightMm: GARAGE_DEFAULT_HEIGHT_MM, cell: best.cell };
}

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