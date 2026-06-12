import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { Plus, Trash2, Check, Send } from "lucide-react";
import { toast } from "sonner";
import {
  loadOpenings,
  createOpening,
  updateOpening,
  deleteOpening,
  pushMeasurementToModule,
  type Opening,
} from "@/lib/iq-measurements";
import { supabase } from "@/integrations/supabase/client";
import { PushToModuleDialog } from "@/components/jennian/PushToModuleDialog";
import type { IQModuleId } from "@/lib/iq-modules";

const OPENING_TYPES: { value: string; label: string }[] = [
  { value: "window", label: "Window" },
  { value: "internal_door", label: "Internal Door" },
  { value: "external_door", label: "External Door" },
  { value: "garage_door", label: "Garage Door" },
  { value: "slider", label: "Slider" },
  { value: "bifold", label: "Bifold" },
  { value: "robe_opening", label: "Robe Opening" },
  { value: "unknown_opening", label: "Unknown Opening" },
];

const OPENING_TARGETS: Record<string, IQModuleId[]> = {
  window: ["iq-core", "iq-cladding"],
  internal_door: ["iq-core", "iq-linings", "iq-framing"],
  external_door: ["iq-core", "iq-cladding", "iq-framing"],
  garage_door: ["iq-core", "iq-cladding", "iq-framing"],
  slider: ["iq-core", "iq-cladding", "iq-framing"],
  bifold: ["iq-core", "iq-linings", "iq-framing"],
  robe_opening: ["iq-core", "iq-linings", "iq-framing"],
  unknown_opening: ["iq-core"],
};

export function OpeningScheduleTab({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const roles = useRoles();
  const canEdit = roles.canWrite;
  const [rows, setRows] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftWidth, setDraftWidth] = useState("");
  const [draftHeight, setDraftHeight] = useState("");
  const [workingFileId, setWorkingFileId] = useState<string | null>(null);
  const [workingPage, setWorkingPage] = useState<number>(1);
  const [pushFor, setPushFor] = useState<Opening | null>(null);

  useEffect(() => {
    loadOpenings(jobId)
      .then((r) => {
        setRows(r);
        setLoading(false);
      })
      .catch((e) => {
        toast.error(e.message);
        setLoading(false);
      });
    supabase
      .from("jobs")
      .select("working_plan_file_id, working_plan_page_number")
      .eq("id", jobId)
      .maybeSingle()
      .then(({ data }) => {
        setWorkingFileId((data?.working_plan_file_id as string | null) ?? null);
        setWorkingPage(Number(data?.working_plan_page_number ?? 1));
      });
  }, [jobId]);

  async function addRow() {
    if (!user) return;
    const w = Number(draftWidth);
    if (!w || w <= 0) {
      toast.error("Enter a valid width in mm.");
      return;
    }
    const h = draftHeight ? Number(draftHeight) : null;
    try {
      const o = await createOpening({
        jobId,
        width_mm: w,
        height_mm: h ?? null,
        page: workingPage,
        fileId: workingFileId,
        opening_type: "unknown_opening",
        source: "User Override",
        confidence: "mid",
        createdBy: user.id,
      });
      setRows((r) => [...r, o]);
      setDraftWidth("");
      setDraftHeight("");
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

  async function onPushOpening(
    o: Opening,
    payload: {
      moduleIds: IQModuleId[];
      label: string;
      unit: string;
      value: number;
      basis: string | null;
      notes: string | null;
    },
  ) {
    if (!user) return;
    const evidence =
      `Working Plan page ${o.plan_page_number}, opening ${o.id.slice(0, 8)} — ` +
      `${o.opening_type} ${o.width_mm}${o.height_mm ? `x${o.height_mm}` : ""}mm`;
    let inserted = 0;
    let conflicts = 0;
    for (const moduleId of payload.moduleIds) {
      try {
        const r = await pushMeasurementToModule({
          jobId,
          moduleId,
          label: payload.label,
          unit: payload.unit,
          value: payload.value,
          basis: payload.basis,
          notes: payload.notes,
          createdBy: user.id,
          openingId: o.id,
          page: o.plan_page_number,
          fileId: (o as unknown as { file_id?: string | null }).file_id ?? null,
          evidence,
          confidence: o.confidence,
        });
        if (r.status === "conflict") conflicts++;
        else inserted++;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not push to ${moduleId}.`);
      }
    }
    if (inserted) toast.success(`Pushed to ${inserted} module${inserted === 1 ? "" : "s"}.`);
    if (conflicts)
      toast.warning(`${conflicts} conflict${conflicts === 1 ? "" : "s"} flagged Review Required.`);
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
            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
              Width (mm)
            </label>
            <input
              value={draftWidth}
              onChange={(e) => setDraftWidth(e.target.value)}
              placeholder="e.g. 1300"
              inputMode="numeric"
              className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
              Height (mm, optional)
            </label>
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
              <tr>
                <td colSpan={9} className="px-5 py-6 text-center text-xs text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-6 text-center text-xs text-muted-foreground">
                  No openings recorded yet.
                </td>
              </tr>
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
                    {OPENING_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-2.5 tabular-nums">{o.width_mm}</td>
                <td className="px-5 py-2.5 tabular-nums text-muted-foreground">
                  {o.height_mm ?? "—"}
                </td>
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
                <td className="px-5 py-2.5 text-[11px] capitalize text-muted-foreground">
                  {o.confidence}
                </td>
                <td className="px-5 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      o.review_status === "confirmed"
                        ? "border-confidence-high/40 bg-confidence-high/10 text-confidence-high"
                        : "border-confidence-mid/40 bg-confidence-mid/10 text-confidence-mid"
                    }`}
                  >
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
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setPushFor(o)}
                        disabled={o.review_status !== "confirmed"}
                        title={
                          o.review_status === "confirmed"
                            ? "Push to module…"
                            : "Confirm opening before pushing to modules."
                        }
                        className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:bg-accent text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => remove(o)}
                        title="Delete"
                        className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:bg-accent text-confidence-low"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pushFor &&
        (() => {
          const label =
            (pushFor.room_name ? `${pushFor.room_name} — ` : "") +
            `${pushFor.opening_type.replace("_", " ")} ${pushFor.width_mm}${pushFor.height_mm ? `x${pushFor.height_mm}` : ""}mm`;
          const summary = `${pushFor.opening_type} · ${pushFor.width_mm}${pushFor.height_mm ? `x${pushFor.height_mm}` : ""}mm · qty ${pushFor.quantity} · page ${pushFor.plan_page_number}`;
          return (
            <PushToModuleDialog
              open={true}
              onOpenChange={(v) => {
                if (!v) setPushFor(null);
              }}
              defaultLabel={label}
              defaultUnit="qty"
              defaultValue={pushFor.quantity}
              defaultBasis="Opening schedule"
              suggestedModules={OPENING_TARGETS[pushFor.opening_type] ?? ["iq-core"]}
              sourceSummary={summary}
              onSubmit={async (s) => {
                await onPushOpening(pushFor, s);
                setPushFor(null);
              }}
            />
          );
        })()}
    </div>
  );
}
