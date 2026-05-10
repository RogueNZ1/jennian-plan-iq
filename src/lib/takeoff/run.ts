/**
 * Phase A — Automatic Takeoff orchestrator.
 *
 * Runs the full text-only pipeline:
 *   classify pages → pick working plan → detect scale → extract quantities
 *   → extract openings → persist draft IQ Core values → populate modules.
 *
 * Safety: never confirms anything, never overwrites approved_value, never
 * writes geometry it didn't extract. Re-runs are idempotent.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { extractFile, loadJobFiles, type ExtractedFile } from "./pdf-text";
import { classifyPageWithType, pickWorkingPage, type ClassifiedPage } from "./classify";
import { detectScaleFromText, writeCalibration } from "./scale";
import { extractQuantitiesFromFile, persistQuantity, type ExtractedQty } from "./extract-quantities";
import { extractOpeningsFromFile, persistOpening, type ExtractedOpening } from "./extract-openings";
import { extractSpecRowsFromFile, type SpecRow } from "./extract-spec";
import { populateModulesFromTakeoff } from "./populate-modules";
import { seedAllModulesForJob } from "@/lib/iq-modules";
import type { PageClassification } from "./summary";
import {
  buildPageDiagnostic, runQuantityChecks, runOpeningChecks, runSpecChecks, deriveOutcome,
  type FileDiagnostic, type TakeoffDiagnostics,
} from "./diagnostics";

export type TakeoffStep =
  | "reviewing_files"
  | "identifying_floorplan"
  | "reading_scale"
  | "preparing_quantities"
  | "preparing_modules"
  | "ready";

export type TakeoffProgress = {
  step: TakeoffStep;
  message: string;
};

export type TakeoffSummary = {
  runId: string;
  filesScanned: number;
  pagesScanned: number;
  workingFileId: string | null;
  workingFileName: string | null;
  workingPageNumber: number | null;
  workingPageType: string | null;
  workingPageConfidence: "high" | "mid" | "low" | null;
  scaleText: string | null;
  scaleStatus: string;
  calibrationId: string | null;
  quantitiesInserted: number;
  quantitiesUpdated: number;
  quantityConflicts: number;
  openingsInserted: number;
  openingsSkipped: number;
  moduleItemsInserted: number;
  moduleItemsUpdated: number;
  moduleItemConflicts: number;
  reviewRequiredCount: number;
  highCount: number;
  midCount: number;
  lowCount: number;
  errors: string[];
  warnings: string[];
  hasWarnings: boolean;
  completedAt: string | null;
  pageClassifications: PageClassification[];
  diagnostics: TakeoffDiagnostics | null;
  /** High-level result classification for the user. */
  resultType:
    | "text_takeoff_completed"
    | "specification_only_takeoff"
    | "limited_specification_takeoff"
    | "flattened_plan_vision_review_required"
    | "no_usable_text_found";
  /** Plan files (A1/A2/A3) where every plan page returned 0 chars. */
  flattenedPlanFiles: Array<{ fileId: string; fileName: string; pageSizes: string[]; pageCount: number }>;
  visionReviewRequired: boolean;
  visionReviewMarkedAt: string | null;
};

async function logAudit(entry: {
  jobId: string;
  userId: string;
  action: string;
  notes?: string | null;
  newValue?: string | null;
}) {
  await supabase.from("audit_logs").insert({
    actor_user_id: entry.userId,
    action: entry.action,
    table_name: "takeoff_runs",
    record_id: entry.jobId,
    new_value: entry.newValue ? { value: entry.newValue } : null,
    metadata: entry.notes ? { notes: entry.notes } : null,
  });
}

