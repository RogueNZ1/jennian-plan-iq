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
import { toJson } from "@/lib/type-helpers";
import type { TakeoffJsonWriter } from "./persist-takeoff";
import { extractFile, loadJobFiles, type ExtractedFile } from "./pdf-text";
import { classifyPageWithType, pickWorkingPage, type ClassifiedPage } from "./classify";
import {
  pickElevationPage,
  pickWindowSchedule,
  scoreFor,
  type PageType,
  type SupportingPage,
} from "@/lib/pdf-page-classify";
import { detectScaleFromText, writeCalibration } from "./scale";
import {
  extractQuantitiesFromFile,
  persistQuantity,
  type ExtractedQty,
} from "./extract-quantities";
import { extractOpeningsFromFile, persistOpening, type ExtractedOpening } from "./extract-openings";
import { extractSpecRowsFromFile, type SpecRow } from "./extract-spec";
import { populateModulesFromTakeoff } from "./populate-modules";
import { loadVisualOpeningCorrectionPromptMemory } from "./visual-opening-correction-hints";
import { seedAllModulesForJob } from "@/lib/iq-modules";
import type { PageClassification } from "./summary";
import {
  buildPageDiagnostic,
  runQuantityChecks,
  runOpeningChecks,
  runSpecChecks,
  deriveOutcome,
  type FileDiagnostic,
  type TakeoffDiagnostics,
} from "./diagnostics";

type SupportingEvidencePage = {
  fileId: string;
  fileName: string;
  pageNumber: number;
};

type ClassifiedRunFile = {
  fileId: string;
  fileName: string;
  fileType: "plan" | "specification";
  pages: ClassifiedPage[];
};

function toSharedPageType(pageType: ClassifiedPage["pageType"]): PageType {
  switch (pageType) {
    case "Dimension Floorplan":
      return "dimension_floor_plan";
    case "Floorplan":
      return "floor_plan";
    case "Site Plan":
      return "site_plan";
    case "Elevations":
      return "elevations";
    case "Sections":
      return "sections";
    case "Roof Plan":
      return "roofing";
    case "Electrical Plan":
      return "electrical";
    case "Plumbing Plan":
      return "plumbing";
    case "Schedule":
      return "window_schedule";
    case "Legend":
      return "legends";
    case "Specification":
      return "details";
    case "Cover Page":
    case "Unknown":
    default:
      return "unknown";
  }
}

function toSupportingPages(pages: readonly ClassifiedPage[]): SupportingPage[] {
  return pages.map((page) => {
    const pageType = toSharedPageType(page.pageType);
    return {
      pageType,
      confidence: page.confidence,
      score: scoreFor(pageType, page.confidence),
      excerpt: page.reason,
    };
  });
}

