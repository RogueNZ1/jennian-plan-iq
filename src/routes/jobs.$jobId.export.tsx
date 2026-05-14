import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "@/components/jennian/AppLayout";
import { Breadcrumbs } from "@/components/jennian/Breadcrumbs";
import {
  buildQSExportData, writeIQDataSheet, buildElectricalSchedule,
  type QSExportData, type ElectricalSchedule,
} from "@/lib/iq-qs-export";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileSpreadsheet, Ruler, Mountain, Square, Zap, Droplets,
  Hammer, PaintRoller, DoorOpen, ArrowLeft,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ModuleItemRow = Database["public"]["Tables"]["module_items"]["Row"];
type OpeningRow = Database["public"]["Tables"]["opening_schedule"]["Row"];

export const Route = createFileRoute("/jobs/$jobId/export")({ component: QuickExport });

function fmt(v: number | null | undefined, unit = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("en-NZ", { maximumFractionDigits: 2 })}${unit ? " " + unit : ""}`;
}

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold tracking-tight">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium tabular-nums">{value}</span>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-[12px] text-muted-foreground italic">{text}</p>;
}

function QuickExport() {
  const { jobId } = Route.useParams();
  const [data, setData] = useState<QSExportData | null>(null);
  const [items, setItems] = useState<ModuleItemRow[]>([]);
  const [openings, setOpenings] = useState<OpeningRow[]>([]);
  const [electrical, setElectrical] = useState<ElectricalSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [exportData, itemsRes, openingsRes] = await Promise.all([
          buildQSExportData(jobId),
          supabase.from("module_items").select("*").eq("job_id", jobId),
          supabase.from("opening_schedule").select("*").eq("job_id", jobId),
        ]);
        if (cancelled) return;
        setData(exportData);
        setItems(itemsRes.data ?? []);
        setOpenings(openingsRes.data ?? []);
        setElectrical(buildElectricalSchedule(exportData));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  async function handleExportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      const bytes = writeIQDataSheet(data);
      const surname = data.clientSurname || data.clientName.split(" ").pop() || "Client";
      const filename = `${data.jmwNumber || data.jobNumber}-IQ-Data-${surname}.xlsx`;
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  function getItemsByModule(moduleId: string): ModuleItemRow[] {
    return items.filter((i) => i.module_id === moduleId);
  }

  const job = data;

  const surname = job ? (job.clientSurname || job.clientName.split(" ").pop() || "Client") : "";
  const filename = job ? `${job.jmwNumber || job.jobNumber}-IQ-Data-${surname}.xlsx` : "IQ-Data.xlsx";

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-5xl">
        <Breadcrumbs items={[
          { label: "Jobs", to: "/jobs" },
          { label: job?.jmwNumber ?? jobId, to: "/jobs/$jobId", params: { jobId } },
          { label: "Quick Export" },
        ]} />

        <PageHeader
          title="Quick Export"
          subtitle={job ? `${job.clientName} · ${job.address}` : "Loading…"}
          actions={
            <div className="flex items-center gap-2">
              <Link
                to="/jobs/$jobId"
                params={{ jobId }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Job
              </Link>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exporting || !data}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {exporting ? "Exporting…" : `Export to Excel — ${filename}`}
              </button>
            </div>
          }
        />

        {loading && (
          <div className="py-12 text-center text-[13px] text-muted-foreground">Loading quantities…</div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
            Failed to load data: {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="grid gap-4 mt-2">

            {/* Core Measurements */}
            <SectionCard icon={Ruler} title="Core Measurements">
              <Row label="Floor Area" value={fmt(data.floorAreaM2, "m²")} />
              <Row label="Perimeter" value={fmt(data.perimeterLm, "lm")} />
              <Row label="Stud Height" value={data.studHeightMm ? fmt(data.studHeightMm, "mm") : "—"} />
              <Row label="Roof Pitch" value={data.roofPitch ?? "—"} />
              <Row label="Alfresco / Deck Area" value={fmt(data.alfrescoAreaM2, "m²")} />
              <Row label="First Floor Area" value={fmt(data.firstFloorAreaM2, "m²")} />
              <Row label="Exterior Wall Length" value={fmt(data.exteriorWallLengthLm, "lm")} />
              <Row label="Exterior Wall Height" value={fmt(data.exteriorWallHeightM, "m")} />
              <Row label="Paths / Patio" value={fmt(data.pathsPatioM2, "m²")} />
              <Row label="Driveway" value={fmt(data.drivewayM2, "m²")} />
            </SectionCard>

            {/* Windows & Doors */}
            <SectionCard icon={DoorOpen} title="Windows & Doors">
              {openings.length === 0 ? (
                <EmptyNote text="No opening schedule data — run a takeoff to extract windows and doors." />
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-semibold text-muted-foreground">Type</th>
                      <th className="pb-2 font-semibold text-muted-foreground">Room</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-right">Qty</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-right">H (mm)</th>
                      <th className="pb-2 font-semibold text-muted-foreground text-right">W (mm)</th>
                      <th className="pb-2 font-semibold text-muted-foreground">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openings.map((o) => (
                      <tr key={o.id} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pr-3 capitalize">{o.opening_type.replace(/_/g, " ")}</td>
                        <td className="py-1.5 pr-3">{o.room_name ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{o.quantity}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{o.height_mm ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{o.width_mm}</td>
                        <td className="py-1.5">{o.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>

            {/* Roofing */}
            <SectionCard icon={Mountain} title="Roofing">
              {(() => {
                const roofItems = getItemsByModule("iq-roofing");
                if (roofItems.length === 0) {
                  return (
                    <>
                      <Row label="Roof Pitch" value={data.roofPitch ?? "—"} />
                      <Row label="Ridge Type" value={data.ridgeType ?? "—"} />
                      <Row label="Underlay" value={data.underlay ?? "—"} />
                      <EmptyNote text="No detailed roofing data extracted yet." />
                    </>
                  );
                }
                return (
                  <>
                    <Row label="Roof Pitch" value={data.roofPitch ?? "—"} />
                    <Row label="Ridge Type" value={data.ridgeType ?? "—"} />
                    <Row label="Underlay" value={data.underlay ?? "—"} />
                    {roofItems.map((i) => (
                      <Row
                        key={i.id}
                        label={i.label ?? ""}
                        value={i.approved_value ?? i.extracted_value ?? "—"}
                      />
                    ))}
                  </>
                );
              })()}
            </SectionCard>

            {/* Cladding */}
            <SectionCard icon={Square} title="Cladding">
              {(() => {
                const claddingItems = getItemsByModule("iq-cladding");
                return (
                  <>
                    <Row label="Cladding Type 1" value={data.claddingType1 ?? "—"} />
                    <Row label="Cladding Type 2" value={data.claddingType2 ?? "—"} />
                    {claddingItems.length === 0 ? (
                      <EmptyNote text="No detailed cladding area data extracted yet." />
                    ) : claddingItems.map((i) => (
                      <Row
                        key={i.id}
                        label={i.label ?? ""}
                        value={i.approved_value ?? i.extracted_value ?? "—"}
                      />
                    ))}
                  </>
                );
              })()}
            </SectionCard>

            {/* Electrical */}
            <SectionCard icon={Zap} title="Electrical">
              {electrical ? (
                <div className="space-y-3">
                  {(
                    [
                      { label: "Lighting", items: electrical.lighting },
                      { label: "Power", items: electrical.power },
                      { label: "Communications", items: electrical.communications },
                      { label: "Mechanical", items: electrical.mechanical },
                    ] as const
                  ).map(({ label, items: eitems }) => (
                    <div key={label}>
                      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
                      {eitems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                          <span className="text-[12px]">{item.description}</span>
                          <span className="text-[12px] font-medium tabular-nums">{item.qty} {item.unit}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="pt-2 border-t border-border flex justify-between">
                    <span className="text-[12px] font-semibold">Total Estimate (excl. GST)</span>
                    <span className="text-[12px] font-semibold tabular-nums">
                      ${electrical.totalEstimate.toLocaleString("en-NZ", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyNote text="No floor area available for electrical schedule." />
              )}
            </SectionCard>

            {/* Plumbing */}
            <SectionCard icon={Droplets} title="Plumbing">
              {(() => {
                const plumbingItems = getItemsByModule("iq-plumbing");
                if (plumbingItems.length === 0) {
                  return <EmptyNote text="No plumbing data extracted yet — run a takeoff with a specification document." />;
                }
                return plumbingItems.map((i) => (
                  <Row
                    key={i.id}
                    label={i.label ?? ""}
                    value={i.approved_value ?? i.extracted_value ?? "—"}
                  />
                ));
              })()}
            </SectionCard>

            {/* Framing */}
            <SectionCard icon={Hammer} title="Framing">
              {(() => {
                const framingItems = getItemsByModule("iq-framing");
                if (framingItems.length === 0) {
                  return (
                    <>
                      <Row label="Exterior Wall Length" value={fmt(data.exteriorWallLengthLm, "lm")} />
                      <EmptyNote text="No detailed framing data extracted yet." />
                    </>
                  );
                }
                return framingItems.map((i) => (
                  <Row
                    key={i.id}
                    label={i.label ?? ""}
                    value={i.approved_value ?? i.extracted_value ?? "—"}
                  />
                ));
              })()}
            </SectionCard>

            {/* Linings */}
            <SectionCard icon={PaintRoller} title="Linings">
              {(() => {
                const liningItems = getItemsByModule("iq-linings");
                if (liningItems.length === 0) {
                  return <EmptyNote text="No linings data extracted yet." />;
                }
                return liningItems.map((i) => (
                  <Row
                    key={i.id}
                    label={i.label ?? ""}
                    value={i.approved_value ?? i.extracted_value ?? "—"}
                  />
                ));
              })()}
            </SectionCard>

          </div>
        )}
      </div>
    </AppLayout>
  );
}
