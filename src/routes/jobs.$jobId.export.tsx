import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { Breadcrumbs } from "@/components/jennian/Breadcrumbs";
import { getJob, type Job } from "@/lib/jennian-data";
import { buildQSExportData, writeIQDataSheet } from "@/lib/iq-qs-export";
import { supabase } from "@/integrations/supabase/client";
import { FileSpreadsheet, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/jobs/$jobId/export")({
  component: QuickExport,
});

type ModuleItem = {
  id: string;
  module_id: string;
  label: string;
  extracted_value: string | null;
  approved_value: string | null;
  unit: string | null;
  value_source: string;
  sort_order: number | null;
};

type Opening = {
  id: string;
  opening_type: string;
  room_name: string | null;
  width_mm: number | null;
  height_mm: number | null;
  quantity: number | null;
  notes: string | null;
  confidence: string;
  review_status: string;
};

const SECTION_MODULES = [
  { id: "iq-core", label: "Core Measurements" },
  { id: "iq-framing", label: "Framing" },
  { id: "iq-roofing", label: "Roofing" },
  { id: "iq-cladding", label: "Cladding" },
  { id: "iq-electrical", label: "Electrical" },
  { id: "iq-plumbing", label: "Plumbing" },
  { id: "iq-linings", label: "Linings" },
  { id: "iq-margin", label: "Margin & Contingency" },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <div className="text-[13px] font-semibold tracking-tight">{title}</div>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

function ItemRow({ item }: { item: ModuleItem }) {
  const value = item.approved_value ?? item.extracted_value ?? "—";
  const isAssumed = item.value_source === "assumed";
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 ${isAssumed ? "opacity-70" : ""}`}>
      <span className="text-sm">{item.label}{isAssumed && <span className="ml-1.5 text-[10px] text-amber-600">(assumed)</span>}</span>
      <span className="text-sm tabular-nums font-medium">{value}{item.unit ? ` ${item.unit}` : ""}</span>
    </div>
  );
}

function QuickExport() {
  const { jobId } = Route.useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<ModuleItem[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([
      getJob(jobId),
      supabase.from("module_items")
        .select("id, module_id, label, extracted_value, approved_value, unit, value_source, sort_order")
        .eq("job_id", jobId)
        .order("sort_order", { ascending: true }),
      supabase.from("opening_schedule")
        .select("id, opening_type, room_name, width_mm, height_mm, quantity, notes, confidence, review_status")
        .eq("job_id", jobId),
    ])
      .then(([j, itemsRes, openingsRes]) => {
        setJob(j);
        setItems((itemsRes.data ?? []) as ModuleItem[]);
        setOpenings((openingsRes.data ?? []) as Opening[]);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  function getItemsByModule(moduleId: string): ModuleItem[] {
    return items.filter((i) => i.module_id === moduleId);
  }

  async function handleExport() {
    if (!job) return;
    setExporting(true);
    try {
      const data = await buildQSExportData(jobId);
      const bytes = await writeIQDataSheet({ ...data, jobId });
      const surname = job.client_name.split(" ").pop() || "Client";
      const filename = `${job.job_number}-IQ-Data-${surname}.xlsx`;
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("IQ data sheet exported.");
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <AppLayout><div className="p-10 text-sm text-muted-foreground">Loading…</div></AppLayout>;
  }

  if (!job) {
    return <AppLayout><div className="p-10 text-sm text-muted-foreground">Job not found.</div></AppLayout>;
  }

  const windows = openings.filter((o) => o.opening_type === "window");
  const doors = openings.filter((o) => ["exterior_door", "interior_door", "entry_door"].includes(o.opening_type));

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-5xl">
        <Breadcrumbs items={[
          { label: "Jobs", to: "/jobs" },
          { label: job.job_number, to: "/jobs/$jobId", params: { jobId: job.id } },
          { label: "Quick Export" },
        ]} />
        <PageHeader
          title="Quick Export"
          subtitle={`${job.job_number} · ${job.client_name} · ${job.address}`}
          actions={
            <div className="flex gap-2 items-center">
              <Link
                to="/jobs/$jobId"
                params={{ jobId: job.id }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Job
              </Link>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export to Excel"}
              </button>
            </div>
          }
        />

        {job.plan_type === "concept" && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-[12.5px] text-amber-700">
            Concept plan — {items.filter((i) => i.value_source === "assumed").length} items use Jennian standard allowances.
            {job.confidence_score != null && <span className="ml-2 font-medium">Confidence: {job.confidence_score}%</span>}
          </div>
        )}

        <div className="space-y-5">
          {/* Windows & Doors */}
          <SectionCard title="Windows & Doors">
            {windows.length === 0 && doors.length === 0 ? (
              <EmptyNote text="No windows or doors extracted yet." />
            ) : (
              <div className="space-y-3">
                {windows.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Windows</div>
                    {windows.map((o) => (
                      <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        <span className="text-sm">{o.room_name ?? o.opening_type}</span>
                        <span className="text-sm tabular-nums">
                          {o.width_mm && o.height_mm ? `${o.width_mm}×${o.height_mm}mm` : o.width_mm ? `${o.width_mm}mm W` : "—"}
                          {o.quantity && o.quantity > 1 ? ` ×${o.quantity}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {doors.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Doors</div>
                    {doors.map((o) => (
                      <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                        <span className="text-sm">{o.room_name ?? o.opening_type.replace(/_/g, " ")}</span>
                        <span className="text-sm tabular-nums">
                          {o.width_mm ? `${o.width_mm}mm W` : "—"}
                          {o.quantity && o.quantity > 1 ? ` ×${o.quantity}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Module sections */}
          {SECTION_MODULES.map(({ id, label }) => {
            const moduleItems = getItemsByModule(id);
            return (
              <SectionCard key={id} title={label}>
                {moduleItems.length === 0 ? (
                  <EmptyNote text="Not extracted yet." />
                ) : (
                  moduleItems.map((item) => <ItemRow key={item.id} item={item} />)
                )}
              </SectionCard>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
