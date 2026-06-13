/**
 * Stage 5 — Cross-reference: elevations vs floor plan.
 * Pure function — no AI, no I/O.
 */
import type { TakeoffData } from "./concept.functions";
import type { ElevationData } from "./extract-elevations";
import type { SitePlanData } from "./extract-site-plan";
import { isQsGlazedOpening } from "./derive-fields";

export interface CrossReferenceResult {
  windowCountMatch: boolean;
  windowCountFloorPlan: number;
  windowCountElevations: number;
  windowCountDiscrepancy: number;
  /** QS external-glazing count: windows + external glazed doors, excluding sectional garage doors. */
  externalGlazedOpeningCountFloorPlan: number;
  externalGlazedOpeningCountElevations: number;
  externalGlazedOpeningDiscrepancy: number;
  externalGlazedOpeningMatch: boolean;
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

  // QS external-glazing cross-check. Elevations see external doors as wall openings;
  // the floor-plan ledger should too. Sectional garage doors are the single exception.
  const fpExternalGlazedCount =
    floorPlan.openings && floorPlan.openings.length > 0
      ? floorPlan.openings.filter((o) => isQsGlazedOpening(o.type)).length
      : (floorPlan.window_count ?? 0) + (floorPlan.external_door_count ?? 0);
  const elExternalGlazedCount = elevations ? elCount + elevations.externalDoorCount : 0;
  const externalGlazedDiscrepancy = Math.abs(fpExternalGlazedCount - elExternalGlazedCount);
  const externalGlazedMatch = elevations !== null && externalGlazedDiscrepancy <= 2;

  if (elevations && discrepancy > 2) {
    warnings.push(
      `Window count mismatch — floor plan shows ${fpCount}, elevations show ${elCount}. Check plan carefully.`,
    );
  }
  if (elevations && externalGlazedDiscrepancy > 2) {
    warnings.push(
      `External glazed opening mismatch — floor plan ledger shows ${fpExternalGlazedCount}, elevations show ${elExternalGlazedCount} (windows plus external doors; sectional garage doors excluded). Check elevations against the floor plan.`,
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
    externalGlazedOpeningCountFloorPlan: fpExternalGlazedCount,
    externalGlazedOpeningCountElevations: elExternalGlazedCount,
    externalGlazedOpeningDiscrepancy: externalGlazedDiscrepancy,
    externalGlazedOpeningMatch: externalGlazedMatch,
    claddingTypeCode: elevations?.claddingTypeCode ?? null,
    roofType: elevations?.roofType ?? null,
    roofPitchDegrees: elevations?.roofPitchDegrees ?? null,
    studHeightMm,
    studHeightSource,
    warnings,
  };
}
