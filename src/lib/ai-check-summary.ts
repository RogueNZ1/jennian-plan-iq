import type { QSExportData } from "@/lib/iq-qs-export";
import type { VisualOpeningAuditSummary } from "@/lib/takeoff/visual-opening-audit";
import type { ExtractedQuantityReadModel } from "@/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantityAuthoritySource } from "@/lib/takeoff/extracted-quantity-authority";
import { EXTERNAL_WALL_AREA_BLOCKED, customerSafeText } from "@/lib/customer-facing-text";

export const AI_CHECK_SUMMARY_TITLE = "AI Takeoff Check";

export type AiCheckStatus = "ready" | "review_required";

export type AiCheckSummaryMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type AiCheckSummary = {
  title: typeof AI_CHECK_SUMMARY_TITLE;
  jobNumber: string;
  clientName: string;
  status: AiCheckStatus;
  statusLabel: string;
  runId: string | null;
  runIdShort: string | null;
  authoritySource: ExtractedQuantityAuthoritySource | "none";
  safeToUse: AiCheckSummaryMetric[];
  blocked: AiCheckSummaryMetric[];
  vision: {
    visualQsGlazedOpenings: number | null;
    cleanWindowRows: number;
    mismatchRequiresReview: boolean | null;
    line: string;
  };
  garage: {
    reviewOnly: boolean;
    dimension: string | null;
    line: string;
  };
  nextAction: string;
  mustNotPrice: string[];
  statusCounts: {
    clean: number;
    needsReview: number;
    missingEvidence: number;
    conflict: number;
    ignored: number;
  };
};

export type AiCheckSummaryOptions = {
  visualSummary?: VisualOpeningAuditSummary | null;
  runId?: string | null;
  authoritySource?: ExtractedQuantityAuthoritySource | "none" | null;
};

