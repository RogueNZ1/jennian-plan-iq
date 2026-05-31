/**
 * Phase 3 — geometry ↔ AI page-of-truth reconciliation.
 *
 * Two layers independently choose which page to measure:
 *  - the AI path classifies the floor plan (pickPrimaryFloorplan), and
 *  - the geometry engine, left to auto-detect, runs its own OCR-score page scan.
 * They can silently diverge — the Harrison cold run measured the *site plan* in
 * geometry while the AI correctly selected the A201 floor plan, and only geometry's
 * own 190%-mismatch sanity check happened to catch it.
 *
 * This module makes the AI's floor-plan classification the single page-of-truth:
 * the app pins geometry to that page (the geometry API accepts a 0-based `page`),
 * and any residual divergence between the page we requested and the page geometry
 * reports it used is surfaced as a confidence flag rather than shipped silently.
 *
 * Pure + literal-free: reconciles by page ROLE (the floor-plan pick), never a page
 * number — works for single-page, multi-page, and both drawing templates.
 */

/** Minimal shape needed from a PageAnalysis: its 1-based plan page number. */
export interface PageRef {
  /** 1-based plan page number (pdfjs convention). */
  pageNumber: number;
}

/**
 * Resolve the geometry API page index (0-based) for the AI-classified floor plan.
 *
 * `selectedIndex` is the index pickPrimaryFloorplan chose into `pages`; `pageNumber`
 * is 1-based, the geometry API's `page` query param is 0-based, so we subtract one.
 * Returns `undefined` when there is no usable floor-plan pick — the caller then omits
 * the page and geometry self-selects (the prior behaviour), never guessing a number.
 */
export function resolveGeometryPageIndex(
  selectedIndex: number | null | undefined,
  pages: ReadonlyArray<PageRef>,
): number | undefined {
  if (selectedIndex == null || selectedIndex < 0) return undefined;
  const pageNumber = pages[selectedIndex]?.pageNumber;
  if (pageNumber == null || pageNumber < 1) return undefined;
  return pageNumber - 1;
}

export interface PageReconciliation {
  /** True when geometry measured the page we asked for (or we did not pin one). */
  agreed: boolean;
  /** A human-facing confidence flag when the pages diverged, else null. */
  note: string | null;
}

/**
 * Compare the page we asked geometry to measure against the page it reports it used.
 *
 * When we pin an explicit page geometry should honour it, so a mismatch means the
 * request did not take effect (page out of range, a proxy dropped the query param,
 * an older geometry build) and geometry fell back to its own pick — surface that as
 * a flag instead of trusting the wrong sheet. When we did not pin a page
 * (`requestedGeometryPage` undefined) geometry self-selected and there is nothing to
 * reconcile.
 */
export function reconcileGeometryPage(
  requestedGeometryPage: number | undefined,
  geometryPageUsed: number | null | undefined,
): PageReconciliation {
  if (requestedGeometryPage == null) return { agreed: true, note: null };
  if (geometryPageUsed == null || geometryPageUsed === requestedGeometryPage) {
    return { agreed: true, note: null };
  }
  return {
    agreed: false,
    note:
      `Geometry measured page ${geometryPageUsed + 1} but the AI classified page ` +
      `${requestedGeometryPage + 1} as the floor plan — measurements may be from the ` +
      `wrong sheet; confirm against the floor plan.`,
  };
}
