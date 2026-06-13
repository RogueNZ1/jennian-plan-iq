/**
 * Stage 5 - Cross-reference: elevations vs floor plan.
 * Pure function - no AI, no I/O.
 */
import type { TakeoffData } from "./concept.functions";
import type { ElevationData, ElevationOpeningCandidate } from "./extract-elevations";
import type { SitePlanData } from "./extract-site-plan";
import { isQsGlazedOpening } from "./derive-fields";

export type ElevationOpeningLedgerSource = "candidate_ledger" | "summary_counts" | "none";

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
  /** Whether elevation counts came from the new per-opening ledger or old summary totals. */
  elevationOpeningLedgerSource: ElevationOpeningLedgerSource;
  elevationOpeningCandidateCount: number;
  elevationGarageDoorCount: number;
  elevationUnknownOpeningCount: number;
  elevationUndimensionedOpeningCount: number;
  elevationOpeningAreaM2: number | null;
  claddingTypeCode: number | null;
  roofType: string | null;
  roofPitchDegrees: number | null;
  studHeightMm: number | null;
  studHeightSource: "elevation" | "floor_plan" | "builder_default";
  warnings: string[];
}

type ElevationOpeningStats = {
  source: ElevationOpeningLedgerSource;
  candidateCount: number;
  windowCount: number;
  externalGlazedCount: number;
  garageDoorCount: number;
  unknownCount: number;
  undimensionedCount: number;
  areaM2: number | null;
  lowTrust: boolean;
};

function qty(opening: ElevationOpeningCandidate): number {
  return Number.isFinite(opening.quantity) && opening.quantity > 0
    ? Math.round(opening.quantity)
    : 1;
}

function areaM2(opening: ElevationOpeningCandidate): number | null {
  if (opening.widthMm == null || opening.heightMm == null) return null;
  return (opening.widthMm * opening.heightMm) / 1_000_000;
}

function readElevationOpeningStats(elevations: ElevationData | null): ElevationOpeningStats {
  if (!elevations) {
    return {
      source: "none",
      candidateCount: 0,
      windowCount: 0,
      externalGlazedCount: 0,
      garageDoorCount: 0,
      unknownCount: 0,
      undimensionedCount: 0,
      areaM2: null,
      lowTrust: false,
    };
  }

  const candidates = elevations.elevationOpenings ?? [];
  if (candidates.length === 0) {
    const windowCount = Object.values(elevations.windowCountPerFace).reduce((s, n) => s + n, 0);
    return {
      source: "summary_counts",
      candidateCount: 0,
      windowCount,
      externalGlazedCount: windowCount + elevations.externalDoorCount,
      garageDoorCount: elevations.garageDoorsPresent ? 1 : 0,
      unknownCount: 0,
      undimensionedCount: 0,
      areaM2: null,
      lowTrust: false,
    };
  }

  let windowCount = 0;
  let externalGlazedCount = 0;
  let garageDoorCount = 0;
  let unknownCount = 0;
  let undimensionedCount = 0;
  let area = 0;
  let hasArea = false;

  for (const candidate of candidates) {
    const count = qty(candidate);
    if (candidate.type === "window" || candidate.type === "slider") windowCount += count;
    if (candidate.type === "garage_door") {
      garageDoorCount += count;
    } else {
      externalGlazedCount += count;
    }
    if (candidate.type === "unknown") unknownCount += count;
    const openingArea = areaM2(candidate);
    if (openingArea == null) {
      undimensionedCount += count;
    } else {
      area += openingArea * count;
      hasArea = true;
    }
  }

  return {
    source: "candidate_ledger",
    candidateCount: candidates.reduce((s, opening) => s + qty(opening), 0),
    windowCount,
    externalGlazedCount,
    garageDoorCount,
    unknownCount,
    undimensionedCount,
    areaM2: hasArea ? Math.round(area * 100) / 100 : null,
    lowTrust:
      candidates.length > 0 &&
      (undimensionedCount / candidates.reduce((s, opening) => s + qty(opening), 0) >= 0.5 ||
        unknownCount > 0),
  };
}

