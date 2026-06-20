// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BLOCKED_OPENING_REVIEW_ONLY_NOTE,
  BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX,
  blockedOpeningActionMessage,
  isBlockedReviewOnlyOpening,
} from "../opening-review-guards";

describe("opening review guards", () => {
  it("identifies blocked review-only opening rows from canonical source evidence", () => {
    expect(
      isBlockedReviewOnlyOpening({
        source_evidence: `${BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX} (candidate-1)`,
        notes: null,
      }),
    ).toBe(true);
  });

  it("identifies blocked review-only opening rows from canonical notes", () => {
    expect(
      isBlockedReviewOnlyOpening({
        source_evidence: null,
        notes: `${BLOCKED_OPENING_REVIEW_ONLY_NOTE} Candidate held for reconciliation.`,
      }),
    ).toBe(true);
  });

  it("identifies blocked rows from the canonical note heading", () => {
    expect(
      isBlockedReviewOnlyOpening({
        source_evidence: null,
        notes: `${BLOCKED_OPENING_REVIEW_ONLY_NOTE.split(";")[0]} - needs QS reconciliation.`,
      }),
    ).toBe(true);
  });

  it("does not block normal confirmed opening rows", () => {
    expect(
      isBlockedReviewOnlyOpening({
        source_evidence: "canonical opening",
        notes: "Reviewed by QS",
      }),
    ).toBe(false);
  });

  it("returns action-specific operator messages", () => {
    expect(blockedOpeningActionMessage("confirm")).toContain("cannot be confirmed");
    expect(blockedOpeningActionMessage("push")).toContain("cannot be pushed");
    expect(blockedOpeningActionMessage("export")).toContain("export is blocked");
  });
});
