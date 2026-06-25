import type { ElevationData, ElevationOpeningCandidate } from "./extract-elevations";
import type { PlanPhysicalOpeningWidthWitness } from "./floor-opening-witnesses";
import type { VisualOpeningAudit, VisualOpeningAuditItem } from "./visual-opening-audit";

const MALFORMED_LABEL_FLAG = "malformed dimension label";

type UsableElevationOpening = ElevationOpeningCandidate & {
  widthMm: number;
  heightMm: number;
  confidence: "high" | "medium";
};

type PhysicalElevationMatch = {
  witness: PlanPhysicalOpeningWidthWitness;
  candidate: UsableElevationOpening;
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

function visualDimensionToleranceMm(widthMm: number): number {
  return Math.max(180, Math.round(widthMm * 0.12));
}

function visualPoint(
  opening: VisualOpeningAuditItem,
  page: { width: number; height: number },
): { x: number; y: number } {
  return { x: opening.x * page.width, y: opening.y * page.height };
}

function nearbyPhysicalOpeningWidths(
  opening: VisualOpeningAuditItem,
  witnesses: readonly PlanPhysicalOpeningWidthWitness[] | null | undefined,
  page: { width: number; height: number } | null | undefined,
): PlanPhysicalOpeningWidthWitness[] {
  if (!witnesses?.length || !page) return [];
  const point = visualPoint(opening, page);
  const maxDistancePt = Math.max(page.width, page.height) * 0.18;
  return witnesses
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
  recoveryProof?: VisualOpeningAuditItem["recoveryProof"],
): VisualOpeningAuditItem {
  return {
    ...opening,
    height_m: Math.round((candidate.heightMm / 1000) * 100) / 100,
    width_m: Math.round((candidate.widthMm / 1000) * 100) / 100,
    confidence: candidate.confidence,
    evidence: [opening.evidence, evidenceNote].filter(Boolean).join("; "),
    flags: withoutMalformedFlag(opening.flags),
    ...(recoveryProof ? { recoveryProof } : {}),
  };
}

function recoverFromPhysicalElevationMatch(
  opening: VisualOpeningAuditItem,
  match: PhysicalElevationMatch,
): VisualOpeningAuditItem {
  const { witness, candidate } = match;
  const recoveryProof: VisualOpeningAuditItem["recoveryProof"] = {
    kind: "physical_elevation",
    floorWidthMm: witness.widthMm,
    elevationFace: candidate.face,
    elevationLabel: candidate.label ?? null,
    elevationWidthMm: candidate.widthMm,
    elevationHeightMm: candidate.heightMm,
  };
  return {
    ...recoverFromCandidate(
      opening,
      { ...candidate, widthMm: witness.widthMm },
      `visual locator confirmed by physical floor-plan width ${witness.widthMm}mm with stub+leaf evidence and ${candidate.face} elevation ${candidate.label ?? "opening"} at ${candidate.widthMm}x${candidate.heightMm}mm`,
      recoveryProof,
    ),
    width_m: Math.round((witness.widthMm / 1000) * 100) / 100,
  };
}

function visualDimensionsAgreeWithProof(
  opening: VisualOpeningAuditItem,
  match: PhysicalElevationMatch,
): boolean {
  const visualWidthMm = opening.width_m != null ? opening.width_m * 1000 : null;
  const visualHeightMm = opening.height_m != null ? opening.height_m * 1000 : null;

  if (
    visualWidthMm != null &&
    Math.abs(visualWidthMm - match.witness.widthMm) >
      visualDimensionToleranceMm(match.witness.widthMm)
  ) {
    return false;
  }

  if (
    visualHeightMm != null &&
    Math.abs(visualHeightMm - match.candidate.heightMm) >
      visualDimensionToleranceMm(match.candidate.heightMm)
  ) {
    return false;
  }

  return true;
}

function physicalElevationMatches(
  opening: VisualOpeningAuditItem,
  candidates: UsableElevationOpening[],
  options:
    | {
        physicalOpeningWidthWitnesses?: readonly PlanPhysicalOpeningWidthWitness[] | null;
        page?: { width: number; height: number } | null;
      }
    | undefined,
): { matches: PhysicalElevationMatch[]; nearbyWitnessCount: number } {
  const witnesses = nearbyPhysicalOpeningWidths(
    opening,
    options?.physicalOpeningWidthWitnesses,
    options?.page,
  );
  if (witnesses.length === 0) return { matches: [], nearbyWitnessCount: 0 };

  const matches = witnesses.flatMap((witness) =>
    candidates
      .filter(
        (candidate) =>
          Math.abs(candidate.widthMm - witness.widthMm) <= widthToleranceMm(witness.widthMm),
      )
      .map((candidate) => ({ witness, candidate }))
      .filter((match) => visualDimensionsAgreeWithProof(opening, match)),
  );
  return { matches, nearbyWitnessCount: witnesses.length };
}

function recoverWithPhysicalOpeningWidth(
  opening: VisualOpeningAuditItem,
  candidates: UsableElevationOpening[],
  options:
    | {
        physicalOpeningWidthWitnesses?: readonly PlanPhysicalOpeningWidthWitness[] | null;
        page?: { width: number; height: number } | null;
      }
    | undefined,
): { recovered: VisualOpeningAuditItem | null; nearbyWitnessCount: number } {
  const result = physicalElevationMatches(opening, candidates, options);
  if (result.matches.length !== 1) {
    return { recovered: null, nearbyWitnessCount: result.nearbyWitnessCount };
  }
  return {
    recovered: recoverFromPhysicalElevationMatch(opening, result.matches[0]),
    nearbyWitnessCount: result.nearbyWitnessCount,
  };
}

function physicalWitnessKey(witness: PlanPhysicalOpeningWidthWitness): string {
  return `${Math.round(witness.x)}:${Math.round(witness.y)}:${witness.widthMm}:${witness.planSide}`;
}

function elevationCandidateKey(candidate: UsableElevationOpening): string {
  return [
    candidate.face,
    candidate.type,
    candidate.label ?? "",
    candidate.widthMm,
    candidate.heightMm,
  ].join("|");
}

function recoverLocatorBackedOpenings(
  audit: VisualOpeningAudit,
  candidates: UsableElevationOpening[],
  options:
    | {
        physicalOpeningWidthWitnesses?: readonly PlanPhysicalOpeningWidthWitness[] | null;
        page?: { width: number; height: number } | null;
      }
    | undefined,
): { audit: VisualOpeningAudit; changed: boolean } {
  const proposals = audit.openings.flatMap((opening) => {
    if (opening.type === "uncertain" || opening.type === "garage_door" || opening.recoveryProof) {
      return [];
    }
    const compatible = candidates.filter((candidate) =>
      compatibleType(opening.type, candidate.type),
    );
    const result = physicalElevationMatches(opening, compatible, options);
    if (result.matches.length !== 1) return [];
    const match = result.matches[0];
    return [
      {
        opening,
        match,
        witnessKey: physicalWitnessKey(match.witness),
        candidateKey: elevationCandidateKey(match.candidate),
      },
    ];
  });

  if (proposals.length === 0) return { audit, changed: false };

  const witnessClaims = new Map<string, number>();
  const candidateClaims = new Map<string, number>();
  for (const proposal of proposals) {
    witnessClaims.set(proposal.witnessKey, (witnessClaims.get(proposal.witnessKey) ?? 0) + 1);
    candidateClaims.set(
      proposal.candidateKey,
      (candidateClaims.get(proposal.candidateKey) ?? 0) + 1,
    );
  }

  const recoveredById = new Map<string, VisualOpeningAuditItem>();
  for (const proposal of proposals) {
    if (
      witnessClaims.get(proposal.witnessKey) !== 1 ||
      candidateClaims.get(proposal.candidateKey) !== 1
    ) {
      continue;
    }
    recoveredById.set(
      proposal.opening.id,
      recoverFromPhysicalElevationMatch(proposal.opening, proposal.match),
    );
  }

  if (recoveredById.size === 0) return { audit, changed: false };

  const openings = audit.openings.map((opening) => recoveredById.get(opening.id) ?? opening);
  return {
    changed: true,
    audit: {
      ...audit,
      openings,
      summary: {
        ...audit.summary,
        uncertain: openings.filter((item) => item.type === "uncertain" || item.confidence === "low")
          .length,
      },
    },
  };
}

export function recoverVisualAuditFromElevationLedger(
  audit: VisualOpeningAudit | null | undefined,
  elevations: ElevationData | null | undefined,
  options?: {
    physicalOpeningWidthWitnesses?: readonly PlanPhysicalOpeningWidthWitness[] | null;
    page?: { width: number; height: number } | null;
  },
): VisualOpeningAudit | null | undefined {
  if (!audit || !elevations?.elevationOpenings?.length) return audit;

  const candidates = elevations.elevationOpenings.filter(candidateIsUsable);
  if (candidates.length === 0) return audit;

  const locatorBacked = recoverLocatorBackedOpenings(audit, candidates, options);
  if (locatorBacked.changed) return locatorBacked.audit;

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
  const physicalWidthRecovery = recoverWithPhysicalOpeningWidth(opening, compatible, options);

  const recovered =
    physicalWidthRecovery.recovered ??
    (physicalWidthRecovery.nearbyWitnessCount > 0
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
