import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { LatestTakeoffRun } from "@/lib/takeoff/run";
import { normalizeSummary, isEmptyRun } from "@/lib/takeoff/summary";
import {
  FileSearch, Ruler, ListChecks, Layers, AlertCircle, ClipboardCheck, Eye,
  AlertTriangle, FileWarning, ChevronDown, ChevronRight, ScanEye, CheckCircle2,
} from "lucide-react";
import { useRoles } from "@/hooks/use-roles";
import { TakeoffDiagnosticsPanel } from "./TakeoffDiagnostics";
import { VisionTakeoffPanel } from "./VisionTakeoffPanel";
import { supabase } from "@/integrations/supabase/client";

const GEOMETRY_DEFERRED = [
  "Internal Wall Length (if not printed)",
  "External Perimeter (if not printed)",
  "Garage Area (if not printed)",
  "Living Area (if not printed)",
  "Room areas (if not printed)",
  "Roof area (if not printed)",
];

export function TakeoffSummary({
  run, jobId,
}: {
  run: LatestTakeoffRun;
  jobId: string;
}) {
  const s = normalizeSummary(run.summary);
  const { isAdmin } = useRoles();
  const failed = run.status === "failed";
  const hasWarnings =
    s.hasWarnings || run.status === "completed_with_warnings" ||
    s.errors.length > 0 || s.warnings.length > 0;
  const empty = !failed && isEmptyRun(s);
  const diag = s.diagnostics;

  const [errorsOpen, setErrorsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [visionMarked, setVisionMarked] = useState<boolean>(s.visionReviewRequired);
  const [visionMarkedAt, setVisionMarkedAt] = useState<string | null>(s.visionReviewMarkedAt);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);

  async function markForVisionReview() {
    setVisionBusy(true);
    setVisionError(null);
    try {
      // Read current summary and merge — never overwrite existing keys.
      const { data: row, error: readErr } = await supabase
        .from("takeoff_runs")
        .select("summary")
        .eq("id", run.id)
        .single();
      if (readErr) throw readErr;
      const existing = (row?.summary && typeof row.summary === "object" ? row.summary : {}) as Record<string, unknown>;
      const nowIso = new Date().toISOString();
      const merged = {
        ...existing,
        visionReviewRequired: true,
        visionReviewMarkedAt: nowIso,
      };
      const { error: upErr } = await supabase
        .from("takeoff_runs")
        .update({ summary: merged })
        .eq("id", run.id);
      if (upErr) throw upErr;
      setVisionMarked(true);
      setVisionMarkedAt(nowIso);
    } catch (e) {
      setVisionError(e instanceof Error ? e.message : "Could not mark for vision review.");
    } finally {
      setVisionBusy(false);
    }
  }

  const completedLabel = (() => {
    const ts = s.completedAt ?? run.completed_at ?? run.started_at;
    try { return new Date(ts).toLocaleString(); } catch { return "—"; }
  })();

  const resultTypeLabel: Record<typeof s.resultType, string> = {
    text_takeoff_completed: "Text Takeoff Completed",
    specification_only_takeoff: "Specification Only Takeoff",
    limited_specification_takeoff: "Limited Specification Takeoff",
    flattened_plan_vision_review_required: "Flattened Plan — Vision Review Required",
    no_usable_text_found: "No Usable Text Found",
  };
  const resultTypeMessage: Record<typeof s.resultType, string> = {
    text_takeoff_completed:
      "Readable text was found and source-backed quantities were created. Review before approval.",
    specification_only_takeoff:
      "Specification text was readable, but plan pages could not be read. Plan measurements need vision review or manual measurement.",
    limited_specification_takeoff:
      "Only a small number of specification items were extracted. Review the uploaded files — the specification may not include schedule-style values, or extraction patterns may need to be expanded.",
    flattened_plan_vision_review_required:
      "Plan pages appear to be flattened images. Text-based takeoff cannot read dimensions from these drawings. OCR / vision review is required for automatic plan measurement.",
    no_usable_text_found:
      "No useful plan or specification text was found in the uploaded files.",
  };
  const showVisionSection =
    s.resultType === "flattened_plan_vision_review_required" ||
    s.resultType === "specification_only_takeoff" ||
    s.resultType === "limited_specification_takeoff" ||
    s.flattenedPlanFiles.length > 0;

  const workingPlanValue =
    s.workingPlanStatus === "not_identified"
      ? "Not identified"
      : s.workingPlanStatus === "candidate"
      ? `${s.workingPlanFileName} · Page ${s.workingPlanPageNumber ?? "—"}`
      : `${s.workingPlanFileName} · Page ${s.workingPlanPageNumber ?? "—"}`;

  const workingPlanSub =
    s.workingPlanStatus === "not_identified"
      ? "No floorplan candidate was confidently detected in uploaded plans."
      : s.workingPlanStatus === "candidate"
      ? "Candidate selected for review. Please confirm before measuring."
      : `${s.workingPlanPageType ?? "Floorplan"} · ${s.workingPlanConfidence ?? "low"} confidence`;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-tight">Automatic Takeoff Summary</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {failed
              ? `Last run failed${run.error_message ? ` — ${run.error_message}` : ""}.`
              : hasWarnings
              ? `Last run ${completedLabel} — completed with warnings.`
              : `Last run ${completedLabel}. Draft quantities prepared for review.`}
          </div>
        </div>
      </div>

      {!failed && (
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 items-center rounded-full border border-border bg-card px-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Result
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold tracking-tight">
                {resultTypeLabel[s.resultType]}
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                {resultTypeMessage[s.resultType]}
              </div>
            </div>
          </div>
        </div>
      )}

      {empty && (
        <div className="px-5 py-4 border-b border-border bg-amber-500/5">
          <div className="flex items-start gap-2">
            <FileWarning className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold tracking-tight">
                {diag?.outcome === "no_readable_text"
                  ? "No PDF text layer detected"
                  : diag?.outcome === "partial_readable_text_no_matches"
                  ? "Some pages have no readable text"
                  : diag?.outcome === "matches_no_module_rows"
                  ? "Matches found but no module rows created"
                  : diag?.outcome === "errors"
                  ? "Errors during file processing"
                  : diag?.outcome === "no_files"
                  ? "No uploaded files"
                  : diag?.outcome === "limited_specification"
                  ? "Limited specification takeoff"
                  : diag?.outcome === "specification_only"
                  ? "Specification only takeoff"
                  : diag?.outcome === "flattened_plan"
                  ? "Flattened plan — vision review required"
                  : "Readable text but no quantity matches"}
              </div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                {diag?.outcomeMessage ??
                  "Jennian IQ reviewed the uploaded files but did not find usable plan or specification text for automatic takeoff."}
              </div>
              <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                {[
                  "PDF is scanned or flattened",
                  "Text layer not available",
                  "Floorplan page not detected",
                  "Scale or dimensions not readable",
                  "Specification file missing",
                ].map((r) => (
                  <li key={r} className="flex items-start gap-1.5">
                    <span className="text-muted-foreground/60 mt-1.5 inline-block h-1 w-1 rounded-full bg-current flex-shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link to="/jobs/$jobId" params={{ jobId }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
                  <Eye className="h-3 w-3" /> Open Working Plan
                </Link>
                <Link to="/upload"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
                  <FileSearch className="h-3 w-3" /> Review Uploaded Files
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasWarnings && !failed && (s.errors.length > 0 || s.warnings.length > 0) && (
        <div className="px-5 py-3 border-b border-border bg-amber-500/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold tracking-tight">Takeoff completed with warnings</div>
              {s.warnings.length > 0 && (
                <ul className="mt-1 text-[11.5px] text-muted-foreground space-y-0.5">
                  {s.warnings.map((w, i) => (<li key={`w${i}`}>• {w}</li>))}
                </ul>
              )}
              {s.errors.length > 0 && (
                <div className="mt-1.5">
                  <button type="button" onClick={() => setErrorsOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline">
                    {errorsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {s.errors.length} row-level {s.errors.length === 1 ? "error" : "errors"}
                  </button>
                  {errorsOpen && (
                    <ul className="mt-1 text-[11px] text-muted-foreground space-y-0.5 max-h-48 overflow-auto">
                      {s.errors.map((e, i) => (<li key={`e${i}`} className="break-words">• {e}</li>))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
        <Card icon={<FileSearch className="h-4 w-4" />}
          label={s.workingPlanStatus === "candidate" ? "Working Plan Candidate" : "Working Plan"}
          value={workingPlanValue}
          sub={workingPlanSub} />
        <Card icon={<Ruler className="h-4 w-4" />} label="Scale Status"
          value={s.scaleText ?? s.scaleStatus}
          sub={
            s.scaleStatus === "Auto-calibrated"
              ? "Auto-calibrated from text — review before measuring."
              : s.scaleStatus === "Not checked"
              ? "Working plan not identified — scale not checked."
              : "Manual calibration required before measured quantities can be created."
          } />
        <Card icon={<ListChecks className="h-4 w-4" />} label="IQ Core Draft Quantities"
          value={String(s.quantitiesInserted + s.quantitiesRefreshed)}
          sub={`${s.quantitiesInserted} new · ${s.quantitiesRefreshed} refreshed${s.quantityConflicts ? ` · ${s.quantityConflicts} conflicts` : ""}`} />
        <Card icon={<Layers className="h-4 w-4" />} label="Openings Found"
          value={String(s.openingsInserted + s.openingsRefreshed)}
          sub={`${s.openingsInserted} new · ${s.openingsRefreshed} refreshed`} />
        <Card icon={<ClipboardCheck className="h-4 w-4" />} label="Module Draft Items"
          value={String(s.moduleItemsInserted + s.moduleItemsRefreshed)}
          sub={`${s.moduleItemsInserted} new · ${s.moduleItemsRefreshed} refreshed${s.moduleItemConflicts ? ` · ${s.moduleItemConflicts} conflicts` : ""}`} />
        <Card icon={<AlertCircle className="h-4 w-4" />} label="Review Required Items"
          value={String(s.reviewRequiredCount)}
          sub={`${s.highConfidenceCount} high · ${s.mediumConfidenceCount} medium · ${s.lowConfidenceCount} low confidence`} />
      </div>

      <div className="px-5 py-3 border-t border-border bg-muted/20">
        <button type="button" onClick={() => setPagesOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline">
          {pagesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Page Review {s.pageClassifications.length > 0 ? `(${s.pageClassifications.length})` : ""}
        </button>
        {pagesOpen && (
          <div className="mt-2">
            {s.pageClassifications.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">
                No page classification results available.
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-2.5 py-1.5">File</th>
                      <th className="text-left font-medium px-2.5 py-1.5">Page</th>
                      <th className="text-left font-medium px-2.5 py-1.5">Detected Type</th>
                      <th className="text-left font-medium px-2.5 py-1.5">Confidence</th>
                      <th className="text-left font-medium px-2.5 py-1.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.pageClassifications.map((p, i) => (
                      <tr key={`${p.fileName}-${p.pageNumber}-${i}`} className="border-t border-border">
                        <td className="px-2.5 py-1.5 truncate max-w-[180px]">{p.fileName}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{p.pageNumber}</td>
                        <td className="px-2.5 py-1.5">{p.pageType}</td>
                        <td className="px-2.5 py-1.5">{p.confidence}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{p.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showVisionSection && (
        <div className="px-5 py-3 border-t border-border bg-muted/20">
          <div className="flex items-start gap-2">
            <ScanEye className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[12.5px] font-semibold tracking-tight">Plan Vision Review</div>
                <span className="inline-flex h-4 items-center rounded-full border border-border bg-card px-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {visionMarked ? "Marked" : "Not configured"}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                Flattened drawings require OCR / vision processing before Jennian IQ can automatically read dimensions, rooms, openings, and scale.
              </div>
              {s.flattenedPlanFiles.length > 0 && (
                <ul className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                  {s.flattenedPlanFiles.map((f) => (
                    <li key={f.fileId} className="flex items-start gap-1.5">
                      <span className="text-muted-foreground/60 mt-1.5 inline-block h-1 w-1 rounded-full bg-current flex-shrink-0" />
                      <span className="break-all">
                        <span className="font-medium text-foreground">{f.fileName}</span>{" "}
                        — {f.pageCount} {f.pageCount === 1 ? "page" : "pages"}{" "}
                        ({f.pageSizes.join(", ") || "unknown size"}), no text layer detected
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {visionMarked && visionMarkedAt && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Marked for vision review on {(() => { try { return new Date(visionMarkedAt).toLocaleString(); } catch { return visionMarkedAt; } })()}.
                </div>
              )}
              {visionError && (
                <div className="mt-2 text-[11px] text-destructive">{visionError}</div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={markForVisionReview}
                  disabled={visionBusy || visionMarked}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ScanEye className="h-3 w-3" />
                  {visionMarked ? "Marked for Vision Review" : visionBusy ? "Marking…" : "Mark for Vision Review"}
                </button>
                <Link to="/jobs/$jobId" params={{ jobId }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
                  <Eye className="h-3 w-3" /> Open Working Plan for Manual Measurement
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVisionSection && s.flattenedPlanFiles.length > 0 && (
        <VisionTakeoffPanel
          jobId={jobId}
          flattenedFiles={s.flattenedPlanFiles.map((f) => ({
            fileId: f.fileId, fileName: f.fileName, pageCount: f.pageCount,
          }))}
        />
      )}

      <div className="px-5 py-3 border-t border-border bg-muted/20">
        <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
          Not yet auto-detected — measure manually
        </div>
        <div className="text-[11.5px] text-muted-foreground">
          Geometry measurement has not been auto-detected in this pass. Use the Working Plan tools to measure perimeter, areas, and internal walls. Affected:
        </div>
        <ul className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
          {GEOMETRY_DEFERRED.map((g) => (
            <li key={g} className="flex items-start gap-1.5">
              <span className="text-muted-foreground/60 mt-1.5 inline-block h-1 w-1 rounded-full bg-current flex-shrink-0" />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-2">
        <Link to="/review" search={{ job: jobId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
          <ClipboardCheck className="h-3 w-3" /> Review IQ Core
        </Link>
        <Link to="/modules/$moduleId" params={{ moduleId: "iq-framing" }} search={{ job: jobId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
          <Layers className="h-3 w-3" /> Review Modules
        </Link>
        <Link to="/jobs/$jobId" params={{ jobId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
          <Eye className="h-3 w-3" /> Open Working Plan
        </Link>
      </div>

      {isAdmin && diag && <TakeoffDiagnosticsPanel d={diag} />}
    </div>
  );
}

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-6 w-6 rounded-md bg-primary/10 grid place-items-center text-primary">{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="mt-2 text-[15px] font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
