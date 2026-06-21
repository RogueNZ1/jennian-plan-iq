import type { ElevationData, ElevationOpeningCandidate } from "./extract-elevations";
import type { FloorPlanGapCandidate } from "./floor-plan-gaps";

export const MEASURED_WIDTH_CONFIRMATION_TOLERANCE_MM = 50;

export type FloorPlanGapElevationMatch = {
  source: "elevation_measurement";
  face: string;
  expectedFace: "north" | "south" | "east" | "west" | null;
  faceCheck: "matched" | "unknown";
  measurementCheck: "confirmed" | "supporting";
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

function canonicalFace(
  face: string | null | undefined,
): "north" | "south" | "east" | "west" | null {
  const text = (face ?? "").toLowerCase();
  const hits = (["north", "south", "east", "west"] as const).filter((dir) =>
    new RegExp(`\\b${dir}\\b`).test(text),
  );
  return hits.length === 1 ? hits[0] : null;
}

function oppositeFace(
  side: FloorPlanGapCandidate["roomSide"],
): "north" | "south" | "east" | "west" | null {
  if (side === "north") return "south";
  if (side === "south") return "north";
  if (side === "east") return "west";
  if (side === "west") return "east";
  return null;
}

function faceCompatible(gap: FloorPlanGapCandidate, opening: ElevationOpeningCandidate): boolean {
  const expectedFace = oppositeFace(gap.roomSide ?? null);
  const actualFace = canonicalFace(opening.face);
  return expectedFace == null || actualFace == null || expectedFace === actualFace;
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
      (opening) =>
        Math.abs(opening.widthMm - gap.widthMm) <= tolerance && faceCompatible(gap, opening),
    );
    if (matches.length !== 1) continue;

    const match = matches[0];
    const competingGaps = gaps.filter(
      (candidate) =>
        Math.abs(match.widthMm - candidate.widthMm) <= widthToleranceMm(candidate.widthMm) &&
        faceCompatible(candidate, match),
    );
    if (competingGaps.length !== 1) continue;

    const widthDeltaMm = Math.abs(match.widthMm - gap.widthMm);
    const measurementCheck =
      widthDeltaMm <= MEASURED_WIDTH_CONFIRMATION_TOLERANCE_MM ? "confirmed" : "supporting";
    out.set(gap.id, {
      source: "elevation_measurement",
      face: match.face,
      expectedFace: oppositeFace(gap.roomSide ?? null),
      faceCheck:
        oppositeFace(gap.roomSide ?? null) != null && canonicalFace(match.face) != null
          ? "matched"
          : "unknown",
      measurementCheck,
      type: match.type,
      label: match.label,
      widthMm: match.widthMm,
      heightMm: match.heightMm,
      widthDeltaMm,
      confidence: match.confidence,
      note:
        measurementCheck === "confirmed"
          ? `${match.face} elevation ${match.label ?? "opening"} confirms ${match.widthMm}mm width within ${widthDeltaMm}mm of measured floor-plan gap; height ${match.heightMm}mm recovered as evidence only.`
          : `${match.face} elevation ${match.label ?? "opening"} supports a similar ${match.widthMm}mm width, but the ${widthDeltaMm}mm delta is outside the 50mm confirmation tolerance; keep review-only.`,
    });
  }

  return out;
}
