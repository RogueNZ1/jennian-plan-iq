import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { useRoles } from "@/hooks/use-roles";
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
  AlertTriangle, ShoppingCart, ClipboardCheck, Eye, FileSpreadsheet, FileText, ArrowRight, History,
  Wand2, RefreshCw, Package, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildQSExportData, writeIQDataSheet,
  buildElectricalSchedule, electricalScheduleToCSV,
} from "@/lib/iq-qs-export";
import { exportSMWDocument } from "@/lib/iq-smw-export";
import { exportCartersLoads } from "@/lib/iq-carters-loads";
import { JobAuditTimeline } from "@/components/jennian/JobAuditTimeline";
import { AutomaticTakeoffDialog } from "@/components/jennian/AutomaticTakeoffDialog";
import { TakeoffSummary } from "@/components/jennian/TakeoffSummary";
import { loadLatestTakeoffRun, type LatestTakeoffRun } from "@/lib/takeoff/run";
import { StartTakeoffPanel } from "@/components/jennian/StartTakeoffPanel";
import { StartTakeoffDialog } from "@/components/jennian/StartTakeoffDialog";
import { VisionTakeoffDialog } from "@/components/jennian/VisionTakeoffDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  generateElectricalSchedule, buildRoomSpecsFromCounts, electricalScheduleToCSV as layoutToCSV,
  type RoomCounts,
} from "@/lib/iq-electrical-layout";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobDetail });

const ICONS: Record<string, typeof Ruler> = {
  "iq-core": Ruler, "iq-electrical": Zap, "iq-plumbing": Droplets,
  "iq-linings": PaintRoller, "iq-framing": Hammer, "iq-cladding": Square,
  "iq-roofing": Mountain, "iq-margin": AlertTriangle, "iq-procurement": ShoppingCart,
};

