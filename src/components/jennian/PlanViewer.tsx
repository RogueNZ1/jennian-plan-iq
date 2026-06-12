import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Download, ExternalLink, Loader2, FileWarning } from "lucide-react";

/**
 * Private plan PDF viewer modal.
 * Resolves a short-lived signed URL for the job's plan PDF and renders it.
 */
export function PlanViewer({
  jobId,
  jobNumber,
  open,
  onClose,
}: {
  jobId: string | null;
  jobNumber?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "missing">("idle");

  useEffect(() => {
    if (!open || !jobId) return;
    let active = true;
    setState("loading");
    setUrl(null);
    setFileName(null);
    (async () => {
      const { data: files } = await supabase
        .from("uploaded_files")
        .select("storage_url, file_name, uploaded_at")
        .eq("job_id", jobId)
        .eq("file_type", "plan")
        .order("uploaded_at", { ascending: false })
        .limit(1);
      const path = files?.[0]?.storage_url;
      if (!path) {
        if (active) setState("missing");
        return;
      }
      const { data: signed } = await supabase.storage
        .from("job-files")
        .createSignedUrl(path, 60 * 30);
      if (!active) return;
      if (signed?.signedUrl) {
        setUrl(signed.signedUrl);
        setFileName(files?.[0]?.file_name ?? null);
        setState("ready");
      } else {
        setState("missing");
      }
    })();
    return () => {
      active = false;
    };
  }, [open, jobId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[85vh] rounded-xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
              Plan preview
            </div>
            <div className="text-[14px] font-semibold tracking-tight">
              {jobNumber ? `${jobNumber} · ` : ""}
              {fileName ?? "Plan PDF"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open full plan
                </a>
                <a
                  href={url}
                  download={fileName ?? "plan.pdf"}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-muted/40">
          {state === "loading" && (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {state === "missing" && (
            <div className="h-full grid place-items-center text-center px-6">
              <div>
                <FileWarning className="h-7 w-7 text-muted-foreground mx-auto" />
                <div className="mt-3 text-sm font-medium">No plan PDF available</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  No plan has been uploaded for this job yet.
                </p>
              </div>
            </div>
          )}
          {state === "ready" && url && (
            <iframe key={url} src={url} title="Plan PDF" className="h-full w-full bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}
