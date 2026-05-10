import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { HouseFrame } from "@/components/jennian/HouseFrame";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import {
  IQ_MODULES, loadModuleState, confidencePercent, STATUS_LABEL,
  type IQModuleId, type IQModuleStatus,
} from "@/lib/iq-modules";
import { listJobs, type Job } from "@/lib/jennian-data";
import { useEffect, useMemo, useState } from "react";
import {
  Layers, Ruler, Zap, Droplets, PaintRoller, Hammer, Square, Mountain,
  AlertTriangle, ShoppingCart, ArrowRight,
} from "lucide-react";

const MODULE_ICONS: Record<IQModuleId, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  "iq-core":        Ruler,
  "iq-electrical":  Zap,
  "iq-plumbing":    Droplets,
  "iq-linings":     PaintRoller,
  "iq-framing":     Hammer,
  "iq-cladding":    Square,
  "iq-roofing":     Mountain,
  "iq-margin":      AlertTriangle,
  "iq-procurement": ShoppingCart,
};

export const Route = createFileRoute("/modules")({
  component: ModulesIndex,
  validateSearch: (s: Record<string, unknown>) => ({
    job: typeof s.job === "string" ? s.job : undefined,
  }),
});

type ModuleSummary = {
  status: IQModuleStatus;
  confidence: number;
  itemCount: number;
};

function ModulesIndex() {
  const { job: jobId } = Route.useSearch();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | undefined>(jobId);

  useEffect(() => { listJobs().then(setJobs).catch(() => {}); }, []);
  useEffect(() => { setSelected(jobId); }, [jobId]);

  const job = jobs.find((j) => j.id === selected);
  const jobKey = selected ?? "preview";

  const summaries = useMemo<Record<IQModuleId, ModuleSummary>>(() => {
    const out = {} as Record<IQModuleId, ModuleSummary>;
    for (const m of IQ_MODULES) {
      const s = loadModuleState(jobKey, m);
      out[m.id] = {
        status: s.status,
        confidence: confidencePercent(s.items),
        itemCount: s.items.length,
      };
    }
    return out;
  }, [jobKey]);

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="Modules"
          subtitle="Modular extraction packages — Core, Electrical, Plumbing, Framing, Cladding, Roofing, Margin and Procurement."
          actions={
            <select
              className="rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selected ?? ""}
              onChange={(e) => setSelected(e.target.value || undefined)}
            >
              <option value="">Preview (no job)…</option>
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
                  Open quantity review <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {IQ_MODULES.map((m) => {
            const Icon = MODULE_ICONS[m.id] ?? Layers;
            const s = summaries[m.id];
            return (
              <div
                key={m.id}
                className="group relative rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] transition-all overflow-hidden flex flex-col"
              >
                <svg viewBox="0 0 80 80" className="absolute -top-4 -right-4 w-20 h-20 text-foreground/[0.04] pointer-events-none" aria-hidden>
                  <path d="M10 70 V20 L40 6 L70 20 V70" stroke="currentColor" strokeWidth="1" fill="none" />
                  <line x1="10" y1="20" x2="70" y2="20" stroke="currentColor" strokeWidth="1" />
                </svg>

                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-md bg-accent grid place-items-center text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <StatusChip status={s.status} />
                </div>

                <div className="mt-4 text-[15px] font-semibold tracking-tight">{m.name}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">{m.shortDescription}</div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric label="Items" value={s.itemCount.toString()} />
                  <Metric label="Confidence" value={`${s.confidence}%`} accent={s.confidence >= 80} />
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                    Export · {m.exportSheet}
                  </span>
                  <Link
                    to="/modules/$moduleId"
                    params={{ moduleId: m.id }}
                    search={{ job: selected }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                  >
                    Open Module <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {!selected && (
          <div className="mt-10 rounded-xl border border-dashed border-border bg-card p-10 grid place-items-center text-center">
            <HouseFrame className="w-56 text-muted-foreground/40" />
            <div className="mt-4 text-sm font-medium">Select a job for live module data</div>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Modules are showing preview data. Pick a job to load that job's saved module state and edits.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tabular-nums tracking-tight ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

export function StatusChip({ status }: { status: IQModuleStatus }) {
  const cls: Record<IQModuleStatus, string> = {
    not_started: "bg-muted text-muted-foreground border-border",
    ready:       "bg-confidence-high-bg text-confidence-high border-transparent",
    in_review:   "bg-confidence-mid-bg text-confidence-mid border-transparent",
    approved:    "bg-primary/10 text-primary border-transparent",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${cls[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}