function num(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString("en-NZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function rounded(value: number, dp = 2): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

function areaM2(value: number): string {
  return `${num(rounded(value, 2), 2)} m2`;
}

function lengthLmFromMm(valueMm: number): string {
  return `${num(rounded(valueMm / 1000, 1), 1)} lm`;
}

function lengthLm(value: number): string {
  return `${num(rounded(value, 1), 1)} lm`;
}

function dimensionM(widthMm: number, heightMm: number): string {
  return `${num(rounded(widthMm / 1000, 2), 2)} x ${num(rounded(heightMm / 1000, 2), 2)}`;
}

function cleanRows(readModel: ExtractedQuantityReadModel | null | undefined) {
  return readModel?.groups.extracted ?? [];
}

function extractVisionCountFromFlags(data: QSExportData): number | null {
  for (const flagGroup of data.reviewFlags ?? []) {
    for (const flag of flagGroup.flags) {
      const text = String(flag);
      const rawMatch = text.match(/AI opening check found\s+(\d+)\s+QS-glazed/i);
      if (rawMatch) return Number(rawMatch[1]);
      const safeMatch = text.match(/review found\s+(\d+)\s+QS-glazed/i);
      if (safeMatch) return Number(safeMatch[1]);
      const visualMatch = text.match(/Visual QS found\s+(\d+)\s+QS-glazed/i);
      if (visualMatch) return Number(visualMatch[1]);
    }
  }
  return null;
}

function cleanWindowRows(readModel: ExtractedQuantityReadModel | null | undefined) {
  return cleanRows(readModel).filter((row) => row.category === "window");
}

function cleanWindowArea(readModel: ExtractedQuantityReadModel | null | undefined): number {
  return cleanWindowRows(readModel).reduce((sum, row) => sum + (row.areaM2 ?? 0), 0);
}

function interiorDoorCount(data: QSExportData, readModel: ExtractedQuantityReadModel | null) {
  const ledgerCount = readModel?.cleanTotalsByCategory.interior_door?.count;
  if (ledgerCount != null && ledgerCount > 0) return ledgerCount;
  return (
    data.intDoorStandard +
    data.intDoorUGroove +
    data.intDoorVGroove +
    data.intDoorBarnSlider +
    data.intDoorDouble +
    data.intDoorCavitySlider
  );
}

function exteriorPerimeterValue(data: QSExportData, readModel: ExtractedQuantityReadModel | null) {
  const ledgerMm = readModel?.cleanTotalsByCategory.exterior_perimeter?.lengthMm;
  if (ledgerMm != null && ledgerMm > 0) return lengthLmFromMm(ledgerMm);
  const fallbackLm = data.exteriorWallLengthLm ?? data.perimeterLm;
  return fallbackLm != null ? lengthLm(fallbackLm) : "not available";
}

function firstGarageDimension(
  readModel: ExtractedQuantityReadModel | null | undefined,
): string | null {
  const row = readModel?.rows.find(
    (candidate) =>
      candidate.category === "garage_door" &&
      candidate.widthMm != null &&
      candidate.heightMm != null,
  );
  return row?.widthMm != null && row.heightMm != null
    ? dimensionM(row.widthMm, row.heightMm)
    : null;
}

export function buildAiCheckSummary(
  data: QSExportData,
  options: AiCheckSummaryOptions = {},
): AiCheckSummary {
  const readModel = data.extractedQuantityReadModel ?? null;
  const windows = cleanWindowRows(readModel);
  const cleanWindowRowsCount = windows.length;
  const cleanWindowAreaM2 = cleanWindowArea(readModel);
  const visualQsGlazedOpenings =
    options.visualSummary?.qsGlazedOpenings ?? extractVisionCountFromFlags(data);
  const openingBlocked = data.openingPricingBlocked === true;
  const statusCounts = {
    clean: readModel?.groups.extracted.length ?? 0,
    needsReview: readModel?.groups.needs_review.length ?? 0,
    missingEvidence: readModel?.groups.missing_evidence.length ?? 0,
    conflict: readModel?.groups.conflict.length ?? 0,
    ignored: readModel?.groups.ignored.length ?? 0,
  };
  const hasReviewRows =
    statusCounts.needsReview + statusCounts.missingEvidence + statusCounts.conflict > 0;
  const mismatchRequiresReview =
    visualQsGlazedOpenings == null ? null : visualQsGlazedOpenings !== cleanWindowRowsCount;
  const status: AiCheckStatus = openingBlocked || hasReviewRows ? "review_required" : "ready";
  const garageDimension = firstGarageDimension(readModel);

  const safeToUse: AiCheckSummaryMetric[] = [
    {
      label: "Exterior perimeter",
      value: exteriorPerimeterValue(data, readModel),
    },
    {
      label: "Interior doors",
      value: String(interiorDoorCount(data, readModel)),
    },
  ];
  if (cleanWindowRowsCount > 0) {
    safeToUse.push({
      label: "Clean window evidence",
      value: `${cleanWindowRowsCount} rows / ${areaM2(cleanWindowAreaM2)}`,
      detail: "Review before pricing openings.",
    });
  }

  const blocked: AiCheckSummaryMetric[] = [];
  if (openingBlocked) {
    blocked.push({
      label: "External wall area / cladding",
      value: EXTERNAL_WALL_AREA_BLOCKED,
      detail: "Opening reconciliation unresolved.",
    });
    blocked.push({
      label: "Openings / pricing",
      value: "Blocked until exterior openings are reviewed",
    });
  }
  if (garageDimension && openingBlocked) {
    blocked.push({
      label: "Garage door",
      value: `${garageDimension} review only`,
      detail: "Not pushed into IQ Import pricing cells.",
    });
  }

  const visionLine =
    visualQsGlazedOpenings == null
      ? `Vision count unavailable; active clean extracted window rows ${cleanWindowRowsCount}; review exterior openings before pricing.`
      : `Vision found ${visualQsGlazedOpenings} likely QS-glazed external openings; active clean extracted window rows ${cleanWindowRowsCount}; ${
          mismatchRequiresReview
            ? "mismatch requires review"
            : "counts currently agree, still verify against plan evidence"
        }.`;

  const nextAction = openingBlocked
    ? "Review exterior openings in Extracted Quantities before pricing windows, openings, garage door, or cladding."
    : hasReviewRows
      ? "Review flagged extracted quantities before pricing affected scopes."
      : "Proceed with normal QS check against the plans.";

  return {
    title: AI_CHECK_SUMMARY_TITLE,
    jobNumber: customerSafeText(data.jobNumber || "Job"),
    clientName: customerSafeText(data.clientName || ""),
    status,
    statusLabel:
      status === "review_required" ? "REVIEW REQUIRED - openings unresolved" : "READY FOR QS CHECK",
    runId: options.runId ?? readModel?.activeRunId ?? readModel?.runIds[0] ?? null,
    runIdShort:
      (options.runId ?? readModel?.activeRunId ?? readModel?.runIds[0] ?? null)?.slice(0, 8) ??
      null,
    authoritySource: options.authoritySource ?? "none",
    safeToUse,
    blocked,
    vision: {
      visualQsGlazedOpenings,
      cleanWindowRows: cleanWindowRowsCount,
      mismatchRequiresReview,
      line: visionLine,
    },
    garage: {
      reviewOnly: openingBlocked && garageDimension != null,
      dimension: garageDimension,
      line: garageDimension
        ? `${garageDimension} garage door candidate found; ${
            openingBlocked
              ? "review only; not pushed into IQ Import pricing cells"
              : "available for normal QS check"
          }.`
        : "No garage door candidate with complete dimensions is available in the active ledger.",
    },
    nextAction,
    mustNotPrice: openingBlocked ? ["windows", "openings", "garage door", "cladding"] : [],
    statusCounts,
  };
}

export function aiCheckSummaryLines(summary: AiCheckSummary): string[] {
  const lines = [
    `${summary.title} - ${summary.jobNumber}`,
    `Status: ${summary.statusLabel}`,
    `Safe to use: ${summary.safeToUse.map((item) => `${item.label} ${item.value}`).join("; ")}`,
  ];
  if (summary.blocked.length > 0) {
    lines.push(
      `Blocked: ${summary.blocked.map((item) => `${item.label} ${item.value}`).join("; ")}.`,
    );
  }
  lines.push(`Vision check: ${summary.vision.line}`);
  if (summary.garage.dimension) lines.push(`Garage: ${summary.garage.line}`);
  lines.push(`Next action: ${summary.nextAction}`);
  if (summary.mustNotPrice.length > 0) {
    lines.push(
      `Do not price: ${summary.mustNotPrice.join(", ")} from this run until reconciliation is resolved.`,
    );
  }
  return lines.map(customerSafeText);
}

export function aiCheckSummaryWorkbookRows(summary: AiCheckSummary): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [
    [summary.title],
    ["Status", summary.statusLabel],
    ["Run", summary.runIdShort ?? "not available"],
    ["Authority", summary.authoritySource],
    [],
    ["Safe to use"],
    ...summary.safeToUse.map((item) => [item.label, item.value, item.detail ?? ""]),
  ];
  if (summary.blocked.length > 0) {
    rows.push(
      [],
      ["Blocked"],
      ...summary.blocked.map((item) => [item.label, item.value, item.detail ?? ""]),
    );
  }
  rows.push(
    [],
    ["Vision check", summary.vision.line],
    ["Garage", summary.garage.line],
    ["Next action", summary.nextAction],
  );
  if (summary.mustNotPrice.length > 0) {
    rows.push([
      "Do not price",
      `${summary.mustNotPrice.join(", ")} from this run until reconciliation is resolved.`,
    ]);
  }
  return rows.map((row) =>
    row.map((cell) => (typeof cell === "string" ? customerSafeText(cell) : cell)),
  );
}
