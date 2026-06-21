import type { ElevationData, ElevationOpeningCandidate } from "./extract-elevations";
import type { PlanStandaloneOpeningWidth, PlanText } from "./plan-text";
import type { VisualOpeningAudit, VisualOpeningAuditItem } from "./visual-opening-audit";

const MALFORMED_LABEL_FLAG = "malformed dimension label";

type UsableElevationOpening = ElevationOpeningCandidate & {
  widthMm: number;
  heightMm: number;
  confidence: "high" | "medium";
};

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

function candidateIsUsable(
  candidate: ElevationOpeningCandidate,
): candidate is UsableElevationOpening {
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

function widthToleranceMm(widthMm: number): number {
  return Math.max(100, Math.round(widthMm * 0.08));
}

function visualPoint(
  opening: VisualOpeningAuditItem,
  page: { width: number; height: number },
): { x: number; y: number } {
  return { x: opening.x * page.width, y: opening.y * page.height };
}

function nearbyStandaloneWidths(
  opening: VisualOpeningAuditItem,
  widths: readonly PlanStandaloneOpeningWidth[] | null | undefined,
  page: { width: number; height: number } | null | undefined,
): PlanStandaloneOpeningWidth[] {
  if (!widths?.length || !page) return [];
  const point = visualPoint(opening, page);
  const maxDistancePt = Math.max(page.width, page.height) * 0.18;
  return widths
    .map((witness) => ({
      witness,
      distance: Math.hypot(witness.x - point.x, witness.y - point.y),
    }))
    .filter((candidate) => candidate.distance <= maxDistancePt)
    .sort((a, b) => a.distance - b.distance)
    .map((candidate) => candidate.witness);
}

function recoverFromCandidate(
  opening: VisualOpeningAuditItem,
  candidate: UsableElevationOpening,
  evidenceNote: string,
): VisualOpeningAuditItem {
  return {
    ...opening,
    height_m: Math.round((candidate.heightMm / 1000) * 100) / 100,
    width_m: Math.round((candidate.widthMm / 1000) * 100) / 100,
    confidence: candidate.confidence,
    evidence: [opening.evidence, evidenceNote].filter(Boolean).join("; "),
    flags: withoutMalformedFlag(opening.flags),
  };
}

function recoverWithStandaloneWidth(
  opening: VisualOpeningAuditItem,
  candidates: UsableElevationOpening[],
  options:
    | {
        planText?: Pick<PlanText, "standaloneOpeningWidths"> | null;
        page?: { width: number; height: number } | null;
      }
    | undefined,
): { recovered: VisualOpeningAuditItem | null; nearbyWitnessCount: number } {
  const witnesses = nearbyStandaloneWidths(
    opening,
    options?.planText?.standaloneOpeningWidths,
    options?.page,
  );
  if (witnesses.length === 0) return { recovered: null, nearbyWitnessCount: 0 };

  const matches = witnesses.flatMap((witness) =>
    candidates
      .filter(
        (candidate) =>
          Math.abs(candidate.widthMm - witness.widthMm) <= widthToleranceMm(witness.widthMm),
      )
      .map((candidate) => ({ witness, candidate })),
  );
  if (matches.length !== 1) return { recovered: null, nearbyWitnessCount: witnesses.length };

  const { witness, candidate } = matches[0];
  return {
    recovered: recoverFromCandidate(
      opening,
      candidate,
      `standalone floor-plan width ${witness.widthMm}mm near the physical opening selects ${candidate.face} elevation ${candidate.label ?? "opening"} at ${candidate.widthMm}x${candidate.heightMm}mm`,
    ),
    nearbyWitnessCount: witnesses.length,
  };
}

export function recoverVisualAuditFromElevationLedger(
  audit: VisualOpeningAudit | null | undefined,
  elevations: ElevationData | null | undefined,
  options?: {
    planText?: Pick<PlanText, "standaloneOpeningWidths"> | null;
    page?: { width: number; height: number } | null;
  },
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
  const standaloneRecovery = recoverWithStandaloneWidth(opening, compatible, options);

  const recovered =
    standaloneRecovery.recovered ??
    (standaloneRecovery.nearbyWitnessCount > 0
      ? null
      : compatible.length === 1
        ? recoverFromCandidate(
            opening,
            compatible[0],
            `malformed floor-plan label resolved from ${compatible[0].face} elevation ledger`,
          )
        : null);
  if (!recovered) return audit;

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
