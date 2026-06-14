import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { useRoles } from "@/hooks/use-roles";
import { Breadcrumbs } from "@/components/jennian/Breadcrumbs";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { PlanThumbnail } from "@/components/jennian/PlanThumbnail";
import { PlanViewer } from "@/components/jennian/PlanViewer";
import { getJob, type Job } from "@/lib/jennian-data";
import {
  IQ_MODULES,
  seedAllModulesForJob,
  loadModuleRuns,
  statusBadgeClass,
  statusLabel,
  type ModuleRun,
} from "@/lib/iq-modules";
import {
  Ruler,
  Zap,
  Droplets,
  PaintRoller,
  Hammer,
  Square,
  Mountain,
  AlertTriangle,
  ShoppingCart,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  FileText,
  ArrowRight,
  History,
  Wand2,
  RefreshCw,
  Package,
  Trash2,
  CheckCircle2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildQSExportData,
  writeIQDataSheetFull,
  buildElectricalSchedule,
  electricalScheduleToCSV,
} from "@/lib/iq-qs-export";
import { exportSMWDocument } from "@/lib/iq-smw-export";
import { exportCartersLoads } from "@/lib/iq-carters-loads";
import { JobAuditTimeline } from "@/components/jennian/JobAuditTimeline";
import { AutomaticTakeoffDialog } from "@/components/jennian/AutomaticTakeoffDialog";
import { TakeoffSummary } from "@/components/jennian/TakeoffSummary";
import { loadLatestTakeoffRun, type LatestTakeoffRun } from "@/lib/takeoff/run";
import { StartTakeoffPanel } from "@/components/jennian/StartTakeoffPanel";
import { SpecificationsPanel } from "@/components/jennian/SpecificationsPanel";
import { VisionTakeoffDialog } from "@/components/jennian/VisionTakeoffDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  generateElectricalSchedule,
  buildRoomSpecsFromCounts,
  electricalScheduleToCSV as layoutToCSV,
  type RoomCounts,
} from "@/lib/iq-electrical-layout";

export const Route = createFileRoute("/jobs/$jobId")({ component: JobDetail });

const ICONS: Record<string, typeof Ruler> = {
  "iq-core": Ruler,
  "iq-electrical": Zap,
  "iq-plumbing": Droplets,
  "iq-linings": PaintRoller,
  "iq-framing": Hammer,
  "iq-cladding": Square,
  "iq-roofing": Mountain,
  "iq-margin": AlertTriangle,
  "iq-procurement": ShoppingCart,
};

