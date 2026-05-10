import { useState } from "react";
import { ScanEye, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { renderAndUploadPlanPage } from "@/lib/takeoff/render-page";
import { runVisionTakeoff } from "@/lib/takeoff/vision.functions";
import type { VisionRunSummary } from "@/lib/takeoff/vision-types";

type FlatFile = { fileId: string; fileName: string; pageCount: number };

export function VisionTakeoffPanel({
  jobId, flattenedFiles,
}: {
  jobId: string;
  flattenedFiles: FlatFile[];
}) {
  const runFn = useServerFn(runVisionTakeoff);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisionRunSummary | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null); setStatus("Preparing rendered plan pages…");
    try {
      // Look up source storage paths for the flattened files.
      const ids = flattenedFiles.map((f) => f.fileId);
      if (ids.length === 0) throw new Error("No flattened plan files to review.");
      const { data: rows, error: fErr } = await supabase
        .from("uploaded_files")
        .select("id, file_name, storage_url")
        .in("id", ids);
      if (fErr) throw fErr;

      const pageInputs: Array<{
        fileId: string; fileName: string; pageNumber: number;
        storageBucket: string; storagePath: string;
      }> = [];

      // Render up to 3 pages per file (heuristic — usually plan layouts).
      for (const r of rows ?? []) {
        const file = flattenedFiles.find((f) => f.fileId === r.id);
        if (!file) continue;
        const pageLimit = Math.min(file.pageCount, 3);
        for (let p = 1; p <= pageLimit; p++) {
          setStatus(`Rendering ${file.fileName} page ${p}…`);
          const rendered = await renderAndUploadPlanPage({
            jobId,
            fileId: file.fileId,
            fileName: file.fileName,
            fileStoragePath: r.storage_url as string,
            pageNumber: p,
            scale: 2.0,
          });
          pageInputs.push({
            fileId: file.fileId, fileName: file.fileName, pageNumber: p,
            storageBucket: rendered.bucket, storagePath: rendered.storagePath,
          });
        }
      }

      setStatus(`Calling vision model on ${pageInputs.length} rendered pages…`);
      const summary = await runFn({ data: { jobId, pages: pageInputs } });
      setResult(summary);
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vision takeoff failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-3 border-t border-border bg-muted/20">
      <div className="flex items-start gap-2">
        <ScanEye className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold tracking-tight">Vision Takeoff</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            Renders flattened plan pages as images and asks a vision-capable model to extract draft quantities, openings, and wall lengths. All results are draft and require human review before approval or pricing.
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={busy || flattenedFiles.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanEye className="h-3 w-3" />}
              {busy ? "Running Vision Takeoff…" : "Run Vision Takeoff"}
            </button>
          </div>

          {status && (
            <div className="mt-2 text-[11px] text-muted-foreground">{status}</div>
          )}
          {error && (
            <div className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <>
              <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-md overflow-hidden">
                <Card label="Working Plan Reviewed" value={result.workingPlanReviewed ? "Yes" : "No"} />
                <Card label="Area / Perimeter Values" value={String(result.areaPerimeterValuesFound)} />
                <Card label="Window Items" value={String(result.windowItemsFound)} />
                <Card label="Door Items" value={String(result.doorItemsFound)} />
                <Card label="Wall Lengths" value={String(result.wallLengthsFound)} />
                <Card label="Module Draft Items" value={String(result.moduleDraftItemsCreated)} />
                <Card label="Review Required" value={String(result.reviewRequiredItems)} />
                <Card label="Warnings" value={String(result.warnings.length)} />
              </div>
              <div className="mt-2 text-[11px] text-amber-700 inline-flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>Vision takeoff creates draft quantities for review. Confirm before pricing or procurement.</span>
              </div>
              {result.errors.length === 0 && result.pagesProcessed > 0 && (
                <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Vision review complete on {result.pagesProcessed} {result.pagesProcessed === 1 ? "page" : "pages"}.
                </div>
              )}
              {result.pagesProcessed === 0 && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Vision review could not extract reliable quantities from this drawing. Use manual measurement tools or upload a clearer plan.
                </div>
              )}
              {result.errors.length > 0 && (
                <ul className="mt-2 text-[11px] text-destructive space-y-0.5 max-h-40 overflow-auto">
                  {result.errors.slice(0, 8).map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[14px] font-semibold tracking-tight">{value}</div>
    </div>
  );
}