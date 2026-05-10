import { Link } from "@tanstack/react-router";
import type { LatestTakeoffRun } from "@/lib/takeoff/run";
import { FileSearch, Ruler, ListChecks, Layers, AlertCircle, ClipboardCheck, Eye } from "lucide-react";

const GEOMETRY_DEFERRED = [
  "Internal Wall Length (if not printed)",
  "External Perimeter (if not printed)",
  "Garage Area (if not printed)",
  "Living Area (if not printed)",
  "Room areas (if not printed)",
  "Roof area (if not printed)",
];

export function TakeoffSummary({
  run, jobId,
}: {
  run: LatestTakeoffRun;
  jobId: string;
}) {
  const s = run.summary;
  const failed = run.status === "failed";
  const scaleMissing = !s?.scaleText;
  const noWorkingPlan = !s?.workingFileId;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-tight">Automatic Takeoff Summary</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {failed
              ? `Last run failed${run.error_message ? ` — ${run.error_message}` : ""}.`
              : `Last run ${new Date(run.completed_at ?? run.started_at).toLocaleString()}. Draft quantities prepared for review.`}
          </div>
        </div>
      </div>

      {s && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          <Card icon={<FileSearch className="h-4 w-4" />} label="Working Plan Selected"
            value={s.workingFileName ? `${s.workingFileName}` : "Not identified"}
            sub={s.workingFileName ? `${s.workingPageType ?? "Floorplan"} · page ${s.workingPageNumber} · ${s.workingPageConfidence ?? "low"} confidence` : "No floorplan candidate found in uploaded plans."} />
          <Card icon={<Ruler className="h-4 w-4" />} label="Scale Status"
            value={s.scaleText ?? s.scaleStatus}
            sub={s.scaleText ? "Auto-calibrated from text — review before measuring." : "Manual calibration required before measured quantities can be created."} />
          <Card icon={<ListChecks className="h-4 w-4" />} label="IQ Core Draft Quantities"
            value={String(s.quantitiesInserted + s.quantitiesUpdated)}
            sub={`${s.quantitiesInserted} new · ${s.quantitiesUpdated} refreshed${s.quantityConflicts ? ` · ${s.quantityConflicts} conflicts` : ""}`} />
          <Card icon={<Layers className="h-4 w-4" />} label="Openings Found"
            value={String(s.openingsInserted)}
            sub={s.openingsSkipped ? `${s.openingsSkipped} draft already existed.` : "Each opening starts as Review Required."} />
          <Card icon={<ClipboardCheck className="h-4 w-4" />} label="Module Draft Items"
            value={String(s.moduleItemsInserted + s.moduleItemsUpdated)}
            sub={`${s.moduleItemsInserted} new · ${s.moduleItemsUpdated} refreshed${s.moduleItemConflicts ? ` · ${s.moduleItemConflicts} conflicts` : ""}`} />
          <Card icon={<AlertCircle className="h-4 w-4" />} label="Review Required Items"
            value={String(s.reviewRequiredCount)}
            sub={`${s.highCount} high · ${s.midCount} medium · ${s.lowCount} low confidence`} />
        </div>
      )}

      {(scaleMissing || noWorkingPlan) && !failed && (
        <div className="px-5 py-3 border-t border-border bg-muted/30 text-[11.5px] text-muted-foreground space-y-1">
          {noWorkingPlan && (
            <div>No floorplan was confidently identified in the uploaded plans. Open the Working Plan tools to pick a page manually.</div>
          )}
          {scaleMissing && (
            <div>Manual calibration required before measured quantities can be created.</div>
          )}
        </div>
      )}

      <div className="px-5 py-3 border-t border-border bg-muted/20">
        <div className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
          Not yet auto-detected — measure manually
        </div>
        <div className="text-[11.5px] text-muted-foreground">
          Geometry measurement has not been auto-detected in this pass. Use the Working Plan tools to measure perimeter, areas, and internal walls. Affected:
        </div>
        <ul className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
          {GEOMETRY_DEFERRED.map((g) => (
            <li key={g} className="flex items-start gap-1.5">
              <span className="text-muted-foreground/60 mt-1.5 inline-block h-1 w-1 rounded-full bg-current flex-shrink-0" />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-2">
        <Link to="/review" search={{ job: jobId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
          <ClipboardCheck className="h-3 w-3" /> Review IQ Core
        </Link>
        <Link to="/modules/$moduleId" params={{ moduleId: "iq-framing" }} search={{ job: jobId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
          <Layers className="h-3 w-3" /> Review Modules
        </Link>
        <Link to="/jobs/$jobId" params={{ jobId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
          <Eye className="h-3 w-3" /> Open Working Plan
        </Link>
      </div>
    </div>
  );
}

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-6 w-6 rounded-md bg-primary/10 grid place-items-center text-primary">{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div className="mt-2 text-[15px] font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
