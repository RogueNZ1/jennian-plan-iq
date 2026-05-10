/**
 * Safe normaliser for takeoff_runs.summary.
 *
 * The summary JSON is written by `run.ts` over time and may be missing or
 * partial on older runs. This helper guarantees a fully populated, render-safe
 * shape so the UI never displays NaN / undefined / null / [object Object].
 */

import type { TakeoffDiagnostics } from "./diagnostics";

export type PageClassification = {
  fileName: string;
  pageNumber: number;
  pageType: string;
  confidence: "high" | "mid" | "low";
  reason: string;
};

export type NormalizedSummary = {
  filesScanned: number;
  pagesScanned: number;

  quantitiesInserted: number;
  quantitiesRefreshed: number;
  quantityConflicts: number;

  openingsInserted: number;
  openingsRefreshed: number;

  moduleItemsInserted: number;
  moduleItemsRefreshed: number;
  moduleItemConflicts: number;

  reviewRequiredCount: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;

  errors: string[];
  warnings: string[];
  hasWarnings: boolean;

  workingPlanFileId: string | null;
  workingPlanFileName: string | null;
  workingPlanPageNumber: number | null;
  workingPlanPageType: string | null;
  workingPlanConfidence: "high" | "mid" | "low" | null;
  workingPlanStatus: "identified" | "candidate" | "not_identified";

  scaleText: string | null;
  scaleStatus:
    | "Auto-calibrated"
    | "Scale text detected — manual calibration required"
    | "Manual calibration required"
    | "No scale detected"
    | "Not checked";

  pageClassifications: PageClassification[];

  completedAt: string | null;

  diagnostics: TakeoffDiagnostics | null;

  resultType:
    | "text_takeoff_completed"
    | "specification_only_takeoff"
    | "limited_specification_takeoff"
    | "flattened_plan_vision_review_required"
    | "no_usable_text_found";
  flattenedPlanFiles: Array<{ fileId: string; fileName: string; pageSizes: string[]; pageCount: number }>;
  visionReviewRequired: boolean;
  visionReviewMarkedAt: string | null;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function pickFirst<T>(...vals: T[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}
function conf(v: unknown): "high" | "mid" | "low" | null {
  return v === "high" || v === "mid" || v === "low" ? v : null;
}

export function normalizeSummary(raw: unknown): NormalizedSummary {
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});

  const workingFileId = str(pickFirst(r.workingPlanFileId, r.workingFileId));
  const workingFileName = str(pickFirst(r.workingPlanFileName, r.workingFileName));
  const workingPageNumber = (() => {
    const v = pickFirst(r.workingPlanPageNumber, r.workingPageNumber);
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const workingPageType = str(pickFirst(r.workingPlanPageType, r.workingPageType));
  const workingConfidence = conf(pickFirst(r.workingPlanConfidence, r.workingPageConfidence));

  let workingStatus: NormalizedSummary["workingPlanStatus"] = "not_identified";
  if (workingFileId && workingFileName) {
    workingStatus = workingConfidence === "high" ? "identified" : "candidate";
  }
  const explicitStatus = str(r.workingPlanStatus);
  if (
    explicitStatus === "identified" ||
    explicitStatus === "candidate" ||
    explicitStatus === "not_identified"
  ) {
    workingStatus = explicitStatus;
  }

  const scaleText = str(r.scaleText);
  const calibrationId = str(r.calibrationId);
  let scaleStatus: NormalizedSummary["scaleStatus"];
  const rawScaleStatus = typeof r.scaleStatus === "string" ? r.scaleStatus : "";
  if (
    rawScaleStatus === "Auto-calibrated" ||
    rawScaleStatus === "Scale text detected — manual calibration required" ||
    rawScaleStatus === "Manual calibration required" ||
    rawScaleStatus === "No scale detected" ||
    rawScaleStatus === "Not checked"
  ) {
    scaleStatus = rawScaleStatus;
  } else if (calibrationId) {
    scaleStatus = "Auto-calibrated";
  } else if (scaleText) {
    scaleStatus = "Scale text detected — manual calibration required";
  } else if (workingStatus === "not_identified") {
    scaleStatus = "Not checked";
  } else {
    scaleStatus = "Manual calibration required";
  }

  return {
    filesScanned: num(r.filesScanned),
    pagesScanned: num(r.pagesScanned),

    quantitiesInserted: num(r.quantitiesInserted),
    quantitiesRefreshed: num(pickFirst(r.quantitiesRefreshed, r.quantitiesUpdated)),
    quantityConflicts: num(r.quantityConflicts),

    openingsInserted: num(r.openingsInserted),
    openingsRefreshed: num(pickFirst(r.openingsRefreshed, r.openingsSkipped)),

    moduleItemsInserted: num(r.moduleItemsInserted),
    moduleItemsRefreshed: num(pickFirst(r.moduleItemsRefreshed, r.moduleItemsUpdated)),
    moduleItemConflicts: num(r.moduleItemConflicts),

    reviewRequiredCount: num(r.reviewRequiredCount),
    highConfidenceCount: num(pickFirst(r.highConfidenceCount, r.highCount)),
    mediumConfidenceCount: num(pickFirst(r.mediumConfidenceCount, r.midCount)),
    lowConfidenceCount: num(pickFirst(r.lowConfidenceCount, r.lowCount)),

    errors: arr<string>(r.errors).filter((e): e is string => typeof e === "string"),
    warnings: arr<string>(r.warnings).filter((w): w is string => typeof w === "string"),
    hasWarnings: r.hasWarnings === true,

    workingPlanFileId: workingFileId,
    workingPlanFileName: workingFileName,
    workingPlanPageNumber: workingPageNumber,
    workingPlanPageType: workingPageType,
    workingPlanConfidence: workingConfidence,
    workingPlanStatus: workingStatus,

    scaleText,
    scaleStatus,

    pageClassifications: arr<unknown>(r.pageClassifications)
      .map((p): PageClassification | null => {
        if (!p || typeof p !== "object") return null;
        const o = p as Record<string, unknown>;
        const fileName = str(o.fileName);
        const pageNumber = num(o.pageNumber);
        if (!fileName || !pageNumber) return null;
        return {
          fileName,
          pageNumber,
          pageType: str(o.pageType) ?? "unknown",
          confidence: conf(o.confidence) ?? "low",
          reason: str(o.reason) ?? "",
        };
      })
      .filter((p): p is PageClassification => p !== null),

    completedAt: str(r.completedAt),

    diagnostics:
      r.diagnostics && typeof r.diagnostics === "object"
        ? (r.diagnostics as unknown as TakeoffDiagnostics)
        : null,

    resultType: (() => {
      const v = r.resultType;
      if (
        v === "text_takeoff_completed" ||
        v === "specification_only_takeoff" ||
        v === "limited_specification_takeoff" ||
        v === "flattened_plan_vision_review_required" ||
        v === "no_usable_text_found"
      ) return v;
      // Backward compat: if no resultType, infer from numeric fields.
      const total =
        num(r.quantitiesInserted) + num(pickFirst(r.quantitiesRefreshed, r.quantitiesUpdated)) +
        num(r.openingsInserted) + num(r.moduleItemsInserted);
      return total > 0 ? "text_takeoff_completed" : "no_usable_text_found";
    })(),

    flattenedPlanFiles: arr<unknown>(r.flattenedPlanFiles)
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const o = p as Record<string, unknown>;
        const fileId = str(o.fileId);
        const fileName = str(o.fileName);
        if (!fileId || !fileName) return null;
        return {
          fileId,
          fileName,
          pageSizes: arr<string>(o.pageSizes).filter((s): s is string => typeof s === "string"),
          pageCount: num(o.pageCount),
        };
      })
      .filter((p): p is { fileId: string; fileName: string; pageSizes: string[]; pageCount: number } => p !== null),

    visionReviewRequired: r.visionReviewRequired === true,
    visionReviewMarkedAt: str(r.visionReviewMarkedAt),
  };
}

export function isEmptyRun(s: NormalizedSummary): boolean {
  return (
    s.quantitiesInserted +
      s.quantitiesRefreshed +
      s.openingsInserted +
      s.openingsRefreshed +
      s.moduleItemsInserted +
      s.moduleItemsRefreshed ===
    0
  );
}