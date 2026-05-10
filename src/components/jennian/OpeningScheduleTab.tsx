import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  loadOpenings, createOpening, updateOpening, deleteOpening,
  type Opening,
} from "@/lib/iq-measurements";

const OPENING_TYPES: { value: string; label: string }[] = [
  { value: "window",          label: "Window" },
  { value: "internal_door",   label: "Internal Door" },
  { value: "external_door",   label: "External Door" },
  { value: "garage_door",     label: "Garage Door" },
  { value: "slider",          label: "Slider" },
  { value: "robe_opening",    label: "Robe Opening" },
  { value: "unknown_opening", label: "Unknown Opening" },
];

export function OpeningScheduleTab({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const roles = useRoles();
  const canEdit = roles.canWrite;
  const [rows, setRows] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftWidth, setDraftWidth] = useState("");
  const [draftHeight, setDraftHeight] = useState("");

  useEffect(() => {
    loadOpenings(jobId).then((r) => { setRows(r); setLoading(false); }).catch((e) => {
      toast.error(e.message); setLoading(false);
    });
  }, [jobId]);

  async function addRow() {
    if (!user) return;
    const w = Number(draftWidth);
    if (!w || w <= 0) { toast.error("Enter a valid width in mm."); return; }
    const h = draftHeight ? Number(draftHeight) : null;
    try {
      const o = await createOpening({
        jobId, width_mm: w, height_mm: h ?? null,
        opening_type: "unknown_opening",
        source: "User Override",
        confidence: "mid",
        createdBy: user.id,
      });
      setRows((r) => [...r, o]);
      setDraftWidth(""); setDraftHeight("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add.");
    }
  }

  async function patch(o: Opening, p: Partial<Opening>) {
    try {
      await updateOpening(o.id, p);
      setRows((rs) => rs.map((r) => (r.id === o.id ? { ...r, ...p } : r)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update.");
    }
  }

  async function remove(o: Opening) {
    try {
      await deleteOpening(o.id);
      setRows((rs) => rs.filter((r) => r.id !== o.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-tight">Windows & Doors</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Extracted opening sizes for this job. Confirm each row to lock the type and dimensions.
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Width (mm)</label>
            <input
              value={draftWidth}
              onChange={(e) => setDraftWidth(e.target.value)}
              placeholder="e.g. 1300"
              inputMode="numeric"
              className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Height (mm, optional)</label>
            <input
              value={draftHeight}
              onChange={(e) => setDraftHeight(e.target.value)}
              placeholder="e.g. 1500"
              inputMode="numeric"
              className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add opening
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Type</th>
              <th className="px-5 py-2.5 font-medium">Width (mm)</th>
              <th className="px-5 py-2.5 font-medium">Height (mm)</th>
              <th className="px-5 py-2.5 font-medium">Room / Location</th>
              <th className="px-5 py-2.5 font-medium text-center">Qty</th>
              <th className="px-5 py-2.5 font-medium">Source</th>
              <th className="px-5 py-2.5 font-medium">Confidence</th>
              <th className="px-5 py-2.5 font-medium">Confirmed</th>
              <th className="px-5 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="px-5 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-6 text-center text-xs text-muted-foreground">
                No openings recorded yet.
              </td></tr>
            )}
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-border align-middle">
                <td className="px-5 py-2.5">
                  <select
                    disabled={!canEdit}
                    value={o.opening_type}
                    onChange={(e) => patch(o, { opening_type: e.target.value })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    {OPENING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td className="px-5 py-2.5 tabular-nums">{o.width_mm}</td>
                <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{o.height_mm ?? "—"}</td>
                <td className="px-5 py-2.5">
                  <input
                    disabled={!canEdit}
                    defaultValue={o.room_name ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (o.room_name ?? "")) {
                        patch(o, { room_name: e.target.value || null });
                      }
                    }}
                    placeholder="—"
                    className="w-40 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-5 py-2.5 text-center tabular-nums">{o.quantity}</td>
                <td className="px-5 py-2.5 text-[11px] text-muted-foreground">{o.source}</td>
                <td className="px-5 py-2.5 text-[11px] capitalize text-muted-foreground">{o.confidence}</td>
                <td className="px-5 py-2.5">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    o.review_status === "confirmed"
                      ? "border-confidence-high/40 bg-confidence-high/10 text-confidence-high"
                      : "border-confidence-mid/40 bg-confidence-mid/10 text-confidence-mid"
                  }`}>
                    {o.review_status === "confirmed" ? "Confirmed" : "Review"}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    {canEdit && o.review_status !== "confirmed" && (
                      <button
                        onClick={() => patch(o, { review_status: "confirmed" })}
                        title="Confirm"
                        className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:bg-accent"
                      ><Check className="h-3 w-3" /></button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => remove(o)}
                        title="Delete"
                        className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:bg-accent text-confidence-low"
                      ><Trash2 className="h-3 w-3" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}