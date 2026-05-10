import { useEffect, useState } from "react";
import { loadJobTimeline, type JobTimelineEntry } from "@/lib/iq-modules";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { History } from "lucide-react";

type Filter = "all" | "measurement" | "module" | "override" | "export";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "measurement", label: "Measurements" },
  { id: "module", label: "Module Changes" },
  { id: "override", label: "Overrides" },
  { id: "export", label: "Exports" },
];

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    measurement_created: "Measurement created",
    measurement_deleted: "Measurement deleted",
    measurement_updated: "Measurement updated",
    review_status_changed: "Review status changed",
    pushed_to_module: "Pushed to module",
    opening_created: "Opening created",
    opening_updated: "Opening updated",
    opening_deleted: "Opening deleted",
    calibration_created: "Calibration set",
    calibration_updated: "Calibration updated",
    measurement_pushed: "Measurement pushed",
    measurement_push_conflict: "Push conflict — review required",
    manual_override: "Manual override",
    edit_quantity: "Quantity edited",
    edit_notes: "Notes edited",
    set_review_status: "Review status changed",
    mark_reviewed: "Module marked reviewed",
    approve_module: "Module approved",
    recalculate_module: "Module recalculated",
    recalculate_drift: "Drift detected — review required",
    recalculate_matched: "Source value matched",
    source_missing: "Source missing — review required",
    source_edited: "Source edited — review required",
    source_deleted: "Source deleted — review required",
    export_module_csv: "Module CSV exported",
    export_approved_quantities: "Approved quantities exported",
    export_csv: "CSV exported",
    vision_takeoff_started: "Vision takeoff started",
    vision_model_called: "Vision model reviewed page",
    vision_page_skipped: "Vision page skipped",
    vision_takeoff_warning: "Vision warning",
    vision_quantity_created: "Vision quantity created",
    vision_opening_created: "Vision opening created",
    vision_opening_refreshed: "Vision opening refreshed",
    vision_opening_conflict: "Vision opening conflict — review required",
    vision_measurement_created: "Vision measurement created",
    vision_module_item_created: "Vision module item created",
    vision_takeoff_drift: "Vision takeoff drift detected",
    vision_page_processed: "Vision page processed",
    vision_takeoff_failed: "Vision takeoff failed",
    vision_takeoff_completed: "Vision takeoff completed",
  };
  if (map[action]) return map[action];
  if (action.startsWith("vision_")) {
    const cleaned = action.replace(/_/g, " ");
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return action;
}

function matchesFilter(e: JobTimelineEntry, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "measurement") return e.kind === "measurement";
  if (f === "export") return e.kind === "export";
  if (f === "override") return e.kind === "module" && e.action === "manual_override";
  if (f === "module") return e.kind === "module" && e.action !== "manual_override";
  return true;
}

export function JobAuditTimeline({
  jobId, open, onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [entries, setEntries] = useState<JobTimelineEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadJobTimeline(jobId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, jobId]);

  const visible = entries.filter((e) => matchesFilter(e, filter));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Audit Timeline
          </SheetTitle>
          <SheetDescription>
            Every change to plan measurements, openings, module quantities and exports for this job.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
          {!loading && visible.length === 0 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              No audit entries yet.
            </div>
          )}
          {visible.map((e) => (
            <div key={`${e.kind}-${e.id}`} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[11.5px] font-medium tracking-tight">
                  {actionLabel(e.action)}
                </div>
                <div className="text-[10.5px] text-muted-foreground tabular-nums">
                  {new Date(e.created_at).toLocaleString()}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {e.module_id && <span>Module: <span className="text-foreground">{e.module_id}</span></span>}
                {e.measurement_id && <span>Measurement: <span className="text-foreground tabular-nums">{e.measurement_id.slice(0, 8)}</span></span>}
                {e.opening_id && <span>Opening: <span className="text-foreground tabular-nums">{e.opening_id.slice(0, 8)}</span></span>}
                {e.item_id && <span>Item: <span className="text-foreground tabular-nums">{e.item_id.slice(0, 8)}</span></span>}
              </div>
              {(e.previous_value || e.new_value) && (
                <div className="mt-1 text-[11px] tabular-nums">
                  <span className="text-muted-foreground">{e.previous_value ?? "—"}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span>{e.new_value ?? "—"}</span>
                </div>
              )}
              {e.notes && (
                <div className="mt-1 text-[11px] text-muted-foreground">{e.notes}</div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}