/**
 * Pure page-classification + ranking logic for multi-page plan sets.
 *
 * Extracted from pdf-pages.ts so it can be unit-tested without pulling in pdfjs
 * (which needs a DOM/worker). pdf-pages.ts re-exports everything here, so existing
 * importers are unaffected.
 *
 * Phase 2a fix (see BEDDIS_BASELINE.md):
 *  - classifyText now evaluates the explicit floor-plan family FIRST, so a real
 *    floor plan that incidentally mentions "elevation"/"legend"/"section" in a note
 *    or schedule is no longer hijacked into those categories. On the Beddis prelim
 *    this was scoring every page negative → pickPrimaryFloorplan returned null →
 *    the takeoff fell back to the wrong page and came back empty.
 *  - FLOORPLAN_SCORE re-ranked so floor_plan outranks dimension_floor_plan.
 */

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

export const CONFIDENCE_LABEL: Record<PageConfidence, string> = {
  high: "High",
  mid:  "Medium",
  low:  "Low",
};

/**
 * Classification scoring per type. Floorplan-style pages outscore everything else.
 *
 * Phase 2a: floor_plan (100) now outranks dimension_floor_plan (90). A plain
 * floor-plan sheet reliably carries the area summary + window schedule the takeoff
 * reads, whereas a dimension-only overlay sheet often does not. The remaining order
 * is unchanged.
 */
export const FLOORPLAN_SCORE: Record<PageType, number> = {
  floor_plan:           100,
  dimension_floor_plan: 90,
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

/** Score a classified page (type + confidence) the way analyzePdfPages does. */
export function scoreFor(type: PageType, confidence: PageConfidence): number {
  return FLOORPLAN_SCORE[type] + (confidence === "high" ? 5 : confidence === "mid" ? 2 : 0);
}

export function classifyText(
  text: string,
  dimHits: number,
): { type: PageType; confidence: PageConfidence } {
  const t = text.toLowerCase();
  const has = (s: string) => t.includes(s);

  // Floorplan family FIRST (Phase 2a). An explicit floor-plan sheet must win even
  // when the page also contains incidental disqualifier words ("elevation" in a
  // note, "legend"/"section" in a schedule). Previously those were tested first and
  // mislabelled real floor plans — the Beddis prelim floor plan page scored as
  // "elevations" because the sheet referenced an elevation.
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

  // Strong negatives — title-heavy disqualifiers (only when this is NOT an explicit
  // floor plan, which is already handled above).
  if (has("legend") || has("abbreviation") || has("symbols schedule")) {
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
    return { type: "details", confidence: "mid" };
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

/** Minimal shape pickPrimaryFloorplan needs — PageAnalysis is a structural superset. */
export type ScoredPage = {
  pageType: PageType;
  confidence: PageConfidence;
  score: number;
};

/** Pick the best primary-floorplan page index, or null if none qualifies. */
export function pickPrimaryFloorplan(pages: readonly ScoredPage[]): {
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
