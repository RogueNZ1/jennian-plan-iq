import type { ExtractedQuantityAuthority } from "@/lib/takeoff/extracted-quantity-authority";
import type {
  ExtractedQuantityExportRow,
  ExtractedQuantityReadModel,
  ExtractedQuantityTotals,
} from "@/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantityStatus } from "@/lib/takeoff/extracted-quantity-ledger";

export const EXTRACTED_QUANTITY_REVIEW_SECTIONS: Array<{
  status: ExtractedQuantityStatus;
  label: string;
}> = [
  { status: "extracted", label: "Clean extracted" },
  { status: "needs_review", label: "Needs review" },
  { status: "missing_evidence", label: "Missing evidence" },
  { status: "conflict", label: "Conflict" },
  { status: "ignored", label: "Ignored" },
];

export type ExtractedQuantityReviewSection = {
  status: ExtractedQuantityStatus;
  label: string;
  rows: ExtractedQuantityExportRow[];
};

export type ExtractedQuantityReviewModel = {
  source: ExtractedQuantityAuthority["source"];
  runId: string | null;
  activeRunId: string | null;
  warnings: string[];
  readModel: ExtractedQuantityReadModel | null;
  sections: ExtractedQuantityReviewSection[];
  cleanTotals: ExtractedQuantityTotals;
};

export type ReviewLegacyWritePathClass =
  | "SAFE_COMPAT"
  | "LEGACY_AUTHORITY_RISK"
  | "APPROVAL_WORKFLOW"
  | "EXPORT_WORKFLOW"
  | "VALIDATION_RISK";

export type ReviewLegacyActionPolicy = {
  path: string;
  classification: ReviewLegacyWritePathClass;
  contained: boolean;
  reason: string;
};

const EMPTY_TOTALS: ExtractedQuantityTotals = { count: 0, lengthMm: 0, areaM2: 0 };

export const REVIEW_LEGACY_ACTION_POLICIES: ReviewLegacyActionPolicy[] = [
  {
    path: "base_geometry_quantity_override",
    classification: "LEGACY_AUTHORITY_RISK",
    contained: true,
    reason: "Legacy extracted_quantities overrides are not active ledger edits.",
  },
  {
    path: "opening_schedule_add_update_delete_confirm_push",
    classification: "LEGACY_AUTHORITY_RISK",
    contained: true,
    reason:
      "opening_schedule is compatibility evidence beside the active extracted quantity ledger.",
  },
  {
    path: "printed_reference_quantity_upsert",
    classification: "VALIDATION_RISK",
    contained: true,
    reason: "Printed reference values are read-only comparison evidence in Review.",
  },
  {
    path: "module_item_assumption_confirm",
    classification: "APPROVAL_WORKFLOW",
    contained: true,
    reason: "Module assumptions are legacy workflow values, not active ledger corrections.",
  },
  {
    path: "job_approval_status_update",
    classification: "APPROVAL_WORKFLOW",
    contained: false,
    reason: "Job approval is a workflow status change and does not mutate ledger rows.",
  },
  {
    path: "export_log_and_status_update",
    classification: "EXPORT_WORKFLOW",
    contained: false,
    reason: "Export logging/status does not mutate ledger rows or legacy quantity values.",
  },
];

export function legacyActionPolicy(path: string): ReviewLegacyActionPolicy | undefined {
  return REVIEW_LEGACY_ACTION_POLICIES.find((policy) => policy.path === path);
}

export function reviewHasLegacyDataBesideLedger(args: {
  activeLedgerRows: number;
  legacyOpeningRows: number;
  legacyQuantityRows: number;
  legacyModuleItems: number;
  printedReferenceRows: number;
}): boolean {
  return (
    args.activeLedgerRows > 0 &&
    (args.legacyOpeningRows > 0 ||
      args.legacyQuantityRows > 0 ||
      args.legacyModuleItems > 0 ||
      args.printedReferenceRows > 0)
  );
}

export function buildExtractedQuantityReviewModel(
  authority: ExtractedQuantityAuthority | null | undefined,
): ExtractedQuantityReviewModel {
  const readModel = authority?.readModel ?? null;
  return {
    source: authority?.source ?? "unavailable",
    runId: authority?.runId ?? null,
    activeRunId: readModel?.activeRunId ?? authority?.runId ?? null,
    warnings: authority?.warnings ?? [],
    readModel,
    sections: EXTRACTED_QUANTITY_REVIEW_SECTIONS.map((section) => ({
      ...section,
      rows: readModel?.groups[section.status] ?? [],
    })),
    cleanTotals: readModel?.cleanTotals ?? EMPTY_TOTALS,
  };
}
