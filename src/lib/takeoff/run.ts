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
import { classifyPage, pickWorkingPage, type ClassifiedPage } from "./classify";
import { detectScaleFromText, writeCalibration } from "./scale";
import { extractQuantitiesFromFile, persistQuantity, type ExtractedQty } from "./extract-quantities";
import { extractOpeningsFromFile, persistOpening, type ExtractedOpening } from "./extract-openings";
import { populateModulesFromTakeoff } from "./populate-modules";
import { seedAllModulesForJob } from "@/lib/iq-modules";

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
    const files = await loadJobFiles(jobId);
    if (files.length === 0) {
      const summary: TakeoffSummary = emptySummary(runId);
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
      try {
        const ef = await extractFile({
          fileId: f.id,
          fileName: f.file_name,
          fileType: f.file_type as "plan" | "specification",
          storagePath: f.storage_url,
        });
        extracted.push(ef);
      } catch {
        // Continue on per-file errors — partial extraction is fine.
      }
    }

    progress("identifying_floorplan", "Identifying floorplan…");
    const classified = extracted.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      fileType: file.fileType,
      pages: file.pages.map<ClassifiedPage>((p) => classifyPage(p)),
      rawPages: file.pages,
    }));

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
          } catch {
            // calibration insert failed — leave status text in place
          }
        }
      }
    }

    progress("preparing_quantities", "Preparing draft quantities…");
    const allQty: ExtractedQty[] = [];
    const allOpenings: ExtractedOpening[] = [];
    for (const f of extracted) {
      allQty.push(...extractQuantitiesFromFile(f));
      allOpenings.push(...extractOpeningsFromFile(f));
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
      } catch {
        /* swallow per-row failure to keep run going */
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
      } catch {
        /* swallow per-row failure */
      }
    }

    progress("preparing_modules", "Preparing module review items…");
    const mod = await populateModulesFromTakeoff({
      jobId, quantities: allQty, openings: allOpenings,
    });
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
    };

    await supabase.from("takeoff_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      working_file_id: workingFileId,
      working_page_number: workingPageNumber,
      working_page_type: workingPageType,
      classification_confidence: workingPageConf,
      scale_text: scaleText,
      calibration_id: calibrationId,
      summary: summary as unknown as Json,
    }).eq("id", runId);

    await logAudit({ jobId, userId, action: "automatic_takeoff_completed",
      notes: `${qInserted} quantities · ${oInserted} openings · ${mod.inserted} module items` });

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
