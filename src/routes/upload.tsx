import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { TEMPLATES } from "@/lib/jennian-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  UploadCloud, FileText, Sparkles, CheckCircle2, X, ArrowRight,
  ArrowLeft, Wand2, AlertTriangle, Info, AlertCircle, Download, Edit3,
} from "lucide-react";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { renderPdfThumbnail } from "@/lib/pdf-thumbnail";
import { seedAllModulesForJob } from "@/lib/iq-modules";
import {
  analyzePdfPages, pickPrimaryFloorplan, disposePageAnalyses, renderPageForAnalysis,
  PAGE_TYPE_LABEL, CONFIDENCE_LABEL,
  type PageAnalysis, type PageConfidence,
} from "@/lib/pdf-pages";
import {
  extractScaleFactor, checkPlanIssues, extractConceptTakeoffs,
  type ScaleResult, type PlanIssue, type TakeoffData,
} from "@/lib/takeoff/concept.functions";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/upload")({ component: UploadPage });

type Step = "form" | "select" | "scale" | "check" | "takeoff";

const CONCEPT_STEPS: { key: Step; label: string }[] = [
  { key: "form",    label: "Upload" },
  { key: "select",  label: "Select page" },
  { key: "scale",   label: "Scale" },
  { key: "check",   label: "Plan check" },
  { key: "takeoff", label: "Takeoffs" },
];

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

function UploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobNumber, setJobNumber] = useState("");
  const [clientName, setClientName] = useState("");

  // Auto-generate next JM-XXXX number on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("jobs").select("job_number");
      const nums = (data ?? [])
        .map((j) => {
          const m = (j.job_number as string)?.match(/^JM-(\d+)$/i);
          return m ? parseInt(m[1], 10) : 0;
        })
        .filter(Boolean);
      const next = nums.length ? Math.max(...nums) + 1 : 1;
      setJobNumber(`JM-${String(next).padStart(4, "0")}`);
    })();
  }, []);
  const [address, setAddress] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0].code + " — " + TEMPLATES[0].name);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [electricalFile, setElectricalFile] = useState<File | null>(null);
  const [planType, setPlanType] = useState<"concept" | "detailed">("concept");
  const [busy, setBusy] = useState<null | "draft" | "extract">(null);
  const [planPreviewUrl, setPlanPreviewUrl] = useState<string | null>(null);
  const [planThumbBlob, setPlanThumbBlob] = useState<Blob | null>(null);

  // Page selection step
  const [step, setStep] = useState<Step>("form");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [pageAnalyses, setPageAnalyses] = useState<PageAnalysis[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [autoCertainty, setAutoCertainty] = useState<PageConfidence | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Concept pipeline state
  const [conceptBusy, setConceptBusy] = useState<null | "rendering" | "scale" | "check" | "takeoff">(null);
  const [highResBlob, setHighResBlob] = useState<Blob | null>(null);
  const [scaleResult, setScaleResult] = useState<ScaleResult | null>(null);
  // Manual scale fallback
  const [manualKnownMm, setManualKnownMm] = useState("");
  const [planIssues, setPlanIssues] = useState<PlanIssue[] | null>(null);
  const [errorsAcknowledged, setErrorsAcknowledged] = useState(false);
  const [takeoffData, setTakeoffData] = useState<TakeoffData | null>(null);
  const [editedTakeoff, setEditedTakeoff] = useState<TakeoffData | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    setPlanPreviewUrl(null);
    setPlanThumbBlob(null);
    if (!planFile) return;
    let cancelled = false;
    (async () => {
      const blob = await renderPdfThumbnail(planFile);
      if (cancelled) return;
      if (blob) {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setPlanThumbBlob(blob);
        setPlanPreviewUrl(url);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [planFile]);

  useEffect(() => {
    return () => { disposePageAnalyses(pageAnalyses); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  function acceptFile(setter: (f: File | null) => void) {
    return (f: File | null) => {
      if (f && f.size > MAX_BYTES) {
        toast.error(`"${f.name}" exceeds the 50 MB limit. Please compress or split the PDF.`);
        return;
      }
      setter(f);
    };
  }

  async function startPlanReviewSelection() {
    if (!planFile) {
      toast.error("Please upload a plan PDF.");
      return;
    }
    if (planType === "detailed" && !specFile) {
      toast.error("Please upload a Schedule of Materials & Works for detailed mode.");
      return;
    }
    if (!jobNumber || !clientName || !address) {
      toast.error("Job number, client and address are required.");
      return;
    }
    disposePageAnalyses(pageAnalyses);
    setPageAnalyses([]);
    setSelectedIndex(null);
    setAutoCertainty(null);
    setConfirmed(false);
    setStep("select");
    setAnalyzing(true);
    setAnalyzeProgress({ done: 0, total: 0 });
    try {
      const pages = await analyzePdfPages(planFile, {
        onProgress: (done, total) => setAnalyzeProgress({ done, total }),
      });
      setPageAnalyses(pages);
      const pick = pickPrimaryFloorplan(pages);
      if (pick) {
        setSelectedIndex(pick.index);
        setAutoCertainty(pick.certainty);
        if (pick.certainty === "high") setConfirmed(true);
      } else {
        setSelectedIndex(0);
        setAutoCertainty("low");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not analyse the plan PDF. Please try again.");
      setStep("form");
    } finally {
      setAnalyzing(false);
    }
  }

  async function persist(asExtraction: boolean, primaryThumbBlob?: Blob | null) {
    if (!user) return;
    if (!jobNumber || !clientName || !address) {
      toast.error("Job number, client and address are required.");
      return;
    }
    if (asExtraction && (!planFile || (planType === "detailed" && !specFile))) {
      toast.error("Required files are missing.");
      return;
    }
    setBusy(asExtraction ? "extract" : "draft");
    try {
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .insert({
          job_number: jobNumber,
          client_name: clientName,
          address,
          template,
          plan_type: planType,
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();
      if (jobErr) throw jobErr;

      const uploads: Array<{ file: File; type: "plan" | "specification" | "electrical" }> = [];
      if (planFile) uploads.push({ file: planFile, type: "plan" });
      if (specFile) uploads.push({ file: specFile, type: "specification" });
      if (electricalFile) uploads.push({ file: electricalFile, type: "electrical" });

      for (const u of uploads) {
        const prefix = u.type === "electrical" ? "electrical" : u.type;
        const path = `${user.id}/${job.id}/${prefix}-${Date.now()}-${u.file.name}`;
        const { error: upErr } = await supabase.storage.from("job-files").upload(path, u.file);
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("uploaded_files").insert({
          job_id: job.id,
          file_type: u.type,
          file_name: u.file.name,
          storage_url: path,
        });
        if (insErr) throw insErr;
      }

      let thumbnailPath: string | null = null;
      if (planFile) {
        const blob =
          primaryThumbBlob ??
          planThumbBlob ??
          (await renderPdfThumbnail(planFile));
        if (blob) {
          thumbnailPath = `${user.id}/${job.id}/thumbnail-${Date.now()}.jpg`;
          const { error: tErr } = await supabase.storage
            .from("job-files")
            .upload(thumbnailPath, blob, { contentType: "image/jpeg", upsert: true });
          if (tErr) { console.warn("Thumbnail upload failed:", tErr); thumbnailPath = null; }
        }
      }

      if (asExtraction) {
        await supabase
          .from("jobs")
          .update({
            status: "review_required",
            uploaded_at: new Date().toISOString(),
            ...(thumbnailPath ? { plan_thumbnail_url: thumbnailPath } : {}),
          })
          .eq("id", job.id);
        seedAllModulesForJob(job.id);
        toast.success("Job uploaded. Choose a takeoff method to begin.");
        navigate({ to: "/jobs/$jobId", params: { jobId: job.id } });
      } else {
        await supabase
          .from("jobs")
          .update({
            uploaded_at: uploads.length ? new Date().toISOString() : null,
            ...(thumbnailPath ? { plan_thumbnail_url: thumbnailPath } : {}),
          })
          .eq("id", job.id);
        toast.success("Draft saved.");
        navigate({ to: "/jobs" });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  // After page selection — fork on plan type
  async function continueFromPageSelection() {
    if (selectedIndex === null) return;
    const thumbBlob = pageAnalyses[selectedIndex]?.thumbnailBlob ?? null;

    if (planType === "detailed") {
      await persist(true, thumbBlob);
      return;
    }

    // Concept mode — render high-res page then move to scale step
    if (!planFile) return;
    setConceptBusy("rendering");
    try {
      const blob = await renderPageForAnalysis(planFile, pageAnalyses[selectedIndex].pageNumber);
      setHighResBlob(blob);
    } catch (e) {
      console.error(e);
      toast.error("Could not render plan page. Please try again.");
      setConceptBusy(null);
      return;
    }

    // Kick off scale extraction — show the scale step with a spinner while we work.
    // If a scale is found automatically, we skip the user-confirmation screen.
    setConceptBusy("scale");
    setStep("scale");
    setScaleResult(null);
    let foundResult: typeof scaleResult = null;
    try {
      const blob = await renderPageForAnalysis(planFile, pageAnalyses[selectedIndex].pageNumber);
      setHighResBlob(blob);
      if (!blob) throw new Error("No page image.");
      const [b64, dims] = await Promise.all([blobToBase64(blob), getBlobDimensions(blob)]);
      const result = await extractScaleFactor({ data: { imageBase64: b64, imageWidth: dims.width, imageHeight: dims.height } });
      setScaleResult(result);
      foundResult = result;
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : String(e);
      if (detail.includes("LOVABLE_API_KEY")) {
        toast.error("AI is not configured on this server. Contact support.");
      } else {
        toast.error(`Scale extraction failed: ${detail}`);
      }
      const fallback = {
        scaleFactor: null,
        confidence: "low" as const,
        rationale: `Scale extraction failed: ${detail}. Enter a known dimension below to calibrate manually.`,
      };
      setScaleResult(fallback);
      foundResult = fallback;
    } finally {
      setConceptBusy(null);
    }

    // Auto-advance: if we found a scale, skip the confirmation screen entirely.
    if (foundResult?.scaleFactor !== null && foundResult?.scaleFactor !== undefined) {
      await proceedToCheck(foundResult.scaleFactor);
    }
  }

  async function proceedToCheck(resolvedScaleFactor: number | null) {
    if (!highResBlob && !planFile) return;
    setConceptBusy("check");
    setStep("check");
    setPlanIssues(null);
    setErrorsAcknowledged(false);
    try {
      const blob = highResBlob ?? (planFile ? await renderPageForAnalysis(planFile, pageAnalyses[selectedIndex!]?.pageNumber ?? 1) : null);
      if (!blob) throw new Error("No plan image available.");
      const b64 = await blobToBase64(blob);
      const result = await checkPlanIssues({ data: { imageBase64: b64 } });
      setPlanIssues(result.issues);
    } catch (e) {
      console.error(e);
      toast.error("Plan check failed. You can still proceed.");
      setPlanIssues([{ severity: "warning", description: "Plan check could not run. Proceed with caution." }]);
    } finally {
      setConceptBusy(null);
    }
    // Store for use in takeoff step
    if (resolvedScaleFactor !== null) {
      setScaleResult((prev) => prev ? { ...prev, scaleFactor: resolvedScaleFactor } : { scaleFactor: resolvedScaleFactor, confidence: "high", rationale: "" });
    }
  }

  async function proceedToTakeoffs() {
    if (!highResBlob && !planFile) return;
    setConceptBusy("takeoff");
    setStep("takeoff");
    setTakeoffData(null);
    setEditedTakeoff(null);
    try {
      const blob = highResBlob ?? (planFile ? await renderPageForAnalysis(planFile, pageAnalyses[selectedIndex!]?.pageNumber ?? 1) : null);
      if (!blob) throw new Error("No plan image available.");
      const b64 = await blobToBase64(blob);
      const result = await extractConceptTakeoffs({ data: { imageBase64: b64, scaleFactor: scaleResult?.scaleFactor ?? null } });
      setTakeoffData(result);
      setEditedTakeoff(result);
    } catch (e) {
      console.error(e);
      toast.error("Takeoff extraction failed. Enter values manually below.");
      const empty: TakeoffData = {
        floor_area_m2: null, garage_area_m2: null, alfresco_area_m2: null,
        external_wall_lm: null, internal_wall_lm: null, roof_area_m2: null,
        window_count: null, external_door_count: null, internal_door_count: null,
        bathroom_count: null, ensuite_count: null, laundry_count: null,
        kitchen_count: null, ceiling_height_m: null, foundation_type: null,
        windows_by_room: null, door_breakdown: null, garage_door_size: null,
        notes: "Extraction failed — enter values manually.",
      };
      setTakeoffData(empty);
      setEditedTakeoff(empty);
    } finally {
      setConceptBusy(null);
    }
  }

  function exportToExcel() {
    const t = editedTakeoff ?? takeoffData;
    if (!t) {
      toast.error("No takeoff data available to export.");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const fileName = `${jobNumber || "JM"}-${(clientName || "client").replace(/\s+/g, "-")}-takeoffs-${today}.xlsx`;

    const metaRows = [
      ["Job Number", jobNumber],
      ["Client Name", clientName],
      ["Address", address],
      ["Plan Type", planType === "concept" ? "Concept (Quick)" : "Detailed"],
      ["Date Generated", today],
      [],
      [],
    ];

    const n = (v: number | null) => v ?? "";
    const s = (v: string | null) => v ?? "";
    const headers = ["Item", "Quantity", "Unit", "Notes"];
    const rows = [
      headers,
      ["Floor area",          n(t.floor_area_m2),       "m²",    "Habitable, excluding garage"],
      ["Garage area",         n(t.garage_area_m2),      "m²",    ""],
      ["Alfresco / deck area",n(t.alfresco_area_m2),    "m²",    ""],
      ["External wall length",n(t.external_wall_lm),    "lm",    ""],
      ["Internal wall length",n(t.internal_wall_lm),    "lm",    ""],
      ["Roof area",           n(t.roof_area_m2),        "m²",    ""],
      ["Windows",             n(t.window_count),        "count", ""],
      ["External doors",      n(t.external_door_count), "count", ""],
      ["Internal doors",      n(t.internal_door_count), "count", ""],
      ["Bathrooms",           n(t.bathroom_count),      "count", ""],
      ["Ensuites",            n(t.ensuite_count),       "count", ""],
      ["Laundry",             n(t.laundry_count),       "count", ""],
      ["Kitchen",             n(t.kitchen_count),       "count", ""],
      ["Ceiling height",      n(t.ceiling_height_m),    "m",     ""],
      ["Foundation type",     s(t.foundation_type),     "",      ""],
      ["Garage door size",    s(t.garage_door_size),    "",      ""],
    ];

    const doorBreakdownRows: (string | number)[][] = [];
    if (t.door_breakdown) {
      doorBreakdownRows.push(
        [],
        ["Door Breakdown", "Qty", "Type", ""],
        ["— Standard hinged",   t.door_breakdown.standard,        "count", ""],
        ["— Cavity sliders",    t.door_breakdown.cavity_sliders,  "count", ""],
        ["— Double doors",      t.door_breakdown.double_doors,    "count", ""],
        ["— Barn sliders",      t.door_breakdown.barn_sliders,    "count", ""],
      );
    }

    const windowRows: (string | number)[][] = [];
    if (t.windows_by_room && Object.keys(t.windows_by_room).length > 0) {
      windowRows.push(
        [],
        ["Windows by Room", "Qty", "Width (m)", "Height (m)"],
      );
      for (const [room, data] of Object.entries(t.windows_by_room)) {
        windowRows.push([room, data.qty, data.width_m ?? "", data.height_m ?? ""]);
      }
    }

    const allRows = [
      ...metaRows,
      ...rows,
      ...doorBreakdownRows,
      ...windowRows,
      [],
      ["AI Notes / Assumptions", t.notes],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    XLSX.utils.book_append_sheet(wb, ws, "Takeoffs");

    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Loading screen ──────────────────────────────────────────────────────────

  if (busy === "extract") {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center max-w-md">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center">
              <Sparkles className="h-6 w-6 text-primary animate-pulse" />
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-tight">Reviewing plan quantities…</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Reading dimensions from{" "}
              {selectedIndex !== null && pageAnalyses[selectedIndex]
                ? `Page ${pageAnalyses[selectedIndex].pageNumber} · ${PAGE_TYPE_LABEL[pageAnalyses[selectedIndex].pageType]}`
                : "selected plan"}.
            </p>
            <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-1/3 bg-primary animate-[loading_1.4s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
        <style>{`@keyframes loading { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }`}</style>
      </AppLayout>
    );
  }

  // ── Concept pipeline: scale step ────────────────────────────────────────────

  if (step === "scale") {
    const isLoading = conceptBusy === "scale" || conceptBusy === "rendering";
    const scaleOk = scaleResult?.scaleFactor !== null && scaleResult?.scaleFactor !== undefined;

    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-3xl">
          <ConceptProgressBar current="scale" />
          <PageHeader
            title="Scale Extraction"
            subtitle="We're reading the scale from your plan so all measurements can be converted to real-world dimensions."
          />

          {isLoading && (
            <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
              <Wand2 className="h-5 w-5 text-primary animate-pulse shrink-0" />
              <div>
                <div className="text-sm font-medium">Reading scale from plan…</div>
                <div className="text-xs text-muted-foreground mt-0.5">This takes a few seconds.</div>
              </div>
            </div>
          )}

          {!isLoading && scaleResult && (
            <div className="space-y-4">
              <div className={`rounded-lg border p-5 ${scaleOk ? "border-emerald-500/30 bg-emerald-50/5" : "border-amber-500/30 bg-amber-50/5"}`}>
                <div className={`text-[10.5px] uppercase tracking-[0.16em] font-medium ${scaleOk ? "text-emerald-500" : "text-amber-500"}`}>
                  {scaleOk ? "Scale detected" : "Scale not detected"}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {scaleOk
                    ? `${scaleResult.scaleFactor!.toFixed(4)} px/mm (${scaleResult.confidence} confidence)`
                    : "Could not determine scale automatically"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{scaleResult.rationale}</div>
              </div>

              {!scaleOk && (
                <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                  <div className="text-sm font-medium">Enter a known dimension</div>
                  <p className="text-xs text-muted-foreground">
                    If you know the real-world length of a specific wall or dimension on the plan, enter it below.
                    We'll use it to calibrate the scale.
                  </p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground">Known dimension (mm)</label>
                      <input
                        type="number"
                        placeholder="e.g. 12000 for 12m wall"
                        value={manualKnownMm}
                        onChange={(e) => setManualKnownMm(e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    If you don't have a reference dimension, you can still proceed — the AI will use visible annotations.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const resolved = scaleOk
                      ? scaleResult.scaleFactor
                      : manualKnownMm
                        ? null // pixel distance unknown without clicking — pass null, AI uses annotations
                        : null;
                    proceedToCheck(resolved ?? scaleResult?.scaleFactor ?? null);
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm"
                >
                  Continue to Plan Check <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── Concept pipeline: plan check step ──────────────────────────────────────

  if (step === "check") {
    const isLoading = conceptBusy === "check";
    const errors = planIssues?.filter((i) => i.severity === "error") ?? [];
    const warnings = planIssues?.filter((i) => i.severity === "warning") ?? [];
    const infos = planIssues?.filter((i) => i.severity === "info") ?? [];
    const hasErrors = errors.length > 0;
    const canProceed = !isLoading && planIssues !== null && (!hasErrors || errorsAcknowledged);

    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-3xl">
          <ConceptProgressBar current="check" />
          <PageHeader
            title="Plan Check"
            subtitle="Automated review of your plan before running takeoffs."
          />

          {isLoading && (
            <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
              <Wand2 className="h-5 w-5 text-primary animate-pulse shrink-0" />
              <div>
                <div className="text-sm font-medium">Checking plan…</div>
                <div className="text-xs text-muted-foreground mt-0.5">Reviewing for missing dimensions, labels and wet areas.</div>
              </div>
            </div>
          )}

          {!isLoading && planIssues !== null && (
            <div className="space-y-4">
              {planIssues.length === 0 ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/5 p-5 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-600">Plan looks good</div>
                    <div className="text-xs text-muted-foreground mt-0.5">No issues found. Ready to run takeoffs.</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {errors.map((issue, i) => (
                    <IssueCard key={`e${i}`} issue={issue} />
                  ))}
                  {warnings.map((issue, i) => (
                    <IssueCard key={`w${i}`} issue={issue} />
                  ))}
                  {infos.map((issue, i) => (
                    <IssueCard key={`i${i}`} issue={issue} />
                  ))}
                </div>
              )}

              {hasErrors && !errorsAcknowledged && (
                <div className="rounded-md border border-red-500/30 bg-red-50/5 p-4">
                  <p className="text-sm text-muted-foreground">
                    There are <strong className="text-red-500">{errors.length} error{errors.length > 1 ? "s" : ""}</strong> that may affect takeoff accuracy.
                    Acknowledge to continue.
                  </p>
                  <button
                    type="button"
                    onClick={() => setErrorsAcknowledged(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> I understand — proceed anyway
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep("scale")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={proceedToTakeoffs}
                  disabled={!canProceed}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm disabled:opacity-50"
                >
                  Continue to Takeoffs <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── Concept pipeline: takeoff step ─────────────────────────────────────────

  if (step === "takeoff") {
    const isLoading = conceptBusy === "takeoff";
    const t = editedTakeoff;

    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-3xl">
          <ConceptProgressBar current="takeoff" />
          <PageHeader
            title="Takeoff Results"
            subtitle="Review and edit quantities before exporting to Excel."
          />

          {isLoading && (
            <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-4">
              <Wand2 className="h-5 w-5 text-primary animate-pulse shrink-0" />
              <div>
                <div className="text-sm font-medium">Extracting quantities…</div>
                <div className="text-xs text-muted-foreground mt-0.5">Reading dimensions and counting elements from the plan.</div>
              </div>
            </div>
          )}

          {!isLoading && t && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-[0.16em] font-medium text-muted-foreground">Item</th>
                      <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-[0.16em] font-medium text-muted-foreground">Quantity</th>
                      <th className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-[0.16em] font-medium text-muted-foreground">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TAKEOFF_ROWS.map(({ key, label, unit }) => {
                      const val = t[key as keyof TakeoffData];
                      const isNull = val === null || val === undefined;
                      return (
                        <tr key={key} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-medium">{label}</td>
                          <td className="px-4 py-2.5">
                            {isNull ? (
                              <span className="text-amber-500 text-xs font-medium">Not found — enter manually</span>
                            ) : (
                              <TakeoffCell
                                value={val as number | string | null}
                                onChange={(v) =>
                                  setEditedTakeoff((prev) => prev ? { ...prev, [key]: v } : prev)
                                }
                              />
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{unit}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {t.notes && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-50/5 p-4">
                  <div className="text-[10.5px] uppercase tracking-[0.14em] font-medium text-blue-400 mb-1">AI notes & assumptions</div>
                  <p className="text-xs text-muted-foreground">{t.notes}</p>
                </div>
              )}

              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep("check")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={exportToExcel}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm"
                >
                  <Download className="h-4 w-4" /> Export to QS (.xlsx)
                </button>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── Page selection step ─────────────────────────────────────────────────────

  if (step === "select") {
    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-7xl">
          {planType === "concept" && <ConceptProgressBar current="select" />}
          <button
            type="button"
            onClick={() => setStep("form")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-3 w-3" /> Back to upload
          </button>
          <PageHeader
            title="Select Working Plan"
            subtitle={
              autoCertainty === "high"
                ? "Primary floorplan auto-selected. Confirm or change before quantity review."
                : "Confirm the primary floorplan to use for quantity review."
            }
            actions={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmed(true)}
                  disabled={selectedIndex === null || analyzing}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" /> Confirm Selection
                </button>
                <button
                  type="button"
                  onClick={continueFromPageSelection}
                  disabled={selectedIndex === null || analyzing || !confirmed || conceptBusy !== null}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm disabled:opacity-60"
                >
                  {conceptBusy === "rendering"
                    ? "Rendering…"
                    : planType === "concept"
                      ? <>Continue <ArrowRight className="h-4 w-4" /></>
                      : <>Continue to Review <ArrowRight className="h-4 w-4" /></>
                  }
                </button>
              </div>
            }
          />

          {analyzing && (
            <div className="mb-6 rounded-lg border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-3">
                <Wand2 className="h-4 w-4 text-primary animate-pulse" />
                <div className="text-sm font-medium">Reading plan set…</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {analyzeProgress.done}/{analyzeProgress.total || "?"} pages
                </div>
              </div>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{
                    width: analyzeProgress.total
                      ? `${(analyzeProgress.done / analyzeProgress.total) * 100}%`
                      : "10%",
                  }}
                />
              </div>
            </div>
          )}

          {!analyzing && pageAnalyses.length > 0 && selectedIndex !== null && (
            <div className="mb-6 rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
                    Primary plan {autoCertainty === "high" ? "(auto-selected)" : "(needs confirmation)"}
                  </div>
                  <div className="mt-1 text-[15px] font-semibold tracking-tight">
                    Page {pageAnalyses[selectedIndex].pageNumber} ·{" "}
                    {PAGE_TYPE_LABEL[pageAnalyses[selectedIndex].pageType]}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Detection confidence:{" "}
                    <ConfidenceText level={pageAnalyses[selectedIndex].confidence} />
                    {" · "}
                    {confirmed ? (
                      <span className="text-confidence-high">Confirmed</span>
                    ) : (
                      <span className="text-confidence-mid">Awaiting confirmation</span>
                    )}
                  </div>
                </div>
                {autoCertainty !== "high" && (
                  <div className="text-[11px] rounded-md border border-confidence-mid/40 bg-confidence-mid-bg text-confidence-mid px-2.5 py-1">
                    Confirm primary floorplan for quantity review
                  </div>
                )}
              </div>
            </div>
          )}

          {!analyzing && pageAnalyses.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pageAnalyses.map((p, idx) => {
                const active = idx === selectedIndex;
                return (
                  <button
                    key={p.pageNumber}
                    type="button"
                    onClick={() => { setSelectedIndex(idx); setConfirmed(false); }}
                    className={`group text-left rounded-xl border bg-card overflow-hidden transition-all ${
                      active
                        ? "border-primary shadow-[0_4px_18px_-12px_rgba(0,0,0,0.25)] ring-2 ring-primary/30"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-muted/40 grid place-items-center overflow-hidden">
                      <img
                        src={p.thumbnailUrl}
                        alt={`Page ${p.pageNumber}`}
                        className="h-full w-full object-contain"
                      />
                      {active && autoCertainty && idx === selectedIndex && (
                        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                          <Wand2 className="h-2.5 w-2.5" /> Auto-selected
                        </span>
                      )}
                      <span className="absolute top-2 right-2 inline-flex rounded-md bg-background/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium tabular-nums">
                        Page {p.pageNumber}
                      </span>
                    </div>
                    <div className="p-3 border-t border-border">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12.5px] font-semibold tracking-tight truncate">
                          {PAGE_TYPE_LABEL[p.pageType]}
                        </div>
                        <ConfidenceText level={p.confidence} />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {active ? (confirmed ? "Selected" : "Pending confirm") : "Available"}
                        </span>
                        {!active && (
                          <span className="text-[11px] text-primary font-medium">Change Plan</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── Upload form ─────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-4xl">
        <PageHeader title="Upload Plan" subtitle="Provide the plan set and specification documents to begin quantity review." />

        <form onSubmit={(e) => { e.preventDefault(); startPlanReviewSelection(); }} className="space-y-8">

          {/* Dropzones — layout depends on plan type */}
          {planType === "concept" ? (
            <div className="space-y-4">
              <Dropzone
                label="Plan PDF"
                sub="Architectural drawings"
                file={planFile}
                onFile={acceptFile(setPlanFile)}
                previewUrl={planPreviewUrl}
              />
              <Dropzone
                label="Electrical / Lighting Plan (optional)"
                sub="Couchmans / Laser Electrical PDF"
                file={electricalFile}
                onFile={acceptFile(setElectricalFile)}
              />
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <Dropzone label="Plan PDF" sub="Architectural drawings" file={planFile} onFile={acceptFile(setPlanFile)} previewUrl={planPreviewUrl} />
                <Dropzone label="Schedule of Materials & Works" sub="Specification PDF" file={specFile} onFile={acceptFile(setSpecFile)} />
              </div>
              <div>
                <Dropzone
                  label="Electrical / Lighting Plan (optional)"
                  sub="Couchmans / Laser Electrical PDF"
                  file={electricalFile}
                  onFile={acceptFile(setElectricalFile)}
                />
              </div>
            </>
          )}

          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold tracking-tight">Job details</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Job Number" placeholder="JM-2452" value={jobNumber} onChange={setJobNumber} />
              <Field label="Client Name" placeholder="Full client name" value={clientName} onChange={setClientName} />
              <div className="md:col-span-2">
                <Field label="Address" placeholder="Street, Suburb, City" value={address} onChange={setAddress} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Select Template</label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={`${t.code} — ${t.name}`}>{t.code} — {t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">Plan Type</div>
            <div className="flex gap-2">
              {(["concept", "detailed"] as const).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setPlanType(pt)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    planType === pt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {pt === "concept" ? "Concept (Quick)" : "Detailed"}
                </button>
              ))}
            </div>
            {planType === "concept" && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2.5">
                <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-primary/80">
                  Concept mode — upload your plan PDF only. We'll scale it, check it, and run takeoffs automatically. No SMW required.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => persist(false)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
            >
              {busy === "draft" ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="submit"
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" /> Select Working Plan
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getBlobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const TAKEOFF_ROWS: { key: keyof TakeoffData; label: string; unit: string }[] = [
  { key: "floor_area_m2",        label: "Floor area",          unit: "m²" },
  { key: "garage_area_m2",       label: "Garage area",         unit: "m²" },
  { key: "alfresco_area_m2",     label: "Alfresco / deck",     unit: "m²" },
  { key: "external_wall_lm",     label: "External wall",       unit: "lm" },
  { key: "internal_wall_lm",     label: "Internal wall",       unit: "lm" },
  { key: "roof_area_m2",         label: "Roof area",           unit: "m²" },
  { key: "window_count",         label: "Windows",             unit: "count" },
  { key: "external_door_count",  label: "External doors",      unit: "count" },
  { key: "internal_door_count",  label: "Internal doors",      unit: "count" },
  { key: "bathroom_count",       label: "Bathrooms",           unit: "count" },
  { key: "ensuite_count",        label: "Ensuites",            unit: "count" },
  { key: "laundry_count",        label: "Laundry",             unit: "count" },
  { key: "kitchen_count",        label: "Kitchen",             unit: "count" },
  { key: "ceiling_height_m",     label: "Ceiling height",      unit: "m" },
  { key: "foundation_type",      label: "Foundation type",     unit: "" },
];

function TakeoffCell({
  value,
  onChange,
}: {
  value: number | string | null;
  onChange: (v: number | string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === "null") { onChange(null); return; }
    const num = Number(trimmed);
    onChange(isNaN(num) ? trimmed : num);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-24 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value === null ? "" : String(value)); setEditing(true); }}
      className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary group"
    >
      {value === null ? <span className="text-amber-500 text-xs">Not found — click to enter</span> : String(value)}
      <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-60" />
    </button>
  );
}

function IssueCard({ issue }: { issue: PlanIssue }) {
  const colors = {
    error: { bg: "bg-red-50/5 border-red-500/30", text: "text-red-500", icon: <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" /> },
    warning: { bg: "bg-amber-50/5 border-amber-500/30", text: "text-amber-500", icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" /> },
    info: { bg: "bg-blue-50/5 border-blue-500/20", text: "text-blue-400", icon: <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" /> },
  };
  const c = colors[issue.severity];
  return (
    <div className={`rounded-lg border p-3.5 flex gap-3 ${c.bg}`}>
      {c.icon}
      <div className="min-w-0">
        <div className="text-sm font-medium">{issue.description}</div>
        {issue.location && (
          <div className={`text-xs mt-0.5 ${c.text}`}>{issue.location}</div>
        )}
      </div>
    </div>
  );
}

function ConceptProgressBar({ current }: { current: Step }) {
  const steps = CONCEPT_STEPS;
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 mb-6 text-[11px]">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                active
                  ? "bg-primary/15 text-primary"
                  : done
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "text-muted-foreground"
              }`}
            >
              {done && <CheckCircle2 className="h-3 w-3" />}
              {String(i + 1).replace(/1/,"①").replace(/2/,"②").replace(/3/,"③").replace(/4/,"④").replace(/5/,"⑤")} {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-muted-foreground/40">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function ConfidenceText({ level }: { level: PageConfidence }) {
  const cls =
    level === "high"
      ? "text-confidence-high"
      : level === "mid"
      ? "text-confidence-mid"
      : "text-confidence-low";
  return (
    <span className={`text-[10.5px] font-medium uppercase tracking-[0.14em] ${cls}`}>
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function Dropzone({ label, sub, file, onFile, previewUrl }: {
  label: string; sub: string; file: File | null;
  onFile: (f: File | null) => void; previewUrl?: string | null;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

  function isPdf(f: File) {
    return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  }

  function acceptFile(f: File) {
    if (f.size > MAX_BYTES) {
      toast.error(`File "${f.name}" exceeds the 50 MB limit. Please compress or split the PDF.`);
      return;
    }
    onFile(f);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;
    const pdfs = dropped.filter(isPdf);
    if (pdfs.length !== dropped.length || pdfs.length === 0) {
      toast.error("Only PDF files are supported for plan/specification upload.");
      if (pdfs.length === 0) return;
    }
    const next = pdfs[0];
    if (file && file.name === next.name && file.size === next.size) return;
    acceptFile(next);
  }

  function handleDragOver(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragEnter(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragging(false);
  }

  if (file) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-colors ${
          isDragging ? "border-primary/60 bg-accent/40" : "border-border"
        }`}
      >
        <div className="flex items-start gap-4">
          <PlanThumbnail storagePath={previewUrl ?? null} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-confidence-high" />
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground font-medium">{label}</span>
            </div>
            <div className="mt-1 text-[13.5px] font-medium truncate">{file.name}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {(file.size / 1024 / 1024).toFixed(2)} MB · ready for review
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label className="text-[11px] text-primary font-medium hover:underline cursor-pointer">
                Replace file
                <input type="file" accept="application/pdf" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }} />
              </label>
              <button
                type="button"
                onClick={() => onFile(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <label
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative block rounded-xl border-2 border-dashed bg-card p-8 text-center cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40 overflow-hidden ${
        isDragging ? "border-primary/60 bg-accent/40" : "border-border"
      }`}
    >
      <svg viewBox="0 0 200 80" className="absolute inset-x-0 bottom-0 w-full h-16 text-foreground/[0.05] pointer-events-none" aria-hidden>
        <g stroke="currentColor" strokeWidth="0.5">
          <line x1="0" y1="60" x2="200" y2="60" />
          <path d="M30 60 V32 L70 16 L110 32 V60" fill="none" />
          <path d="M110 60 V40 L160 40 V60" fill="none" />
        </g>
      </svg>
      <UploadCloud className="h-7 w-7 text-muted-foreground mx-auto relative" />
      <div className="mt-3 text-sm font-medium relative">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5 relative">{sub}</div>
      <div className="mt-4 inline-flex items-center gap-2 text-xs text-primary font-medium relative">
        <FileText className="h-3.5 w-3.5" /> Choose file or drag &amp; drop
      </div>
      <input
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
      />
    </label>
  );
}
