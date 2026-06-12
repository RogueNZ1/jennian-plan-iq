import { Ruler, Sparkles } from "lucide-react";

export function StartTakeoffPanel({
  onStart,
  onWorkingPlan,
  detecting,
}: {
  onStart: () => void;
  onWorkingPlan: () => void;
  detecting?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 grid place-items-center flex-shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-[14px] font-semibold tracking-tight">Start Quantity Takeoff</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            No takeoff data yet. IQ will analyse the uploaded plans and prepare draft quantities
            automatically.
          </div>
        </div>
      </div>

      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onStart}
          disabled={detecting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 shadow-sm disabled:opacity-70"
        >
          <Sparkles className="h-4 w-4" />
          {detecting ? "Analysing plans…" : "Run Takeoff"}
        </button>
        <button
          type="button"
          onClick={onWorkingPlan}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <Ruler className="h-3.5 w-3.5" /> Manual working plan
        </button>
      </div>
    </div>
  );
}
