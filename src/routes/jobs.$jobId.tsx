import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { Breadcrumbs } from "@/components/jennian/Breadcrumbs";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { PlanViewer } from "@/components/jennian/PlanViewer";
import { getJob, type Job } from "@/lib/jennian-data";
import {
  IQ_MODULES, seedAllModulesForJob, loadModuleRuns,
  statusBadgeClass, statusLabel,
  type ModuleRun,
} from "@/lib/iq-modules";
import {
  Ruler, Zap, Droplets, PaintRoller, Hammer, Square, Mountain,
  AlertTriangle, ShoppingCart, ClipboardCheck, Eye, FileSpreadsheet, ArrowRight, History,
  Wand2, RefreshCw,
} from "lucide-react";
import { JobAuditTimeline } from "@/components/jennian/JobAuditTimeline";
import { AutomaticTakeoffDialog } from "@/components/jennian/AutomaticTakeoffDialog";
import { TakeoffSummary } from "@/components/jennian/TakeoffSummary";
import { loadLatestTakeoffRun, type LatestTakeoffRun } from "@/lib/takeoff/run";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobDetail });

const ICONS: Record<string, typeof Ruler> = {
  "iq-core": Ruler, "iq-electrical": Zap, "iq-plumbing": Droplets,
  "iq-linings": PaintRoller, "iq-framing": Hammer, "iq-cladding": Square,
  "iq-roofing": Mountain, "iq-margin": AlertTriangle, "iq-procurement": ShoppingCart,
};

function JobDetail() {
  const { jobId } = Route.useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [runs, setRuns] = useState<ModuleRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  const [takeoffRun, setTakeoffRun] = useState<LatestTakeoffRun | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const j = await getJob(jobId).catch(() => null);
      if (cancelled) return;
      setJob(j);
      try {
        await seedAllModulesForJob(jobId);
        const r = await loadModuleRuns(jobId);
        if (!cancelled) setRuns(r);
        const tr = await loadLatestTakeoffRun(jobId).catch(() => null);
        if (!cancelled) setTakeoffRun(tr);
      } catch {
        /* ignore — modules will surface their own errors */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  const runByModule: Record<string, ModuleRun | undefined> = Object.fromEntries(
    runs.map((r) => [r.module_id, r]),
  );

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <Breadcrumbs items={[
          { label: "Jobs", to: "/jobs" },
          { label: job?.job_number ?? jobId },
        ]} />

        <PageHeader
          title={job?.job_number ?? "Job"}
          subtitle={job ? `${job.client_name} · ${job.address}` : "Loading…"}
          actions={
            <div className="flex items-center gap-2">
              {takeoffRun ? (
                <button
                  type="button"
                  onClick={() => setRerunConfirmOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <RefreshCw className="h-4 w-4" /> Re-run Automatic Takeoff
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTakeoffOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <Wand2 className="h-4 w-4" /> Run Automatic Takeoff
                </button>
              )}
              <button
                type="button"
                onClick={() => setTimelineOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <History className="h-4 w-4" /> Audit Timeline
              </button>
              <button
                type="button"
                onClick={() => setViewerOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Eye className="h-4 w-4" /> View Plans
              </button>
              <Link
                to="/review"
                search={{ job: jobId }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <ClipboardCheck className="h-4 w-4" /> Open IQ Core Review
              </Link>
            </div>
          }
        />

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 mb-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <PlanThumbnail storagePath={job?.plan_thumbnail_url} size="lg" className="w-full" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <Tile label="Status" node={job ? <StatusBadge status={job.status} /> : <span>—</span>} />
              <Tile label="Template" value={job?.template ?? "—"} />
              <Tile label="Created" value={job ? new Date(job.created_at).toLocaleDateString() : "—"} />
              <Tile label="Modules" value={`${runs.length}/${IQ_MODULES.length}`} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold tracking-tight">Modules</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {loading ? "Loading…" : `${runs.filter(r => r.status === "approved").length} approved · ${runs.filter(r => r.required).length} required`}
                </div>
              </div>
              <Link
                to="/review"
                search={{ job: jobId }}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                IQ Core Review <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
              {IQ_MODULES.map((m) => {
                const run = runByModule[m.id];
                const status = run?.status ?? "not_started";
                const Icon = ICONS[m.id] ?? Ruler;
                return (
                  <Link
                    key={m.id}
                    to="/modules/$moduleId"
                    params={{ moduleId: m.id }}
                    search={{ job: jobId }}
                    className="block bg-card hover:bg-accent transition-colors p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="h-8 w-8 rounded-md bg-primary/10 grid place-items-center">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(status)}`}>
                        {statusLabel(status)}
                      </span>
                    </div>
                    <div className="mt-3 text-[13.5px] font-semibold tracking-tight">{m.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{m.shortDescription}</div>
                    <div className="mt-2 text-[10.5px] text-muted-foreground tabular-nums">
                      {run ? `${run.item_count} items · ${run.confidence_avg ?? 0}% confidence` : "Not started"}
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <Link
                to="/review"
                search={{ job: jobId }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
              >
                <FileSpreadsheet className="h-3 w-3" /> Export from Review
              </Link>
            </div>
          </div>
        </div>

        {takeoffRun && (
          <div className="mb-6">
            <TakeoffSummary run={takeoffRun} jobId={jobId} />
          </div>
        )}
      </div>
      <PlanViewer
        open={viewerOpen}
        jobId={viewerOpen ? jobId : null}
        jobNumber={job?.job_number}
        onClose={() => setViewerOpen(false)}
      />
      <JobAuditTimeline
        jobId={jobId}
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
      />
      <AutomaticTakeoffDialog
        open={takeoffOpen}
        onOpenChange={setTakeoffOpen}
        jobId={jobId}
        onCompleted={async () => {
          const tr = await loadLatestTakeoffRun(jobId).catch(() => null);
          setTakeoffRun(tr);
          const r = await loadModuleRuns(jobId).catch(() => []);
          setRuns(r);
        }}
      />
      <AlertDialog open={rerunConfirmOpen} onOpenChange={setRerunConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-run Automatic Takeoff?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new draft takeoff from the uploaded files. Confirmed,
              approved, and user-overridden values will not be overwritten. Differences
              will be marked Review Required.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setRerunConfirmOpen(false); setTakeoffOpen(true); }}
            >
              Re-run Takeoff
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function Tile({ label, value, node }: { label: string; value?: string; node?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[12px] font-medium truncate">{node ?? value ?? "—"}</div>
    </div>
  );
}