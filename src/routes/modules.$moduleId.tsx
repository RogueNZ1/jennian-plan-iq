import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { HouseFrame } from "@/components/jennian/HouseFrame";
import { StatusChip } from "./modules";
import {
  IQ_MODULES, findIQModule, loadModuleState, saveModuleState,
  runDummyExtraction, confidencePercent,
  type IQItem, type IQModule, type IQModuleId, type IQModuleStatus,
} from "@/lib/iq-modules";
import { getJob, type Job } from "@/lib/jennian-data";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkles, CheckCircle2, FileSpreadsheet, RotateCcw, Trash2,
} from "lucide-react";
import type { Confidence } from "@/lib/jennian-data";

export const Route = createFileRoute("/modules/$moduleId")({
  component: ModuleDetail,
  validateSearch: (s: Record<string, unknown>) => ({
    job: typeof s.job === "string" ? s.job : undefined,
  }),
});

function ModuleDetail() {
  const { moduleId } = Route.useParams();
  const { job: jobId } = Route.useSearch();
  const navigate = useNavigate();
  const mod = findIQModule(moduleId);

  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<IQItem[]>([]);
  const [status, setStatus] = useState<IQModuleStatus>("not_started");
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const jobKey = jobId ?? "preview";

  useEffect(() => {
    if (!mod) return;
    const s = loadModuleState(jobKey, mod);
    setItems(s.items);
    setStatus(s.status);
    setLastRunAt(s.lastRunAt);
  }, [jobKey, mod]);

  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    getJob(jobId).then(setJob).catch(() => setJob(null));
  }, [jobId]);

  // Persist on every change
  useEffect(() => {
    if (!mod) return;
    saveModuleState(jobKey, mod.id, { items, status, lastRunAt });
  }, [items, status, lastRunAt, jobKey, mod]);

  const confidence = useMemo(() => confidencePercent(items), [items]);

  if (!mod) {
    return (
      <AppLayout>
        <div className="px-8 py-10">
          <div className="text-sm">Module not found.</div>
          <Link to="/modules" className="mt-3 inline-block text-xs text-primary hover:underline">Back to Modules</Link>
        </div>
      </AppLayout>
    );
  }

  function patchItem(key: string, patch: Partial<IQItem>) {
    setItems((rs) => rs.map((r) => r.key === key ? { ...r, ...patch } : r));
    if (status === "not_started" || status === "ready") setStatus("in_review");
  }

  async function runExtraction() {
    if (!mod) return;
    setRunning(true);
    try {
      const next = await runDummyExtraction(jobKey, mod);
      setItems(next);
      setStatus("ready");
      setLastRunAt(new Date().toISOString());
      toast.success(`${mod.name} — extraction complete (preview).`);
    } finally {
      setRunning(false);
    }
  }

  function markReviewed() {
    setStatus("approved");
    setItems((rs) => rs.map((r) => ({ ...r, approved: true })));
    toast.success(`${mod.name} marked reviewed.`);
  }

  function resetItems() {
    if (!mod) return;
    if (!confirm("Reset edits and restore extracted values?")) return;
    setItems((rs) => rs.map((r) => ({
      ...r, finalQuantity: r.extractedQuantity, notes: "", approved: false,
    })));
    setStatus("ready");
    toast.success("Module reset.");
  }

  function exportCsv() {
    if (!mod) return;
    const header = ["Item","Description","Unit","Extracted Quantity","Final Quantity","Confidence","Notes","Approved"];
    const rows = items.map((i) => [
      i.key, i.description, i.unit,
      i.extractedQuantity, i.finalQuantity, i.confidence,
      (i.notes ?? "").replace(/"/g, '""'),
      i.approved ? "yes" : "no",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => /[",\n]/.test(String(c)) ? `"${c}"` : String(c)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = job?.job_number ?? "preview";
    a.href = url; a.download = `${slug}-${mod.id}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Module CSV exported.");
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <Link
          to={jobId ? "/review" : "/modules"}
          search={jobId ? { job: jobId } : undefined}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> {jobId ? "Back to Job" : "All modules"}
        </Link>

        <PageHeader
          title={mod.name}
          subtitle={mod.longDescription}
          actions={
            <div className="flex items-center gap-2">
              <StatusChip status={status} />
              <button
                onClick={runExtraction}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                {running ? "Running…" : "Run Extraction"}
              </button>
              <button
                onClick={markReviewed}
                disabled={status === "approved"}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" /> Mark Reviewed
              </button>
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export Module CSV
              </button>
            </div>
          }
        />

        {/* Job context strip */}
        <div className="mb-6 grid sm:grid-cols-4 gap-4">
          <Tile label="Job"        value={job?.job_number ?? (jobId ? "—" : "Preview")} />
          <Tile label="Client"     value={job?.client_name ?? "—"} mono={false} />
          <Tile label="Items"      value={items.length.toString()} />
          <Tile label="Confidence" value={`${confidence}%`} />
        </div>

        {!jobId && (
          <div className="mb-6 rounded-lg border border-dashed border-border bg-card p-6 grid place-items-center text-center">
            <HouseFrame className="w-44 text-muted-foreground/40" />
            <div className="mt-3 text-sm font-medium">Preview mode</div>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              You are viewing example data. Open this module from a job to edit
              and persist quantities for that job.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold tracking-tight">Extracted items</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {lastRunAt ? `Last run ${new Date(lastRunAt).toLocaleString()}` : "Not yet extracted"}
                {" · "}{items.filter((i) => i.approved).length}/{items.length} approved
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetItems}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
                title="Reset edits"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Item</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Unit</th>
                  <th className="px-5 py-3 font-medium">Extracted</th>
                  <th className="px-5 py-3 font-medium">Final</th>
                  <th className="px-5 py-3 font-medium">Confidence</th>
                  <th className="px-5 py-3 font-medium">Notes</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} className="border-t border-border">
                    <td className="px-5 py-3 font-medium tabular-nums">{it.key}</td>
                    <td className="px-5 py-3">{it.description}</td>
                    <td className="px-5 py-3 text-muted-foreground">{it.unit}</td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{it.extractedQuantity}</td>
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        step="any"
                        defaultValue={String(it.finalQuantity)}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isNaN(v)) {
                            e.target.value = String(it.finalQuantity);
                            return;
                          }
                          if (v !== it.finalQuantity) patchItem(it.key, { finalQuantity: v });
                        }}
                        className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={it.confidence}
                        onChange={(e) => patchItem(it.key, { confidence: e.target.value as Confidence })}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="high">High</option>
                        <option value="mid">Review</option>
                        <option value="low">Low</option>
                      </select>
                      <div className="mt-1"><ConfidencePill level={it.confidence} /></div>
                    </td>
                    <td className="px-5 py-3 min-w-[14rem]">
                      <input
                        defaultValue={it.notes}
                        placeholder="Add note…"
                        onBlur={(e) => {
                          if (e.target.value !== it.notes) patchItem(it.key, { notes: e.target.value });
                        }}
                        className="w-full rounded-md border border-transparent hover:border-input bg-transparent px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background focus:border-input"
                      />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => patchItem(it.key, { approved: !it.approved })}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                            it.approved
                              ? "border-transparent bg-primary/10 text-primary"
                              : "border-border bg-card hover:bg-accent"
                          }`}
                          title={it.approved ? "Mark as not approved" : "Approve item"}
                        >
                          <CheckCircle2 className="h-3 w-3" /> {it.approved ? "Approved" : "Approve"}
                        </button>
                        <button
                          onClick={() => patchItem(it.key, {
                            finalQuantity: it.extractedQuantity,
                            notes: "",
                            approved: false,
                          })}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                          title="Reset this row"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => navigate({
              to: jobId ? "/review" : "/modules",
              search: jobId ? { job: jobId } : undefined,
            })}
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

// satisfy unused-import elimination across module list
void IQ_MODULES;
void ({} as IQModule);
void ({} as IQModuleId);