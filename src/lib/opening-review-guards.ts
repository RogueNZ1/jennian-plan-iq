export const BLOCKED_OPENING_REVIEW_ONLY_NOTE =
  "REVIEW ONLY - opening pricing blocked; do not price from this row until reconciled.";

export const BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX = "review-only blocked opening candidate";

export type OpeningReviewGuardRow = {
  source_evidence?: string | null;
  notes?: string | null;
};

export type BlockedOpeningAction = "confirm" | "push" | "export";

export function isBlockedReviewOnlyOpening(row: OpeningReviewGuardRow): boolean {
  const sourceEvidence = (row.source_evidence ?? "").toLowerCase();
  const notes = (row.notes ?? "").toLowerCase();

  return (
    sourceEvidence.includes(BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX) ||
    notes.includes("review only - opening pricing blocked") ||
    notes.includes("opening pricing blocked; do not price")
  );
}

export function blockedOpeningActionMessage(action: BlockedOpeningAction): string {
  switch (action) {
    case "confirm":
      return "Blocked opening evidence is review-only and cannot be confirmed until the pricing block is reconciled.";
    case "push":
      return "Blocked opening evidence is review-only and cannot be pushed to pricing modules.";
    case "export":
      return "Opening Schedule export is blocked while review-only opening evidence is present.";
  }
}
