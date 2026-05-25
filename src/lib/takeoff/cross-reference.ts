/**
 * Stage 5 — Cross-reference: elevations vs floor plan.
 * Pure function — no AI, no I/O.
 */
import type { TakeoffData } from "./concept.functions";
import type { ElevationData } from "./extract-elevations";
import type { SitePlanData } from "./extract-site-plan";

export interface CrossReferenceResult {
  windowCountMatch: boolean;
  windowCountFloorPlan: number;
  windowCountElevations: number;
  windowCountDiscrepancy: number;
  claddingTypeCode: number | null;
  roofType: string | null;
  roofPitchDegrees: number | null;
  studHeightMm: number | null;
  studHeightSource: "elevation" | "floor_plan" | "builder_default";
  warnings: string[];
}

export function crossReference(
  floorPlan: TakeoffData,
  elevations: ElevationData | null,
  _sitePlan: SitePlanData | null,
): CrossReferenceResult {
  const warnings: string[] = [];

  // Window count cross-check
  const fpCount = floorPlan.window_count ?? 0;
  const elCount = elevations
    ? Object.values(elevations.windowCountPerFace).reduce((s, n) => s + n, 0)
    : 0;
  const discrepancy = Math.abs(fpCount - elCount);
  const windowCountMatch = elevations !== null && discrepancy <= 2;

  if (elevations && discrepancy > 2) {
    warnings.push(
      `Window count mismatch — floor plan shows ${fpCount}, elevations show ${elCount}. Check plan carefully.`,
    );
  }
  if (!elevations) {
    warnings.push("Upload elevation PDF to auto-detect cladding type and verify window count.");
  }

  // Stud height resolution
  let studHeightMm: number | null = null;
  let studHeightSource: CrossReferenceResult["studHeightSource"] = "builder_default";

  if (elevations?.studHeightMm != null) {
    studHeightMm = elevations.studHeightMm;
    studHeightSource = "elevation";
  } else if (floorPlan.ceiling_height_m != null) {
    studHeightMm = Math.round(floorPlan.ceiling_height_m * 1000);
    studHeightSource = "floor_plan";
  }

  return {
    windowCountMatch,
    windowCountFloorPlan: fpCount,
    windowCountElevations: elCount,
    windowCountDiscrepancy: discrepancy,
    claddingTypeCode: elevations?.claddingTypeCode ?? null,
    roofType: elevations?.roofType ?? null,
    roofPitchDegrees: elevations?.roofPitchDegrees ?? null,
    studHeightMm,
    studHeightSource,
    warnings,
  };
}
