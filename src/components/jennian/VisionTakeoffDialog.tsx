import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { VisionTakeoffPanel } from "./VisionTakeoffPanel";
import { Loader2 } from "lucide-react";

type FlatFile = { fileId: string; fileName: string; pageCount: number };

export function VisionTakeoffDialog({
  open, onOpenChange, jobId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string;
}) {
  const [files, setFiles] = useState<FlatFile[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFiles(null);
    (async () => {
      const { data } = await supabase
        .from("uploaded_files")
        .select("id, file_name, file_type")
        .eq("job_id", jobId);
      if (cancelled) return;
      const planFiles = (data ?? [])
        .filter((r) => ((r.file_type as string) ?? "plan") === "plan")
        .map((r) => ({
          fileId: r.id as string,
          fileName: r.file_name as string,
          pageCount: 0,
        }));
      setFiles(planFiles);
    })();
    return () => { cancelled = true; };
  }, [open, jobId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vision Takeoff</DialogTitle>
          <DialogDescription>
            Run Vision Takeoff on flattened/image-based plan PDFs.
          </DialogDescription>
        </DialogHeader>
        {files === null && (
          <div className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading plan files…
          </div>
        )}
        {files !== null && files.length === 0 && (
          <div className="py-8 text-[12px] text-muted-foreground">
            No plan files available. Upload a plan PDF before running Vision Takeoff.
          </div>
        )}
        {files !== null && files.length > 0 && (
          <VisionTakeoffPanel jobId={jobId} flattenedFiles={files} />
        )}
      </DialogContent>
    </Dialog>
  );
}