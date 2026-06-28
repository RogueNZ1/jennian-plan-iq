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

const EMPTY_TOTALS: ExtractedQuantityTotals = { count: 0, lengthMm: 0, areaM2: 0 };

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
