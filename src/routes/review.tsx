import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import {
  getJob, listQuantities, listOverrides,
  type Job, type Quantity, type OverrideRow,
} from "@/lib/jennian-data";
import { MODULES, moduleForQuantity, type ModuleId } from "@/lib/takeoff-modules";
import {
  IQ_MODULES, loadModuleState, confidencePercent, STATUS_LABEL,
  type IQModuleId, type IQModuleStatus,
} from "@/lib/iq-modules";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Download, FileSpreadsheet, History, CheckCircle2, ArrowRight,
  Ruler, Zap, Droplets, PaintRoller, Hammer, Square, Mountain, AlertTriangle, ShoppingCart, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const MODULE_ICONS: Record<IQModuleId, React.ComponentType<{ className?: string }>> = {
  "iq-core": Ruler, "iq-electrical": Zap, "iq-plumbing": Droplets,
  "iq-linings": PaintRoller, "iq-framing": Hammer, "iq-cladding": Square,
  "iq-roofing": Mountain, "iq-margin": AlertTriangle, "iq-procurement": ShoppingCart,
};

export const Route = createFileRoute("/review")({
  component: ReviewPage,
  validateSearch: (s: Record<string, unknown>) => ({ job: typeof s.job === "string" ? s.job : undefined }),
});

function ReviewPage() {
  const { job: jobId } = Route.useSearch();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Quantity[]>([]);
  const [audit, setAudit] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) { setLoading(false); return; }
    Promise.all([getJob(jobId), listQuantities(jobId), listOverrides(jobId)])
      .then(([j, q, o]) => { setJob(j); setRows(q); setAudit(o); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
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
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, approved_value: newValue, confidence: "high" } : r));
    const fresh = await listOverrides(jobId!);
    setAudit(fresh);
    toast.success("Quantity updated.");
  }

  async function approve() {
    if (!job) return;
    await supabase.from("jobs").update({ status: "approved" }).eq("id", job.id);
    setJob({ ...job, status: "approved" });
    toast.success("Job approved.");
  }

  function exportRows() {
    if (!job) return [];
    return rows.map((r) => ({
      "Job Number": job.job_number,
      "Client Name": job.client_name,
      "Address": job.address,
      "Quantity Type": r.quantity_type,
      "Unit": r.unit,
      "Extracted Value": r.extracted_value,
      "Final Approved Value": r.approved_value ?? r.extracted_value,
      "Confidence": r.confidence,
      "Notes": r.notes ?? "",
    }));
  }

  async function logExport(type: "csv" | "excel") {
    if (!job || !user) return;
    await supabase.from("export_logs").insert({ job_id: job.id, exported_by: user.id, export_type: type });
    if (job.status !== "exported") {
      await supabase.from("jobs").update({ status: "exported" }).eq("id", job.id);
      setJob({ ...job, status: "exported" });
    }
  }

  async function exportCsv() {
    if (!job) return;
    const data = exportRows();
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${job.job_number}-quantities.csv`);
    await logExport("csv");
    toast.success("CSV exported.");
  }

  async function exportExcel() {
    if (!job) return;
    const data = exportRows();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quantities");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    triggerDownload(new Blob([buf], { type: "application/octet-stream" }), `${job.job_number}-quantities.xlsx`);
    await logExport("excel");
    toast.success("Excel exported.");
  }

  if (loading) {
    return <AppLayout><div className="p-10 text-sm text-muted-foreground">Loading…</div></AppLayout>;
  }

  if (!job) {
    return (
      <AppLayout>
        <div className="px-8 py-8 max-w-3xl">
          <PageHeader title="Quantity Review" subtitle="Select a job to review extracted quantities." />
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">No job selected.</p>
            <Link to="/jobs" className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Browse jobs</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <PageHeader
          title="IQ Core Review"
          subtitle={`${job.job_number} · ${job.client_name} · ${job.address}`}
          actions={
            <div className="flex gap-2 items-center">
              <StatusBadge status={job.status} />
              {job.status !== "approved" && job.status !== "exported" && (
                <button onClick={approve} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent"><CheckCircle2 className="h-4 w-4" /> Approve</button>
              )}
              <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-accent"><Download className="h-4 w-4" /> Export CSV</button>
              <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><FileSpreadsheet className="h-4 w-4" /> Export Excel</button>
            </div>
          }
        />

        <ModulesOverview jobId={job.id} />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-5">
            {rows.length === 0 && (
              <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                No quantities yet for this job.
              </div>
            )}
            {MODULES.map((m) => {
              const moduleRows = rows.filter((r) => moduleForQuantity(r.quantity_type) === (m.id as ModuleId));
              if (moduleRows.length === 0) return null;
              return (
                <div key={m.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-semibold tracking-tight">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{m.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">→ {m.exportSheet}</span>
                      <Link to="/modules/$moduleId" params={{ moduleId: m.id }} search={{ job: jobId }} className="text-xs font-medium text-primary hover:underline">Open module</Link>
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
                        <th className="px-5 py-2.5 font-medium">Notes</th>
                        <th className="px-5 py-2.5 font-medium text-right">Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moduleRows.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-5 py-3 font-medium">{r.quantity_type}</td>
                          <td className="px-5 py-3 text-muted-foreground">{r.unit}</td>
                          <td className="px-5 py-3 tabular-nums text-muted-foreground">{r.extracted_value}</td>
                          <td className="px-5 py-3 tabular-nums font-medium">{r.approved_value ?? r.extracted_value}</td>
                          <td className="px-5 py-3"><ConfidencePill level={r.confidence} /></td>
                          <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs">{r.notes || "—"}</td>
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
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Confidence summary</div>
              <div className="mt-3 space-y-2 text-sm">
                <SummaryRow label="High" count={rows.filter(r => r.confidence === "high").length} cls="bg-confidence-high" />
                <SummaryRow label="Review" count={rows.filter(r => r.confidence === "mid").length} cls="bg-confidence-mid" />
                <SummaryRow label="Low" count={rows.filter(r => r.confidence === "low").length} cls="bg-confidence-low" />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                <History className="h-3 w-3" /> Audit log
              </div>
              <div className="mt-3 space-y-3 max-h-72 overflow-auto">
                {audit.length === 0 && <div className="text-xs text-muted-foreground">No overrides yet.</div>}
                {audit.map((a) => {
                  const q = rows.find((r) => r.id === a.quantity_id);
                  return (
                    <div key={a.id} className="text-xs">
                      <div className="font-medium">{q?.quantity_type ?? "Quantity"}</div>
                      <div className="text-muted-foreground">
                        {a.original_value} → <span className="text-foreground">{a.new_value}</span> · {new Date(a.timestamp).toLocaleString()}
                      </div>
                      {a.reason && <div className="text-muted-foreground italic">"{a.reason}"</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function OverrideInput({ row, onSave }: { row: Quantity; onSave: (r: Quantity, value: string, reason: string) => void }) {
  const [val, setVal] = useState(String(row.approved_value ?? row.extracted_value));
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val === String(row.approved_value ?? row.extracted_value)) return;
        const reason = window.prompt("Reason for override?") ?? "";
        onSave(row, val, reason);
      }}
      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function SummaryRow({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${cls}`} /><span>{label}</span></div>
      <span className="tabular-nums font-medium">{count}</span>
    </div>
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

