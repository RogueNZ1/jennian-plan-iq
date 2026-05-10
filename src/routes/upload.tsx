import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { TEMPLATES } from "@/lib/jennian-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { UploadCloud, FileText, Sparkles, CheckCircle2, X, ArrowRight, ArrowLeft, Wand2 } from "lucide-react";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { renderPdfThumbnail } from "@/lib/pdf-thumbnail";
import { seedAllModulesForJob } from "@/lib/iq-modules";
import {
  analyzePdfPages, pickPrimaryFloorplan, disposePageAnalyses,
  PAGE_TYPE_LABEL, CONFIDENCE_LABEL,
  type PageAnalysis, type PageConfidence,
} from "@/lib/pdf-pages";

export const Route = createFileRoute("/upload")({ component: UploadPage });

function UploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobNumber, setJobNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0].code + " — " + TEMPLATES[0].name);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "draft" | "extract">(null);
  const [planPreviewUrl, setPlanPreviewUrl] = useState<string | null>(null);
  const [planThumbBlob, setPlanThumbBlob] = useState<Blob | null>(null);

  // Plan Review Selection step
  type Step = "form" | "select";
  const [step, setStep] = useState<Step>("form");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [pageAnalyses, setPageAnalyses] = useState<PageAnalysis[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [autoCertainty, setAutoCertainty] = useState<PageConfidence | null>(null);
  const [confirmed, setConfirmed] = useState(false);

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

  // Cleanup any analysis blob URLs on unmount or when file changes
  useEffect(() => {
    return () => { disposePageAnalyses(pageAnalyses); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global safety: prevent the browser from opening files dropped outside
  // any drop zone while the upload page is mounted.
  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  async function startPlanReviewSelection() {
    if (!planFile || !specFile) {
      toast.error("Plan and Specification PDFs are required to review quantities.");
      return;
    }
    if (!jobNumber || !clientName || !address) {
      toast.error("Job number, client and address are required.");
      return;
    }
    // Reset prior analyses
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
    if (asExtraction && (!planFile || !specFile)) {
      toast.error("Plan and Specification PDFs are required to review quantities.");
      return;
    }
    setBusy(asExtraction ? "extract" : "draft");
    try {
      // 1. Create job
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .insert({
          job_number: jobNumber,
          client_name: clientName,
          address,
          template,
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();
      if (jobErr) throw jobErr;

      // 2. Upload files
      const uploads: Array<{ file: File; type: "plan" | "specification" }> = [];
      if (planFile) uploads.push({ file: planFile, type: "plan" });
      if (specFile) uploads.push({ file: specFile, type: "specification" });

      for (const u of uploads) {
        const path = `${user.id}/${job.id}/${u.type}-${Date.now()}-${u.file.name}`;
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

      // Generate & upload plan thumbnail (private)
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
            .upload(thumbnailPath, blob, {
              contentType: "image/jpeg",
              upsert: true,
            });
          if (tErr) {
            console.warn("Thumbnail upload failed:", tErr);
            thumbnailPath = null;
          }
        }
      }

      if (asExtraction) {
        // No quantities are seeded. IQ Core starts empty — quantities must
        // come from the uploaded plan/spec, calibrated measurement, template
        // allowance, or user override.
        await supabase
          .from("jobs")
          .update({
            status: "review_required",
            uploaded_at: new Date().toISOString(),
            ...(thumbnailPath ? { plan_thumbnail_url: thumbnailPath } : {}),
          })
          .eq("id", job.id);

        // Activate every IQ module for this job (no fake items seeded).
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

  async function continueToReview() {
    if (selectedIndex === null) return;
    const blob = pageAnalyses[selectedIndex]?.thumbnailBlob ?? null;
    await persist(true, blob);
  }

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

  if (step === "select") {
    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-7xl">
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
                  onClick={continueToReview}
                  disabled={selectedIndex === null || analyzing || !confirmed}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm disabled:opacity-60"
                >
                  Continue to Review <ArrowRight className="h-4 w-4" />
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
                          <span className="text-[11px] text-primary font-medium">
                            Change Plan
                          </span>
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

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-4xl">
        <PageHeader title="Upload Plan" subtitle="Provide the plan set and specification documents to begin quantity review." />

        <form onSubmit={(e) => { e.preventDefault(); startPlanReviewSelection(); }} className="space-y-8">
          <div className="grid md:grid-cols-2 gap-4">
            <Dropzone label="Plan PDF" sub="Architectural drawings" file={planFile} onFile={setPlanFile} previewUrl={planPreviewUrl} />
            <Dropzone label="Schedule of Materials & Works" sub="Specification PDF" file={specFile} onFile={setSpecFile} />
          </div>

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

function Dropzone({ label, sub, file, onFile, previewUrl }: { label: string; sub: string; file: File | null; onFile: (f: File | null) => void; previewUrl?: string | null }) {
  if (file) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
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
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
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
    <label className="relative block rounded-xl border-2 border-dashed border-border bg-card p-8 text-center cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40 overflow-hidden">
      {/* Architectural cue */}
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
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}