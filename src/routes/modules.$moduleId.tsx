import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader, ConfidencePill } from "@/components/jennian/AppLayout";
import { StatusBadge } from "@/components/jennian/StatusBadge";
import { HouseFrame } from "@/components/jennian/HouseFrame";
import {
  MODULES, MOCK_WINDOWS, MOCK_DOORS, MOCK_CLADDING, moduleForQuantity,
  type ModuleId,
} from "@/lib/takeoff-modules";
import {
  getJob, listQuantities, type Job, type Quantity,
} from "@/lib/jennian-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/modules/$moduleId")({
  component: ModuleDetail,
  validateSearch: (s: Record<string, unknown>) => ({
    job: typeof s.job === "string" ? s.job : undefined,
  }),
});

function ModuleDetail() {
  const { moduleId } = Route.useParams();
  const { job: jobId } = Route.useSearch();
  const { user } = useAuth();
  const mod = MODULES.find((m) => m.id === (moduleId as ModuleId));

  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Quantity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewStatus, setReviewStatus] = useState<"pending" | "in_review" | "complete">("pending");
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!jobId) { setLoading(false); return; }
    Promise.all([getJob(jobId), listQuantities(jobId)])
      .then(([j, q]) => { setJob(j); setRows(q.filter((r) => moduleForQuantity(r.quantity_type) === moduleId)); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [jobId, moduleId]);

  async function override(row: Quantity, raw: string) {
    const newValue = Number(raw);
    if (Number.isNaN(newValue)) return toast.error("Value must be numeric.");
    const original = row.approved_value ?? row.extracted_value;
    if (newValue === original) return;
    const reason = window.prompt("Reason for override?") ?? "";
    const { error: ovErr } = await supabase.from("quantity_overrides").insert({
      quantity_id: row.id, original_value: original, new_value: newValue,
      edited_by: user!.id, reason: reason || null,
    });
    if (ovErr) return toast.error(ovErr.message);
    await supabase.from("extracted_quantities").update({ approved_value: newValue, confidence: "high" }).eq("id", row.id);
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, approved_value: newValue, confidence: "high" } : r));
    toast.success("Quantity updated.");
  }

  async function updateNotes(row: Quantity, notes: string) {
    if ((row.notes ?? "") === notes) return;
    await supabase.from("extracted_quantities").update({ notes }).eq("id", row.id);
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, notes } : r));
  }

  if (!mod) {
    return <AppLayout><div className="p-10 text-sm">Module not found.</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="px-8 py-8 max-w-7xl">
        <Link to="/modules" search={{ job: jobId }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3 w-3" /> All modules
        </Link>

        <PageHeader
          title={mod.name}
          subtitle={mod.description}
          actions={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-primary">
                Export → {mod.exportSheet}
              </span>
              {job && <StatusBadge status={job.status} />}
              <button
                onClick={() => { setApproved(true); setReviewStatus("complete"); toast.success(`${mod.name} approved.`); }}
                disabled={approved}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" /> {approved ? "Approved" : "Approve module"}
              </button>
            </div>
          }
        />

        {/* Job context strip */}
        <div className="mb-6 grid sm:grid-cols-4 gap-4">
          <Tile label="Job" value={job?.job_number ?? "—"} />
          <Tile label="Client" value={job?.client_name ?? "—"} />
          <Tile label="Address" value={job?.address ?? "—"} mono={false} />
          <Tile label="Review" value={reviewStatus === "complete" ? "Complete" : reviewStatus === "in_review" ? "In review" : "Pending"} />
        </div>

        {!jobId ? (
          <EmptySelectJob />
        ) : loading ? (
          <div className="p-10 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ModuleBody
            moduleId={moduleId as ModuleId}
            rows={rows}
            onReviewing={() => setReviewStatus("in_review")}
            onOverride={override}
            onNotes={updateNotes}
          />
        )}
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

function EmptySelectJob() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-12 grid place-items-center text-center">
      <HouseFrame className="w-48 text-muted-foreground/40" />
      <div className="mt-4 text-sm font-medium">No job selected</div>
      <p className="mt-1 text-xs text-muted-foreground">Pick a job from <Link to="/modules" className="text-primary hover:underline">Takeoff Modules</Link>.</p>
    </div>
  );
}

