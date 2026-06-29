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

export type OpeningTriageGroupId =
  | "clean"
  | "dirty_assembly"
  | "width_only"
  | "height_missing"
  | "face_elevation_check"
  | "missing_bbox"
  | "conflict"
  | "other_review";

export type OpeningTriageGroupDefinition = {
  id: OpeningTriageGroupId;
  label: string;
  explanation: string;
};

export type OpeningTriageRow = ExtractedQuantityExportRow & {
  hasOverlayMarker: boolean;
  evidencePage: number | null;
  evidenceBbox: [number, number, number, number] | null;
  triageGroups: OpeningTriageGroupId[];
};

export type OpeningTriageGroup = OpeningTriageGroupDefinition & {
  rows: OpeningTriageRow[];
};

export type OpeningTriageSummary = Record<OpeningTriageGroupId, number>;

export type ExtractedQuantityReviewSummary = {
  cleanExtracted: number;
  needsReview: number;
  missingEvidence: number;
  conflict: number;
  rowsWithOverlayMarkers: number;
  rowsWithoutOverlayMarkers: number;
  openingTriage: OpeningTriageSummary;
};

export type ExtractedQuantityOpeningTriage = {
  rows: OpeningTriageRow[];
  groups: OpeningTriageGroup[];
  summary: OpeningTriageSummary;
};

