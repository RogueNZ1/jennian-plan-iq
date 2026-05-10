import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { HouseFrame } from "@/components/jennian/HouseFrame";
import { MODULES } from "@/lib/takeoff-modules";
import { listJobs, type Job } from "@/lib/jennian-data";
import { useEffect, useState } from "react";
import {
  Layers, Ruler, DoorOpen, Layers3, Square, Frame, Mountain, Anchor, AlertTriangle,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/modules")({
  component: ModulesLayout,
  validateSearch: (s: Record<string, unknown>) => ({
    job: typeof s.job === "string" ? s.job : undefined,
  }),
});

function ModulesLayout() {
  // The index of /modules shows the module grid; child routes via <Outlet/> render module detail.
  return (
    <Outlet />
  );
}

export const MODULE_ICONS = {
  "base-geometry": Ruler,
  "windows-doors": DoorOpen,
  "cladding": Square,
  "interior-linings": Layers3,
  "interior-trim": Frame,
  "roofing": Mountain,
  "foundation": Anchor,
  "risk-flags": AlertTriangle,
} as const;

/* Default index renders the grid */
export function ModulesIndex() {
  const { job: jobId } = Route.useSearch();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | undefined>(jobId);

  useEffect(() => { listJobs().then(setJobs).catch(() => {}); }, []);
  useEffect(() => { setSelected(jobId); }, [jobId]);

  const job = jobs.find((j) => j.id === selected);

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
          <div className="mb-6 rounded-lg border border-border bg-card px-5 py-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Active job</div>
              <div className="mt-0.5 font-medium">{job.job_number} · {job.client_name}</div>
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
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MODULES.map((m) => {
            const Icon = MODULE_ICONS[m.id] ?? Layers;
            return (
              <Link
                key={m.id}
                to="/modules/$moduleId"
                params={{ moduleId: m.id }}
                search={{ job: selected }}
                className="group rounded-lg border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-md bg-accent grid place-items-center text-primary">
                    <Icon className="h-4.5 w-4.5" strokeWidth={1.6} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                </div>
                <div className="mt-4 text-[15px] font-semibold tracking-tight">{m.name}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">{m.description}</div>
                <div className="mt-4 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Maps to · <span className="text-foreground/70">{m.exportSheet}</span>
                </div>
              </Link>
            );
          })}
        </div>

        {!selected && (
          <div className="mt-10 rounded-lg border border-dashed border-border bg-card p-10 grid place-items-center text-center">
            <HouseFrame className="w-48 text-muted-foreground/40" />
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