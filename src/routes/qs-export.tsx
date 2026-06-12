import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { Breadcrumbs } from "@/components/jennian/Breadcrumbs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  buildQSExportData,
  writeIQDataSheetFull,
  buildElectricalSchedule,
  electricalScheduleToCSV,
  type QSExportData,
} from "@/lib/iq-qs-export";
import { IQ_MODULES, type IQModuleId } from "@/lib/iq-modules";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { FileSpreadsheet, Zap, DoorOpen, Download, ArrowLeft, Loader2 } from "lucide-react";

type ModuleItemRow = Database["public"]["Tables"]["module_items"]["Row"];
type OpeningRow = Database["public"]["Tables"]["opening_schedule"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

type Search = { job?: string };

export const Route = createFileRoute("/qs-export")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    job: typeof raw.job === "string" && raw.job.length > 0 ? raw.job : undefined,
  }),
  head: () => ({
    meta: [
      { title: "QS Takeoff Export — Jennian Plan IQ" },
      {
        name: "description",
        content: "Trade-by-trade quantity surveyor takeoff export with download package.",
      },
    ],
  }),
  component: QSExportPage,
});

function downloadBlob(bytes: BlobPart, filename: string, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function confidenceTone(c: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (c === "high") return "default";
  if (c === "mid") return "secondary";
  if (c === "low") return "destructive";
  return "outline";
}

function reviewTone(s: string | null): "default" | "secondary" | "outline" {
  if (s === "confirmed") return "default";
  if (s === "review_required") return "secondary";
  return "outline";
}

function buildOpeningCSV(rows: OpeningRow[]): string {
  const header = [
    "Type",
    "Room",
    "Qty",
    "Width (mm)",
    "Height (mm)",
    "Source",
    "Confidence",
    "Review Status",
    "Page",
  ];
  const lines = [header.join(",")];
  for (const o of rows) {
    const cells = [
      o.opening_type,
      o.room_name ?? "",
      o.quantity,
      o.width_mm,
      o.height_mm ?? "",
      o.source,
      o.confidence,
      o.review_status,
      o.plan_page_number,
    ];
    lines.push(
      cells
        .map((c) => {
          const s = String(c ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

function QSExportPage() {
  const { job: jobParam } = Route.useSearch();
  const navigate = useNavigate({ from: "/qs-export" });

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [job, setJob] = useState<JobRow | null>(null);
  const [data, setData] = useState<QSExportData | null>(null);
  const [items, setItems] = useState<ModuleItemRow[]>([]);
  const [openings, setOpenings] = useState<OpeningRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Job picker list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        toast.error(`Could not load jobs: ${error.message}`);
        return;
      }
      setJobs(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Job-scoped data
  useEffect(() => {
    if (!jobParam) {
      setJob(null);
      setData(null);
      setItems([]);
      setOpenings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [jobRes, itemsRes, openingsRes, exportData] = await Promise.all([
          supabase.from("jobs").select("*").eq("id", jobParam).maybeSingle(),
          supabase.from("module_items").select("*").eq("job_id", jobParam),
          supabase.from("opening_schedule").select("*").eq("job_id", jobParam),
          buildQSExportData(jobParam),
        ]);
        if (cancelled) return;
        if (jobRes.error) throw jobRes.error;
        setJob(jobRes.data ?? null);
        setItems(itemsRes.data ?? []);
        setOpenings(openingsRes.data ?? []);
        setData(exportData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobParam]);

  const itemsByModule = useMemo(() => {
    const map = new Map<string, ModuleItemRow[]>();
    for (const i of items) {
      const arr = map.get(i.module_id) ?? [];
      arr.push(i);
      map.set(i.module_id, arr);
    }
    return map;
  }, [items]);

  const surname = data ? data.clientSurname || data.clientName.split(" ").pop() || "Client" : "";
  const fileBase = data ? `${data.jmwNumber || data.jobNumber}-${surname}` : "QS-Takeoff";

  async function withExport(label: string, fn: () => Promise<void> | void) {
    setExporting(label);
    try {
      await fn();
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(null);
    }
  }

  function exportIQData() {
    if (!data) return;
    void withExport("iq", async () => {
      const bytes = await writeIQDataSheetFull({ ...data, jobId: jobParam });
      downloadBlob(
        bytes as BlobPart,
        `${fileBase}-QS-Export.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      toast.success("QS Export downloaded");
    });
  }
  function exportElectrical() {
    if (!data) return;
    void withExport("electrical", () => {
      const csv = electricalScheduleToCSV(buildElectricalSchedule(data));
      downloadBlob(csv, `${fileBase}-Electrical.csv`, "text/csv;charset=utf-8");
      toast.success("Electrical schedule downloaded");
    });
  }
  function exportOpenings() {
    if (openings.length === 0) {
      toast.error("No opening schedule rows to export.");
      return;
    }
    void withExport("openings", () => {
      const csv = buildOpeningCSV(openings);
      downloadBlob(csv, `${fileBase}-Openings.csv`, "text/csv;charset=utf-8");
      toast.success("Opening schedule downloaded");
    });
  }

  const firstModuleWithItems =
    IQ_MODULES.find((m) => (itemsByModule.get(m.id)?.length ?? 0) > 0)?.id ?? IQ_MODULES[0].id;

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <Breadcrumbs items={[{ label: "Jobs", to: "/jobs" }, { label: "QS Takeoff Export" }]} />

        <PageHeader
          title="QS Takeoff Export"
          subtitle={
            job
              ? `${job.job_number} · ${job.client_name} · ${job.address}`
              : "Select a job to view its trade-by-trade takeoff and download the QS package."
          }
          actions={
            job ? (
              <Link
                to="/jobs/$jobId"
                params={{ jobId: job.id }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Job
              </Link>
            ) : null
          }
        />

        {/* Job picker */}
        <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-muted-foreground">Job</span>
          <div className="min-w-[320px]">
            <Select
              value={jobParam ?? ""}
              onValueChange={(v) => navigate({ search: { job: v || undefined } })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose a job…" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.job_number} — {j.client_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {jobParam && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ search: { job: undefined } })}
            >
              Clear
            </Button>
          )}
        </div>

        {!jobParam && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              Pick a job above, or open this page with{" "}
              <code className="px-1 rounded bg-muted">?job=&lt;jobId&gt;</code>.
            </p>
          </div>
        )}

        {jobParam && loading && (
          <div className="py-12 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading takeoff data…
          </div>
        )}

        {jobParam && error && !loading && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
            Failed to load: {error}
          </div>
        )}

        {jobParam && !loading && !error && data && (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
            {/* Left: tabbed trade tables */}
            <div>
              <Tabs defaultValue={firstModuleWithItems} className="w-full">
                <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/40 p-1">
                  {IQ_MODULES.map((m) => {
                    const count = itemsByModule.get(m.id)?.length ?? 0;
                    return (
                      <TabsTrigger key={m.id} value={m.id} className="text-[12px]">
                        {m.name}
                        <span className="ml-1.5 text-[10.5px] text-muted-foreground">{count}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {IQ_MODULES.map((m) => {
                  const rows = itemsByModule.get(m.id) ?? [];
                  return (
                    <TabsContent key={m.id} value={m.id} className="mt-4">
                      <div className="rounded-lg border border-border bg-card overflow-hidden">
                        <div className="px-4 py-3 border-b border-border bg-muted/30">
                          <div className="text-[13px] font-semibold tracking-tight">{m.name}</div>
                          <div className="text-[11.5px] text-muted-foreground">
                            {m.shortDescription}
                          </div>
                        </div>
                        {rows.length === 0 ? (
                          <div className="p-6 text-center text-[12px] text-muted-foreground italic">
                            No items extracted for this trade yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="border-b border-border text-left bg-muted/10">
                                  <th className="px-3 py-2 font-semibold text-muted-foreground">
                                    Item
                                  </th>
                                  <th className="px-3 py-2 font-semibold text-muted-foreground text-right">
                                    Value
                                  </th>
                                  <th className="px-3 py-2 font-semibold text-muted-foreground">
                                    Unit
                                  </th>
                                  <th className="px-3 py-2 font-semibold text-muted-foreground">
                                    Source
                                  </th>
                                  <th className="px-3 py-2 font-semibold text-muted-foreground">
                                    Confidence
                                  </th>
                                  <th className="px-3 py-2 font-semibold text-muted-foreground">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => {
                                  const value = r.extracted_value ?? "—";
                                  return (
                                    <tr
                                      key={r.id}
                                      className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                                    >
                                      <td className="px-3 py-2">
                                        <div className="font-medium">{r.label}</div>
                                        {r.source_evidence && (
                                          <div className="text-[10.5px] text-muted-foreground line-clamp-1">
                                            {r.source_evidence}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                                        {value}
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">
                                        {r.unit ?? "—"}
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">
                                        {r.data_source ?? "—"}
                                      </td>
                                      <td className="px-3 py-2">
                                        <Badge variant={confidenceTone(r.confidence)}>
                                          {r.confidence ?? "n/a"}
                                        </Badge>
                                      </td>
                                      <td className="px-3 py-2">
                                        <Badge variant={reviewTone(r.review_status)}>
                                          {(r.review_status ?? "").replace(/_/g, " ") || "n/a"}
                                        </Badge>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>

            {/* Right: download panel */}
            <aside className="space-y-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="h-4 w-4 text-primary" />
                  <h2 className="text-[13px] font-semibold tracking-tight">Download package</h2>
                </div>
                <p className="text-[11.5px] text-muted-foreground mb-4">
                  Generated from the latest approved and extracted takeoff data for this job.
                </p>

                <div className="space-y-2">
                  <Button
                    onClick={exportIQData}
                    disabled={exporting !== null}
                    className="w-full justify-start"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    {exporting === "iq" ? "Preparing…" : "QS Export (.xlsx)"}
                  </Button>
                  <Button
                    onClick={exportElectrical}
                    disabled={exporting !== null}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Zap className="h-4 w-4" />
                    {exporting === "electrical" ? "Preparing…" : "Electrical Schedule (.csv)"}
                  </Button>
                  <Button
                    onClick={exportOpenings}
                    disabled={exporting !== null || openings.length === 0}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <DoorOpen className="h-4 w-4" />
                    {exporting === "openings"
                      ? "Preparing…"
                      : `Opening Schedule (.csv)${openings.length ? ` · ${openings.length}` : ""}`}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 text-[12px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Module items</span>
                  <span className="font-medium tabular-nums">{items.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Openings</span>
                  <span className="font-medium tabular-nums">{openings.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Confirmed</span>
                  <span className="font-medium tabular-nums">
                    {items.filter((i) => i.review_status === "confirmed").length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Review required</span>
                  <span className="font-medium tabular-nums">
                    {items.filter((i) => i.review_status === "review_required").length}
                  </span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Re-export the module id type so external linkers can reach it without a separate import.
export type { IQModuleId };
