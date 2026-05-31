// @vitest-environment node
/**
 * Phase 3 — geometry ↔ AI page-of-truth reconciliation.
 *
 * Pure unit tests: the AI floor-plan pick resolves to the geometry API's 0-based
 * page index, and a divergence between the requested page and geometry's reported
 * page_used is surfaced as a confidence flag (never a silent accept). Reconciles by
 * page role, with no page-number literals in the logic.
 */
import { describe, it, expect } from "vitest";
import { resolveGeometryPageIndex, reconcileGeometryPage } from "../takeoff/page-of-truth";

const pages = [
  { pageNumber: 1 }, // site plan
  { pageNumber: 2 }, // floor plan
  { pageNumber: 3 }, // elevations
];

describe("resolveGeometryPageIndex — 1-based pick → 0-based geometry page", () => {
  it("maps the AI-selected floor-plan index to its 0-based geometry page", () => {
    // selectedIndex 1 → pageNumber 2 → geometry 0-based index 1
    expect(resolveGeometryPageIndex(1, pages)).toBe(1);
  });

  it("maps the first page (1-based 1) to geometry index 0", () => {
    expect(resolveGeometryPageIndex(0, pages)).toBe(0);
  });

  it("returns undefined when there is no pick (null/undefined) → geometry self-selects", () => {
    expect(resolveGeometryPageIndex(null, pages)).toBeUndefined();
    expect(resolveGeometryPageIndex(undefined, pages)).toBeUndefined();
  });

  it("returns undefined for an out-of-range or negative index", () => {
    expect(resolveGeometryPageIndex(9, pages)).toBeUndefined();
    expect(resolveGeometryPageIndex(-1, pages)).toBeUndefined();
  });

  it("honours a non-sequential pageNumber (sparse/re-numbered sets)", () => {
    // A set whose floor plan is pdfjs page 5 → geometry index 4, by ROLE not position.
    const sparse = [{ pageNumber: 4 }, { pageNumber: 5 }];
    expect(resolveGeometryPageIndex(1, sparse)).toBe(4);
  });
});

describe("reconcileGeometryPage — surface divergence, never silently accept", () => {
  it("agrees when geometry used exactly the requested page", () => {
    expect(reconcileGeometryPage(1, 1)).toEqual({ agreed: true, note: null });
  });

  it("agrees (nothing to reconcile) when no page was pinned", () => {
    expect(reconcileGeometryPage(undefined, 0)).toEqual({ agreed: true, note: null });
  });

  it("agrees when geometry did not report a page_used", () => {
    expect(reconcileGeometryPage(1, null)).toEqual({ agreed: true, note: null });
    expect(reconcileGeometryPage(1, undefined)).toEqual({ agreed: true, note: null });
  });

  it("flags a divergence and names both pages in 1-based human terms", () => {
    // Requested floor plan at index 1 (page 2), geometry fell back to index 0 (page 1 / site plan).
    const r = reconcileGeometryPage(1, 0);
    expect(r.agreed).toBe(false);
    expect(r.note).toContain("page 1"); // geometry measured page 1
    expect(r.note).toContain("page 2"); // AI classified page 2
  });
});
