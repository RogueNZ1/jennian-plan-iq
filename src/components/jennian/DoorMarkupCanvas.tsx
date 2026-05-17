import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eraser, MousePointer2 } from "lucide-react";

type DoorType = "hinged" | "double_cavity" | "cavity_slider" | "wardrobe";
type Mode = DoorType | "eraser";

interface DoorDot {
  id: string;
  door_type: DoorType;
  x_percent: number;
  y_percent: number;
  label_number: number;
  pending?: boolean;
}

const TYPES: Array<{
  type: DoorType;
  label: string;
  short: string;
  color: string;
  ring: string;
  bg: string;
}> = [
  {
    type: "hinged",
    label: "Standard Hinged (H187)",
    short: "H187",
    color: "#dc2626",
    ring: "ring-red-500",
    bg: "bg-red-500",
  },
  {
    type: "double_cavity",
    label: "Double Cavity Slider (H192)",
    short: "H192",
    color: "#ea580c",
    ring: "ring-orange-500",
    bg: "bg-orange-500",
  },
  {
    type: "cavity_slider",
    label: "Single Cavity Slider (H193)",
    short: "H193",
    color: "#2563eb",
    ring: "ring-blue-500",
    bg: "bg-blue-500",
  },
  {
    type: "wardrobe",
    label: "Wardrobe Slider",
    short: "WRD",
    color: "#9333ea",
    ring: "ring-purple-500",
    bg: "bg-purple-500",
  },
];

type PdfJs = typeof import("pdfjs-dist");
let _pdfjs: PdfJs | null = null;
async function getPdfJs(): Promise<PdfJs> {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  _pdfjs = pdfjs;
  return pdfjs;
}

