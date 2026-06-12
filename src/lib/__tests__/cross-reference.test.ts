/**
 * Stage 8.3 — Cross-reference tests.
 */
import { describe, it, expect } from "vitest";
import { crossReference } from "../takeoff/cross-reference";
import type { TakeoffData } from "../takeoff/concept.functions";
import type { ElevationData } from "../takeoff/extract-elevations";
import type { SitePlanData } from "../takeoff/extract-site-plan";

const baseTakeoff: TakeoffData = {
  floor_area_m2: 135,
  garage_area_m2: 0,
  alfresco_area_m2: 0,
  external_wall_lm: 57.1,
  internal_wall_lm: null,
  roof_area_m2: null,
  window_count: 8,
  external_door_count: 2,
  internal_door_count: 8,
  bathroom_count: 2,
  ensuite_count: 1,
  laundry_count: 1,
  kitchen_count: 1,
  ceiling_height_m: 2.4,
  foundation_type: null,
  windows_by_room: null,
  door_breakdown: null,
  garage_door_size: null,
  notes: "",
};

const elevationsMatch: ElevationData = {
  claddingTypes: ["brick", "Linea weatherboard"],
  claddingTypeCode: 3,
  roofType: "Metal tiles",
  roofPitchDegrees: 25,
  wallHeightMm: 2400,
  studHeightMm: null,
  facesPresent: ["North Western", "South Western", "North Eastern", "South Eastern"],
  windowCountPerFace: {
    "North Western": 3,
    "South Western": 2,
    "North Eastern": 2,
    "South Eastern": 1,
  },
  externalDoorCount: 2,
  gableEndCount: 2,
  garageDoorsPresent: false,
};

const elevationsMismatch: ElevationData = {
  ...elevationsMatch,
  windowCountPerFace: {
    "North Western": 4,
    "South Western": 4,
    "North Eastern": 2,
    "South Eastern": 1,
  },
};

const sitePlan: SitePlanData = {
  concreteAreas: [
    { label: "Driveway", areaM2: 80 },
    { label: "Path", areaM2: 163 },
  ],
  totalConcreteM2: 243,
  drivewayConcretM2: 80,
  patioConcreteM2: 163,
  totalCoverageM2: null,
  perimeterM: 58.7,
};

describe("crossReference", () => {
  it("window count match when floor plan and elevations agree within 2", () => {
    const result = crossReference(baseTakeoff, elevationsMatch, sitePlan);
    expect(result.windowCountFloorPlan).toBe(8);
    expect(result.windowCountElevations).toBe(8);
    expect(result.windowCountMatch).toBe(true);
    expect(result.windowCountDiscrepancy).toBe(0);
    expect(result.warnings.some((w) => /mismatch/i.test(w))).toBe(false);
  });

  it("window count mismatch when discrepancy > 2", () => {
    const result = crossReference(baseTakeoff, elevationsMismatch, sitePlan);
    // elevationsMismatch has 4+4+2+1 = 11 windows, floor plan has 8 → discrepancy = 3
    expect(result.windowCountElevations).toBe(11);
    expect(result.windowCountMatch).toBe(false);
    expect(result.windowCountDiscrepancy).toBe(3);
    expect(result.warnings.some((w) => /mismatch/i.test(w))).toBe(true);
    expect(result.warnings[0]).toMatch(/floor plan shows 8/i);
    expect(result.warnings[0]).toMatch(/elevations show 11/i);
  });

  it("warns to upload elevations when none provided", () => {
    const result = crossReference(baseTakeoff, null, sitePlan);
    expect(result.windowCountMatch).toBe(false);
    expect(result.warnings.some((w) => /upload elevation/i.test(w))).toBe(true);
  });

  it("extracts cladding type code from elevations", () => {
    const result = crossReference(baseTakeoff, elevationsMatch, null);
    expect(result.claddingTypeCode).toBe(3);
  });

  it("returns null cladding type code when no elevations", () => {
    const result = crossReference(baseTakeoff, null, null);
    expect(result.claddingTypeCode).toBeNull();
  });

  it("extracts roof type and pitch from elevations", () => {
    const result = crossReference(baseTakeoff, elevationsMatch, null);
    expect(result.roofType).toBe("Metal tiles");
    expect(result.roofPitchDegrees).toBe(25);
  });

  it("stud height from elevation preferred over floor plan", () => {
    const elevWithStud: ElevationData = { ...elevationsMatch, studHeightMm: 2570 };
    const result = crossReference(baseTakeoff, elevWithStud, null);
    expect(result.studHeightMm).toBe(2570);
    expect(result.studHeightSource).toBe("elevation");
  });

  it("stud height falls back to floor plan ceiling height", () => {
    const result = crossReference(baseTakeoff, elevationsMatch, null);
    // elevationsMatch has no studHeightMm, baseTakeoff has ceiling_height_m = 2.4
    expect(result.studHeightMm).toBe(2400);
    expect(result.studHeightSource).toBe("floor_plan");
  });

  it("stud height is builder_default when nothing provided", () => {
    const noHeight: TakeoffData = { ...baseTakeoff, ceiling_height_m: null };
    const result = crossReference(noHeight, elevationsMatch, null);
    expect(result.studHeightMm).toBeNull();
    expect(result.studHeightSource).toBe("builder_default");
  });
});
