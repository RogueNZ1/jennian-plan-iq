import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import {
  getJob,
  listQuantities,
  listOverrides,
  type Job,
  type Quantity,
  type OverrideRow,
} from "@/lib/jennian-data";
import { MODULES, moduleForQuantity, type ModuleId } from "@/lib/takeoff-modules";
import {
  IQ_MODULES,
  loadModuleRuns,
  calculateJobModuleRollup,
  statusLabel,
  statusBadgeClass,
  type IQModuleId,
  type ModuleRun,
} from "@/lib/iq-modules";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import {
  FileSpreadsheet,
  History,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Wand2,
  ScanEye,
  Info,
  Ruler,
  Zap,
  Droplets,
  PaintRoller,
  Hammer,
  Square,
  Mountain,
  AlertTriangle,
  ShoppingCart,
  Layers,
} from "lucide-react";
import { useEffect, useMemo, useState, useRef, lazy, Suspense } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { OverrideReasonDialog } from "@/components/jennian/OverrideReasonDialog";
import { Breadcrumbs } from "@/components/jennian/Breadcrumbs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
const PlanCanvas = lazy(() =>
  import("@/components/jennian/PlanCanvas").then((m) => ({ default: m.PlanCanvas })),
);
import { OpeningScheduleTab } from "@/components/jennian/OpeningScheduleTab";
import { ValidationTab } from "@/components/jennian/ValidationTab";
import { loadMeasurements, loadOpenings, type PlanMeasurement } from "@/lib/iq-measurements";
import { buildQSExportData, writeIQDataSheetFull } from "@/lib/iq-qs-export";
import { AutomaticTakeoffDialog } from "@/components/jennian/AutomaticTakeoffDialog";
import { VisionTakeoffDialog } from "@/components/jennian/VisionTakeoffDialog";
import { loadExtractedQuantityAuthorityForJob } from "@/lib/takeoff/extracted-quantity-authority";
import {
  buildExtractedQuantityReviewModel,
  type ExtractedQuantityReviewModel,
} from "@/lib/review/extracted-quantity-review-model";
import type { ExtractedQuantityExportRow } from "@/lib/takeoff/extracted-quantity-read-model";