export function crossReference(
  floorPlan: TakeoffData,
  elevations: ElevationData | null,
  _sitePlan: SitePlanData | null,
): CrossReferenceResult {
  const warnings: string[] = [];

  const elevationStats = readElevationOpeningStats(elevations);

  // Window count cross-check
  const fpCount = floorPlan.window_count ?? 0;
  const elCount = elevationStats.windowCount;
  const discrepancy = Math.abs(fpCount - elCount);
  const windowCountMatch = elevations !== null && discrepancy <= 2;
  const elevationCountsLowTrust = elevations !== null && elevationStats.lowTrust;

  // QS external-glazing cross-check. Elevations see external doors as wall openings;
  // the floor-plan ledger should too. Sectional garage doors are the single exception.
  const fpExternalGlazedCount =
    floorPlan.openings && floorPlan.openings.length > 0
      ? floorPlan.openings.filter((o) => isQsGlazedOpening(o.type)).length
      : (floorPlan.window_count ?? 0) + (floorPlan.external_door_count ?? 0);
  const elExternalGlazedCount = elevationStats.externalGlazedCount;
  const externalGlazedDiscrepancy = Math.abs(fpExternalGlazedCount - elExternalGlazedCount);
  const externalGlazedMatch = elevations !== null && externalGlazedDiscrepancy <= 2;

  if (elevations && elevationCountsLowTrust) {
    warnings.push(
      `Elevation opening ledger is low-confidence (${elevationStats.undimensionedCount} of ${elevationStats.candidateCount} opening(s) have no readable dimensions). Floor-plan/window-code evidence remains the source of truth until the elevation openings can be read cleanly.`,
    );
  } else if (elevations && discrepancy > 2) {
    warnings.push(
      `Window count mismatch - floor plan shows ${fpCount}, elevations show ${elCount}. Check plan carefully.`,
    );
  }
  if (elevations && !elevationCountsLowTrust && externalGlazedDiscrepancy > 2) {
    warnings.push(
      `External glazed opening mismatch - floor plan ledger shows ${fpExternalGlazedCount}, elevations show ${elExternalGlazedCount} (windows plus external doors; sectional garage doors excluded). Check elevations against the floor plan.`,
    );
  }
  if (
    elevations &&
    elevationStats.source === "candidate_ledger" &&
    elevationStats.unknownCount > 0
  ) {
    warnings.push(
      `${elevationStats.unknownCount} elevation opening(s) were visible but not typed confidently. Treat them as external glazed openings until verified.`,
    );
  }
  if (
    elevations &&
    elevationStats.source === "candidate_ledger" &&
    elevationStats.undimensionedCount > 0 &&
    !elevationStats.lowTrust
  ) {
    warnings.push(
      `${elevationStats.undimensionedCount} elevation opening(s) have no readable dimensions. Count cross-check can continue, but opening area needs plan/schedule confirmation.`,
    );
  }
  if (elevations && elevationStats.source === "candidate_ledger") {
    const summaryWindowCount = Object.values(elevations.windowCountPerFace).reduce(
      (s, n) => s + n,
      0,
    );
    if (Math.abs(summaryWindowCount - elevationStats.windowCount) > 1) {
      warnings.push(
        `Elevation opening ledger disagrees with elevation summary - ledger windows ${elevationStats.windowCount}, summary windows ${summaryWindowCount}. Use the per-opening ledger for review.`,
      );
    }
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
    elevationOpeningLedgerSource: elevationStats.source,
    elevationOpeningCandidateCount: elevationStats.candidateCount,
    elevationGarageDoorCount: elevationStats.garageDoorCount,
    elevationUnknownOpeningCount: elevationStats.unknownCount,
    elevationUndimensionedOpeningCount: elevationStats.undimensionedCount,
    elevationOpeningAreaM2: elevationStats.areaM2,
    claddingTypeCode: elevations?.claddingTypeCode ?? null,
    roofType: elevations?.roofType ?? null,
    roofPitchDegrees: elevations?.roofPitchDegrees ?? null,
    studHeightMm,
    studHeightSource,
    warnings,
  };
}