function ModuleBody({
  moduleId, rows, onReviewing, onOverride, onNotes,
}: {
  moduleId: ModuleId;
  rows: Quantity[];
  onReviewing: () => void;
  onOverride: (r: Quantity, v: string) => void;
  onNotes: (r: Quantity, notes: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Module-specific schedules */}
      {moduleId === "windows-doors" && <WindowsDoorsSchedules />}
      {moduleId === "cladding" && <CladdingSchedule />}

      {/* Generic extracted quantities for this module */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-[13px] font-semibold tracking-tight">Extracted quantities</div>
          <div className="text-[11px] text-muted-foreground">{rows.length} item{rows.length === 1 ? "" : "s"}</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No extracted quantities mapped to this module yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Quantity</th>
                <th className="px-5 py-3 font-medium">Unit</th>
                <th className="px-5 py-3 font-medium">Extracted</th>
                <th className="px-5 py-3 font-medium">Final</th>
                <th className="px-5 py-3 font-medium">Confidence</th>
                <th className="px-5 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-5 py-3 font-medium">{r.quantity_type}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.unit}</td>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">{r.extracted_value}</td>
                  <td className="px-5 py-3">
                    <input
                      defaultValue={String(r.approved_value ?? r.extracted_value)}
                      onFocus={onReviewing}
                      onBlur={(e) => onOverride(r, e.target.value)}
                      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className="px-5 py-3"><ConfidencePill level={r.confidence} /></td>
                  <td className="px-5 py-3">
                    <input
                      defaultValue={r.notes ?? ""}
                      placeholder="Add note…"
                      onFocus={onReviewing}
                      onBlur={(e) => onNotes(r, e.target.value)}
                      className="w-full rounded-md border border-transparent hover:border-input bg-transparent px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background focus:border-input"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function WindowsDoorsSchedules() {
  return (
    <>
      <ScheduleCard title="Window schedule" count={MOCK_WINDOWS.length}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {["ID","Elev.","Room","W (mm)","H (mm)","Type","Glazing","Cladding behind","Sill / head","Conf.","Notes"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_WINDOWS.map((w) => (
              <tr key={w.opening_id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{w.opening_id}</td>
                <td className="px-4 py-3">{w.elevation}</td>
                <td className="px-4 py-3">{w.room}</td>
                <td className="px-4 py-3 tabular-nums">{w.width_mm}</td>
                <td className="px-4 py-3 tabular-nums">{w.height_mm}</td>
                <td className="px-4 py-3">{w.type}</td>
                <td className="px-4 py-3">{w.glazing}</td>
                <td className="px-4 py-3 text-muted-foreground">{w.cladding_behind}</td>
                <td className="px-4 py-3 text-muted-foreground">{w.sill_head}</td>
                <td className="px-4 py-3"><ConfidencePill level={w.confidence} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[14rem]">{w.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScheduleCard>

      <ScheduleCard title="Door schedule" count={MOCK_DOORS.length}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {["ID","Location","W (mm)","H (mm)","Type","Int / Ext","Architrave","Jamb","Conf.","Notes"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_DOORS.map((d) => (
              <tr key={d.door_id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{d.door_id}</td>
                <td className="px-4 py-3">{d.location}</td>
                <td className="px-4 py-3 tabular-nums">{d.width_mm}</td>
                <td className="px-4 py-3 tabular-nums">{d.height_mm}</td>
                <td className="px-4 py-3">{d.door_type}</td>
                <td className="px-4 py-3">{d.internal_external}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.architrave_required}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.jamb_required}</td>
                <td className="px-4 py-3"><ConfidencePill level={d.confidence} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[14rem]">{d.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScheduleCard>
    </>
  );
}

function CladdingSchedule() {
  return (
    <ScheduleCard title="Cladding schedule" count={MOCK_CLADDING.length}>
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {["Cladding","Elev.","Gross length (lm)","Gross area (m²)","Opening ded. (m²)","Net area (m²)","Sill (lm)","Conf.","Notes"].map((h) => (
              <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_CLADDING.map((c, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{c.cladding_type}</td>
              <td className="px-4 py-3">{c.elevation}</td>
              <td className="px-4 py-3 tabular-nums">{c.gross_wall_length_lm.toFixed(2)}</td>
              <td className="px-4 py-3 tabular-nums">{c.gross_wall_area_m2.toFixed(2)}</td>
              <td className="px-4 py-3 tabular-nums">{c.opening_deductions_m2.toFixed(2)}</td>
              <td className="px-4 py-3 tabular-nums font-medium">{c.net_cladding_area_m2.toFixed(2)}</td>
              <td className="px-4 py-3 tabular-nums">{c.sill_length_lm.toFixed(2)}</td>
              <td className="px-4 py-3"><ConfidencePill level={c.confidence} /></td>
              <td className="px-4 py-3 text-xs text-muted-foreground max-w-[14rem]">{c.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScheduleCard>
  );
}

function ScheduleCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="text-[13px] font-semibold tracking-tight">{title}</div>
        <div className="text-[11px] text-muted-foreground">{count} item{count === 1 ? "" : "s"}</div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}