import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { HouseFrame } from "@/components/jennian/HouseFrame";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { MODULES, moduleForQuantity, type ModuleId } from "@/lib/takeoff-modules";
import { listJobs, listQuantities, type Job, type Quantity } from "@/lib/jennian-data";
import { useEffect, useMemo, useState } from "react";
import {
  Layers, Ruler, DoorOpen, Layers2, Square, Frame, Mountain, Anchor, AlertTriangle,
  ArrowRight,
} from "lucide-react";

export const MODULE_ICONS = {
  "base-geometry": Ruler,
  "windows-doors": DoorOpen,
  "cladding": Square,
  "interior-linings": Layers2,
  "interior-trim": Frame,
  "roofing": Mountain,
  "foundation": Anchor,
  "risk-flags": AlertTriangle,
} as const;

export const Route = createFileRoute("/modules")({
  component: ModulesIndex,
  validateSearch: (s: Record<string, unknown>) => ({
    job: typeof s.job === "string" ? s.job : undefined,
  }),
});

function ModulesIndex() {
  const { job: jobId } = Route.useSearch();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | undefined>(jobId);
  const [quantities, setQuantities] = useState<Quantity[]>([]);

  useEffect(() => { listJobs().then(setJobs).catch(() => {}); }, []);
  useEffect(() => { setSelected(jobId); }, [jobId]);

  useEffect(() => {
    if (!selected) { setQuantities([]); return; }
    listQuantities(selected).then(setQuantities).catch(() => setQuantities([]));
  }, [selected]);

  const job = jobs.find((j) => j.id === selected);

  const stats = useMemo(() => {
    const map: Record<ModuleId, { total: number; review: number; high: number }> = {
      "base-geometry": { total: 0, review: 0, high: 0 },
      "windows-doors": { total: 0, review: 0, high: 0 },
      "cladding": { total: 0, review: 0, high: 0 },
      "interior-linings": { total: 0, review: 0, high: 0 },
      "interior-trim": { total: 0, review: 0, high: 0 },
      "roofing": { total: 0, review: 0, high: 0 },
      "foundation": { total: 0, review: 0, high: 0 },
      "risk-flags": { total: 0, review: 0, high: 0 },
    };
    for (const q of quantities) {
      const m = moduleForQuantity(q.quantity_type);
      map[m].total += 1;
      if (q.confidence === "high") map[m].high += 1;
      else map[m].review += 1;
    }
    return map;
  }, [quantities]);

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="Takeoff Modules"
          subtitle="Modular quantity extraction — review and approve by trade package."
          actions={
            <select
              className="rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value || undefined)}
            >
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.job_number} · {j.client_name}</option>
              ))}
            </select>
          }
        />

        {job && (
          <div className="mb-6 rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <div className="flex items-stretch">
              <div className="p-4 border-r border-border bg-muted/30 grid place-items-center">
                <PlanThumbnail storagePath={job.plan_thumbnail_url} size="md" />
              </div>
              <div className="flex-1 px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">Active job</div>
                  <div className="mt-0.5 text-[15px] font-semibold tracking-tight">{job.job_number} · {job.client_name}</div>
                  <div className="text-xs text-muted-foreground">{job.address}</div>
                </div>
                <Link
                  to="/review"
                  search={{ job: job.id }}
                  className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"
                >
                  Open full review <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MODULES.map((m) => {
            const Icon = MODULE_ICONS[m.id] ?? Layers;
            const s = stats[m.id];
            const hasData = s.total > 0;
            const allHigh = hasData && s.review === 0;
            return (
              <Link
                key={m.id}
                to="/modules/$moduleId"
                params={{ moduleId: m.id }}
                search={{ job: selected }}
                className="group relative rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] transition-all overflow-hidden"
              >
                {/* Subtle architectural corner cue */}
                <svg viewBox="0 0 80 80" className="absolute -top-4 -right-4 w-20 h-20 text-foreground/[0.04] pointer-events-none" aria-hidden>
                  <path d="M10 70 V20 L40 6 L70 20 V70" stroke="currentColor" strokeWidth="1" fill="none" />
                  <line x1="10" y1="20" x2="70" y2="20" stroke="currentColor" strokeWidth="1" />
                </svg>

                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-md bg-accent grid place-items-center text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
                <div className="mt-4 text-[15px] font-semibold tracking-tight">{m.name}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">{m.description}</div>

                <div className="mt-4 flex items-center gap-2">
                  {hasData ? (
                    <>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        <span className="text-foreground font-semibold">{s.total}</span> qty
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <ConfidencePill level={allHigh ? "high" : s.review >= s.high ? "mid" : "low"} />
                      {s.review > 0 && (
                        <span className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">
                          {s.review} to review
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/60">
                      {selected ? "No quantities yet" : `Maps to · ${m.exportSheet}`}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {!selected && (
          <div className="mt-10 rounded-xl border border-dashed border-border bg-card p-10 grid place-items-center text-center">
            <HouseFrame className="w-56 text-muted-foreground/40" />
            <div className="mt-4 text-sm font-medium">Select a job to begin module review</div>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Each module groups extracted quantities so estimators can review, override, and approve trade packages independently.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