const MODULE_ICONS: Record<IQModuleId, React.ComponentType<{ className?: string }>> = {
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

export const Route = createFileRoute("/review")({
  component: ReviewPage,
  validateSearch: (s: Record<string, unknown>): { job?: string; tab?: string } => {
    const out: { job?: string; tab?: string } = {};
    if (typeof s.job === "string") out.job = s.job;
    if (typeof s.tab === "string") out.tab = s.tab;
    return out;
  },
});

function ReviewPage() {
  const { job: jobId, tab: initialTab } = Route.useSearch();
  const { user } = useAuth();
  const roles = useRoles();
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Quantity[]>([]);
  const [audit, setAudit] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollup, setRollup] = useState<{
    requiredApproved: number;
    required: number;
    allRequiredApproved: boolean;
  } | null>(null);
  const [measurementCount, setMeasurementCount] = useState<number>(0);
  const [openingsCount, setOpeningsCount] = useState<number>(0);
  const [tab, setTab] = useState<string>(
    initialTab &&
      ["extracted", "base", "working", "openings", "walls", "validation", "assumptions"].includes(
        initialTab,
      )
      ? initialTab
      : "extracted",
  );
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const [moduleItems, setModuleItems] = useState<ModuleItemRow[]>([]);
  const [extractedQuantityReview, setExtractedQuantityReview] =
    useState<ExtractedQuantityReviewModel | null>(null);
  const [extractedQuantityLoading, setExtractedQuantityLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    Promise.all([getJob(jobId), listQuantities(jobId), listOverrides(jobId)])
      .then(([j, q, o]) => {
        setJob(j);
        setRows(q);
        setAudit(o);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    calculateJobModuleRollup(jobId)
      .then((r) => setRollup(r))
      .catch(() => {});
    setExtractedQuantityLoading(true);
    loadExtractedQuantityAuthorityForJob(jobId)
      .then((authority) => setExtractedQuantityReview(buildExtractedQuantityReviewModel(authority)))
      .catch((e) =>
        setExtractedQuantityReview({
          ...buildExtractedQuantityReviewModel(null),
          warnings: [e instanceof Error ? e.message : String(e)],
        }),
      )
      .finally(() => setExtractedQuantityLoading(false));
    (async () => {
      const [m, o] = await Promise.all([
        supabase
          .from("plan_measurements")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId),
        supabase
          .from("opening_schedule")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId),
      ]);
      setMeasurementCount(m.count ?? 0);
      setOpeningsCount(o.count ?? 0);
    })();
    supabase
      .from("module_items")
      .select(
        "id, module_id, label, extracted_value, approved_value, unit, value_source, confidence, description, sort_order",
      )
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true })
      .then(
        ({ data }) => {
          setModuleItems((data ?? []) as ModuleItemRow[]);
        },
        () => {},
      );
  }, [jobId]);

  async function override(row: Quantity, raw: string, reason: string) {
    const newValue = Number(raw);
    if (Number.isNaN(newValue)) return toast.error("Value must be a number.");
    const original = row.approved_value ?? row.extracted_value;
    if (newValue === original) return;
    const { error: ovErr } = await supabase.from("quantity_overrides").insert({
      quantity_id: row.id,
      original_value: original,
      new_value: newValue,
      edited_by: user!.id,
      reason: reason || null,
    });
    if (ovErr) return toast.error(ovErr.message);
    const { error: upErr } = await supabase
      .from("extracted_quantities")
      .update({ approved_value: newValue, confidence: "high" })
      .eq("id", row.id);
    if (upErr) return toast.error(upErr.message);
    setRows((rs) =>
      rs.map((r) => (r.id === row.id ? { ...r, approved_value: newValue, confidence: "high" } : r)),
    );
    const fresh = await listOverrides(jobId!);
    setAudit(fresh);
    toast.success("Quantity updated.");
  }

  async function confirmAssumedItem(itemId: string, newValue: string) {
    const { error } = await supabase
      .from("module_items")
      .update({ approved_value: newValue, value_source: "confirmed", confidence: "high" })
      .eq("id", itemId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setModuleItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, approved_value: newValue, value_source: "confirmed", confidence: "high" }
          : i,
      ),
    );
    toast.success("Item confirmed.");
  }

  async function approve() {
    if (!job) return;
    const r = await calculateJobModuleRollup(job.id);
    if (!r.allRequiredApproved) {
      toast.error("All required modules must be approved before this job can be approved.");
      return;
    }
    await supabase.from("jobs").update({ status: "approved" }).eq("id", job.id);
    setJob({ ...job, status: "approved" });
    toast.success("Job approved.");
  }

  async function logExport(type: "csv" | "excel") {
    if (!job || !user) return;
    await supabase
      .from("export_logs")
      .insert({ job_id: job.id, exported_by: user.id, export_type: type });
    if (job.status !== "exported") {
      await supabase.from("jobs").update({ status: "exported" }).eq("id", job.id);
      setJob({ ...job, status: "exported" });
    }
  }

  // Single IQ Data Sheet export — same handler as jobs.$jobId.tsx → buildQSExportData → writeIQDataSheetFull.
  const [exportingIQ, setExportingIQ] = useState(false);
  async function exportIQDataSheet() {
    if (!job || !jobId) return;
    setExportingIQ(true);
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
      await logExport("excel");
      toast.success("IQ Data Sheet exported — paste into your QS");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingIQ(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="p-10 text-sm text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!job) {
    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-3xl">
          <PageHeader
            title="Quantity Review"
            subtitle="Select a job to review extracted quantities."
          />
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">No job selected.</p>
            <Link
              to="/jobs"
              className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Browse jobs
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <Breadcrumbs
          items={[
            { label: "Jobs", to: "/jobs" },
            { label: job.job_number, to: "/jobs/$jobId", params: { jobId: job.id } },
            { label: "IQ Core Review" },
          ]}
        />
        <PageHeader
          title="IQ Core Review"
          subtitle={`${job.job_number} · ${job.client_name} · ${job.address}`}
          actions={
            <div className="flex gap-2 items-center">
              <StatusBadge status={job.status} />
              {job.status !== "approved" && job.status !== "exported" && roles.isAdmin && (
                <button
                  onClick={approve}
                  disabled={!rollup?.allRequiredApproved}
                  title={
                    rollup?.allRequiredApproved
                      ? "Approve job"
                      : "All required modules must be approved before this job can be approved."
                  }
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve Job
                </button>
              )}
              <button
                onClick={exportIQDataSheet}
                disabled={exportingIQ}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-70"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {exportingIQ ? "Exporting…" : "Export IQ Data Sheet"}
              </button>
            </div>
          }
        />

        {rollup && job.status !== "approved" && job.status !== "exported" && (
          <div className="-mt-4 mb-6 text-[12px] text-muted-foreground">
            {rollup.requiredApproved} of {rollup.required} required modules approved.
            {!rollup.allRequiredApproved && (
              <span className="ml-1 text-confidence-mid">
                All required modules must be approved before this job can be approved.
              </span>
            )}
          </div>
        )}

        {moduleItems.filter((i) => i.value_source === "assumed").length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-[12px] text-amber-700">
              <span className="font-semibold">
                {moduleItems.filter((i) => i.value_source === "assumed").length} items
              </span>{" "}
              use Jennian standard allowances.
              {job.confidence_score != null && (
                <span className="ml-2 font-medium">
                  Extraction confidence: {job.confidence_score}%
                </span>
              )}{" "}
              Review the Assumptions tab to confirm or adjust values.
            </div>
          </div>
        )}

        <ModulesOverview jobId={job.id} />

        {rows.length === 0 && measurementCount === 0 && openingsCount === 0 && (
          <div className="mb-6 rounded-lg border border-border bg-card p-6">
            <div className="text-[15px] font-semibold tracking-tight">No Quantity Data Yet</div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">
              This job has no extracted, measured, or vision-reviewed quantities yet. Start a
              takeoff from the Job Overview.
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                to="/jobs/$jobId"
                params={{ jobId: job.id }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Job Overview
              </Link>
              <button
                type="button"
                onClick={() => setTakeoffOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Wand2 className="h-4 w-4" /> Run Automatic Takeoff
              </button>
              <button
                type="button"
                onClick={() => setVisionOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <ScanEye className="h-4 w-4" /> Run Vision Takeoff
              </button>
              <button
                type="button"
                onClick={() => setTab("working")}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Ruler className="h-4 w-4" /> Open Working Plan
              </button>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-5">
            <TabsTrigger value="extracted">Extracted Quantities</TabsTrigger>
            <TabsTrigger value="base">Base Geometry</TabsTrigger>
            <TabsTrigger value="working">Working Plan</TabsTrigger>
            <TabsTrigger value="openings">Windows & Doors</TabsTrigger>
            <TabsTrigger value="walls">Internal Walls</TabsTrigger>
            <TabsTrigger value="validation">Validation</TabsTrigger>
            <TabsTrigger value="assumptions">
              Assumptions
              {moduleItems.filter((i) => i.value_source === "assumed").length > 0 && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {moduleItems.filter((i) => i.value_source === "assumed").length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extracted">
            <ExtractedQuantityLedgerReview
              model={extractedQuantityReview}
              loading={extractedQuantityLoading}
            />
          </TabsContent>

          <TabsContent value="base">
            <div className="grid lg:grid-cols-[1fr_320px] gap-6">
              <div className="space-y-5">
                {rows.length === 0 && (
                  <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                    No quantities yet for this job. Quantities will appear here once they are read
                    from the uploaded plan or specification, measured from the working plan, taken
                    from a template allowance, or entered as a user override.
                  </div>
                )}
                {MODULES.map((m) => {
                  const moduleRows = rows.filter(
                    (r) => moduleForQuantity(r.quantity_type) === (m.id as ModuleId),
                  );
                  if (moduleRows.length === 0) return null;
                  return (
                    <div
                      key={m.id}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                        <div>
                          <div className="text-[13px] font-semibold tracking-tight">{m.name}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {m.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            → {m.exportSheet}
                          </span>
                          <Link
                            to="/modules/$moduleId"
                            params={{ moduleId: m.id }}
                            search={{ job: jobId }}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Open module
                          </Link>
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-5 py-2.5 font-medium">Quantity Type</th>
                            <th className="px-5 py-2.5 font-medium">Unit</th>
                            <th className="px-5 py-2.5 font-medium">Extracted</th>
                            <th className="px-5 py-2.5 font-medium">Final</th>
                            <th className="px-5 py-2.5 font-medium">Confidence</th>
                            <th className="px-5 py-2.5 font-medium">Source</th>
                            <th className="px-5 py-2.5 font-medium">Evidence</th>
                            <th className="px-5 py-2.5 font-medium text-right">Override</th>
                          </tr>
                        </thead>
                        <tbody>
                          {moduleRows.map((r) => (
                            <tr key={r.id} className="border-t border-border">
                              <td className="px-5 py-3 font-medium">{r.quantity_type}</td>
                              <td className="px-5 py-3 text-muted-foreground">{r.unit}</td>
                              <td className="px-5 py-3 tabular-nums text-muted-foreground">
                                {r.extracted_value}
                              </td>
                              <td className="px-5 py-3 tabular-nums font-medium">
                                {r.approved_value ?? r.extracted_value}
                              </td>
                              <td className="px-5 py-3">
                                <ConfidencePill level={r.confidence} />
                              </td>
                              <td className="px-5 py-3 text-xs">
                                <DataSourceBadge source={r.data_source} />
                              </td>
                              <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs">
                                {r.source_evidence || r.notes || "—"}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <OverrideInput row={r} onSave={override} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              <aside className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                    Confidence summary
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <SummaryRow
                      label="High"
                      count={rows.filter((r) => r.confidence === "high").length}
                      cls="bg-confidence-high"
                    />
                    <SummaryRow
                      label="Review"
                      count={rows.filter((r) => r.confidence === "mid").length}
                      cls="bg-confidence-mid"
                    />
                    <SummaryRow
                      label="Low"
                      count={rows.filter((r) => r.confidence === "low").length}
                      cls="bg-confidence-low"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                    <History className="h-3 w-3" /> Audit log
                  </div>
                  <div className="mt-3 space-y-3 max-h-72 overflow-auto">
                    {audit.length === 0 && (
                      <div className="text-xs text-muted-foreground">No overrides yet.</div>
                    )}
                    {audit.map((a) => {
                      const q = rows.find((r) => r.id === a.quantity_id);
                      return (
                        <div key={a.id} className="text-xs">
                          <div className="font-medium">{q?.quantity_type ?? "Quantity"}</div>
                          <div className="text-muted-foreground">
                            {a.original_value} →{" "}
                            <span className="text-foreground">{a.new_value}</span> ·{" "}
                            {new Date(a.timestamp).toLocaleString()}
                          </div>
                          {a.reason && (
                            <div className="text-muted-foreground italic">"{a.reason}"</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="working">
            <Suspense
              fallback={
                <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                  Loading working plan…
                </div>
              }
            >
              <PlanCanvas jobId={job.id} />
            </Suspense>
          </TabsContent>

          <TabsContent value="openings">
            <OpeningScheduleTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="walls">
            <InternalWallsTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="validation">
            <ValidationTab jobId={job.id} />
          </TabsContent>

          <TabsContent value="assumptions">
            <ConceptAssumptionsTab items={moduleItems} onConfirm={confirmAssumedItem} />
          </TabsContent>
        </Tabs>
      </div>
      <AutomaticTakeoffDialog
        open={takeoffOpen}
        onOpenChange={setTakeoffOpen}
        jobId={job.id}
        onCompleted={async () => {
          const q = await listQuantities(job.id).catch(() => []);
          setRows(q);
          const [m, o] = await Promise.all([
            supabase
              .from("plan_measurements")
              .select("id", { count: "exact", head: true })
              .eq("job_id", job.id),
            supabase
              .from("opening_schedule")
              .select("id", { count: "exact", head: true })
              .eq("job_id", job.id),
          ]);
          setMeasurementCount(m.count ?? 0);
          setOpeningsCount(o.count ?? 0);
        }}
      />
      <VisionTakeoffDialog open={visionOpen} onOpenChange={setVisionOpen} jobId={job.id} />
    </AppLayout>
  );
}

type ModuleItemRow = {
  id: string;
  module_id: string;
  label: string;
  extracted_value: string | null;
  approved_value?: string | null;
  unit: string | null;
  value_source: string | null;
  confidence: string | null;
  description: string | null;
  sort_order: number | null;
};

function nullCell(value: number | string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "null" : String(value);
}

function bboxCell(bbox: [number, number, number, number] | undefined): string {
  return bbox ? bbox.map((n) => Math.round(n * 100) / 100).join(", ") : "null";
}

function evidenceText(row: ExtractedQuantityExportRow): string {
  return row.evidence
    .map((e) => e.text)
    .filter((text): text is string => !!text)
    .join(" | ");
}

function firstEvidencePage(row: ExtractedQuantityExportRow): string {
  const page = row.evidence.find((e) => e.page != null)?.page;
  return page == null ? "null" : String(page);
}

function firstEvidenceBbox(row: ExtractedQuantityExportRow): string {
  const bbox = row.evidence.find((e) => e.bbox)?.bbox;
  return bboxCell(bbox);
}

function ExtractedQuantityLedgerReview({
  model,
  loading,
}: {
  model: ExtractedQuantityReviewModel | null;
  loading: boolean;
}) {
  if (loading && !model) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Loading extracted quantity ledger...
      </div>
    );
  }

  if (!model?.readModel) {
    return (
      <div className="rounded-lg border border-confidence-low/30 bg-confidence-low/8 p-5 text-sm">
        <div className="font-semibold text-confidence-low">
          Extracted quantity ledger unavailable
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Review is waiting for an active persisted ledger or takeoff_json fallback.
        </div>
        {model?.warnings.length ? (
          <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">
            {model.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-tight">
              Active Extracted Quantity Ledger
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Authority {model.source} · run {model.runId ?? "null"} · active run{" "}
              {model.activeRunId ?? "null"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-muted/40 px-2 py-1">
              Clean count{" "}
              <span className="font-medium text-foreground tabular-nums">
                {model.cleanTotals.count}
              </span>
            </span>
            <span className="rounded-md bg-muted/40 px-2 py-1">
              Clean length{" "}
              <span className="font-medium text-foreground tabular-nums">
                {model.cleanTotals.lengthMm} mm
              </span>
            </span>
            <span className="rounded-md bg-muted/40 px-2 py-1">
              Clean area{" "}
              <span className="font-medium text-foreground tabular-nums">
                {model.cleanTotals.areaM2} m²
              </span>
            </span>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground">
          Clean totals include only rows with status extracted. Needs review, missing evidence,
          conflict, and ignored rows stay visible here and are excluded from clean totals.
        </div>
        {model.warnings.length > 0 && (
          <div className="mt-3 rounded-md border border-confidence-mid/30 bg-confidence-mid/8 px-3 py-2 text-xs text-confidence-mid">
            {model.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        )}
      </div>

      {model.sections.map((section) => (
        <div
          key={section.status}
          className="rounded-lg border border-border bg-card overflow-hidden"
        >
          <div className="border-b border-border px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold tracking-tight">{section.label}</div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {section.rows.length} rows
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Row ID</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Label</th>
                  <th className="px-4 py-2.5 font-medium">Count</th>
                  <th className="px-4 py-2.5 font-medium">Width mm</th>
                  <th className="px-4 py-2.5 font-medium">Height mm</th>
                  <th className="px-4 py-2.5 font-medium">Length mm</th>
                  <th className="px-4 py-2.5 font-medium">Area m²</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Confidence</th>
                  <th className="px-4 py-2.5 font-medium">Warnings</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Run ID</th>
                  <th className="px-4 py-2.5 font-medium">Evidence page</th>
                  <th className="px-4 py-2.5 font-medium">Evidence bbox</th>
                  <th className="px-4 py-2.5 font-medium">Evidence text</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={16}
                      className="px-4 py-6 text-center text-xs text-muted-foreground"
                    >
                      No rows.
                    </td>
                  </tr>
                ) : (
                  section.rows.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="px-4 py-2.5 font-mono text-[11px]">{row.id}</td>
                      <td className="px-4 py-2.5">{row.category}</td>
                      <td className="px-4 py-2.5 font-medium">{row.label ?? "null"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{nullCell(row.count)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{nullCell(row.widthMm)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{nullCell(row.heightMm)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{nullCell(row.lengthMm)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{nullCell(row.areaM2)}</td>
                      <td className="px-4 py-2.5">{row.status}</td>
                      <td className="px-4 py-2.5 tabular-nums">{row.confidence}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {row.warnings.length ? row.warnings.join(", ") : "null"}
                      </td>
                      <td className="px-4 py-2.5">{row.source}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px]">{row.runId ?? "null"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{firstEvidencePage(row)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {firstEvidenceBbox(row)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        <div className="max-w-[340px] whitespace-normal">
                          {evidenceText(row) || "null"}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ValueSourceBadge({ source }: { source: string | null }) {
  if (source === "assumed") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        Assumed
      </span>
    );
  }
  if (source === "confirmed") {
    return (
      <span className="inline-flex items-center rounded-full border border-confidence-high/40 bg-confidence-high/10 px-2 py-0.5 text-[10px] font-medium text-confidence-high">
        Confirmed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Extracted
    </span>
  );
}

function AssumedItemRow({
  item,
  onConfirm,
}: {
  item: ModuleItemRow;
  onConfirm: (id: string, value: string) => void;
}) {
  const [editVal, setEditVal] = useState(item.approved_value ?? item.extracted_value ?? "");
  const [editing, setEditing] = useState(false);
  const prevApprovedRef = useRef(item.approved_value);
  useEffect(() => {
    if (item.approved_value !== prevApprovedRef.current) {
      prevApprovedRef.current = item.approved_value;
      setEditVal(item.approved_value ?? item.extracted_value ?? "");
    }
  }, [item.approved_value, item.extracted_value]);
  return (
    <tr className="border-t border-border bg-amber-500/4">
      <td className="px-4 py-2.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        {item.module_id.replace("iq-", "")}
      </td>
      <td className="px-4 py-2.5 text-sm font-medium">{item.label}</td>
      <td className="px-4 py-2.5">
        {editing ? (
          <input
            autoFocus
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <span className="tabular-nums text-sm">
            {item.approved_value ?? item.extracted_value ?? "—"}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.unit ?? ""}</td>
      <td className="px-4 py-2.5">
        <ValueSourceBadge source={item.value_source} />
      </td>
      <td className="px-4 py-2.5 text-right">
        {item.value_source !== "confirmed" &&
          (editing ? (
            <div className="flex gap-1 justify-end">
              <button
                type="button"
                onClick={() => {
                  onConfirm(item.id, editVal);
                  setEditing(false);
                }}
                className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditVal(item.approved_value ?? item.extracted_value ?? "");
                }}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent"
            >
              Edit & Confirm
            </button>
          ))}
      </td>
    </tr>
  );
}

function ConceptAssumptionsTab({
  items,
  onConfirm,
}: {
  items: ModuleItemRow[];
  onConfirm: (id: string, value: string) => void;
}) {
  const assumed = items.filter((i) => i.value_source === "assumed");
  const confirmed = items.filter((i) => i.value_source === "confirmed");
  const extracted = items.filter((i) => !i.value_source || i.value_source === "extracted");

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/6 px-4 py-3 text-[12.5px] text-amber-700">
        <strong>{assumed.length}</strong> items below use Jennian standard allowances. Edit and
        confirm each to improve accuracy. <strong>{confirmed.length}</strong> confirmed ·{" "}
        <strong>{extracted.length}</strong> extracted from plans.
      </div>

      {assumed.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          All items have been confirmed or extracted from plans.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <div className="text-[13px] font-semibold tracking-tight">Assumed Items</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              These values were filled automatically using Jennian standard allowances. Review and
              confirm each.
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Value</th>
                <th className="px-4 py-2.5 font-medium">Unit</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {assumed.map((item) => (
                <AssumedItemRow key={item.id} item={item} onConfirm={onConfirm} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InternalWallsTab({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<PlanMeasurement[]>([]);
  useEffect(() => {
    loadMeasurements(jobId)
      .then((all) => {
        setRows(all.filter((m) => m.measurement_type === "internal_wall"));
      })
      .catch(() => {});
  }, [jobId]);
  const totalM = rows.reduce((s, r) => s + (r.calculated_length_m ?? 0), 0);
  const confirmedM = rows
    .filter((r) => r.review_status === "confirmed")
    .reduce((s, r) => s + (r.calculated_length_m ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-tight">Internal Walls</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Wall segments measured from the working plan. Use the Working Plan tab to add segments
            with the "Internal Wall" tool.
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="text-muted-foreground">
            Confirmed total{" "}
            <span className="ml-1 font-medium text-foreground tabular-nums">
              {confirmedM.toFixed(2)} m
            </span>
          </div>
          <div className="text-muted-foreground">
            All segments{" "}
            <span className="ml-1 font-medium text-foreground tabular-nums">
              {totalM.toFixed(2)} m
            </span>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          No internal walls measured yet.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Label</th>
              <th className="px-5 py-2.5 font-medium">Length</th>
              <th className="px-5 py-2.5 font-medium">Source</th>
              <th className="px-5 py-2.5 font-medium">Confidence</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-5 py-2.5">{r.label ?? "Internal wall"}</td>
                <td className="px-5 py-2.5 tabular-nums">
                  {(r.calculated_length_m ?? 0).toFixed(3)} m
                </td>
                <td className="px-5 py-2.5 text-[11px] text-muted-foreground">{r.source}</td>
                <td className="px-5 py-2.5 text-[11px] text-muted-foreground capitalize">
                  {r.confidence}
                </td>
                <td className="px-5 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      r.review_status === "confirmed"
                        ? "border-confidence-high/40 bg-confidence-high/10 text-confidence-high"
                        : "border-confidence-mid/40 bg-confidence-mid/10 text-confidence-mid"
                    }`}
                  >
                    {r.review_status === "confirmed" ? "Confirmed" : "Review"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OverrideInput({
  row,
  onSave,
}: {
  row: Quantity;
  onSave: (r: Quantity, value: string, reason: string) => void;
}) {
  const [val, setVal] = useState(String(row.approved_value ?? row.extracted_value));
  const [pending, setPending] = useState<{ value: string } | null>(null);
  const original = String(row.approved_value ?? row.extracted_value);
  return (
    <>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if (val === original) return;
          setPending({ value: val });
        }}
        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <OverrideReasonDialog
        open={!!pending}
        label={row.quantity_type}
        currentValue={original}
        newValue={pending?.value}
        onCancel={() => {
          setPending(null);
          setVal(original);
        }}
        onConfirm={(reason) => {
          if (pending) onSave(row, pending.value, reason);
          setPending(null);
        }}
      />
    </>
  );
}

function SummaryRow({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${cls}`} />
        <span>{label}</span>
      </div>
      <span className="tabular-nums font-medium">{count}</span>
    </div>
  );
}

function DataSourceBadge({ source }: { source: string | null | undefined }) {
  const s = source || "Demo Value";
  const isDemo = s === "Demo Value";
  const cls = isDemo
    ? "border-confidence-low/40 bg-confidence-low/10 text-confidence-low"
    : s === "Measured From Plan"
      ? "border-confidence-high/40 bg-confidence-high/10 text-confidence-high"
      : s === "User Override"
        ? "border-confidence-mid/40 bg-confidence-mid/10 text-confidence-mid"
        : "border-border bg-muted/30 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {s}
    </span>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Status styling now centralised in `statusBadgeClass`/`statusLabel`.

function ModulesOverview({ jobId }: { jobId: string }) {
  const [runs, setRuns] = useState<ModuleRun[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadModuleRuns(jobId)
      .then((r) => {
        if (!cancelled) setRuns(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId]);
  const runByModule: Record<string, ModuleRun | undefined> = useMemo(
    () => Object.fromEntries(runs.map((r) => [r.module_id, r])),
    [runs],
  );
  const summaries = IQ_MODULES.map((m) => {
    const r = runByModule[m.id];
    return {
      mod: m,
      status: r?.status ?? "not_started",
      items: r?.item_count ?? 0,
      confidence: r?.confidence_avg ?? 0,
      lastRunAt: r?.last_run_at ?? null,
    };
  });

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Job Modules Overview</h2>
          <p className="text-xs text-muted-foreground">
            All quantity packages for this job. Open a module to review and approve.
          </p>
        </div>
        <Link
          to="/modules"
          search={{ job: jobId }}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          All modules <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {summaries.map(({ mod, status, items, confidence, lastRunAt }) => {
          const Icon = MODULE_ICONS[mod.id] ?? Layers;
          return (
            <div
              key={mod.id}
              className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between">
                <div className="h-8 w-8 rounded-md bg-accent grid place-items-center text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(status)}`}
                >
                  {statusLabel(status)}
                </span>
              </div>
              <div className="mt-3 text-[14px] font-semibold tracking-tight">{mod.name}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    Items
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums">{items}</div>
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    Confidence
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums">{confidence}%</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                {lastRunAt ? `Updated ${new Date(lastRunAt).toLocaleString()}` : "Not yet reviewed"}
              </div>
              <Link
                to="/modules/$moduleId"
                params={{ moduleId: mod.id }}
                search={{ job: jobId }}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
              >
                Open Module <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