const STATUS_STYLES: Record<IQModuleStatus, string> = {
  not_started: "bg-muted text-muted-foreground border-border",
  ready:       "bg-confidence-high-bg text-confidence-high border-transparent",
  in_review:   "bg-confidence-mid-bg text-confidence-mid border-transparent",
  approved:    "bg-primary/10 text-primary border-transparent",
};

function ModulesOverview({ jobId }: { jobId: string }) {
  const [tick, setTick] = useState(0);
  // Recompute when localStorage changes (cross-tab) or window regains focus.
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, []);

  const summaries = useMemo(() => {
    return IQ_MODULES.map((m) => {
      const s = loadModuleState(jobId, m);
      return {
        mod: m,
        status: s.status,
        items: s.items.length,
        confidence: confidencePercent(s.items),
        lastRunAt: s.lastRunAt,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, tick]);

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Job Modules Overview</h2>
          <p className="text-xs text-muted-foreground">All quantity packages for this job. Open a module to review and approve.</p>
        </div>
        <Link to="/modules" search={{ job: jobId }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          All modules <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {summaries.map(({ mod, status, items, confidence, lastRunAt }) => {
          const Icon = MODULE_ICONS[mod.id] ?? Layers;
          return (
            <div key={mod.id} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors flex flex-col">
              <div className="flex items-start justify-between">
                <div className="h-8 w-8 rounded-md bg-accent grid place-items-center text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <div className="mt-3 text-[14px] font-semibold tracking-tight">{mod.name}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Items</div>
                  <div className="text-[13px] font-semibold tabular-nums">{items}</div>
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Confidence</div>
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