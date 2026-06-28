import type { Json } from "@/integrations/supabase/types";
import type { ExtractedQuantityStatus } from "./extracted-quantity-ledger";

export type ExtractedQuantityCorrectionAction =
  | "set_dimension"
  | "set_count"
  | "set_status"
  | "set_label"
  | "ignore_row"
  | "keep_needs_review"
  | "add_note";

export type ExtractedQuantityDimensionField = "widthMm" | "heightMm" | "lengthMm" | "areaM2";

export type ExtractedQuantityCorrectionField =
  | ExtractedQuantityDimensionField
  | "count"
  | "status"
  | "label"
  | "reviewNote"
  | "ignoreReason";

export type ExtractedQuantityCorrectionEvidenceRef = {
  kind: "ledger_evidence" | "visual_anchor" | "manual_reference" | "review_note";
  page?: number | null;
  bbox?: number[] | null;
  text?: string | null;
  extractedQuantityId?: string | null;
  visualAnchorId?: string | null;
  note?: string | null;
};

export type ExtractedQuantityCorrection = {
  id: string;
  jobId: string;
  runId: string;
  extractedQuantityId: string;
  visualAnchorId?: string | null;
  action: ExtractedQuantityCorrectionAction;
  field?: ExtractedQuantityCorrectionField | null;
  before: unknown;
  after: unknown;
  reason: string;
  evidenceRefs: ExtractedQuantityCorrectionEvidenceRef[];
  createdBy: string;
  createdAt: string;
  supersedesCorrectionId?: string | null;
  revertedAt?: string | null;
  revertedBy?: string | null;
  revertReason?: string | null;
};

export type ExtractedQuantityCorrectionDbRow = {
  id: string;
  job_id: string;
  run_id: string;
  extracted_quantity_id: string;
  visual_anchor_id: string | null;
  action: string;
  field: string | null;
  before_json: Json;
  after_json: Json;
  reason: string;
  evidence_refs_json: Json;
  created_by: string;
  created_at: string;
  supersedes_correction_id: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
  revert_reason: string | null;
};

export type ExtractedQuantityCorrectionInsertRow = Omit<
  ExtractedQuantityCorrectionDbRow,
  "id" | "created_at"
> & {
  id?: string;
  created_at?: string;
};

function evidenceRefs(value: Json): ExtractedQuantityCorrectionEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ExtractedQuantityCorrectionEvidenceRef =>
      item != null && typeof item === "object" && !Array.isArray(item),
  );
}

export function fromExtractedQuantityCorrectionDbRow(
  row: ExtractedQuantityCorrectionDbRow,
): ExtractedQuantityCorrection {
  return {
    id: row.id,
    jobId: row.job_id,
    runId: row.run_id,
    extractedQuantityId: row.extracted_quantity_id,
    visualAnchorId: row.visual_anchor_id,
    action: row.action as ExtractedQuantityCorrectionAction,
    field: row.field as ExtractedQuantityCorrectionField | null,
    before: row.before_json,
    after: row.after_json,
    reason: row.reason,
    evidenceRefs: evidenceRefs(row.evidence_refs_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    supersedesCorrectionId: row.supersedes_correction_id,
    revertedAt: row.reverted_at,
    revertedBy: row.reverted_by,
    revertReason: row.revert_reason,
  };
}

export function toExtractedQuantityCorrectionDbRow(
  correction: ExtractedQuantityCorrection,
): ExtractedQuantityCorrectionInsertRow {
  return {
    ...(correction.id ? { id: correction.id } : {}),
    job_id: correction.jobId,
    run_id: correction.runId,
    extracted_quantity_id: correction.extractedQuantityId,
    visual_anchor_id: correction.visualAnchorId ?? null,
    action: correction.action,
    field: correction.field ?? null,
    before_json: correction.before as Json,
    after_json: correction.after as Json,
    reason: correction.reason,
    evidence_refs_json: correction.evidenceRefs as unknown as Json,
    created_by: correction.createdBy,
    created_at: correction.createdAt,
    supersedes_correction_id: correction.supersedesCorrectionId ?? null,
    reverted_at: correction.revertedAt ?? null,
    reverted_by: correction.revertedBy ?? null,
    revert_reason: correction.revertReason ?? null,
  };
}

export const EXTRACTED_QUANTITY_CORRECTION_ACTIONS: readonly ExtractedQuantityCorrectionAction[] = [
  "set_dimension",
  "set_count",
  "set_status",
  "set_label",
  "ignore_row",
  "keep_needs_review",
  "add_note",
];

export const EXTRACTED_QUANTITY_CORRECTION_STATUSES: readonly ExtractedQuantityStatus[] = [
  "extracted",
  "needs_review",
  "missing_evidence",
  "conflict",
  "ignored",
];
