import type {
  ExtractedQuantity,
  ExtractedQuantityStatus,
  ExtractedQuantityWarning,
} from "./extracted-quantity-ledger";
import type {
  ExtractedQuantityExportRow,
  ExtractedQuantityReadModel,
} from "./extracted-quantity-read-model";
import { buildExtractedQuantityReadModel } from "./extracted-quantity-read-model";
import type {
  ExtractedQuantityCorrection,
  ExtractedQuantityCorrectionAction,
  ExtractedQuantityCorrectionField,
  ExtractedQuantityDimensionField,
} from "./extracted-quantity-corrections";

export type ExtractedQuantityCorrectionState =
  | "uncorrected"
  | "corrected"
  | "ignored_by_correction";

export type ExtractedQuantityOriginalValues = {
  label: string | null;
  count: number | null;
  widthMm: number | null;
  heightMm: number | null;
  lengthMm: number | null;
  areaM2: number | null;
  status: ExtractedQuantityStatus;
  warnings: ExtractedQuantityWarning[];
};

export type AppliedExtractedQuantityCorrection = {
  id: string;
  action: ExtractedQuantityCorrectionAction;
  field: ExtractedQuantityCorrectionField | null;
  before: unknown;
  after: unknown;
  reason: string;
  createdBy: string;
  createdAt: string;
  visualAnchorId: string | null;
};

export type ExtractedQuantityCorrectionMetadata = {
  correctionState: ExtractedQuantityCorrectionState;
  correctedFields: ExtractedQuantityCorrectionField[];
  corrections: AppliedExtractedQuantityCorrection[];
  original: ExtractedQuantityOriginalValues;
};

export type EffectiveExtractedQuantity = ExtractedQuantity & ExtractedQuantityCorrectionMetadata;

export type EffectiveExtractedQuantityExportRow = ExtractedQuantityExportRow &
  ExtractedQuantityCorrectionMetadata;

export type EffectiveExtractedQuantityReadModel = Omit<
  ExtractedQuantityReadModel,
  "rows" | "groups"
> & {
  rows: EffectiveExtractedQuantityExportRow[];
  groups: Record<ExtractedQuantityStatus, EffectiveExtractedQuantityExportRow[]>;
  effectiveRows: EffectiveExtractedQuantity[];
};

const DIMENSION_FIELDS = new Set<ExtractedQuantityDimensionField>([
  "widthMm",
  "heightMm",
  "lengthMm",
  "areaM2",
]);

const STATUSES = new Set<ExtractedQuantityStatus>([
  "extracted",
  "needs_review",
  "missing_evidence",
  "conflict",
  "ignored",
]);

function isDimensionField(
  field: ExtractedQuantityCorrectionField | null | undefined,
): field is ExtractedQuantityDimensionField {
  return DIMENSION_FIELDS.has(field as ExtractedQuantityDimensionField);
}

function originalValues(row: ExtractedQuantity): ExtractedQuantityOriginalValues {
  return {
    label: row.label ?? null,
    count: row.count ?? null,
    widthMm: row.widthMm ?? null,
    heightMm: row.heightMm ?? null,
    lengthMm: row.lengthMm ?? null,
    areaM2: row.areaM2 ?? null,
    status: row.status,
    warnings: [...row.warnings],
  };
}

function blankEffectiveRow(row: ExtractedQuantity): EffectiveExtractedQuantity {
  return {
    ...row,
    evidence: [...row.evidence],
    warnings: [...row.warnings],
    correctionState: "uncorrected",
    correctedFields: [],
    corrections: [],
    original: originalValues(row),
  };
}

function appliesToRow(row: ExtractedQuantity, correction: ExtractedQuantityCorrection): boolean {
  return (
    correction.revertedAt == null &&
    row.jobId === correction.jobId &&
    row.runId === correction.runId &&
    row.id === correction.extractedQuantityId
  );
}

function correctionOrder(
  corrections: readonly ExtractedQuantityCorrection[],
): ExtractedQuantityCorrection[] {
  return corrections
    .map((correction, index) => ({ correction, index }))
    .sort(
      (a, b) => a.correction.createdAt.localeCompare(b.correction.createdAt) || a.index - b.index,
    )
    .map(({ correction }) => correction);
}

function numberAfter(correction: ExtractedQuantityCorrection): number | null {
  if (correction.after == null) return null;
  if (typeof correction.after === "number" && Number.isFinite(correction.after)) {
    return correction.after;
  }
  throw new Error(`Invalid numeric correction value for ${correction.id}`);
}

function statusAfter(correction: ExtractedQuantityCorrection): ExtractedQuantityStatus {
  if (
    typeof correction.after === "string" &&
    STATUSES.has(correction.after as ExtractedQuantityStatus)
  ) {
    return correction.after as ExtractedQuantityStatus;
  }
  throw new Error(`Invalid status correction value for ${correction.id}`);
}

function labelAfter(correction: ExtractedQuantityCorrection): string | undefined {
  if (correction.after == null) return undefined;
  if (typeof correction.after === "string") return correction.after;
  throw new Error(`Invalid label correction value for ${correction.id}`);
}

function addCorrectedField(
  row: EffectiveExtractedQuantity,
  field: ExtractedQuantityCorrectionField,
): void {
  if (!row.correctedFields.includes(field)) row.correctedFields.push(field);
}

