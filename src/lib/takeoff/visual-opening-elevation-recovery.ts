import type { ElevationData, ElevationOpeningCandidate } from "./extract-elevations";
import type { VisualOpeningAudit, VisualOpeningAuditItem } from "./visual-opening-audit";

const MALFORMED_LABEL_FLAG = "malformed dimension label";

function hasMalformedLabelFlag(opening: VisualOpeningAuditItem): boolean {
  return opening.flags.some((flag) => flag.toLowerCase().includes(MALFORMED_LABEL_FLAG));
}

function compatibleType(
  visualType: VisualOpeningAuditItem["type"],
  elevationType: ElevationOpeningCandidate["type"],
): boolean {
  if (visualType === "garage_door") return elevationType === "garage_door";
  if (visualType === "slider") return elevationType === "slider";
  if (visualType === "external_door" || visualType === "pa_door") {
    return elevationType === "external_door";
  }
  if (visualType === "window" || visualType === "garage_window") return elevationType === "window";
  return false;
}

function candidateIsUsable(candidate: ElevationOpeningCandidate): boolean {
  return (
    candidate.quantity === 1 &&
    candidate.widthMm != null &&
    candidate.heightMm != null &&
    candidate.widthMm > 0 &&
    candidate.heightMm > 0 &&
    candidate.confidence !== "low"
  );
}

function withoutMalformedFlag(flags: readonly string[]): string[] {
  return flags.filter((flag) => !flag.toLowerCase().includes(MALFORMED_LABEL_FLAG));
}

export function recoverVisualAuditFromElevationLedger(
  audit: VisualOpeningAudit | null | undefined,
  elevations: ElevationData | null | undefined,
): VisualOpeningAudit | null | undefined {
  if (!audit || !elevations?.elevationOpenings?.length) return audit;

  const candidates = elevations.elevationOpenings.filter(candidateIsUsable);
  if (candidates.length === 0) return audit;

  const unresolved = audit.openings.filter(
    (opening) =>
      hasMalformedLabelFlag(opening) &&
      opening.height_m == null &&
      opening.width_m == null &&
      opening.type !== "uncertain",
  );
  if (unresolved.length !== 1) return audit;

  const opening = unresolved[0];
  const compatible = candidates.filter((candidate) => compatibleType(opening.type, candidate.type));
  if (compatible.length !== 1) return audit;

  const candidate = compatible[0];
  const recovered: VisualOpeningAuditItem = {
    ...opening,
    height_m: Math.round((candidate.heightMm! / 1000) * 100) / 100,
    width_m: Math.round((candidate.widthMm! / 1000) * 100) / 100,
    confidence: candidate.confidence,
    evidence: [
      opening.evidence,
      `malformed floor-plan label resolved from ${candidate.face} elevation ledger`,
    ]
      .filter(Boolean)
      .join("; "),
    flags: withoutMalformedFlag(opening.flags),
  };

  const openings = audit.openings.map((item) => (item.id === opening.id ? recovered : item));
  return {
    ...audit,
    openings,
    summary: {
      ...audit.summary,
      uncertain: openings.filter((item) => item.type === "uncertain" || item.confidence === "low")
        .length,
    },
  };
}
