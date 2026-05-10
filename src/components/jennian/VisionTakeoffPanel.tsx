import { useEffect, useState } from "react";
import { ScanEye, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { renderAndUploadPlanPage } from "@/lib/takeoff/render-page";
import { runVisionTakeoff } from "@/lib/takeoff/vision.functions";
import type { VisionRunSummary } from "@/lib/takeoff/vision-types";
import { extractFile } from "@/lib/takeoff/pdf-text";
import { classifyPageWithType } from "@/lib/takeoff/classify";

type FlatFile = { fileId: string; fileName: string; pageCount: number };

const PAGE_CAP = 6;

type PageCandidate = {
  fileId: string;
  fileName: string;
  storagePath: string;
  pageNumber: number;
  clientPageType: string;
  score: number;
};

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
  const [candidates, setCandidates] = useState<PageCandidate[] | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);

  // Pre-classify available pages so the UI can show "X of Y" before running.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = flattenedFiles.map((f) => f.fileId);
        if (ids.length === 0) { setCandidates([]); setTotalPages(0); return; }
        const { data: rows } = await supabase
          .from("uploaded_files")
          .select("id, file_name, file_type, storage_url")
          .in("id", ids);
        const found: PageCandidate[] = [];
        let total = 0;
        for (const r of rows ?? []) {
          const file = flattenedFiles.find((f) => f.fileId === r.id);
          if (!file) continue;
          const extracted = await extractFile({
            fileId: file.fileId,
            fileName: file.fileName,
            fileType: (r.file_type as "plan" | "specification") ?? "plan",
            storagePath: r.storage_url as string,
            maxPages: 30,
          });
          total += extracted.pages.length;
          for (const pg of extracted.pages) {
            const c = classifyPageWithType(pg, "plan");
            const score =
              c.pageType === "Dimension Floorplan" ? 100 :
              c.pageType === "Floorplan" ? 80 :
              c.pageType === "Unknown" ? -100 : -200;
            if (score > 0) {
              found.push({
                fileId: file.fileId,
                fileName: file.fileName,
                storagePath: r.storage_url as string,
                pageNumber: pg.pageNumber,
                clientPageType: c.pageType,
                score: score + (c.confidence === "high" ? 5 : c.confidence === "mid" ? 2 : 0),
              });
            }
          }
        }
        found.sort((a, b) => b.score - a.score);
        if (!cancelled) {
          setCandidates(found.slice(0, PAGE_CAP));
          setTotalPages(total);
        }
      } catch {
        if (!cancelled) { setCandidates([]); setTotalPages(0); }
      }
    })();
    return () => { cancelled = true; };
  }, [flattenedFiles]);

  async function loadSpecificationText(): Promise<string | undefined> {
    try {
      const { data: specRows } = await supabase
        .from("uploaded_files")
        .select("id, file_name, storage_url")
        .eq("job_id", jobId)
        .eq("file_type", "specification");
      const parts: string[] = [];
      for (const sr of specRows ?? []) {
        const ex = await extractFile({
          fileId: sr.id as string,
          fileName: sr.file_name as string,
          fileType: "specification",
          storagePath: sr.storage_url as string,
          maxPages: 20,
        });
        for (const pg of ex.pages) if (pg.text) parts.push(pg.text);
      }
      const joined = parts.join("\n").trim();
      return joined.length > 0 ? joined : undefined;
    } catch {
      return undefined;
    }
  }

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      const list = candidates ?? [];
      if (list.length === 0) {
        throw new Error("Vision Takeoff could not identify a floorplan page. Select the working plan manually or use manual measurement.");
      }
      setStatus("Loading specification context…");
      const specificationText = await loadSpecificationText();

      const pageInputs: Array<{
        fileId: string; fileName: string; pageNumber: number;
        storageBucket: string; storagePath: string;
        clientPageType: string; widthPx: number; heightPx: number;
      }> = [];

      for (const cand of list) {
        setStatus(`Rendering ${cand.fileName} page ${cand.pageNumber}…`);
        const rendered = await renderAndUploadPlanPage({
          jobId,
          fileId: cand.fileId,
          fileName: cand.fileName,
          fileStoragePath: cand.storagePath,
          pageNumber: cand.pageNumber,
          pageType: cand.clientPageType,
          scale: 2.0,
        });
        pageInputs.push({
          fileId: cand.fileId, fileName: cand.fileName, pageNumber: cand.pageNumber,
          storageBucket: rendered.bucket, storagePath: rendered.storagePath,
          clientPageType: cand.clientPageType,
          widthPx: rendered.widthPx, heightPx: rendered.heightPx,
        });
      }

      setStatus(`Calling vision model on ${pageInputs.length} rendered pages…`);
      const summary = await runFn({ data: { jobId, pages: pageInputs, specificationText } });
      setResult(summary);
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vision takeoff failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const selected = candidates?.length ?? 0;
  const noCandidates = candidates !== null && selected === 0;

  return (
    <div className="px-5 py-3 border-t border-border bg-muted/20">
      <div className="flex items-start gap-2">
        <ScanEye className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold tracking-tight">Vision Takeoff</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            Renders flattened plan pages as images and asks a vision-capable model to extract draft quantities, openings, and wall lengths. All results are draft and require human review before approval or pricing.
          </div>

          {candidates !== null && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Pages selected for Vision Takeoff: {selected} of {totalPages}
              {totalPages > selected && selected > 0 && (
                <> — only the strongest floorplan candidates will be reviewed in this run (cap {PAGE_CAP}).</>
              )}
              {noCandidates && (
                <> — no floorplan candidate identified. Select the working plan manually or use manual measurement.</>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={busy || noCandidates || candidates === null}
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
                <Card label="Pages Sent" value={`${result.pagesSentToVision}/${result.pagesRendered}`} />
                <Card label="Area / Perimeter Values" value={String(result.areaPerimeterValuesFound)} />
                <Card label="Window Items" value={String(result.windowItemsFound)} />
                <Card label="Door Items" value={String(result.doorItemsFound)} />
                <Card label="Wall Lengths" value={String(result.wallLengthsFound)} />
                <Card label="Module Draft Items" value={String(result.moduleDraftItemsCreated)} />
                <Card label="Review Required" value={String(result.reviewRequiredItems)} />
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
              {result.warnings.length > 0 && (
                <ul className="mt-2 text-[11px] text-amber-700 space-y-0.5 max-h-40 overflow-auto">
                  {result.warnings.slice(0, 8).map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
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