const PDF_TEXT_PROBE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("PDF text probe timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

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
  const [detecting, setDetecting] = useState(false);
  const [hasTakeoffData, setHasTakeoffData] = useState<boolean | null>(null);
  const [exportingQS, setExportingQS] = useState(false);
  const [exportingSMW, setExportingSMW] = useState(false);
  const [exportingElec, setExportingElec] = useState(false);
  const [exportingCarters, setExportingCarters] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [electricalFile, setElectricalFile] = useState<{
    id: string;
    file_name: string;
    storage_url: string;
  } | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [geometryBadge, setGeometryBadge] = useState<{
    confidence: string;
    scale: string | null;
  } | null>(null);
  const [aiDoorEstimate, setAiDoorEstimate] = useState(0);
  const [roomCounts, setRoomCounts] = useState<RoomCounts>({
    masterBedrooms: 1,
    bedrooms: 3,
    bathrooms: 1,
    ensuites: 1,
    kitchen: 1,
    living: 1,
    dining: 1,
    study: 0,
    laundry: true,
    garage: true,
    alfresco: false,
    hallway: true,
  });

  // Quick-upload autostart: /upload navigates here with history state { autostart: true } so
  // a fresh upload runs the PERSISTING takeoff once, with no manual click. Read-only here.
  const autostart = useRouterState({
    select: (s) => Boolean((s.location.state as { autostart?: boolean } | undefined)?.autostart),
  });
  const autostartConsumedRef = useRef(false);

  async function refreshHasData() {
    const counts = await Promise.all([
      supabase
        .from("extracted_quantities")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId),
      supabase
        .from("module_items")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId),
      supabase
        .from("plan_measurements")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId),
      supabase
        .from("opening_schedule")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId),
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

        const { data: geoRows } = await supabase
          .from("plan_measurements")
          .select("confidence, notes")
          .eq("job_id", jobId)
          .eq("source", "geometry_api")
          .eq("measurement_type", "floor_area")
          .order("created_at", { ascending: false })
          .limit(1);
        if (!cancelled && geoRows?.[0]) {
          setGeometryBadge({
            confidence: geoRows[0].confidence as string,
            scale: (geoRows[0].notes as string | null) ?? null,
          });
        }

        // Door counts — initial confirmed state + AI estimate from module_items
        const [dcRes, miRes] = await Promise.all([
          supabase.from("door_counts").select("confirmed_at").eq("job_id", jobId).maybeSingle(),
          supabase.from("module_items").select("label, extracted_value").eq("job_id", jobId),
        ]);
        if (!cancelled) {
          const doorItem = (miRes.data ?? []).find(
            (i) =>
              i.label?.toLowerCase().includes("internal door") ||
              i.label?.toLowerCase().includes("interior door"),
          );
          if (doorItem?.extracted_value) {
            const n = parseInt(doorItem.extracted_value, 10);
            if (!isNaN(n)) setAiDoorEstimate(n);
          }
        }
      } catch {
        /* ignore — modules will surface their own errors */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Quick-upload autostart consumer: when arriving from /upload with { autostart: true }, fire
  // the SAME handler the "Start Takeoff" button uses — detectAndStartTakeoff — exactly once,
  // preserving the text-layer gate (text → automatic; scanned/<40 chars → vision). Guards:
  // ref so re-renders never re-fire; only after the initial load; and a no-op if this job
  // already has a takeoff_runs row (never auto-rerun / burn tokens on an existing job).
  useEffect(() => {
    if (!autostart) return;
    if (autostartConsumedRef.current) return;
    if (loading) return; // wait until job + latest takeoff_runs row have loaded
    if (takeoffRun !== null) return; // already has a run → do nothing
    if (detecting || takeoffOpen || visionOpen) return; // not while one is already starting
    autostartConsumedRef.current = true;
    void detectAndStartTakeoff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, loading, takeoffRun, detecting, takeoffOpen, visionOpen]);

  const runByModule: Record<string, ModuleRun | undefined> = Object.fromEntries(
    runs.map((r) => [r.module_id, r]),
  );

  const showStartPanel = !loading && hasTakeoffData === false && !takeoffRun;

  async function handleExportIQData() {
    setExportingQS(true);
    try {
      const data = await buildQSExportData(jobId);
      const bytes = await writeIQDataSheetFull({ ...data, jobId });
      const surname = data.clientSurname || data.clientName.split(" ").pop() || "Client";
      const filename = `${data.jmwNumber || data.jobNumber}-IQ-Data-${surname}.xlsx`;
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("IQ data sheet exported — paste into your QS");
    } catch (err) {
      toast.error(`QS export failed: ${err instanceof Error ? err.message : String(err)}`);
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
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("SMW document exported");
    } catch (err) {
      toast.error(`SMW export failed: ${err instanceof Error ? err.message : String(err)}`);
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
      toast.error(`Electrical export failed: ${err instanceof Error ? err.message : String(err)}`);
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
      toast.error(`Carters export failed: ${err instanceof Error ? err.message : String(err)}`);
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
    const { data } = await supabase.storage
      .from("job-files")
      .createSignedUrl(electricalFile.storage_url, 3600);
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

  async function handleToggleSMW() {
    if (!job) return;
    const next = !job.smw_enabled;
    const { error } = await supabase.from("jobs").update({ smw_enabled: next }).eq("id", jobId);
    if (error) {
      toast.error("Failed to update SMW setting");
      return;
    }
    setJob({ ...job, smw_enabled: next });
    toast.success(next ? "SMW enabled" : "SMW disabled");
  }

  async function detectAndStartTakeoff() {
    setDetecting(true);
    try {
      const { data } = await supabase
        .from("uploaded_files")
        .select("id, file_name, file_type, storage_url")
        .eq("job_id", jobId);
      const planFiles = (data ?? []).filter((r) => r.file_type === "plan");
      if (planFiles.length === 0) {
        setTakeoffOpen(true);
        return;
      }
      const { extractFile } = await import("@/lib/takeoff/pdf-text");
      let planTextLen = 0;
      for (const f of planFiles) {
        try {
          const ex = await withTimeout(
            extractFile({
              fileId: f.id as string,
              fileName: f.file_name as string,
              fileType: "plan",
              storagePath: f.storage_url as string,
              maxPages: 4,
            }),
            PDF_TEXT_PROBE_TIMEOUT_MS,
          );
          planTextLen += ex.pages.reduce((s, p) => s + (p.text?.trim().length ?? 0), 0);
        } catch (error) {
          console.warn("[takeoff] PDF text probe failed; falling through to visual takeoff", {
            fileName: f.file_name,
            error,
          });
        }
      }
      if (planTextLen < 40) {
        setVisionOpen(true);
      } else {
        setTakeoffOpen(true);
      }
    } catch {
      setTakeoffOpen(true);
    } finally {
      setDetecting(false);
    }
  }

  function openWorkingPlan() {
    navigate({ to: "/review", search: { job: jobId, tab: "working" } });
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <Breadcrumbs
          items={[{ label: "Jobs", to: "/jobs" }, { label: job?.job_number ?? jobId }]}
        />

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
                  onClick={detectAndStartTakeoff}
                  disabled={detecting}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-70"
                >
                  <Wand2 className="h-4 w-4" />
                  {detecting ? "Analysing…" : "Start Takeoff"}
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
            </div>
          }
        />

        {showStartPanel && (
          <div className="mb-6">
            <StartTakeoffPanel
              onStart={detectAndStartTakeoff}
              onWorkingPlan={openWorkingPlan}
              detecting={detecting}
            />
          </div>
        )}

        {jobId && (
          <div className="mb-6">
            <SpecificationsPanel jobId={jobId} />
          </div>
        )}

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 mb-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <PlanThumbnail storagePath={job?.plan_thumbnail_url} size="lg" className="w-full" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <Tile
                label="Status"
                node={job ? <StatusBadge status={job.status} /> : <span>—</span>}
              />
              <Tile label="Template" value={job?.template ?? "—"} />
              <Tile
                label="Created"
                value={job ? new Date(job.created_at).toLocaleDateString() : "—"}
              />
              <Tile label="Modules" value={`${runs.length}/${IQ_MODULES.length}`} />
              {job?.plan_context &&
                (() => {
                  const ctx = job.plan_context as {
                    builder?: { name?: string };
                    dimensionFormat?: string;
                    dimensionFormatSource?: string;
                    scaleString?: string | null;
                  };
                  const builderName = ctx.builder?.name ?? "Unknown";
                  const isUnknown =
                    builderName === "Unknown" || ctx.dimensionFormatSource === "nz_default";
                  return (
                    <>
                      <Tile label="Builder" value={builderName} />
                      <Tile
                        label="Dim. format"
                        value={
                          ctx.dimensionFormat === "HEIGHT_x_WIDTH"
                            ? "H×W"
                            : ctx.dimensionFormat === "WIDTH_x_HEIGHT"
                              ? "W×H"
                              : "—"
                        }
                      />
                      {ctx.scaleString && <Tile label="Scale" value={ctx.scaleString} />}
                      {isUnknown && (
                        <div className="col-span-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">
                          <span>⚠</span>
                          <span>
                            Builder not recognised — using NZ default conventions. Check window
                            dimensions carefully.
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              {geometryBadge && (
                <>
                  <Tile
                    label="Geo. accuracy"
                    node={
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          geometryBadge.confidence === "high"
                            ? "bg-emerald-100 text-emerald-700"
                            : geometryBadge.confidence === "medium"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {geometryBadge.confidence}
                      </span>
                    }
                  />
                  {geometryBadge.scale && <Tile label="Scale" value={geometryBadge.scale} />}
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold tracking-tight">Modules</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {loading
                    ? "Loading…"
                    : `${runs.filter((r) => r.status === "approved").length} approved · ${runs.filter((r) => r.required).length} required`}
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
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(status)}`}
                      >
                        {statusLabel(status)}
                      </span>
                    </div>
                    <div className="mt-3 text-[13.5px] font-semibold tracking-tight">{m.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                      {m.shortDescription}
                    </div>
                    <div className="mt-2 text-[10.5px] text-muted-foreground tabular-nums">
                      {run
                        ? `${run.item_count} items · ${run.confidence_avg ?? 0}% confidence`
                        : "Not started"}
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <Link
                to="/jobs/$jobId/verification"
                params={{ jobId }}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
              >
                <Printer className="h-3 w-3" /> Verification Printout
              </Link>
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

        {isOwner && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold tracking-tight">SMW Export</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Enable to show the SMW export button for this job
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSMW}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${job?.smw_enabled ? "bg-primary" : "bg-muted"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${job?.smw_enabled ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
            {job?.smw_enabled && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                SMW output is based on concept plan data and uses Jennian standard allowances where
                values are not extracted.
              </div>
            )}
          </div>
        )}

        {takeoffRun && (
          <div className="mb-6">
            <TakeoffSummary run={takeoffRun} jobId={jobId} />
          </div>
        )}

        {/* Elevation & Site Plan section */}
        {job && (job.elevation_data || job.site_plan_data) ? (
          <JobElevationSection
            elevation={
              job.elevation_data as import("@/lib/takeoff/extract-elevations").ElevationData | null
            }
            sitePlan={
              job.site_plan_data as import("@/lib/takeoff/extract-site-plan").SitePlanData | null
            }
            crossRef={
              job.cross_reference_data as
                | import("@/lib/takeoff/cross-reference").CrossReferenceResult
                | null
            }
          />
        ) : (
          <div className="rounded-lg border border-border bg-card p-4 mb-2 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-muted grid place-items-center shrink-0">
              <Mountain className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-[12.5px] font-medium">Elevation & Site Plan</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Upload elevation and site plan PDFs when creating a job to auto-detect cladding,
                roof type, and concrete areas.
              </div>
            </div>
          </div>
        )}

        {/* Export section */}
        <div className="rounded-lg border border-border bg-card overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-border">
            <div className="text-[13px] font-semibold tracking-tight">Export</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Export job data to Excel for QS pricing.
              {/* Door counts come from the deterministic engine — no manual confirm step. */}
            </div>
          </div>
          <div className="p-4 flex flex-wrap gap-3 items-start">
            <div className="relative group">
              <button
                type="button"
                onClick={handleExportIQData}
                disabled={exportingQS}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {exportingQS ? "Exporting…" : "Export Excel (IQ Data Sheet)"}
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportElectrical}
              disabled={exportingElec}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              {exportingElec ? "Exporting…" : "Electrical Schedule"}
            </button>
            {hasTakeoffData && (
              <button
                type="button"
                onClick={handleExportCarters}
                disabled={exportingCarters}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <Package className="h-4 w-4" />
                {exportingCarters ? "Exporting…" : "Carters Loads"}
              </button>
            )}
            {job?.smw_enabled && (
              <button
                type="button"
                onClick={handleExportSMW}
                disabled={exportingSMW}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                {exportingSMW ? "Exporting…" : "Export SMW"}
              </button>
            )}
          </div>
        </div>
      </div>
      <PlanViewer
        open={viewerOpen}
        jobId={viewerOpen ? jobId : null}
        jobNumber={job?.job_number}
        onClose={() => setViewerOpen(false)}
      />
      <JobAuditTimeline jobId={jobId} open={timelineOpen} onOpenChange={setTimelineOpen} />
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
      <VisionTakeoffDialog open={visionOpen} onOpenChange={setVisionOpen} jobId={jobId} />
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{job?.job_number ?? jobId}</strong> and all
              related quantities, openings, module items, and takeoff data. This cannot be undone.
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
            <CountField
              label="Master Bedrooms"
              value={roomCounts.masterBedrooms}
              onChange={(v) => setRoomCounts((p) => ({ ...p, masterBedrooms: v }))}
            />
            <CountField
              label="Bedrooms"
              value={roomCounts.bedrooms}
              onChange={(v) => setRoomCounts((p) => ({ ...p, bedrooms: v }))}
            />
            <CountField
              label="Bathrooms"
              value={roomCounts.bathrooms}
              onChange={(v) => setRoomCounts((p) => ({ ...p, bathrooms: v }))}
            />
            <CountField
              label="Ensuites"
              value={roomCounts.ensuites}
              onChange={(v) => setRoomCounts((p) => ({ ...p, ensuites: v }))}
            />
            <CountField
              label="Kitchen"
              value={roomCounts.kitchen}
              onChange={(v) => setRoomCounts((p) => ({ ...p, kitchen: v }))}
            />
            <CountField
              label="Living"
              value={roomCounts.living}
              onChange={(v) => setRoomCounts((p) => ({ ...p, living: v }))}
            />
            <CountField
              label="Dining"
              value={roomCounts.dining}
              onChange={(v) => setRoomCounts((p) => ({ ...p, dining: v }))}
            />
            <CountField
              label="Study"
              value={roomCounts.study}
              onChange={(v) => setRoomCounts((p) => ({ ...p, study: v }))}
            />
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
            <Button variant="outline" onClick={() => setGeneratorOpen(false)}>
              Cancel
            </Button>
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
              This REPLACES the stored extraction for this job — the new run becomes the takeoff
              that feeds the QS export. Previous numbers, including validated ones, stop feeding
              exports and cannot be restored from this screen. If this job’s takeoff has been
              checked or priced, do NOT re-run it without a reason you can name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRerunConfirmOpen(false);
                setTakeoffOpen(true);
              }}
            >
              Replace takeoff data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function CountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
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

// ── JobElevationSection ──────────────────────────────────────────────────────

import type { ElevationData } from "@/lib/takeoff/extract-elevations";
import type { SitePlanData } from "@/lib/takeoff/extract-site-plan";
import type { CrossReferenceResult } from "@/lib/takeoff/cross-reference";

function JobElevationSection({
  elevation,
  sitePlan,
  crossRef,
}: {
  elevation: ElevationData | null;
  sitePlan: SitePlanData | null;
  crossRef: CrossReferenceResult | null;
}) {
  const windowMatch = crossRef?.windowCountMatch;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden mb-2">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Mountain className="h-4 w-4 text-muted-foreground" />
        <div className="text-[13px] font-semibold tracking-tight">Elevation & Site Plan</div>
      </div>
      <div className="p-4 space-y-4">
        {/* Window count verification */}
        {crossRef && (
          <div
            className={`rounded-md border px-3 py-2.5 flex items-center gap-2 text-[11.5px] ${
              windowMatch
                ? "border-emerald-500/30 bg-emerald-50/5 text-emerald-700"
                : "border-amber-500/30 bg-amber-50/5 text-amber-700"
            }`}
          >
            {windowMatch ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            )}
            {windowMatch
              ? `${crossRef.windowCountElevations} windows verified across ${Object.keys(elevation?.windowCountPerFace ?? {}).length} elevation faces`
              : `Window count mismatch — floor plan: ${crossRef.windowCountFloorPlan}, elevations: ${crossRef.windowCountElevations}. Check plan carefully.`}
          </div>
        )}

        {/* Cladding & Roof grid */}
        {elevation && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border border-border px-3 py-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Cladding
              </div>
              <div className="mt-1 text-[12.5px] font-semibold">
                {elevation.claddingTypes.length > 0 ? elevation.claddingTypes.join(" + ") : "—"}
              </div>
              {elevation.claddingTypeCode != null && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {elevation.claddingTypeCode === 1
                    ? "Brick only"
                    : elevation.claddingTypeCode === 2
                      ? "Weatherboard only"
                      : "Mixed (code 3)"}
                </div>
              )}
            </div>
            <div className="rounded-md border border-border px-3 py-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Roof Type
              </div>
              <div className="mt-1 text-[12.5px] font-semibold">{elevation.roofType ?? "—"}</div>
            </div>
            <div className="rounded-md border border-border px-3 py-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Roof Pitch
              </div>
              <div className="mt-1 text-[12.5px] font-semibold">
                {elevation.roofPitchDegrees != null ? `${elevation.roofPitchDegrees}°` : "—"}
              </div>
            </div>
            <div className="rounded-md border border-border px-3 py-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Gable Ends
              </div>
              <div className="mt-1 text-[12.5px] font-semibold">
                {elevation.gableEndCount ?? "—"}
              </div>
            </div>
          </div>
        )}

        {/* Concrete areas from site plan */}
        {sitePlan && sitePlan.concreteAreas.length > 0 && (
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-2">
              Concrete Areas
            </div>
            <div className="flex flex-wrap gap-2">
              {sitePlan.concreteAreas.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium"
                >
                  {a.label ? `${a.label}: ` : ""}
                  {a.areaM2} m²
                </span>
              ))}
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary">
                Total: {sitePlan.totalConcreteM2} m²
              </span>
            </div>
          </div>
        )}
        {sitePlan && sitePlan.perimeterM != null && (
          <div className="text-[11.5px] text-muted-foreground">
            Perimeter from site plan:{" "}
            <span className="font-semibold text-foreground">{sitePlan.perimeterM} m</span>
          </div>
        )}
      </div>
    </div>
  );
}
