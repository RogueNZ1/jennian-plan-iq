import { useEffect, useMemo, useState } from "react";
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
  confidence: "high" | "mid" | "low";
  reason: string;
  isFallback: boolean;
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const keyOf = (c: { fileId: string; pageNumber: number }) => `${c.fileId}:${c.pageNumber}`;

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
        const positives: PageCandidate[] = [];
        const fallbacks: PageCandidate[] = [];
        let total = 0;
        for (const r of rows ?? []) {
          const file = flattenedFiles.find((f) => f.fileId === r.id);
          if (!file) continue;
          const isPlan = ((r.file_type as string) ?? "plan") === "plan";
          if (!isPlan) continue; // never include specification files in vision
          const extracted = await extractFile({
            fileId: file.fileId,
            fileName: file.fileName,
            fileType: "plan",
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
              positives.push({
                fileId: file.fileId,
                fileName: file.fileName,
                storagePath: r.storage_url as string,
                pageNumber: pg.pageNumber,
                clientPageType: c.pageType,
                score: score + (c.confidence === "high" ? 5 : c.confidence === "mid" ? 2 : 0),
                confidence: c.confidence,
                reason: c.reason,
                isFallback: false,
              });
            } else if ((pg.text ?? "").trim().length === 0 || c.pageType === "Unknown") {
              fallbacks.push({
                fileId: file.fileId,
                fileName: file.fileName,
                storagePath: r.storage_url as string,
                pageNumber: pg.pageNumber,
                clientPageType: "Unknown — flattened fallback",
                score: 0,
                confidence: "low",
                reason:
                  (pg.text ?? "").trim().length === 0
                    ? "No text layer on this page (flattened drawing)."
                    : c.reason,
                isFallback: true,
              });
            }
          }
        }
        positives.sort((a, b) => b.score - a.score);
        fallbacks.sort((a, b) => a.pageNumber - b.pageNumber);
        // Build a single ordered list. Positives first, then fallback pages.
        const merged: PageCandidate[] = [...positives, ...fallbacks];
        if (!cancelled) {
          setCandidates(merged);
          setTotalPages(total);
          // Default selection: positives (capped). If none, fallback up to PAGE_CAP.
          const defaults = positives.length > 0
            ? positives.slice(0, PAGE_CAP).map(keyOf)
            : fallbacks.slice(0, PAGE_CAP).map(keyOf);
          setSelectedKeys(new Set(defaults));
        }
      } catch {
        if (!cancelled) { setCandidates([]); setTotalPages(0); setSelectedKeys(new Set()); }
      }
    })();
    return () => { cancelled = true; };
  }, [flattenedFiles]);

  const selectedCandidates = useMemo(
    () => (candidates ?? []).filter((c) => selectedKeys.has(keyOf(c))),
    [candidates, selectedKeys],
  );
  const selectedCount = selectedCandidates.length;
  const overCap = selectedCount > PAGE_CAP;

  const toggleKey = (k: string) => {
    setSelectedKeys((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

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
      const list = selectedCandidates;
      if (list.length === 0) {
        throw new Error("Vision Takeoff could not identify a floorplan page. Select the working plan manually or use manual measurement.");
      }
      if (list.length > PAGE_CAP) {
        throw new Error(`Maximum ${PAGE_CAP} pages per Vision Takeoff run.`);
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

  const totalCandidates = candidates?.length ?? 0;
  const noCandidates = candidates !== null && totalCandidates === 0;

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
            <>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Pages selected for Vision Takeoff: {selectedCount} of {PAGE_CAP}
                {totalPages > 0 && (
                  <> · {totalPages} plan page{totalPages === 1 ? "" : "s"} scanned</>
                )}
                {noCandidates && (
                  <> — no plan pages available. Upload a plan file or use manual measurement.</>
                )}
              </div>
              {overCap && (
                <div className="mt-1 text-[11px] text-destructive">
                  Maximum {PAGE_CAP} pages per Vision Takeoff run.
                </div>
              )}
              {totalCandidates > 0 && (
                <div className="mt-2 rounded-md border border-border bg-card">
                  <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
                    Select the plan pages Jennian IQ should review. Floorplan or dimension floorplan pages work best.
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="px-2 py-1.5 text-left font-medium w-6"></th>
                          <th className="px-2 py-1.5 text-left font-medium">File</th>
                          <th className="px-2 py-1.5 text-left font-medium">Page</th>
                          <th className="px-2 py-1.5 text-left font-medium">Detected type</th>
                          <th className="px-2 py-1.5 text-left font-medium">Confidence</th>
                          <th className="px-2 py-1.5 text-left font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates!.map((c) => {
                          const k = keyOf(c);
                          const checked = selectedKeys.has(k);
                          return (
                            <tr key={k} className="border-t border-border">
                              <td className="px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleKey(k)}
                                  disabled={busy}
                                />
                              </td>
                              <td className="px-2 py-1.5 truncate max-w-[160px]" title={c.fileName}>{c.fileName}</td>
                              <td className="px-2 py-1.5 tabular-nums">{c.pageNumber}</td>
                              <td className="px-2 py-1.5">{c.clientPageType}</td>
                              <td className="px-2 py-1.5">{c.confidence}</td>
                              <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]" title={c.reason}>{c.reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={busy || candidates === null || selectedCount === 0 || overCap}
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
