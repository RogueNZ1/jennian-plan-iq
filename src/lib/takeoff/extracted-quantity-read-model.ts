import type {
  ExtractedQuantity,
  ExtractedQuantityCategory,
  ExtractedQuantityEvidence,
  ExtractedQuantitySource,
  ExtractedQuantityStatus,
  ExtractedQuantityWarning,
} from "./extracted-quantity-ledger";

export type ExtractedQuantityExportRow = {
  id: string;
  jobId: string;
  runId?: string;
  category: ExtractedQuantityCategory;
  label?: string;
  count: number | null;
  widthMm: number | null;
  heightMm: number | null;
  lengthMm: number | null;
  areaM2: number | null;
  status: ExtractedQuantityStatus;
  confidence: number;
  warnings: ExtractedQuantityWarning[];
  source: ExtractedQuantitySource;
  evidence: ExtractedQuantityEvidence[];
};

export type ExtractedQuantityTotals = {
  count: number;
  lengthMm: number;
  areaM2: number;
};

export type ExtractedQuantityReadModel = {
  activeRunId?: string;
  runIds: string[];
  rows: ExtractedQuantityExportRow[];
  groups: Record<ExtractedQuantityStatus, ExtractedQuantityExportRow[]>;
  cleanTotals: ExtractedQuantityTotals;
  cleanTotalsByCategory: Partial<Record<ExtractedQuantityCategory, ExtractedQuantityTotals>>;
};

export type ExtractedQuantityReadModelOptions = {
  activeRunId?: string;
};

const STATUSES: ExtractedQuantityStatus[] = [
  "extracted",
  "needs_review",
  "missing_evidence",
  "conflict",
  "ignored",
];

function runKey(row: ExtractedQuantity): string {
  return row.runId ?? "__missing_run_id__";
}

function toExportRow(row: ExtractedQuantity): ExtractedQuantityExportRow {
  return {
    id: row.id,
    jobId: row.jobId,
    ...(row.runId ? { runId: row.runId } : {}),
    category: row.category,
    ...(row.label ? { label: row.label } : {}),
    count: row.count ?? null,
    widthMm: row.widthMm ?? null,
    heightMm: row.heightMm ?? null,
    lengthMm: row.lengthMm ?? null,
    areaM2: row.areaM2 ?? null,
    status: row.status,
    confidence: row.confidence,
    warnings: row.warnings,
    source: row.source,
    evidence: row.evidence,
  };
}

function emptyGroups(): Record<ExtractedQuantityStatus, ExtractedQuantityExportRow[]> {
  return {
    extracted: [],
    needs_review: [],
    missing_evidence: [],
    conflict: [],
    ignored: [],
  };
}

function addTotals(total: ExtractedQuantityTotals, row: ExtractedQuantityExportRow): void {
  total.count += row.count ?? 0;
  total.lengthMm += row.lengthMm ?? 0;
  total.areaM2 += row.areaM2 ?? 0;
}

function emptyTotals(): ExtractedQuantityTotals {
  return { count: 0, lengthMm: 0, areaM2: 0 };
}

export function buildExtractedQuantityReadModel(
  quantities: readonly ExtractedQuantity[] | null | undefined,
  options: ExtractedQuantityReadModelOptions = {},
): ExtractedQuantityReadModel {
  const sourceRows = quantities ?? [];
  const rowsForActiveRun = options.activeRunId
    ? sourceRows.filter((row) => row.runId === options.activeRunId)
    : sourceRows;
  const runKeys = [...new Set(rowsForActiveRun.map(runKey))];

  if (!options.activeRunId && runKeys.length > 1) {
    throw new Error(
      `Cannot build extracted quantity read model from multiple runIds without activeRunId: ${runKeys.join(", ")}`,
    );
  }

  const rows = rowsForActiveRun.map(toExportRow);
  const groups = emptyGroups();
  const cleanTotals = emptyTotals();
  const cleanTotalsByCategory: ExtractedQuantityReadModel["cleanTotalsByCategory"] = {};

  for (const status of STATUSES) {
    groups[status] = rows.filter((row) => row.status === status);
  }

  for (const row of groups.extracted) {
    addTotals(cleanTotals, row);
    const categoryTotals = cleanTotalsByCategory[row.category] ?? emptyTotals();
    addTotals(categoryTotals, row);
    cleanTotalsByCategory[row.category] = categoryTotals;
  }

  return {
    ...(options.activeRunId ? { activeRunId: options.activeRunId } : {}),
    runIds: [
      ...new Set(rowsForActiveRun.map((row) => row.runId).filter((id): id is string => !!id)),
    ],
    rows,
    groups,
    cleanTotals,
    cleanTotalsByCategory,
  };
}
