// @vitest-environment node
/**
 * Phase 2a — Takeoff page-selection fix.
 *
 * Pure unit tests against src/lib/pdf-page-classify.ts (no pdfjs / DOM needed).
 * Proves the multi-page takeoff path now selects the *floor plan* page rather
 * than a dimensions-only overlay or being hijacked into legends/elevations by an
 * incidental disqualifier word.
 *
 * Root cause fixed here (see BEDDIS_BASELINE.md §4.1):
 *  1. classifyText evaluated disqualifiers ("elevation"/"legend"/"section") BEFORE
 *     the floor-plan family, so a real floor plan that merely referenced an
 *     elevation scored negative → pickPrimaryFloorplan returned null → the prelim
 *     takeoff fell back to the wrong page and came back empty.
 *  2. FLOORPLAN_SCORE ranked dimension_floor_plan above floor_plan, so even when a
 *     floor page was found the dimensions-only sheet won.
 */
import { describe, it, expect } from "vitest";
import {
  classifyText,
  scoreFor,
  FLOORPLAN_SCORE,
  pickPrimaryFloorplan,
  type ScoredPage,
} from "../../src/lib/pdf-page-classify";

/** Build a ScoredPage from raw page text the way analyzePdfPages does. */
function scored(text: string, dimHits = 0): ScoredPage {
  const { type, confidence } = classifyText(text, dimHits);
  return { pageType: type, confidence, score: scoreFor(type, confidence) };
}

describe("classifyText — floor-plan family wins over incidental disqualifiers", () => {
  it("classifies a floor plan that mentions 'elevation' in a note as a floor plan", () => {
    const { type } = classifyText(
      "GROUND FLOOR PLAN  refer elevation A for window heights  scale 1:100",
      6,
    );
    expect(type).toMatch(/floor_plan/);
  });

  it("classifies a floor plan that references a 'legend' / 'section' as a floor plan", () => {
    const { type } = classifyText(
      "FIRST FLOOR PLAN  see legend below  section B-B marked  living areas",
      6,
    );
    expect(type).toMatch(/floor_plan/);
  });

  it("treats a dimensioned floor plan as dimension_floor_plan", () => {
    const { type } = classifyText("GROUND FLOOR PLAN — DIMENSIONS  2420 3600 4800", 14);
    expect(type).toBe("dimension_floor_plan");
  });

  it("still classifies a genuine elevations sheet (no floor-plan text) as elevations", () => {
    const { type } = classifyText("NORTH & SOUTH ELEVATIONS  ridge height  scale 1:100", 4);
    expect(type).toBe("elevations");
  });

  it("still classifies a genuine legend sheet as legends", () => {
    const { type } = classifyText("LEGEND & ABBREVIATIONS  symbols schedule", 0);
    expect(type).toBe("legends");
  });
});

describe("FLOORPLAN_SCORE / scoreFor — floor_plan outranks dimension_floor_plan", () => {
  it("ranks floor_plan above dimension_floor_plan", () => {
    expect(FLOORPLAN_SCORE.floor_plan).toBeGreaterThan(FLOORPLAN_SCORE.dimension_floor_plan);
  });

  it("a high-confidence floor plan scores above a high-confidence dimension plan", () => {
    expect(scoreFor("floor_plan", "high")).toBeGreaterThan(scoreFor("dimension_floor_plan", "high"));
  });

  it("floor-plan family outscores every disqualifier type", () => {
    const floor = scoreFor("floor_plan", "high");
    for (const t of ["site_plan", "elevations", "sections", "legends", "electrical", "plumbing", "roofing", "details"] as const) {
      expect(floor).toBeGreaterThan(scoreFor(t, "high"));
    }
  });
});

describe("pickPrimaryFloorplan — Beddis-like 7-page prelim set", () => {
  // Mirrors the Beddis prelim: site, landscaping, the real floor plan (page 3),
  // a dimensions-only overlay (page 4), two elevation/section sheets, a window schedule.
  const pages: ScoredPage[] = [
    scored("SITE PLAN  boundary  locality plan  165.4 m²", 4),
    scored("LANDSCAPING PLAN  site plan  planting schedule", 2),
    scored("GROUND FLOOR PLAN  floor area 165.4 m²  window schedule W01-W09  refer elevation", 9),
    scored("GROUND FLOOR PLAN — DIMENSIONS ONLY  2420 3600 4800 1200 900", 20),
    scored("NORTH & SOUTH ELEVATIONS", 4),
    scored("SECTION A-A  insulation  cross section", 3),
    scored("WINDOW SCHEDULE  W01 W02 W03 ... W13  NTS", 0),
  ];

  it("returns a non-null pick", () => {
    expect(pickPrimaryFloorplan(pages)).not.toBeNull();
  });

  it("picks the real floor plan (page index 2), not the dimensions-only overlay (index 3)", () => {
    const pick = pickPrimaryFloorplan(pages)!;
    expect(pick.index).toBe(2);
    expect(pages[pick.index].pageType).toBe("floor_plan");
  });
});

describe("pickPrimaryFloorplan — general multi-page set", () => {
  it("selects the floor-plan page out of a mixed set", () => {
    const pages: ScoredPage[] = [
      scored("COVER SHEET  drawing index", 0),
      scored("ELECTRICAL & LIGHTING PLAN  power plan", 5),
      scored("ROOF PLAN  roof framing", 4),
      scored("LOWER FLOOR PLAN  living  kitchen  bed 1", 7),
      scored("TYPICAL CONSTRUCTION DETAILS", 2),
    ];
    const pick = pickPrimaryFloorplan(pages)!;
    expect(pick).not.toBeNull();
    expect(pages[pick.index].pageType).toMatch(/floor_plan/);
  });

  it("returns null when no floor-plan-like page exists", () => {
    const pages: ScoredPage[] = [
      scored("COVER SHEET  drawing index", 0),
      scored("NORTH ELEVATIONS", 3),
      scored("LEGEND & ABBREVIATIONS", 0),
    ];
    expect(pickPrimaryFloorplan(pages)).toBeNull();
  });
});
