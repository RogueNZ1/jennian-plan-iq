import { useState, useEffect } from "react";
import { CheckCircle2, DoorOpen, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DoorCounts {
  standard: number;
  cavity_sliders: number;
  double_doors: number;
  barn_sliders: number;
}

export interface DoorCountPanelProps {
  jobId: string;
  planThumbnailUrl: string | null;
  aiEstimates: {
    hinged: number;
    cavitySlider: number;
    doubleDoor: number;
    barnSlider: number;
  };
  onConfirmed: () => void;
}

const LABELS: { key: keyof DoorCounts; label: string }[] = [
  { key: "standard", label: "Standard (hinged)" },
  { key: "cavity_sliders", label: "Cavity sliders" },
  { key: "double_doors", label: "Double doors" },
  { key: "barn_sliders", label: "Barn sliders" },
];

export function DoorCountPanel({ jobId, aiEstimates, onConfirmed }: DoorCountPanelProps) {
  const [counts, setCounts] = useState<DoorCounts>({
    standard: aiEstimates.hinged,
    cavity_sliders: aiEstimates.cavitySlider,
    double_doors: aiEstimates.doubleDoor,
    barn_sliders: aiEstimates.barnSlider,
  });
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const aiTotal = aiEstimates.hinged + aiEstimates.cavitySlider + aiEstimates.doubleDoor + aiEstimates.barnSlider;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("door_counts")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setCounts({
            standard: data.standard,
            cavity_sliders: data.cavity_sliders,
            double_doors: data.double_doors,
            barn_sliders: data.barn_sliders,
          });
          setConfirmedAt(data.confirmed_at ?? null);
          if (data.confirmed_at) onConfirmed();
        }
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [jobId]);

  function adjust(key: keyof DoorCounts, delta: number) {
    if (confirmedAt) return;
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  }

  async function handleConfirm() {
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("door_counts").upsert(
      {
        job_id: jobId,
        ...counts,
        ai_total_estimate: aiTotal || null,
        confirmed_at: now,
        updated_at: now,
      },
      { onConflict: "job_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(`Failed to save door counts: ${error.message}`);
    } else {
      setConfirmedAt(now);
      onConfirmed();
      toast.success("Door counts confirmed.");
    }
  }

  async function handleEdit() {
    const { error } = await supabase
      .from("door_counts")
      .update({ confirmed_at: null, updated_at: new Date().toISOString() })
      .eq("job_id", jobId);
    if (error) {
      toast.error(`Failed to unlock door counts: ${error.message}`);
    } else {
      setConfirmedAt(null);
    }
  }

  const total = counts.standard + counts.cavity_sliders + counts.double_doors + counts.barn_sliders;
  const isConfirmed = !!confirmedAt;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DoorOpen className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-[13px] font-semibold tracking-tight">Internal Doors</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {aiTotal > 0
                ? `AI estimate: ${aiTotal} door${aiTotal !== 1 ? "s" : ""} — confirm the breakdown below`
                : "Set the door type breakdown before exporting"}
            </div>
          </div>
        </div>
        {isConfirmed && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmed
            </div>
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="p-4">
        {!loaded ? (
          <div className="text-[11px] text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {LABELS.map(({ key, label }) => (
                <div key={key} className="rounded-md border border-border bg-muted/30 p-3 flex flex-col gap-2">
                  <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjust(key, -1)}
                      disabled={isConfirmed}
                      className="h-6 w-6 rounded border border-border bg-card text-sm font-bold hover:bg-accent flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      −
                    </button>
                    <span className="text-[15px] font-semibold tabular-nums w-5 text-center">
                      {counts[key]}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjust(key, 1)}
                      disabled={isConfirmed}
                      className="h-6 w-6 rounded border border-border bg-card text-sm font-bold hover:bg-accent flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[12px] text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{total}</span>
                {aiTotal > 0 && total !== aiTotal && (
                  <span className="ml-2 text-amber-600">
                    (AI estimated {aiTotal})
                  </span>
                )}
              </div>
              {!isConfirmed && (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Confirm Counts"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
