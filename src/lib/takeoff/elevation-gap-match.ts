import type { ElevationData, ElevationOpeningCandidate } from "./extract-elevations";
import type { FloorPlanGapCandidate } from "./floor-plan-gaps";

export type FloorPlanGapElevationMatch = {
  source: "elevation_measurement";
  face: string;
  type: ElevationOpeningCandidate["type"];
  label: string | null;
  widthMm: number;
  heightMm: number;
  widthDeltaMm: number;
  confidence: "high" | "medium";
  note: string;
};

function usableElevationOpening(
  opening: ElevationOpeningCandidate,
): opening is ElevationOpeningCandidate & {
  widthMm: number;
  heightMm: number;
  confidence: "high" | "medium";
} {
  return (
    opening.quantity === 1 &&
    opening.widthMm != null &&
    opening.heightMm != null &&
    opening.widthMm > 0 &&
    opening.heightMm > 0 &&
    opening.confidence !== "low"
  );
}

function widthToleranceMm(widthMm: number): number {
  return Math.max(100, Math.round(widthMm * 0.08));
}

export function matchElevationToFloorPlanGaps(args: {
  gaps: readonly FloorPlanGapCandidate[] | null | undefined;
  elevations: ElevationData | null | undefined;
}): Map<string, FloorPlanGapElevationMatch> {
  const gaps = args.gaps ?? [];
  const elevationOpenings = (args.elevations?.elevationOpenings ?? []).filter(
    usableElevationOpening,
  );
  const out = new Map<string, FloorPlanGapElevationMatch>();
  if (gaps.length === 0 || elevationOpenings.length === 0) return out;

  for (const gap of gaps) {
    const tolerance = widthToleranceMm(gap.widthMm);
    const matches = elevationOpenings.filter(
      (opening) => Math.abs(opening.widthMm - gap.widthMm) <= tolerance,
    );
    if (matches.length !== 1) continue;

    const match = matches[0];
    const competingGaps = gaps.filter(
      (candidate) =>
        Math.abs(match.widthMm - candidate.widthMm) <= widthToleranceMm(candidate.widthMm),
    );
    if (competingGaps.length !== 1) continue;

    const widthDeltaMm = Math.abs(match.widthMm - gap.widthMm);
    out.set(gap.id, {
      source: "elevation_measurement",
      face: match.face,
      type: match.type,
      label: match.label,
      widthMm: match.widthMm,
      heightMm: match.heightMm,
      widthDeltaMm,
      confidence: match.confidence,
      note: `${match.face} elevation ${match.label ?? "opening"} confirms ${match.widthMm}mm width within ${widthDeltaMm}mm of measured floor-plan gap; height ${match.heightMm}mm recovered as evidence only.`,
    });
  }

  return out;
}