export async function runAutomaticTakeoff(args: {
  jobId: string;
  onProgress?: (p: TakeoffProgress) => void;
}): Promise<TakeoffSummary> {
  const { jobId, onProgress } = args;
  const progress = (step: TakeoffStep, message: string) =>
    onProgress?.({ step, message });

  const { data: userResp } = await supabase.auth.getUser();
  const userId = userResp.user?.id;
  if (!userId) throw new Error("You must be signed in to run automatic takeoff.");

  await seedAllModulesForJob(jobId);

  // Create takeoff_runs row
  const { data: runRow, error: runErr } = await supabase
    .from("takeoff_runs")
    .insert({
      job_id: jobId,
      started_by: userId,
      status: "running",
      summary: {},
    })
    .select("id")
    .single();
  if (runErr || !runRow) throw runErr ?? new Error("Could not create takeoff run.");
  const runId = runRow.id as string;

  await logAudit({ jobId, userId, action: "automatic_takeoff_started" });

  try {
    progress("reviewing_files", "Reviewing uploaded files…");
    const errors: string[] = [];
    const warnings: string[] = [];
    const files = await loadJobFiles(jobId);
    const fileDiagnostics: FileDiagnostic[] = [];
    if (files.length === 0) {
      const summary: TakeoffSummary = emptySummary(runId);
      summary.warnings.push("No uploaded files found for this job.");
      summary.hasWarnings = true;
      summary.completedAt = new Date().toISOString();
      summary.diagnostics = {
        jobId, uploadedFileCount: 0, includedFileCount: 0, files: [],
        quantityChecks: [], openings: { pairsFound: 0, bareDoorsFound: 0, ignored: 0, duplicatesRemoved: 0, rowsCreated: 0, candidates: [] },
        totalCharsExtracted: 0, pagesWithText: 0, pagesWithoutText: 0,
        outcome: "no_files",
        outcomeMessage: "No uploaded files found for this job.",
      };
      await supabase.from("takeoff_runs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        summary: summary as unknown as Json,
        error_message: "No uploaded files found.",
      }).eq("id", runId);
      await logAudit({ jobId, userId, action: "automatic_takeoff_completed", notes: "no files" });
      return summary;
    }

    const extracted: ExtractedFile[] = [];
    for (const f of files) {
      const isPlanOrSpec = f.file_type === "plan" || f.file_type === "specification";
      if (!isPlanOrSpec) {
        fileDiagnostics.push({
          fileId: f.id, fileName: f.file_name, fileType: f.file_type,
          storagePath: f.storage_url, storageStatus: "ok", storageError: null,
          included: false,
          inclusionReason: `Excluded — file_type "${f.file_type}" is not a plan or specification.`,
          pageCount: 0, pages: [],
        });
        continue;
      }
      try {
        const ef = await extractFile({
          fileId: f.id,
          fileName: f.file_name,
          fileType: f.file_type as "plan" | "specification",
          storagePath: f.storage_url,
        });
        extracted.push(ef);
        fileDiagnostics.push({
          fileId: f.id, fileName: f.file_name, fileType: f.file_type,
          storagePath: f.storage_url, storageStatus: "ok", storageError: null,
          included: true,
          inclusionReason: `Included — file_type "${f.file_type}".`,
          pageCount: ef.pages.length,
          pages: [], // filled after classification
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        errors.push(`Failed to read file: ${f.file_name} — ${msg}`);
        fileDiagnostics.push({
          fileId: f.id, fileName: f.file_name, fileType: f.file_type,
          storagePath: f.storage_url, storageStatus: "download_error", storageError: msg,
          included: false,
          inclusionReason: `Excluded — could not read PDF (${msg}).`,
          pageCount: 0, pages: [],
        });
      }
    }

    progress("identifying_floorplan", "Identifying floorplan…");
    const classified = extracted.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      fileType: file.fileType,
      pages: file.pages.map<ClassifiedPage>((p) =>
        classifyPageWithType(p, file.fileType)),
      rawPages: file.pages,
    }));

    const pageClassifications: PageClassification[] = classified.flatMap((c) =>
      c.pages.map<PageClassification>((p) => ({
        fileName: c.fileName,
        pageNumber: p.pageNumber,
        pageType: p.pageType,
        confidence: p.confidence,
        reason: p.reason,
      })),
    );

    // Fill per-page diagnostics into the matching file diagnostic entries.
    for (const c of classified) {
      const fd = fileDiagnostics.find((d) => d.fileId === c.fileId);
      if (!fd) continue;
      fd.pages = c.rawPages.map((rp) => {
        const cp = c.pages.find((p) => p.pageNumber === rp.pageNumber);
        return buildPageDiagnostic(
          rp,
          cp ?? { pageNumber: rp.pageNumber, pageType: "Unknown", confidence: "low", reason: "" },
          null,
        );
      });
    }

    const planClass = classified
      .filter((c) => c.fileType === "plan")
      .map((c) => ({ fileId: c.fileId, fileName: c.fileName, pages: c.pages }));
    const picked = pickWorkingPage(planClass);

    let workingFileId: string | null = null;
    let workingFileName: string | null = null;
    let workingPageNumber: number | null = null;
    let workingPageType: string | null = null;
    let workingPageConf: "high" | "mid" | "low" | null = null;

    if (picked) {
      workingFileId = picked.fileId;
      workingFileName = picked.fileName;
      workingPageNumber = picked.page.pageNumber;
      workingPageType = picked.page.pageType;
      workingPageConf = picked.page.confidence;
      await supabase.from("jobs").update({
        working_plan_file_id: workingFileId,
        working_plan_page_number: workingPageNumber,
      }).eq("id", jobId);
      await logAudit({
        jobId, userId, action: "working_plan_selected",
        notes: `${picked.fileName} p${picked.page.pageNumber} — ${picked.page.pageType} (${picked.page.confidence})`,
      });
    }

    progress("reading_scale", "Reading scale and dimensions…");
    let scaleText: string | null = null;
    let scaleStatus = "Manual Calibration Required";
    let calibrationId: string | null = null;

    if (picked) {
      const file = classified.find((c) => c.fileId === picked.fileId);
      const rawPage = file?.rawPages.find((p) => p.pageNumber === picked.page.pageNumber);
      if (rawPage) {
        const scale = detectScaleFromText(rawPage);
        scaleText = scale.scaleText;
        scaleStatus = scale.status;
        if (scale.pixelsPerMm != null) {
          try {
            calibrationId = await writeCalibration({
              jobId, fileId: picked.fileId, pageNumber: rawPage.pageNumber, scale, userId,
            });
            await logAudit({
              jobId, userId, action: "scale_detected",
              notes: `${scale.scaleText} · ${scale.status}`,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "unknown error";
            errors.push(`Failed to persist scale calibration (${scale.scaleText}) — ${msg}`);
          }
        }
      }
    }

    progress("preparing_quantities", "Preparing draft quantities…");
    const allQty: ExtractedQty[] = [];
    const allOpenings: ExtractedOpening[] = [];
    const allSpecRows: SpecRow[] = [];
    for (const f of extracted) {
      allQty.push(...extractQuantitiesFromFile(f));
      allOpenings.push(...extractOpeningsFromFile(f));
      allSpecRows.push(...extractSpecRowsFromFile(f));
    }

    let qInserted = 0, qUpdated = 0, qConflicts = 0;
    for (const q of allQty) {
      try {
        const r = await persistQuantity({ jobId, q });
        if (r.status === "inserted") qInserted++;
        else if (r.status === "updated") qUpdated++;
        else if (r.status === "conflict") qConflicts++;
        if (r.status === "inserted") {
          await logAudit({ jobId, userId, action: "quantity_created", notes: `${q.label}=${q.value}${q.unit}` });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        const where = q.page != null ? ` on page ${q.page}` : "";
        errors.push(`Failed to persist quantity: ${q.label} = ${q.value}${q.unit}${where} — ${msg}`);
      }
    }

    let oInserted = 0, oSkipped = 0;
    for (const o of allOpenings) {
      try {
        const r = await persistOpening({ jobId, createdBy: userId, o });
        if (r.status === "inserted") {
          oInserted++;
          await logAudit({ jobId, userId, action: "opening_created", notes: `${o.kind} ${o.width_mm}${o.height_mm ? `×${o.height_mm}` : ""}` });
        } else {
          oSkipped++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        const dims = `${o.width_mm}${o.height_mm ? ` x ${o.height_mm}` : ""}`;
        const where = o.page != null ? ` on page ${o.page}` : "";
        errors.push(`Failed to persist opening: ${dims}${where} — ${msg}`);
      }
    }

    progress("preparing_modules", "Preparing module review items…");
    const mod = await populateModulesFromTakeoff({
      jobId, quantities: allQty, openings: allOpenings, specRows: allSpecRows, takeoffRunId: runId,
    });
    if (mod.errors.length > 0) errors.push(...mod.errors);
    if (mod.inserted > 0) {
      await logAudit({ jobId, userId, action: "module_item_created", notes: `${mod.inserted} draft items` });
    }

    // Confidence + review counts across module_items + extracted_quantities for this job.
    const [{ data: mi }, { data: eq }] = await Promise.all([
      supabase.from("module_items").select("confidence, review_status").eq("job_id", jobId),
      supabase.from("extracted_quantities").select("confidence, review_status").eq("job_id", jobId),
    ]);
    const all = [
      ...((mi ?? []) as Array<{ confidence: string | null; review_status: string | null }>),
      ...((eq ?? []) as Array<{ confidence: string | null; review_status: string | null }>),
    ];
    const reviewRequiredCount = all.filter((r) => r.review_status === "review_required").length;
    const highCount = all.filter((r) => r.confidence === "high").length;
    const midCount = all.filter((r) => r.confidence === "mid").length;
    const lowCount = all.filter((r) => r.confidence === "low").length;

    progress("ready", "Ready for review.");

    const totalRows = qInserted + oInserted + mod.inserted;
    if (totalRows === 0) {
      warnings.push("No quantities, openings, or module items were extracted from the uploaded files.");
    }
    const hasWarnings = errors.length > 0 || warnings.length > 0;
    const completedAt = new Date().toISOString();

    // Diagnostics
    const quantityChecks = runQuantityChecks(extracted);
    const openingDiagnostics = runOpeningChecks(extracted, oInserted);
    const totalChars = extracted.reduce(
      (s, f) => s + f.pages.reduce((ss, p) => ss + (p.text?.length ?? 0), 0), 0,
    );
    const pagesWithText = extracted.reduce(
      (s, f) => s + f.pages.filter((p) => (p.text?.length ?? 0) > 0).length, 0,
    );
    const pagesWithoutText = extracted.reduce(
      (s, f) => s + f.pages.filter((p) => (p.text?.length ?? 0) === 0).length, 0,
    );
    const { outcome, outcomeMessage } = deriveOutcome({
      fileCount: files.length,
      pagesWithText,
      pagesWithoutText,
      quantityMatchCount: quantityChecks.filter((q) => q.found).length,
      openingMatchCount: openingDiagnostics.candidates.filter((c) => c.included).length,
      moduleRowsInserted: mod.inserted,
      errorsCount: errors.length,
    });
    const diagnostics: TakeoffDiagnostics = {
      jobId,
      uploadedFileCount: files.length,
      includedFileCount: fileDiagnostics.filter((f) => f.included).length,
      files: fileDiagnostics,
      quantityChecks,
      openings: openingDiagnostics,
      totalCharsExtracted: totalChars,
      pagesWithText,
      pagesWithoutText,
      outcome,
      outcomeMessage,
    };

    // Flattened plan detection: plan files where every plan page is A1/A2/A3
    // and has zero extracted characters.
    const flattenedPlanFiles: TakeoffSummary["flattenedPlanFiles"] = [];
    for (const ef of extracted) {
      if (ef.fileType !== "plan") continue;
      if (ef.pages.length === 0) continue;
      const planPages = ef.pages;
      const allLargeFlatten = planPages.every(
        (p) => (p.text?.length ?? 0) === 0 &&
          (p.pageSize === "A1" || p.pageSize === "A2" || p.pageSize === "A3"),
      );
      if (allLargeFlatten) {
        flattenedPlanFiles.push({
          fileId: ef.fileId,
          fileName: ef.fileName,
          pageSizes: Array.from(new Set(planPages.map((p) => p.pageSize))),
          pageCount: planPages.length,
        });
      }
    }

    const specOnlyMatches = allSpecRows.length > 0 || quantityChecks.some((q) => q.found);
    const planTextChars = extracted
      .filter((f) => f.fileType === "plan")
      .reduce((s, f) => s + f.pages.reduce((ss, p) => ss + (p.text?.length ?? 0), 0), 0);
    const planFiles = extracted.filter((f) => f.fileType === "plan");
    const hasPlanFiles = planFiles.length > 0;
    const planTextless = hasPlanFiles && planTextChars === 0;

    let resultType: TakeoffSummary["resultType"];
    if (flattenedPlanFiles.length > 0 && !specOnlyMatches) {
      resultType = "flattened_plan_vision_review_required";
    } else if (flattenedPlanFiles.length > 0 && specOnlyMatches) {
      resultType = "specification_only_takeoff";
    } else if (planTextless && specOnlyMatches) {
      resultType = "specification_only_takeoff";
    } else if (specOnlyMatches || mod.inserted > 0 || qInserted > 0 || oInserted > 0) {
      resultType = "text_takeoff_completed";
    } else {
      resultType = "no_usable_text_found";
    }
    if (flattenedPlanFiles.length > 0 && resultType === "specification_only_takeoff") {
      warnings.push(
        `${flattenedPlanFiles.length} plan ${flattenedPlanFiles.length === 1 ? "file appears" : "files appear"} to be flattened images — vision review required for plan measurements.`,
      );
    } else if (resultType === "flattened_plan_vision_review_required") {
      warnings.push(
        "Plan pages appear to be flattened images. Text-based takeoff cannot read dimensions from these drawings. OCR / vision review is required.",
      );
    }
    const hasWarnings2 = errors.length > 0 || warnings.length > 0;

    const summary: TakeoffSummary = {
      runId,
      filesScanned: extracted.length,
      pagesScanned: extracted.reduce((s, f) => s + f.pages.length, 0),
      workingFileId, workingFileName, workingPageNumber, workingPageType,
      workingPageConfidence: workingPageConf,
      scaleText, scaleStatus, calibrationId,
      quantitiesInserted: qInserted,
      quantitiesUpdated: qUpdated,
      quantityConflicts: qConflicts,
      openingsInserted: oInserted,
      openingsSkipped: oSkipped,
      moduleItemsInserted: mod.inserted,
      moduleItemsUpdated: mod.updated,
      moduleItemConflicts: mod.conflicts,
      reviewRequiredCount,
      highCount, midCount, lowCount,
      errors,
      warnings,
      hasWarnings: hasWarnings2,
      completedAt,
      pageClassifications,
      diagnostics,
      resultType,
      flattenedPlanFiles,
      visionReviewRequired: false,
      visionReviewMarkedAt: null,
    };

    await supabase.from("takeoff_runs").update({
      status: hasWarnings2 ? "completed_with_warnings" : "completed",
      completed_at: completedAt,
      working_file_id: workingFileId,
      working_page_number: workingPageNumber,
      working_page_type: workingPageType,
      classification_confidence: workingPageConf,
      scale_text: scaleText,
      calibration_id: calibrationId,
      summary: summary as unknown as Json,
      error_message: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
    }).eq("id", runId);

    await logAudit({ jobId, userId, action: "automatic_takeoff_completed",
      notes: `${qInserted} quantities · ${oInserted} openings · ${mod.inserted} module items${errors.length ? ` · ${errors.length} errors` : ""}` });

    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown takeoff failure.";
    await supabase.from("takeoff_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: msg,
    }).eq("id", runId);
    await logAudit({ jobId, userId, action: "automatic_takeoff_failed", notes: msg });
    throw err;
  }
}

function emptySummary(runId: string): TakeoffSummary {
  return {
    runId,
    filesScanned: 0, pagesScanned: 0,
    workingFileId: null, workingFileName: null,
    workingPageNumber: null, workingPageType: null,
    workingPageConfidence: null,
    scaleText: null, scaleStatus: "Manual Calibration Required",
    calibrationId: null,
    quantitiesInserted: 0, quantitiesUpdated: 0, quantityConflicts: 0,
    openingsInserted: 0, openingsSkipped: 0,
    moduleItemsInserted: 0, moduleItemsUpdated: 0, moduleItemConflicts: 0,
    reviewRequiredCount: 0, highCount: 0, midCount: 0, lowCount: 0,
    errors: [], warnings: [], hasWarnings: false, completedAt: null,
    pageClassifications: [],
    diagnostics: null,
    resultType: "no_usable_text_found",
    flattenedPlanFiles: [],
    visionReviewRequired: false,
    visionReviewMarkedAt: null,
  };
}

export type LatestTakeoffRun = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: TakeoffSummary | null;
  error_message: string | null;
};

export async function loadLatestTakeoffRun(jobId: string): Promise<LatestTakeoffRun | null> {
  const { data } = await supabase
    .from("takeoff_runs")
    .select("id, status, started_at, completed_at, summary, error_message")
    .eq("job_id", jobId)
    .order("started_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id as string,
    status: row.status as string,
    started_at: row.started_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    summary: (row.summary as unknown as TakeoffSummary | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
  };
}
