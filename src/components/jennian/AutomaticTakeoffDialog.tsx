import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { runAutomaticTakeoff, type TakeoffStep, type TakeoffSummary } from "@/lib/takeoff/run";

const STEPS: { key: TakeoffStep; label: string }[] = [
  { key: "reviewing_files", label: "Reviewing uploaded files" },
  { key: "identifying_floorplan", label: "Identifying floorplan" },
  { key: "reading_scale", label: "Reading scale and dimensions" },
  { key: "preparing_quantities", label: "Preparing draft quantities" },
  { key: "preparing_modules", label: "Preparing module review items" },
  { key: "ready", label: "Ready for review" },
];

export function AutomaticTakeoffDialog({
  open,
  onOpenChange,
  jobId,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string;
  onCompleted?: (s: TakeoffSummary) => void;
}) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState<TakeoffStep>("reviewing_files");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TakeoffSummary | null>(null);

  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    if (!open) {
      setRunning(false);
      setDone(false);
      setStep("reviewing_files");
      setMessage("");
      setError(null);
      setSummary(null);
      return;
    }
    let cancelled = false;
    setRunning(true);
    setError(null);
    runAutomaticTakeoff({
      jobId,
      onProgress: (p) => {
        if (cancelled) return;
        setStep(p.step);
        setMessage(p.message);
      },
    })
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        setDone(true);
        setRunning(false);
        onCompletedRef.current?.(s);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Automatic takeoff failed.");
        setRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const progress = done ? 100 : Math.max(5, ((stepIndex + 1) / STEPS.length) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Automatic Takeoff</DialogTitle>
          <DialogDescription>
            Reviewing uploaded plans and specifications to prepare draft quantities for review.
            Nothing is approved automatically — every draft is marked Review Required and includes
            its source evidence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Progress value={progress} />
          <ol className="space-y-1.5 text-[12.5px]">
            {STEPS.map((s, i) => {
              const reached = i < stepIndex || done;
              const active = !done && i === stepIndex && running;
              return (
                <li key={s.key} className="flex items-center gap-2">
                  <span className="h-4 w-4 grid place-items-center">
                    {reached ? (
                      <Check className="h-4 w-4 text-confidence-high" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    )}
                  </span>
                  <span
                    className={
                      reached
                        ? "text-foreground"
                        : active
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                    }
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {message && !error && (
            <div className="text-[11.5px] text-muted-foreground">{message}</div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Automatic takeoff failed</div>
                <div className="mt-0.5 text-[11.5px]">{error}</div>
              </div>
            </div>
          )}

          {done && summary && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-[12px] space-y-1">
              <div>
                <span className="text-muted-foreground">Files scanned: </span>
                <span className="font-medium">{summary.filesScanned}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Working plan: </span>
                <span className="font-medium">
                  {summary.workingFileName
                    ? `${summary.workingFileName} · page ${summary.workingPageNumber}`
                    : "Not identified"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Scale: </span>
                <span className="font-medium">{summary.scaleText ?? summary.scaleStatus}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Draft quantities: </span>
                <span className="font-medium">
                  {summary.quantitiesInserted + summary.quantitiesUpdated}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Openings: </span>
                <span className="font-medium">{summary.openingsInserted}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Module review items: </span>
                <span className="font-medium">
                  {summary.moduleItemsInserted + summary.moduleItemsUpdated}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Review Required: </span>
                <span className="font-medium">{summary.reviewRequiredCount}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running && !done && !error}
          >
            {done || error ? "Close" : "Running…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