function recordCorrection(
  row: EffectiveExtractedQuantity,
  correction: ExtractedQuantityCorrection,
  field: ExtractedQuantityCorrectionField | null,
  state: ExtractedQuantityCorrectionState = "corrected",
): void {
  row.correctionState =
    state === "ignored_by_correction" || row.correctionState === "ignored_by_correction"
      ? "ignored_by_correction"
      : "corrected";
  if (field) addCorrectedField(row, field);
  row.corrections.push({
    id: correction.id,
    action: correction.action,
    field,
    before: correction.before,
    after: correction.after,
    reason: correction.reason,
    createdBy: correction.createdBy,
    createdAt: correction.createdAt,
    visualAnchorId: correction.visualAnchorId ?? null,
  });
}

function applyOne(
  row: EffectiveExtractedQuantity,
  correction: ExtractedQuantityCorrection,
): EffectiveExtractedQuantity {
  if (correction.action === "set_dimension") {
    if (!isDimensionField(correction.field)) {
      throw new Error(`set_dimension correction ${correction.id} requires a dimension field`);
    }
    const next = { ...row, [correction.field]: numberAfter(correction) };
    recordCorrection(next, correction, correction.field);
    return next;
  }

  if (correction.action === "set_count") {
    const next = { ...row, count: numberAfter(correction) ?? undefined };
    recordCorrection(next, correction, "count");
    return next;
  }

  if (correction.action === "set_status") {
    const next = { ...row, status: statusAfter(correction) };
    recordCorrection(next, correction, "status");
    return next;
  }

  if (correction.action === "set_label") {
    const next = { ...row, label: labelAfter(correction) };
    recordCorrection(next, correction, "label");
    return next;
  }

  if (correction.action === "ignore_row") {
    const next = { ...row, status: "ignored" as ExtractedQuantityStatus };
    recordCorrection(next, correction, "status", "ignored_by_correction");
    return next;
  }

  if (correction.action === "keep_needs_review") {
    const next = { ...row, status: "needs_review" as ExtractedQuantityStatus };
    recordCorrection(next, correction, "reviewNote");
    addCorrectedField(next, "status");
    return next;
  }

  recordCorrection(row, correction, "reviewNote");
  return row;
}

function metadataKey(row: { jobId: string; runId?: string; id: string }): string {
  return `${row.jobId}:${row.runId ?? ""}:${row.id}`;
}

function toEffectiveExportRow(
  row: ExtractedQuantityExportRow,
  metadata: ExtractedQuantityCorrectionMetadata,
): EffectiveExtractedQuantityExportRow {
  return {
    ...row,
    correctionState: metadata.correctionState,
    correctedFields: [...metadata.correctedFields],
    corrections: metadata.corrections.map((correction) => ({ ...correction })),
    original: {
      ...metadata.original,
      warnings: [...metadata.original.warnings],
    },
  };
}

function effectiveGroups(
  rows: EffectiveExtractedQuantityExportRow[],
): Record<ExtractedQuantityStatus, EffectiveExtractedQuantityExportRow[]> {
  return {
    extracted: rows.filter((row) => row.status === "extracted"),
    needs_review: rows.filter((row) => row.status === "needs_review"),
    missing_evidence: rows.filter((row) => row.status === "missing_evidence"),
    conflict: rows.filter((row) => row.status === "conflict"),
    ignored: rows.filter((row) => row.status === "ignored"),
  };
}

export function applyExtractedQuantityCorrections(
  rows: readonly ExtractedQuantity[],
  corrections: readonly ExtractedQuantityCorrection[],
): EffectiveExtractedQuantity[] {
  const ordered = correctionOrder(corrections);
  return rows.map((sourceRow) => {
    let effective = blankEffectiveRow(sourceRow);
    for (const correction of ordered) {
      if (appliesToRow(sourceRow, correction)) effective = applyOne(effective, correction);
    }
    return effective;
  });
}

export function buildEffectiveExtractedQuantityReadModel(
  rows: readonly ExtractedQuantity[],
  corrections: readonly ExtractedQuantityCorrection[],
  options: { activeRunId?: string } = {},
): EffectiveExtractedQuantityReadModel {
  const effectiveRows = applyExtractedQuantityCorrections(rows, corrections);
  const effectiveRowsForModel = options.activeRunId
    ? effectiveRows.filter((row) => row.runId === options.activeRunId)
    : effectiveRows;
  const base = buildExtractedQuantityReadModel(effectiveRows, options);
  const metadata = new Map(
    effectiveRows.map((row) => [
      metadataKey(row),
      {
        correctionState: row.correctionState,
        correctedFields: row.correctedFields,
        corrections: row.corrections,
        original: row.original,
      },
    ]),
  );
  const exportRows = base.rows.map((row) => {
    const rowMetadata = metadata.get(metadataKey(row));
    if (!rowMetadata) {
      throw new Error(`Missing effective correction metadata for ${row.id}`);
    }
    return toEffectiveExportRow(row, rowMetadata);
  });

  return {
    ...base,
    rows: exportRows,
    groups: effectiveGroups(exportRows),
    effectiveRows: effectiveRowsForModel,
  };
}
