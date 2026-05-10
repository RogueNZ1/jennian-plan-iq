import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { Breadcrumbs } from "@/components/jennian/Breadcrumbs";
import {
  IQ_MODULES, findIQModule,
  loadModuleRun, updateModuleItem, markModuleReviewed,
  approveModule, recalculateModule, exportModuleCsv,
  manualOverrideApprovedValue,
  REVIEW_STATUS_LABEL, statusLabel, statusBadgeClass,
  type IQModuleId, type ItemReviewStatus, type ModuleItem, type ModuleRun,
} from "@/lib/iq-modules";
import { getJob, type Job } from "@/lib/jennian-data";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OverrideReasonDialog } from "@/components/jennian/OverrideReasonDialog";
import {
  ArrowLeft, ClipboardCheck, CheckCircle2, FileSpreadsheet, RotateCcw, Info,
} from "lucide-react";
import type { Confidence } from "@/lib/jennian-data";

export const Route = createFileRoute("/modules/$moduleId")({
  component: ModuleDetail,
  validateSearch: (s: Record<string, unknown>) => ({
    job: typeof s.job === "string" ? s.job : undefined,
  }),
});

const PHASE2 = new Set<IQModuleId>(["iq-margin", "iq-procurement"]);

function ModuleDetail() {
  const { moduleId } = Route.useParams();
  const { job: jobId } = Route.useSearch();
  const navigate = useNavigate();
  const mod = findIQModule(moduleId);
  const { user } = useAuth();
  const roles = useRoles();

  const [job, setJob] = useState<Job | null>(null);
  const [run, setRun] = useState<ModuleRun | null>(null);
  const [items, setItems] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "recalculate" | "approve" | "review" | "export">(null);
  const [showRecalc, setShowRecalc] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{ item: ModuleItem; newValue: string } | null>(null);
  const [overrideTick, setOverrideTick] = useState(0);

  const isPhase2 = mod ? PHASE2.has(mod.id) : false;
  const isCore = mod?.id === "iq-core";
  const canEdit = roles.canWrite && !isPhase2 && !isCore;
  const canApprove = roles.canApprove && !isPhase2;
  const canRecalculate = roles.canWrite && !isPhase2 && !isCore;
  const canExport = roles.hasAny("owner", "admin", "estimator");
  const canNoteOnly = !roles.canWrite && roles.canComment; // PM

  async function refresh() {
    if (!jobId || !mod) return;
    setLoading(true);
    try {
      const r = await loadModuleRun(jobId, mod.id);
      setRun(r.run);
      setItems(r.items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load module.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!jobId) { setJob(null); setLoading(false); return; }
    getJob(jobId).then(setJob).catch(() => setJob(null));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, moduleId]);

  const confidence = useMemo(() => {
    if (!items.length) return 0;
    const highs = items.filter((i) => i.confidence === "high").length;
    return Math.round((highs / items.length) * 100);
  }, [items]);

  async function patchItem(item: ModuleItem, patch: Parameters<typeof updateModuleItem>[2]) {
    if (!user) return;
    try {
      await updateModuleItem(jobId!, item, patch);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save change.";
      toast.error(msg);
    }
  }

  async function onApprove() {
    if (!jobId || !mod) return;
    setBusy("approve");
    try {
      await approveModule(jobId, mod.id);
      toast.success(`${mod.name} approved.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve module.");
    } finally { setBusy(null); }
  }

  async function onMarkReviewed() {
    if (!jobId || !mod) return;
    setBusy("review");
    try {
      await markModuleReviewed(jobId, mod.id);
      toast.success(`${mod.name} marked reviewed.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update module.");
    } finally { setBusy(null); }
  }

  async function onRecalculate() {
    if (!jobId || !mod) return;
    setShowRecalc(false);
    setBusy("recalculate");
    try {
      await recalculateModule(jobId, mod.id);
      toast.success(`${mod.name} — quantities recalculated.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not recalculate.");
    } finally { setBusy(null); }
  }

  async function onExport() {
    if (!job || !mod) return;
    setBusy("export");
    try {
      await exportModuleCsv(job, mod.id);
      toast.success("Module CSV exported.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export.");
    } finally { setBusy(null); }
  }

  if (!mod) {
    return (
      <AppLayout>
        <div className="px-8 py-10">
          <div className="text-sm">Module not found.</div>
          <Link to="/jobs" className="mt-3 inline-block text-xs text-primary hover:underline">Back to Jobs</Link>
        </div>
      </AppLayout>
    );
  }

  if (!jobId) {
    return (
      <AppLayout>
        <div className="px-8 py-10 max-w-2xl">
          <Breadcrumbs items={[{ label: "Jobs", to: "/jobs" }, { label: mod.name }]} />
          <PageHeader title={mod.name} subtitle="Open this module from a job to load saved quantities." />
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Select a job to view {mod.name}.
            <div className="mt-4">
              <Link to="/jobs" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Browse jobs</Link>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const status = run?.status ?? "not_started";
  const lastRunAt = run?.last_run_at ?? null;
  const approvedCount = items.filter((i) => i.review_status === "confirmed").length;

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <Breadcrumbs items={[
          { label: "Jobs", to: "/jobs" },
          { label: job?.job_number ?? "Job", to: "/jobs/$jobId", params: { jobId } },
          { label: mod.name },
        ]} />

        <PageHeader
          title={mod.name}
          subtitle={mod.longDescription}
          actions={
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(status)}`}>
                {statusLabel(status)}
              </span>
              {isCore ? (
                <Link
                  to="/review"
                  search={{ job: jobId }}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <ClipboardCheck className="h-4 w-4" /> Open IQ Core Review
                </Link>
              ) : (
                <>
                  {canRecalculate && (
                    <button
                      onClick={() => setShowRecalc(true)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
                    >
                      <RotateCcw className="h-4 w-4 text-primary" />
                      {busy === "recalculate" ? "Recalculating…" : "Recalculate Quantities"}
                    </button>
                  )}
                  {canApprove && status !== "approved" && (
                    <button
                      onClick={onMarkReviewed}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
                    >
                      <ClipboardCheck className="h-4 w-4" /> Mark Reviewed
                    </button>
                  )}
                  {canApprove && (
                    <button
                      onClick={onApprove}
                      disabled={busy !== null || status === "approved"}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" /> {status === "approved" ? "Approved" : "Approve Module"}
                    </button>
                  )}
                  {canExport && (
                    <button
                      onClick={onExport}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      <FileSpreadsheet className="h-4 w-4" /> Export Module CSV
                    </button>
                  )}
                </>
              )}
            </div>
          }
        />

        {/* Job context strip */}
        <div className="mb-6 grid sm:grid-cols-4 gap-4">
          <Tile label="Job" value={job?.job_number ?? "—"} />
          <Tile label="Client" value={job?.client_name ?? "—"} mono={false} />
          <Tile label="Items" value={items.length.toString()} />
          <Tile label="Confidence" value={`${confidence}%`} />
        </div>

        {isPhase2 && (
          <div className="mb-6 rounded-lg border border-confidence-mid/40 bg-confidence-mid-bg/40 px-5 py-4 flex items-start gap-3">
            <Info className="h-4 w-4 text-confidence-mid mt-0.5" />
            <div className="text-[12px] text-foreground leading-relaxed">
              <span className="font-medium">Phase 2 module.</span>{" "}
              {mod.id === "iq-margin"
                ? "Margin review will surface risk items from approved quantities, specifications, allowances, and historical project data."
                : "Procurement review will prepare supplier-ready quantities and export packs once quantity modules are approved."}
            </div>
          </div>
        )}

        {isCore ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            IQ Core quantities are reviewed in IQ Core Review.
            <div className="mt-4">
              <Link
                to="/review"
                search={{ job: jobId }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <ClipboardCheck className="h-4 w-4" /> Open IQ Core Review
              </Link>
            </div>
          </div>
        ) : isPhase2 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            This module is read-only in Phase 1. No editable quantities, manual
            overrides, push targets, or exports are available yet.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold tracking-tight">Reviewed items</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {lastRunAt ? `Last reviewed ${new Date(lastRunAt).toLocaleString()}` : "Not yet reviewed"}
                  {" · "}{approvedCount}/{items.length} confirmed
                </div>
              </div>
              {run?.approved_at && (
                <div className="text-[11px] text-muted-foreground">
                  Approved {new Date(run.approved_at).toLocaleString()}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Item</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium">Unit</th>
                    <th className="px-5 py-3 font-medium">Extracted Quantity</th>
                    <th className="px-5 py-3 font-medium">Confirmed Quantity</th>
                    <th className="px-5 py-3 font-medium">Confidence</th>
                    <th className="px-5 py-3 font-medium">Review Status</th>
                    <th className="px-5 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={8} className="px-5 py-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
                  )}
                  {!loading && items.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-8 text-center text-xs text-muted-foreground">No items.</td></tr>
                  )}
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border align-top">
                      <td className="px-5 py-3 font-medium tabular-nums">{it.label}</td>
                      <td className="px-5 py-3">{it.description}</td>
                      <td className="px-5 py-3 text-muted-foreground">{it.unit}</td>
                      <td className="px-5 py-3 tabular-nums text-muted-foreground">{it.extracted_value}</td>
                      <td className="px-5 py-3">
                        <input
                          key={`${it.id}-${overrideTick}`}
                          type="number"
                          step="any"
                          defaultValue={it.approved_value ?? ""}
                          disabled={!canEdit}
                          onBlur={(e) => {
                            if (!canEdit) return;
                            const v = e.target.value;
                            if (v === (it.approved_value ?? "")) return;
                            setOverrideTarget({ item: it, newValue: v });
                          }}
                          className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={it.confidence ?? "mid"}
                          disabled={!canEdit}
                          onChange={(e) => patchItem(it, { confidence: e.target.value as Confidence })}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="high">High</option>
                          <option value="mid">Review</option>
                          <option value="low">Low</option>
                        </select>
                        <div className="mt-1"><ConfidencePill level={(it.confidence ?? "mid")} /></div>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={it.review_status}
                          disabled={!canEdit && !canNoteOnly}
                          onChange={(e) => patchItem(it, { review_status: e.target.value as ItemReviewStatus })}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="review_required">Review Required</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="excluded">Excluded</option>
                        </select>
                      </td>
                      <td className="px-5 py-3 min-w-[14rem]">
                        <input
                          defaultValue={it.notes ?? ""}
                          placeholder="Add note…"
                          disabled={!canEdit && !canNoteOnly}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v === (it.notes ?? "")) return;
                            patchItem(it, { notes: v });
                          }}
                          className="w-full rounded-md border border-transparent hover:border-input bg-transparent px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background focus:border-input disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        {!canEdit && canNoteOnly && (
                          <div className="mt-1 text-[10px] text-muted-foreground italic">Notes only</div>
                        )}
                        {it.review_status === "confirmed" && (
                          <div className="mt-1 text-[10px] text-confidence-high">{REVIEW_STATUS_LABEL.confirmed}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/jobs/$jobId", params: { jobId } })}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Job
          </button>
          <div className="text-[11px] text-muted-foreground">
            Other modules:{" "}
            {IQ_MODULES.filter((m) => m.id !== mod.id).slice(0, 4).map((m, i, arr) => (
              <span key={m.id}>
                <Link to="/modules/$moduleId" params={{ moduleId: m.id }} search={{ job: jobId }} className="text-primary hover:underline">
                  {m.name}
                </Link>{i < arr.length - 1 ? " · " : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={showRecalc} onOpenChange={setShowRecalc}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate Quantities?</AlertDialogTitle>
            <AlertDialogDescription>
              This will refresh calculated values for this module. Confirmed quantities will be preserved unless changed manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRecalculate}>Recalculate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OverrideReasonDialog
        open={overrideTarget !== null}
        label={overrideTarget ? `${overrideTarget.item.label}${overrideTarget.item.unit ? ` (${overrideTarget.item.unit})` : ""}` : undefined}
        currentValue={overrideTarget?.item.approved_value ?? ""}
        newValue={overrideTarget?.newValue ?? ""}
        onCancel={() => {
          setOverrideTarget(null);
          setOverrideTick((t) => t + 1);
        }}
        onConfirm={async (reason) => {
          if (!overrideTarget || !jobId) return;
          try {
            await manualOverrideApprovedValue(jobId, overrideTarget.item, overrideTarget.newValue, reason);
            toast.success("Quantity overridden.");
            setOverrideTarget(null);
            await refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save override.");
            setOverrideTick((t) => t + 1);
          }
        }}
      />
    </AppLayout>
  );
}

function Tile({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-medium truncate ${mono ? "tabular-nums" : ""}`}>{value}</div>
    </div>
  );
}