function JobDetail() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const { isOwner } = useRoles();
  const [job, setJob] = useState<Job | null>(null);
  const [runs, setRuns] = useState<ModuleRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const [rerunConfirmOpen, setRerunConfirmOpen] = useState(false);
  const [takeoffRun, setTakeoffRun] = useState<LatestTakeoffRun | null>(null);
  const [startChooserOpen, setStartChooserOpen] = useState(false);
  const [hasTakeoffData, setHasTakeoffData] = useState<boolean | null>(null);
  const [exportingQS, setExportingQS] = useState(false);
  const [exportingSMW, setExportingSMW] = useState(false);
  const [exportingElec, setExportingElec] = useState(false);
  const [exportingCarters, setExportingCarters] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [electricalFile, setElectricalFile] = useState<{ id: string; file_name: string; storage_url: string } | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [roomCounts, setRoomCounts] = useState<RoomCounts>({
    masterBedrooms: 1, bedrooms: 3, bathrooms: 1, ensuites: 1,
    kitchen: 1, living: 1, dining: 1, study: 0,
    laundry: true, garage: true, alfresco: false, hallway: true,
  });

  async function refreshHasData() {
    const counts = await Promise.all([
      supabase.from("extracted_quantities").select("id", { count: "exact", head: true }).eq("job_id", jobId),
      supabase.from("module_items").select("id", { count: "exact", head: true }).eq("job_id", jobId),
      supabase.from("plan_measurements").select("id", { count: "exact", head: true }).eq("job_id", jobId),
      supabase.from("opening_schedule").select("id", { count: "exact", head: true }).eq("job_id", jobId),
    ]);
    const total = counts.reduce((s, r) => s + (r.count ?? 0), 0);
    setHasTakeoffData(total > 0);
  }

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
        await refreshHasData();
        const { data: efRows } = await supabase
          .from("uploaded_files")
          .select("id, file_name, storage_url")
          .eq("job_id", jobId)
          .eq("file_type", "electrical")
          .limit(1);
        if (!cancelled) setElectricalFile(efRows?.[0] ?? null);
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

  const showStartPanel = !loading && hasTakeoffData === false && !takeoffRun;

  async function handleExportIQData() {
    setExportingQS(true);
    try {
      const data = await buildQSExportData(jobId);
      const bytes = writeIQDataSheet(data);
      const surname = data.clientSurname || data.clientName.split(" ").pop() || "Client";
      const filename = `${data.jmwNumber}-IQ-Data-${surname}.xlsx`;
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("IQ data sheet exported — paste into your QS");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingQS(false);
    }
  }

  async function handleExportSMW() {
    setExportingSMW(true);
    try {
      const { blob, filename } = await exportSMWDocument(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("SMW document exported");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingSMW(false);
    }
  }

  async function handleExportElectrical() {
    setExportingElec(true);
    try {
      const data = await buildQSExportData(jobId);
      const schedule = buildElectricalSchedule(data);
      const csv = electricalScheduleToCSV(schedule);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.jobNumber}-Electrical-Schedule.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Electrical schedule exported");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingElec(false);
    }
  }

  async function handleExportCarters() {
    setExportingCarters(true);
    try {
      const { blob, filename } = await exportCartersLoads(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Carters stage loads exported — send to Kirsty");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingCarters(false);
    }
  }

  async function handleDeleteJob() {
    setDeleting(true);
    try {
      await Promise.all([
        supabase.from("module_items").delete().eq("job_id", jobId),
        supabase.from("module_runs").delete().eq("job_id", jobId),
        supabase.from("extracted_quantities").delete().eq("job_id", jobId),
        supabase.from("opening_schedule").delete().eq("job_id", jobId),
        supabase.from("plan_measurements").delete().eq("job_id", jobId),
        supabase.from("takeoff_runs").delete().eq("job_id", jobId),
        supabase.from("export_logs").delete().eq("job_id", jobId),
        supabase.from("uploaded_files").delete().eq("job_id", jobId),
        supabase.from("vision_takeoff_pages").delete().eq("job_id", jobId),
      ]);
      const { error } = await supabase.from("jobs").delete().eq("id", jobId);
      if (error) throw error;
      toast.success("Job deleted");
      navigate({ to: "/jobs" });
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }


  async function handleViewElectricalPlan() {
    if (!electricalFile) return;
    const { data } = await supabase.storage.from("job-files").createSignedUrl(electricalFile.storage_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Could not open electrical plan");
  }

  function handleGenerateElectrical() {
    const rooms = buildRoomSpecsFromCounts(roomCounts);
    const schedule = generateElectricalSchedule(rooms);
    const csv = layoutToCSV(schedule);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job?.job_number ?? jobId}-Electrical-Layout.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Electrical layout generated and downloaded");
    setGeneratorOpen(false);
  }

  function openWorkingPlan() {
    navigate({ to: "/review", search: { job: jobId, tab: "working" } });
  }

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
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-card px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete Job
                </button>
              )}
              {takeoffRun ? (
                <>
                  <button
                    type="button"
                    onClick={() => setRerunConfirmOpen(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    <RefreshCw className="h-4 w-4" /> Re-run Takeoff
                  </button>
                  <Link
                    to="/review"
                    search={{ job: jobId }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <ClipboardCheck className="h-4 w-4" /> Review Takeoff Results
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setStartChooserOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Wand2 className="h-4 w-4" /> Start Takeoff
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
              {electricalFile && (
                <button
                  type="button"
                  onClick={handleViewElectricalPlan}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <Zap className="h-4 w-4" /> Electrical Plan
                </button>
              )}
              <button
                type="button"
                onClick={() => setGeneratorOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Zap className="h-4 w-4" /> Generate Electrical Layout
              </button>
              <div className="flex flex-col items-end gap-0.5">
                <button
                  type="button"
                  onClick={handleExportIQData}
                  disabled={exportingQS}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {exportingQS ? "Exporting…" : "Export Excel"}
                </button>
                <span className="text-[10px] text-muted-foreground">Paste into your master QS spreadsheet</span>
              </div>
              <button
                type="button"
                onClick={handleExportSMW}
                disabled={exportingSMW}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                {exportingSMW ? "Exporting…" : "Export SMW"}
              </button>
              <button
                type="button"
                onClick={handleExportElectrical}
                disabled={exportingElec}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                {exportingElec ? "Exporting…" : "Electrical Schedule"}
              </button>
              {hasTakeoffData && (
                <button
                  type="button"
                  onClick={handleExportCarters}
                  disabled={exportingCarters}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  <Package className="h-4 w-4" />
                  {exportingCarters ? "Exporting…" : "Carters Loads"}
                </button>
              )}
            </div>
          }
        />

        {showStartPanel && (
          <div className="mb-6">
            <StartTakeoffPanel
              jobId={jobId}
              onAutomatic={() => setTakeoffOpen(true)}
              onVision={() => setVisionOpen(true)}
              onWorkingPlan={openWorkingPlan}
            />
          </div>
        )}

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
          await refreshHasData();
        }}
      />
      <StartTakeoffDialog
        open={startChooserOpen}
        onOpenChange={setStartChooserOpen}
        onAutomatic={() => { setStartChooserOpen(false); setTakeoffOpen(true); }}
        onVision={() => { setStartChooserOpen(false); setVisionOpen(true); }}
        onWorkingPlan={() => { setStartChooserOpen(false); openWorkingPlan(); }}
      />
      <VisionTakeoffDialog
        open={visionOpen}
        onOpenChange={setVisionOpen}
        jobId={jobId}
      />
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{job?.job_number ?? jobId}</strong> and all related
              quantities, openings, module items, and takeoff data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJob}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={generatorOpen} onOpenChange={setGeneratorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Electrical Layout</DialogTitle>
            <DialogDescription>
              Enter room counts to generate the Jennian standard electrical schedule CSV.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <CountField label="Master Bedrooms" value={roomCounts.masterBedrooms}
              onChange={(v) => setRoomCounts((p) => ({ ...p, masterBedrooms: v }))} />
            <CountField label="Bedrooms" value={roomCounts.bedrooms}
              onChange={(v) => setRoomCounts((p) => ({ ...p, bedrooms: v }))} />
            <CountField label="Bathrooms" value={roomCounts.bathrooms}
              onChange={(v) => setRoomCounts((p) => ({ ...p, bathrooms: v }))} />
            <CountField label="Ensuites" value={roomCounts.ensuites}
              onChange={(v) => setRoomCounts((p) => ({ ...p, ensuites: v }))} />
            <CountField label="Kitchen" value={roomCounts.kitchen}
              onChange={(v) => setRoomCounts((p) => ({ ...p, kitchen: v }))} />
            <CountField label="Living" value={roomCounts.living}
              onChange={(v) => setRoomCounts((p) => ({ ...p, living: v }))} />
            <CountField label="Dining" value={roomCounts.dining}
              onChange={(v) => setRoomCounts((p) => ({ ...p, dining: v }))} />
            <CountField label="Study" value={roomCounts.study}
              onChange={(v) => setRoomCounts((p) => ({ ...p, study: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["laundry", "garage", "alfresco", "hallway"] as const).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={roomCounts[key]}
                  onChange={(e) => setRoomCounts((p) => ({ ...p, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span className="capitalize">{key}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGeneratorOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerateElectrical}>
              <Zap className="h-4 w-4 mr-1" /> Generate &amp; Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function CountField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
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