function pickSupportingEvidencePage(
  classified: readonly ClassifiedRunFile[],
  kind: "elevations" | "schedule",
  preferredFileId: string | null,
): SupportingEvidencePage | null {
  const planFiles = classified
    .filter((file) => file.fileType === "plan")
    .sort((a, b) => {
      const ap = preferredFileId != null && a.fileId === preferredFileId ? 0 : 1;
      const bp = preferredFileId != null && b.fileId === preferredFileId ? 0 : 1;
      return ap - bp || a.fileName.localeCompare(b.fileName);
    });

  for (const file of planFiles) {
    const supportingPages = toSupportingPages(file.pages);
    const pick =
      kind === "elevations"
        ? pickElevationPage(supportingPages)
        : pickWindowSchedule(supportingPages);
    const page = pick != null ? file.pages[pick.index] : undefined;
    if (page) {
      return {
        fileId: file.fileId,
        fileName: file.fileName,
        pageNumber: page.pageNumber,
      };
    }
  }
  return null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
  flattenedPlanFiles: Array<{
    fileId: string;
    fileName: string;
    pageSizes: string[];
    pageCount: number;
  }>;
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
  const progress = (step: TakeoffStep, message: string) => onProgress?.({ step, message });

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
        jobId,
        uploadedFileCount: 0,
        includedFileCount: 0,
        files: [],
        quantityChecks: [],
        specChecks: [],
        openings: {
          pairsFound: 0,
          bareDoorsFound: 0,
          ignored: 0,
          duplicatesRemoved: 0,
          rowsCreated: 0,
          candidates: [],
        },
        totalCharsExtracted: 0,
        pagesWithText: 0,
        pagesWithoutText: 0,
        outcome: "no_files",
        outcomeMessage: "No uploaded files found for this job.",
      };
      await supabase
        .from("takeoff_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          summary: toJson(summary),
          error_message: "No uploaded files found.",
        })
        .eq("id", runId);
      await logAudit({ jobId, userId, action: "automatic_takeoff_completed", notes: "no files" });
      return summary;
    }

    const extracted: ExtractedFile[] = [];
    for (const f of files) {
      const isPlanOrSpec = f.file_type === "plan" || f.file_type === "specification";
      if (!isPlanOrSpec) {
        fileDiagnostics.push({
          fileId: f.id,
          fileName: f.file_name,
          fileType: f.file_type,
          storagePath: f.storage_url,
          storageStatus: "ok",
          storageError: null,
          included: false,
          inclusionReason: `Excluded — file_type "${f.file_type}" is not a plan or specification.`,
          pageCount: 0,
          pages: [],
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
          fileId: f.id,
          fileName: f.file_name,
          fileType: f.file_type,
          storagePath: f.storage_url,
          storageStatus: "ok",
          storageError: null,
          included: true,
          inclusionReason: `Included — file_type "${f.file_type}".`,
          pageCount: ef.pages.length,
          pages: [], // filled after classification
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        errors.push(`Failed to read file: ${f.file_name} — ${msg}`);
        fileDiagnostics.push({
          fileId: f.id,
          fileName: f.file_name,
          fileType: f.file_type,
          storagePath: f.storage_url,
          storageStatus: "download_error",
          storageError: msg,
          included: false,
          inclusionReason: `Excluded — could not read PDF (${msg}).`,
          pageCount: 0,
          pages: [],
        });
      }
    }

    progress("identifying_floorplan", "Identifying floorplan…");
    const classified = extracted.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      fileType: file.fileType,
      pages: file.pages.map<ClassifiedPage>((p) => classifyPageWithType(p, file.fileType)),
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
      await supabase
        .from("jobs")
        .update({
          working_plan_file_id: workingFileId,
          working_plan_page_number: workingPageNumber,
        })
        .eq("id", jobId);
      await logAudit({
        jobId,
        userId,
        action: "working_plan_selected",
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
              jobId,
              fileId: picked.fileId,
              pageNumber: rawPage.pageNumber,
              scale,
              userId,
            });
            await logAudit({
              jobId,
              userId,
              action: "scale_detected",
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

    let qInserted = 0,
      qUpdated = 0,
      qConflicts = 0;
    for (const q of allQty) {
      try {
        const r = await persistQuantity({ jobId, q });
        if (r.status === "inserted") qInserted++;
        else if (r.status === "updated") qUpdated++;
        else if (r.status === "conflict") qConflicts++;
        if (r.status === "inserted") {
          await logAudit({
            jobId,
            userId,
            action: "quantity_created",
            notes: `${q.label}=${q.value}${q.unit}`,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        const where = q.page != null ? ` on page ${q.page}` : "";
        errors.push(
          `Failed to persist quantity: ${q.label} = ${q.value}${q.unit}${where} — ${msg}`,
        );
      }
    }

    let oInserted = 0,
      oSkipped = 0;
    for (const o of allOpenings) {
      try {
        const r = await persistOpening({ jobId, createdBy: userId, o });
        if (r.status === "inserted") {
          oInserted++;
          await logAudit({
            jobId,
            userId,
            action: "opening_created",
            notes: `${o.kind} ${o.width_mm}${o.height_mm ? `×${o.height_mm}` : ""}`,
          });
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
      jobId,
      quantities: allQty,
      openings: allOpenings,
      specRows: allSpecRows,
      takeoffRunId: runId,
    });
    if (mod.errors.length > 0) errors.push(...mod.errors);
    if (mod.inserted > 0) {
      await logAudit({
        jobId,
        userId,
        action: "module_item_created",
        notes: `${mod.inserted} draft items`,
      });
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

    const totalRows = qInserted + qUpdated + oInserted + mod.inserted + mod.updated;
    if (totalRows === 0) {
      warnings.push(
        "No quantities, openings, or module items were extracted from the uploaded files.",
      );
    }
    const completedAt = new Date().toISOString();

    // Diagnostics
    const quantityChecks = runQuantityChecks(extracted);
    const openingDiagnostics = runOpeningChecks(extracted, oInserted);
    const specChecksRaw = runSpecChecks(extracted);
    // Mark spec checks whose row was actually created/updated by populator.
    const insertedSpecKeys = new Set(allSpecRows.map((r) => `${r.moduleId}|${r.label}`));
    const specChecks = specChecksRaw.map((c) => ({
      ...c,
      rowCreated:
        insertedSpecKeys.has(`${c.moduleId}|${c.label}`) && mod.inserted + mod.updated > 0,
    }));
    const totalChars = extracted.reduce(
      (s, f) => s + f.pages.reduce((ss, p) => ss + (p.text?.length ?? 0), 0),
      0,
    );
    const pagesWithText = extracted.reduce(
      (s, f) => s + f.pages.filter((p) => (p.text?.length ?? 0) > 0).length,
      0,
    );
    const pagesWithoutText = extracted.reduce(
      (s, f) => s + f.pages.filter((p) => (p.text?.length ?? 0) === 0).length,
      0,
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
      specChecks,
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
        (p) =>
          (p.text?.length ?? 0) === 0 &&
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

    // "Useful" spec items: spec rows + quantity matches anchored in
    // specification text or readable plan text.
    const usefulSpecCount = allSpecRows.length + quantityChecks.filter((q) => q.found).length;
    const specOnlyMatches = usefulSpecCount > 0;
    const planTextChars = extracted
      .filter((f) => f.fileType === "plan")
      .reduce((s, f) => s + f.pages.reduce((ss, p) => ss + (p.text?.length ?? 0), 0), 0);
    const planFiles = extracted.filter((f) => f.fileType === "plan");
    const hasPlanFiles = planFiles.length > 0;
    const planTextless = hasPlanFiles && planTextChars === 0;
    const planUnreadable = flattenedPlanFiles.length > 0 || planTextless;
    const isLimitedSpec = usefulSpecCount > 0 && usefulSpecCount < 5;

    let resultType: TakeoffSummary["resultType"];
    if (planUnreadable && !specOnlyMatches) {
      resultType = "flattened_plan_vision_review_required";
    } else if (planUnreadable && isLimitedSpec) {
      resultType = "limited_specification_takeoff";
    } else if (planUnreadable && specOnlyMatches) {
      resultType = "specification_only_takeoff";
    } else if (isLimitedSpec && mod.inserted < 5 && oInserted === 0) {
      resultType = "limited_specification_takeoff";
    } else if (specOnlyMatches || mod.inserted > 0 || qInserted > 0 || oInserted > 0) {
      resultType = "text_takeoff_completed";
    } else {
      resultType = "no_usable_text_found";
    }
    if (
      flattenedPlanFiles.length > 0 &&
      (resultType === "specification_only_takeoff" ||
        resultType === "limited_specification_takeoff")
    ) {
      warnings.push(
        `${flattenedPlanFiles.length} plan ${flattenedPlanFiles.length === 1 ? "file appears" : "files appear"} to be flattened images — vision review required for plan measurements.`,
      );
    } else if (resultType === "flattened_plan_vision_review_required") {
      warnings.push(
        "Plan pages appear to be flattened images. Text-based takeoff cannot read dimensions from these drawings. OCR / vision review is required.",
      );
    }
    if (resultType === "limited_specification_takeoff") {
      warnings.push(
        `Only ${usefulSpecCount} useful specification ${usefulSpecCount === 1 ? "item was" : "items were"} extracted — review uploaded files or expand specification detail.`,
      );
    }
    // Override outcome label when the high-level resultType is more specific
    // than the base diagnostic outcome.
    let finalOutcome: TakeoffDiagnostics["outcome"] = outcome;
    let finalOutcomeMessage = outcomeMessage;
    if (resultType === "flattened_plan_vision_review_required") {
      finalOutcome = "flattened_plan";
      finalOutcomeMessage =
        "Plan PDF is flattened (no text layer). Vision review required for plan measurements.";
    } else if (resultType === "limited_specification_takeoff") {
      finalOutcome = "limited_specification";
      finalOutcomeMessage = `Only ${usefulSpecCount} useful specification ${usefulSpecCount === 1 ? "item" : "items"} extracted from readable text.`;
    } else if (resultType === "specification_only_takeoff") {
      finalOutcome = "specification_only";
      finalOutcomeMessage =
        "Specification text was readable; plan drawings could not be read for measurements.";
    }
    diagnostics.outcome = finalOutcome;
    diagnostics.outcomeMessage = finalOutcomeMessage;
    const hasWarnings2 = errors.length > 0 || warnings.length > 0;

    const summary: TakeoffSummary = {
      runId,
      filesScanned: extracted.length,
      pagesScanned: extracted.reduce((s, f) => s + f.pages.length, 0),
      workingFileId,
      workingFileName,
      workingPageNumber,
      workingPageType,
      workingPageConfidence: workingPageConf,
      scaleText,
      scaleStatus,
      calibrationId,
      quantitiesInserted: qInserted,
      quantitiesUpdated: qUpdated,
      quantityConflicts: qConflicts,
      openingsInserted: oInserted,
      openingsSkipped: oSkipped,
      moduleItemsInserted: mod.inserted,
      moduleItemsUpdated: mod.updated,
      moduleItemConflicts: mod.conflicts,
      reviewRequiredCount,
      highCount,
      midCount,
      lowCount,
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

    // Concept mode: geometry measurement + fill missing items with Jennian standard allowances
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("plan_type")
      .eq("id", jobId)
      .single();
    if (jobRow?.plan_type === "concept") {
      // Canonical-takeoff integrity (11 Jun): a run that never persists takeoff_json must
      // say so LOUDLY instead of completing silently — the export quietly falls back to the
      // last good run and nobody knows (JM-0021 21:01 re-run: status=completed, 14s,
      // takeoff_json NULL, zero indication). Track exactly why the persist was skipped.
      let canonicalPersisted = false;
      let canonicalSkipReason: string = workingFileId
        ? "working plan file could not be downloaded from storage"
        : "no working floor-plan page was resolved by classification";
      // Geometry API — download working plan and measure it
      if (workingFileId) {
        try {
          const { data: fileRow } = await supabase
            .from("uploaded_files")
            .select("storage_url, file_name")
            .eq("id", workingFileId)
            .single();
          if (fileRow?.storage_url) {
            const { data: fileData } = await supabase.storage
              .from("job-files")
              .download(fileRow.storage_url);
            if (fileData) {
              // Convergence Slice 3 / C3 page-pin: pin geometry to the AI-selected working
              // floor-plan page (workingPageNumber is 1-based; geometry wants 0-based) instead
              // of letting it auto-detect — which on a multi-page set could land on the site
              // plan and silently measure the wrong building. undefined → geometry self-selects.
              const geometryPageIndex =
                workingPageNumber != null && workingPageNumber >= 1
                  ? workingPageNumber - 1
                  : undefined;
              const { measurePlanGeometry, overallConfidence } = await import("./geometry-api");
              const geoResult = await measurePlanGeometry(
                fileData,
                fileRow.file_name ?? "plan.pdf",
                geometryPageIndex,
              );
              if (geoResult) {
                // Clear any previous geometry measurements for this job then re-insert
                await supabase
                  .from("plan_measurements")
                  .delete()
                  .eq("job_id", jobId)
                  .eq("source", "geometry_api");

                const scaleNote = geoResult.scale.string ?? null;
                const m = geoResult.measurements;
                const inserts: Array<{
                  job_id: string;
                  created_by: string;
                  measurement_type: string;
                  calculated_area_m2?: number | null;
                  calculated_length_m?: number | null;
                  confidence: string;
                  source: string;
                  notes?: string | null;
                  plan_page_number: number;
                }> = [];

                if (m.floor_area_m2 != null) {
                  inserts.push({
                    job_id: jobId,
                    created_by: userId,
                    measurement_type: "floor_area",
                    calculated_area_m2: m.floor_area_m2,
                    confidence: geoResult.confidence.floor_area,
                    source: "geometry_api",
                    notes: scaleNote,
                    plan_page_number: geoResult.page_used ?? 0,
                  });
                }
                if (m.perimeter_m != null) {
                  inserts.push({
                    job_id: jobId,
                    created_by: userId,
                    measurement_type: "perimeter",
                    calculated_length_m: m.perimeter_m,
                    confidence: geoResult.confidence.perimeter,
                    source: "geometry_api",
                    notes: scaleNote,
                    plan_page_number: geoResult.page_used ?? 0,
                  });
                }
                if (inserts.length > 0) {
                  await supabase.from("plan_measurements").insert(inserts);
                }

                // Persist overall geometry confidence back to the job record
                const conf = overallConfidence(geoResult.confidence);
                await supabase
                  .from("jobs")
                  .update({
                    confidence_score: conf === "high" ? 95 : conf === "medium" ? 70 : 40,
                  })
                  .eq("id", jobId);
              }

              // Pass 0 + vision takeoff → persist plan_context, then COMPOSE the takeoff
              // IN MEMORY (Convergence Slice 3). composeTakeoff is the SAME pure seam
              // Pipeline B (/upload) runs; run.ts now feeds it the full inputs it expects —
              // the page-pinned geometry (incl. vector_annotations, no longer discarded) and
              // the vision takeoff — instead of consuming only floor_area + perimeter. The
              // composed result is NOT persisted: persistence + schema are Slice 5. This
              // proves the production path produces the right numbers before any DB work.
              try {
                const { renderPageForAnalysis } = await import("@/lib/pdf-pages");
                const {
                  extractConceptTakeoffs,
                  extractVisualOpeningAuditFn,
                  extractWindowScheduleFn,
                } = await import("./concept.functions");
                const { composeTakeoff } = await import("./compose-takeoff");
                const { extractElevationsFn } = await import("./extract-elevations");
                const { mergeElevationVectorOpenings } =
                  await import("./elevation-vector-openings");
                const { runElevationVectorEvidence } =
                  await import("./run-elevation-vector-openings");
                const planFile = new File([fileData], fileRow.file_name ?? "plan.pdf", {
                  type: "application/pdf",
                });
                const pdfFileCache = new Map<string, File>();
                pdfFileCache.set(workingFileId, planFile);
                const getEvidencePdf = async (
                  source: SupportingEvidencePage | null,
                ): Promise<File | null> => {
                  if (!source) return null;
                  const cached = pdfFileCache.get(source.fileId);
                  if (cached) return cached;
                  const meta = files.find((file) => file.id === source.fileId);
                  if (!meta?.storage_url) return null;
                  const { data } = await supabase.storage
                    .from("job-files")
                    .download(meta.storage_url);
                  if (!data) return null;
                  const file = new File([data], meta.file_name ?? source.fileName, {
                    type: "application/pdf",
                  });
                  pdfFileCache.set(source.fileId, file);
                  return file;
                };
                const renderEvidencePage = async (
                  source: SupportingEvidencePage | null,
                ): Promise<Blob | null> => {
                  const file = await getEvidencePdf(source);
                  if (!file || !source) return null;
                  return renderPageForAnalysis(file, source.pageNumber).catch(() => null);
                };
                const scheduleSource = pickSupportingEvidencePage(
                  classified,
                  "schedule",
                  workingFileId,
                );
                const elevationSource = pickSupportingEvidencePage(
                  classified,
                  "elevations",
                  workingFileId,
                );
                const pageBlob = await renderPageForAnalysis(planFile, workingPageNumber ?? 1);
                if (!pageBlob)
                  canonicalSkipReason = "working page could not be rendered for vision";
                if (pageBlob) {
                  const b64 = await blobToBase64(pageBlob);
                  // The vision pass also yields the planContext we already persist (same
                  // underlying recognisePlan), so this replaces the separate recon call.
                  const conceptResult = await extractConceptTakeoffs({
                    data: { imageBase64: b64, filename: fileRow.file_name ?? "plan.pdf" },
                  });
                  await supabase
                    .from("jobs")
                    .update({ plan_context: toJson(conceptResult.planContext) })
                    .eq("id", jobId);

                  const builderName = conceptResult.planContext?.builder?.name ?? "Jennian Homes";
                  const [scheduleBlob, elevationBlob] = await Promise.all([
                    renderEvidencePage(scheduleSource),
                    renderEvidencePage(elevationSource),
                  ]);
                  const scheduleRaw = scheduleBlob
                    ? await blobToBase64(scheduleBlob)
                        .then((sb64) =>
                          extractWindowScheduleFn({
                            data: { imageBase64: sb64, builderName },
                          }),
                        )
                        .catch(() => null)
                    : null;
                  const elevationFile = await getEvidencePdf(elevationSource);
                  const elevationImageBase64 = elevationBlob
                    ? await blobToBase64(elevationBlob)
                    : null;
                  const visualCorrectionMemoryP = loadVisualOpeningCorrectionPromptMemory(
                    jobId,
                  ).catch((err) => {
                    console.warn(
                      "[visual-opening-corrections] memory unavailable:",
                      err instanceof Error ? err.message : String(err),
                    );
                    return null;
                  });
                  const visualOpeningAuditP = elevationImageBase64
                    ? visualCorrectionMemoryP
                        .then((humanCorrectionMemory) =>
                          extractVisualOpeningAuditFn({
                            data: {
                              imageBase64: b64,
                              pageNumber: workingPageNumber ?? null,
                              elevationImageBase64,
                              humanCorrectionMemory,
                            },
                          }),
                        )
                        .catch(() => null)
                    : visualCorrectionMemoryP
                        .then((humanCorrectionMemory) =>
                          extractVisualOpeningAuditFn({
                            data: {
                              imageBase64: b64,
                              pageNumber: workingPageNumber ?? null,
                              elevationImageBase64: null,
                              humanCorrectionMemory,
                            },
                          }),
                        )
                        .catch(() => null);
                  const [elevRaw, elevVectorEvidence, visualOpeningAudit] = await Promise.all([
                    elevationImageBase64
                      ? extractElevationsFn({
                          data: { imageBase64: elevationImageBase64, builderName },
                        }).catch(() => null)
                      : Promise.resolve(null),
                    elevationFile
                      ? elevationFile
                          .arrayBuffer()
                          .then((data) =>
                            runElevationVectorEvidence(data, elevationSource?.pageNumber ?? 1),
                          )
                          .catch(() => ({
                            elevationOpenings: [],
                            elevationFaceBands: [],
                            elevationOpeningSlots: [],
                          }))
                      : Promise.resolve({
                          elevationOpenings: [],
                          elevationFaceBands: [],
                          elevationOpeningSlots: [],
                        }),
                    visualOpeningAuditP,
                  ]);
                  const elev = mergeElevationVectorOpenings(elevRaw, elevVectorEvidence);

                  // Convergence Slice 3 — the enriched takeoff, computed IN MEMORY only.
                  // schedule/elevation/visual evidence is threaded only when an uploaded
                  // supporting page is actually found; missing support stays null.
                  // Deterministic door pass (no AI). Fail-safe: any failure → null →
                  // the export's door cells fall back through the precedence chain.
                  const { runDoorEngine } = await import("../doors/run-doors");
                  const doorEngine = await runDoorEngine(
                    await fileData.arrayBuffer(),
                    workingPageNumber ?? 1,
                    geoResult?.scale?.string ?? scaleText,
                  );
                  if (doorEngine) {
                    console.info(
                      "[door-engine]",
                      doorEngine.counts,
                      "flags:",
                      doorEngine.flags.length,
                    );
                  }
                  const composed = composeTakeoff({
                    visionTakeoff: conceptResult.takeoffData,
                    geometry: geoResult,
                    schedule: scheduleRaw,
                    geometryPageIndex,
                    doorEngine,
                    visualOpeningAudit,
                    visualOpeningAuditRequired: true,
                    elevationData: elev,
                    jobId,
                    runId,
                  });
                  console.info("[concept-compose] enriched takeoff:", {
                    floor_area_m2: composed.enriched.floor_area_m2.value,
                    floor_source: composed.enriched.floor_area_m2.source,
                    window_count: composed.enriched.window_count.value,
                    garage_door_size: composed.enriched.garage_door_size.value,
                    evidence_pages: {
                      schedule: scheduleSource
                        ? `${scheduleSource.fileName} p${scheduleSource.pageNumber}`
                        : null,
                      elevations: elevationSource
                        ? `${elevationSource.fileName} p${elevationSource.pageNumber}`
                        : null,
                      visual_audit: elevationImageBase64 != null ? "floor+elevation" : "floor",
                    },
                    reconciliation_flags: composed.reconciliation.flags.length,
                    page_agreed: composed.pageReconcile.agreed,
                  });

                  // Convergence Slice 5 — persist the canonical enriched takeoff to
                  // takeoff_runs.takeoff_json, ALONGSIDE the existing relational rows (which
                  // are unchanged). GRACEFUL: persistEnrichedTakeoff never throws — until the
                  // Slice 4 migration is applied the column is absent and this no-ops, so the
                  // job save is never affected. (cast bridges the not-yet-regenerated types.)
                  const { persistEnrichedTakeoff } = await import("./persist-takeoff");
                  const persistResult = await persistEnrichedTakeoff(
                    supabase as unknown as TakeoffJsonWriter,
                    runId,
                    composed.enriched,
                  );
                  canonicalPersisted = persistResult.written;
                  if (!persistResult.written) {
                    canonicalSkipReason = `takeoff_json write failed: ${persistResult.error ?? "unknown"}`;
                  }
                  if (persistResult.written) {
                    const { projectEnrichedOpeningsToSchedule } =
                      await import("./opening-schedule-projection");
                    const projectionResult = await projectEnrichedOpeningsToSchedule(
                      supabase as never,
                      {
                        jobId,
                        createdBy: userId,
                        openings: composed.enriched.openings,
                        openingEvidence: composed.enriched.opening_evidence,
                        pricingBlocked:
                          composed.enriched.external_wall_area_m2.discrepancy_flags.some((flag) =>
                            flag.startsWith("Opening pricing blocked:"),
                          ) ||
                          (composed.enriched.opening_evidence ?? []).some((candidate) =>
                            candidate.conflicts.includes("visual_reconciliation_error"),
                          ),
                      },
                    );
                    if (!projectionResult.written) {
                      canonicalSkipReason = `opening_schedule projection failed: ${
                        projectionResult.error ?? "unknown"
                      }`;
                    }
                  }
                }
              } catch (reconErr) {
                canonicalSkipReason = `recognise/compose failed: ${reconErr instanceof Error ? reconErr.message : String(reconErr)}`;
                console.warn("[concept-recon] recognise/compose failed — run continues:", reconErr);
              }
            }
          }
        } catch (geoErr) {
          canonicalSkipReason = `geometry/download stage failed: ${geoErr instanceof Error ? geoErr.message : String(geoErr)}`;
          console.warn("[concept-geometry] Geometry API failed — run continues:", geoErr);
        }
      }
      // Fires on EVERY skipped-persist path — including workingFileId === null, which is
      // exactly how the JM-0021 14-second silent run happened.
      if (!canonicalPersisted) {
        warnings.push(
          `Canonical takeoff NOT persisted — ${canonicalSkipReason}. The QS export will fall back to the last good run; re-run once the cause is fixed.`,
        );
        summary.hasWarnings = true;
      }

      try {
        const { data: existingItems } = await supabase
          .from("module_items")
          .select("label, value_source")
          .eq("job_id", jobId);
        const existingLabels = new Set<string>(
          (existingItems ?? [])
            .filter(
              (i: { label: string; value_source: string | null }) => i.value_source === "extracted",
            )
            .map((i: { label: string }) => i.label),
        );
        const { data: floorQty } = await supabase
          .from("extracted_quantities")
          .select("extracted_value")
          .eq("job_id", jobId)
          .eq("quantity_type", "total_floor_area")
          .maybeSingle();
        const floorAreaM2 =
          typeof floorQty?.extracted_value === "number" ? floorQty.extracted_value : null;
        const { applyConceptAssumptions } = await import("./concept-assumptions");
        const assumptionResult = await applyConceptAssumptions({
          jobId,
          runId,
          floorAreaM2,
          existingLabels,
        });
        await supabase
          .from("jobs")
          .update({ confidence_score: assumptionResult.confidenceScore })
          .eq("id", jobId);
      } catch (assumptionErr) {
        console.warn(
          "[concept-mode] applyConceptAssumptions failed — run continues:",
          assumptionErr,
        );
      }
    }

    await supabase
      .from("takeoff_runs")
      .update({
        // recomputed live: integrity warnings are pushed after the hasWarnings2 snapshot
        status: errors.length > 0 || warnings.length > 0 ? "completed_with_warnings" : "completed",
        completed_at: completedAt,
        working_file_id: workingFileId,
        working_page_number: workingPageNumber,
        working_page_type: workingPageType,
        classification_confidence: workingPageConf,
        scale_text: scaleText,
        calibration_id: calibrationId,
        summary: toJson(summary),
        error_message: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
      })
      .eq("id", runId);

    await logAudit({
      jobId,
      userId,
      action: "automatic_takeoff_completed",
      notes: `${qInserted} quantities · ${oInserted} openings · ${mod.inserted} module items${errors.length ? ` · ${errors.length} errors` : ""}`,
    });

    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown takeoff failure.";
    await supabase
      .from("takeoff_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq("id", runId);
    await logAudit({ jobId, userId, action: "automatic_takeoff_failed", notes: msg });
    throw err;
  }
}

function emptySummary(runId: string): TakeoffSummary {
  return {
    runId,
    filesScanned: 0,
    pagesScanned: 0,
    workingFileId: null,
    workingFileName: null,
    workingPageNumber: null,
    workingPageType: null,
    workingPageConfidence: null,
    scaleText: null,
    scaleStatus: "Manual Calibration Required",
    calibrationId: null,
    quantitiesInserted: 0,
    quantitiesUpdated: 0,
    quantityConflicts: 0,
    openingsInserted: 0,
    openingsSkipped: 0,
    moduleItemsInserted: 0,
    moduleItemsUpdated: 0,
    moduleItemConflicts: 0,
    reviewRequiredCount: 0,
    highCount: 0,
    midCount: 0,
    lowCount: 0,
    errors: [],
    warnings: [],
    hasWarnings: false,
    completedAt: null,
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
    summary: (row.summary ?? null) as TakeoffSummary | null,
    error_message: (row.error_message as string | null) ?? null,
  };
}
