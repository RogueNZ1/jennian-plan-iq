import { useEffect, useState } from "react";
import { Wand2, ScanEye, Ruler, Sparkles, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractFile } from "@/lib/takeoff/pdf-text";

type FileRow = {
  id: string;
  file_name: string;
  file_type: "plan" | "specification";
  storage_url: string;
};

type Recommendation =
  | { kind: "none"; planTextLen: 0; specTextLen: 0; flatPlan: false; hasFiles: false }
  | { kind: "vision" | "automatic" | "either"; planTextLen: number; specTextLen: number; flatPlan: boolean; hasFiles: true };

export function StartTakeoffPanel({
  jobId,
  onAutomatic,
  onVision,
  onWorkingPlan,
}: {
  jobId: string;
  onAutomatic: () => void;
  onVision: () => void;
  onWorkingPlan: () => void;
}) {
  const [rec, setRec] = useState<Recommendation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("uploaded_files")
        .select("id, file_name, file_type, storage_url")
        .eq("job_id", jobId);
      if (error || !data) {
        if (!cancelled)
          setRec({ kind: "none", planTextLen: 0, specTextLen: 0, flatPlan: false, hasFiles: false });
        return;
      }
      const files = data as FileRow[];
      if (files.length === 0) {
        if (!cancelled)
          setRec({ kind: "none", planTextLen: 0, specTextLen: 0, flatPlan: false, hasFiles: false });
        return;
      }
      let planTextLen = 0;
      let specTextLen = 0;
      for (const f of files) {
        try {
          const ex = await extractFile({
            fileId: f.id,
            fileName: f.file_name,
            fileType: f.file_type,
            storagePath: f.storage_url,
            maxPages: 4,
          });
          const len = ex.pages.reduce((s, p) => s + (p.text?.trim().length ?? 0), 0);
          if (f.file_type === "plan") planTextLen += len;
          else specTextLen += len;
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      const hasPlan = files.some((f) => f.file_type === "plan");
      const flatPlan = hasPlan && planTextLen < 40;
      const kind: Recommendation["kind"] =
        flatPlan && specTextLen >= 40
          ? "vision"
          : flatPlan
            ? "vision"
            : planTextLen >= 40 || specTextLen >= 40
              ? "automatic"
              : "either";
      setRec({ kind, planTextLen, specTextLen, flatPlan, hasFiles: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 grid place-items-center flex-shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-[14px] font-semibold tracking-tight">Start Quantity Takeoff</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            This job has no takeoff data yet. Choose how Jennian IQ should prepare the first
            draft quantities.
          </div>
        </div>
      </div>

      {rec && (
        <div className="px-5 py-3 border-b border-border bg-muted/20 text-[12px] flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
          <div className="space-y-0.5">
            {!rec.hasFiles && (
              <div className="text-muted-foreground">
                Upload plans and specifications to begin.
              </div>
            )}
            {rec.hasFiles && rec.kind === "vision" && (
              <>
                <div>
                  <span className="text-muted-foreground">Recommended: </span>
                  <span className="font-medium">Run Vision Takeoff</span>
                </div>
                <div className="text-muted-foreground">
                  Flattened plan detected. Text-based takeoff cannot read this drawing.
                </div>
                {rec.specTextLen >= 40 && (
                  <div className="text-muted-foreground">
                    Specification text detected. Automatic Takeoff can extract
                    specification-backed items.
                  </div>
                )}
              </>
            )}
            {rec.hasFiles && rec.kind === "automatic" && (
              <>
                <div>
                  <span className="text-muted-foreground">Recommended: </span>
                  <span className="font-medium">Run Automatic Takeoff</span>
                </div>
                {rec.specTextLen >= 40 && (
                  <div className="text-muted-foreground">
                    Specification text detected. Automatic Takeoff can extract
                    specification-backed items.
                  </div>
                )}
              </>
            )}
            {rec.hasFiles && rec.kind === "either" && (
              <div className="text-muted-foreground">
                Choose Automatic Takeoff for readable text-layer plans, or Vision Takeoff for
                flattened/image-based plan PDFs.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-px bg-border">
        <button
          type="button"
          onClick={onAutomatic}
          className="text-left bg-card hover:bg-accent transition-colors p-5"
        >
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <div className="text-[13px] font-semibold tracking-tight">Run Automatic Takeoff</div>
          </div>
          <div className="mt-1.5 text-[11.5px] text-muted-foreground">
            Use this for readable text-layer plans and specification PDFs.
          </div>
        </button>
        <button
          type="button"
          onClick={onVision}
          className="text-left bg-card hover:bg-accent transition-colors p-5"
        >
          <div className="flex items-center gap-2">
            <ScanEye className="h-4 w-4 text-primary" />
            <div className="text-[13px] font-semibold tracking-tight">Run Vision Takeoff</div>
          </div>
          <div className="mt-1.5 text-[11.5px] text-muted-foreground">
            Use this for flattened/image-based plan PDFs.
          </div>
        </button>
        <button
          type="button"
          onClick={onWorkingPlan}
          className="text-left bg-card hover:bg-accent transition-colors p-5"
        >
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary" />
            <div className="text-[13px] font-semibold tracking-tight">Open Working Plan</div>
          </div>
          <div className="mt-1.5 text-[11.5px] text-muted-foreground">
            Measure manually from the selected plan page.
          </div>
        </button>
      </div>
    </div>
  );
}