export type ExtractedQuantityReviewModel = {
  source: ExtractedQuantityAuthority["source"];
  runId: string | null;
  activeRunId: string | null;
  warnings: string[];
  readModel: ExtractedQuantityReadModel | null;
  sections: ExtractedQuantityReviewSection[];
  cleanTotals: ExtractedQuantityTotals;
  summary: ExtractedQuantityReviewSummary;
  openingTriage: ExtractedQuantityOpeningTriage;
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

const OPENING_CATEGORIES = new Set(["window", "opening", "exterior_door", "garage_door"]);

export const OPENING_TRIAGE_GROUPS: OpeningTriageGroupDefinition[] = [
  {
    id: "clean",
    label: "Clean",
    explanation: "Trusted extracted opening rows.",
  },
  {
    id: "dirty_assembly",
    label: "Dirty assembly",
    explanation:
      "Malformed, contaminated, multi-part, overlight, sidelight, or split-entry evidence.",
  },
  {
    id: "width_only",
    label: "Width only",
    explanation: "Width is visible but height is still unknown.",
  },
  {
    id: "height_missing",
    label: "Height missing",
    explanation: "Height or area is missing, so glass area is not clean.",
  },
  {
    id: "face_elevation_check",
    label: "Needs face/elevation check",
    explanation:
      "Useful evidence exists, but face, elevation, order, garage, or slider assignment needs review.",
  },
  {
    id: "missing_bbox",
    label: "No overlay marker",
    explanation: "No usable page and bbox evidence is available for an overlay marker.",
  },
  {
    id: "conflict",
    label: "Conflict",
    explanation: "Conflicting source evidence or conflict status.",
  },
  {
    id: "other_review",
    label: "Other review",
    explanation: "Needs review but does not match a more specific triage reason.",
  },
];

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

function usableBbox(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function firstOverlayEvidence(row: ExtractedQuantityExportRow): {
  page: number | null;
  bbox: [number, number, number, number] | null;
} {
  const evidence = row.evidence.find((item) => item.page != null && usableBbox(item.bbox));
  return {
    page: evidence?.page ?? null,
    bbox: usableBbox(evidence?.bbox) ? evidence.bbox : null,
  };
}

function rowReviewText(row: ExtractedQuantityExportRow): string {
  return [
    row.id,
    row.label ?? "",
    row.category,
    row.status,
    row.source,
    ...row.warnings,
    ...row.evidence.flatMap((item) => [
      item.source ?? "",
      item.text ?? "",
      item.witnessIds?.join(" ") ?? "",
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function isOpeningRow(row: ExtractedQuantityExportRow): boolean {
  return OPENING_CATEGORIES.has(row.category);
}

function emptyOpeningTriageSummary(): OpeningTriageSummary {
  return {
    clean: 0,
    dirty_assembly: 0,
    width_only: 0,
    height_missing: 0,
    face_elevation_check: 0,
    missing_bbox: 0,
    conflict: 0,
    other_review: 0,
  };
}

export function classifyOpeningTriageRow(row: ExtractedQuantityExportRow): OpeningTriageGroupId[] {
  const groups = new Set<OpeningTriageGroupId>();
  const text = rowReviewText(row);
  const hasOverlayMarker = firstOverlayEvidence(row).page != null;

  if (row.status === "extracted") groups.add("clean");
  if (
    row.status === "conflict" ||
    row.warnings.includes("source_conflict") ||
    /conflict/.test(text)
  ) {
    groups.add("conflict");
  }
  if (
    /malformed|contaminated|assembly|multi[- ]?part|sidelight|overlight|split entry|drafting issue/.test(
      text,
    )
  ) {
    groups.add("dirty_assembly");
  }
  if (row.widthMm != null && row.heightMm == null) groups.add("width_only");
  if (
    row.heightMm == null &&
    row.areaM2 == null &&
    (row.warnings.includes("height_not_extracted") ||
      row.warnings.includes("area_not_calculated") ||
      /height.*missing|height.*not extracted|area.*not calculated/.test(text))
  ) {
    groups.add("height_missing");
  }
  if (
    /face|elevation|room\/order|order assignment|assignment ambiguous|garage anchor|slider|garage door/.test(
      text,
    )
  ) {
    groups.add("face_elevation_check");
  }
  if (!hasOverlayMarker) groups.add("missing_bbox");

  const hasSpecificReviewReason = [...groups].some((group) => group !== "missing_bbox");
  if (row.status !== "extracted" && row.status !== "conflict" && !hasSpecificReviewReason) {
    groups.add("other_review");
  }

  return [...groups];
}

function buildOpeningTriage(
  readModel: ExtractedQuantityReadModel | null,
): ExtractedQuantityOpeningTriage {
  const rows = (readModel?.rows ?? []).filter(isOpeningRow).map((row) => {
    const overlay = firstOverlayEvidence(row);
    return {
      ...row,
      hasOverlayMarker: overlay.page != null && overlay.bbox != null,
      evidencePage: overlay.page,
      evidenceBbox: overlay.bbox,
      triageGroups: classifyOpeningTriageRow(row),
    };
  });
  const summary = emptyOpeningTriageSummary();
  for (const row of rows) {
    for (const group of row.triageGroups) summary[group] += 1;
  }

  return {
    rows,
    groups: OPENING_TRIAGE_GROUPS.map((group) => ({
      ...group,
      rows: rows.filter((row) => row.triageGroups.includes(group.id)),
    })),
    summary,
  };
}

function buildReviewSummary(
  readModel: ExtractedQuantityReadModel | null,
  openingTriage: ExtractedQuantityOpeningTriage,
): ExtractedQuantityReviewSummary {
  const rows = readModel?.rows ?? [];
  const rowsWithOverlayMarkers = rows.filter((row) => {
    const overlay = firstOverlayEvidence(row);
    return overlay.page != null && overlay.bbox != null;
  }).length;

  return {
    cleanExtracted: readModel?.groups.extracted.length ?? 0,
    needsReview: readModel?.groups.needs_review.length ?? 0,
    missingEvidence: readModel?.groups.missing_evidence.length ?? 0,
    conflict: readModel?.groups.conflict.length ?? 0,
    rowsWithOverlayMarkers,
    rowsWithoutOverlayMarkers: rows.length - rowsWithOverlayMarkers,
    openingTriage: openingTriage.summary,
  };
}

export function buildExtractedQuantityReviewModel(
  authority: ExtractedQuantityAuthority | null | undefined,
): ExtractedQuantityReviewModel {
  const readModel = authority?.readModel ?? null;
  const openingTriage = buildOpeningTriage(readModel);
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
    summary: buildReviewSummary(readModel, openingTriage),
    openingTriage,
  };
}