export function DoorMarkupCanvas({ jobId, onDotChange }: { jobId: string; onDotChange?: () => void }) {
  const [dots, setDots] = useState<DoorDot[]>([]);
  const [mode, setMode] = useState<Mode>("hinged");
  const [planLoaded, setPlanLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tally = {
    hinged: dots.filter((d) => d.door_type === "hinged").length,
    double_cavity: dots.filter((d) => d.door_type === "double_cavity").length,
    cavity_slider: dots.filter((d) => d.door_type === "cavity_slider").length,
    wardrobe: dots.filter((d) => d.door_type === "wardrobe").length,
  };

  const nextLabelFor = useCallback(
    (type: DoorType) =>
      dots.filter((d) => d.door_type === type).length + 1,
    [dots],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const { data: existing } = await supabase
          .from("door_markups")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: true });

        if (!cancelled && existing) {
          setDots(
            (existing as DoorDot[]).map((r) => ({
              id: r.id,
              door_type: r.door_type as DoorType,
              x_percent: Number(r.x_percent),
              y_percent: Number(r.y_percent),
              label_number: r.label_number,
            })),
          );
        }

        const { data: jobRow } = await supabase
          .from("jobs")
          .select("working_plan_file_id")
          .eq("id", jobId)
          .single();

        const fileId = jobRow?.working_plan_file_id;
        let storagePath: string | null = null;

        if (fileId) {
          const { data: fRow } = await supabase
            .from("uploaded_files")
            .select("storage_url")
            .eq("id", fileId)
            .single();
          storagePath = fRow?.storage_url ?? null;
        }

        if (!storagePath) {
          const { data: fallback } = await supabase
            .from("uploaded_files")
            .select("storage_url")
            .eq("job_id", jobId)
            .eq("file_type", "plan")
            .limit(1)
            .single();
          storagePath = fallback?.storage_url ?? null;
        }

        if (!storagePath) {
          if (!cancelled) setError("No floor plan found for this job.");
          return;
        }

        const { data: pdfBlob, error: dlErr } = await supabase.storage
          .from("job-files")
          .download(storagePath);

        if (dlErr || !pdfBlob) {
          if (!cancelled) setError("Could not download floor plan.");
          return;
        }

        const buf = await pdfBlob.arrayBuffer();
        const pdfjs = await getPdfJs();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);

        const baseVp = page.getViewport({ scale: 1 });
        const maxW = Math.min(window.innerWidth - 320, 1400);
        const scale = maxW / baseVp.width;
        const vp = page.getViewport({ scale });

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        if (!cancelled) {
          setCanvasSize({ w: canvas.width, h: canvas.height });
          setPlanLoaded(true);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load plan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!overlayRef.current || !canvasSize.w) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;

    if (mode === "eraser") {
      const DOT_PX = 16;
      const closest = dots
        .map((d) => ({
          d,
          dist: Math.hypot(
            (d.x_percent - xPct) * rect.width,
            (d.y_percent - yPct) * rect.height,
          ),
        }))
        .filter((x) => x.dist < DOT_PX * 2)
        .sort((a, b) => a.dist - b.dist)[0];

      if (!closest) return;

      const { error } = await supabase
        .from("door_markups")
        .delete()
        .eq("id", closest.d.id);

      if (error) {
        toast.error("Failed to remove dot");
        return;
      }
      setDots((prev) => prev.filter((d) => d.id !== closest.d.id));
      onDotChange?.();
      return;
    }

    const doorType = mode as DoorType;
    const labelNum = nextLabelFor(doorType);
    const tempId = crypto.randomUUID();

    const optimistic: DoorDot = {
      id: tempId,
      door_type: doorType,
      x_percent: xPct,
      y_percent: yPct,
      label_number: labelNum,
      pending: true,
    };
    setDots((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("door_markups")
      .insert({
        job_id: jobId,
        door_type: doorType,
        x_percent: xPct,
        y_percent: yPct,
        label_number: labelNum,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error("Failed to save dot");
      setDots((prev) => prev.filter((d) => d.id !== tempId));
      return;
    }

    setDots((prev) =>
      prev.map((d) =>
        d.id === tempId ? { ...d, id: (data as { id: string }).id, pending: false } : d,
      ),
    );
    onDotChange?.();
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <div className="text-[13px] font-semibold tracking-tight">Door Markup</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Click the plan to place coloured dots. Counts feed directly into Excel export.
        </div>
      </div>

      <div className="flex">
        <div className="w-56 shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
              Tool
            </div>
            <div className="flex flex-col gap-1">
              {TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setMode(t.type)}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
                    mode === t.type
                      ? "bg-accent font-semibold ring-2 ring-inset " + t.ring
                      : "hover:bg-accent/60"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode("eraser")}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
                  mode === "eraser"
                    ? "bg-accent font-semibold ring-2 ring-inset ring-border"
                    : "hover:bg-accent/60"
                }`}
              >
                <Eraser className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Eraser
              </button>
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
              Tally
            </div>
            <div className="flex flex-col gap-1.5">
              {TYPES.filter((t) => t.type !== "wardrobe").map((t) => (
                <div key={t.type} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.short}
                  </div>
                  <span className="text-[13px] font-semibold tabular-nums">
                    {tally[t.type]}
                  </span>
                </div>
              ))}
              <div className="mt-1 border-t border-border pt-1.5 flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-1.5 text-[12px]">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-purple-500" />
                  WRD
                </div>
                <span className="text-[12px] tabular-nums">{tally.wardrobe}</span>
              </div>
            </div>
          </div>

          <div className="mt-auto p-3 border-t border-border text-[10.5px] text-muted-foreground leading-relaxed">
            {mode === "eraser" ? (
              <span className="flex items-center gap-1">
                <Eraser className="h-3 w-3" /> Click a dot to remove it
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <MousePointer2 className="h-3 w-3" /> Click plan to place dot
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-96 overflow-auto bg-muted/30 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-[13px] text-muted-foreground animate-pulse">
                Loading floor plan…
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-[13px] text-destructive">{error}</div>
            </div>
          )}

          <div ref={containerRef} className="relative inline-block">
            <canvas
              ref={canvasRef}
              className={planLoaded ? "block" : "hidden"}
              style={{ display: planLoaded ? "block" : "none" }}
            />
            {planLoaded && (
              <div
                ref={overlayRef}
                onClick={handleOverlayClick}
                className={`absolute inset-0 ${
                  mode === "eraser" ? "cursor-cell" : "cursor-crosshair"
                }`}
              >
                {dots.map((dot) => {
                  const meta = TYPES.find((t) => t.type === dot.door_type);
                  return (
                    <div
                      key={dot.id}
                      className="absolute flex items-center justify-center rounded-full text-white font-bold select-none pointer-events-none"
                      style={{
                        width: 20,
                        height: 20,
                        fontSize: 9,
                        left: `${dot.x_percent * 100}%`,
                        top: `${dot.y_percent * 100}%`,
                        transform: "translate(-50%, -50%)",
                        backgroundColor: meta?.color ?? "#888",
                        opacity: dot.pending ? 0.6 : 1,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                      }}
                    >
                      {dot.label_number}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
