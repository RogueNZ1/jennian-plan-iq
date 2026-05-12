import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import {
  Loader2, Ruler, Square, Spline, Plus, Minus, Move, Trash2, Check, Send,
  AlertTriangle, RotateCcw, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadCalibration, saveCalibration, loadMeasurements, saveMeasurement,
  setMeasurementReviewStatus, deleteMeasurement, pushMeasurementToModule,
  polylinePixelLength, polygonPixelArea, pxToMm, pxAreaToM2,
  type Calibration, type PlanMeasurement, type Pt, type MeasurementType,
} from "@/lib/iq-measurements";
import { PushToModuleDialog } from "@/components/jennian/PushToModuleDialog";
import type { IQModuleId } from "@/lib/iq-modules";
// pdfjs-dist references DOM globals (DOMMatrix) that don't exist on the
// server. Import it lazily inside an effect so this module stays SSR-safe.
type PdfJs = typeof import("pdfjs-dist");
let _pdfjs: PdfJs | null = null;
async function getPdfJs(): Promise<PdfJs> {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

const INTERNAL_WALL_CATEGORIES: { value: string; label: string }[] = [
  { value: "standard",        label: "Standard internal wall" },
  { value: "wet_area",        label: "Wet area wall" },
  { value: "robe",            label: "Robe wall" },
  { value: "garage_internal", label: "Garage internal wall" },
  { value: "excluded",        label: "Excluded" },
];

type Tool =
  | "pan"
  | "calibrate"
  | "line"
  | "polyline"
  | "area"
  | "internal_wall"
  | "external_perimeter";

const TOOL_LABEL: Record<Tool, string> = {
  pan: "Pan",
  calibrate: "Calibrate Scale",
  line: "Measure Line",
  polyline: "Measure Polyline",
  area: "Measure Area",
  internal_wall: "Add Internal Wall",
  external_perimeter: "Measure External Perimeter",
};

const POLY_TOOLS: Tool[] = ["polyline", "area", "internal_wall", "external_perimeter"];

/** Default target modules per measurement type. */
const MEASUREMENT_TARGETS: Record<string, IQModuleId[]> = {
  external_perimeter: ["iq-core", "iq-cladding", "iq-framing"],
  internal_wall: ["iq-core", "iq-framing", "iq-linings"],
  area: ["iq-core", "iq-linings"],
  line: ["iq-core"],
  polyline: ["iq-core"],
  count: ["iq-core"],
};

function pushDefaults(m: PlanMeasurement) {
  if (m.measurement_type === "area") {
    return { unit: "m²", value: m.calculated_area_m2 ?? 0 };
  }
  return { unit: "lm", value: m.calculated_length_m ?? 0 };
}

export function PlanCanvas({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const roles = useRoles();
  const canEdit = roles.canWrite;

  const [planPage, setPlanPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgSize, setBgSize] = useState<{ w: number; h: number } | null>(null);
  const [planFileId, setPlanFileId] = useState<string | null>(null);
  const [planFileName, setPlanFileName] = useState<string | null>(null);
  const [planFiles, setPlanFiles] = useState<Array<{ id: string; file_name: string; storage_url: string }>>([]);
  const [workingFileId, setWorkingFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [measurements, setMeasurements] = useState<PlanMeasurement[]>([]);

  const [tool, setTool] = useState<Tool>("pan");
  const [draftPoints, setDraftPoints] = useState<Pt[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Pt | null>(null);
  const [wallCategory, setWallCategory] = useState<string>("standard");
  const [pushFor, setPushFor] = useState<PlanMeasurement | null>(null);

  // Zoom + pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const panRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false, lastX: 0, lastY: 0,
  });
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Calibration modal
  const [calibPrompt, setCalibPrompt] = useState<{ pts: Pt[] } | null>(null);
  const [calibInputMm, setCalibInputMm] = useState("");

  /* ---------- Load list of plan files + working-plan selection ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: files }, { data: job }] = await Promise.all([
        supabase
          .from("uploaded_files")
          .select("id, file_name, storage_url, uploaded_at")
          .eq("job_id", jobId)
          .eq("file_type", "plan")
          .order("uploaded_at", { ascending: false }),
        supabase
          .from("jobs")
          .select("working_plan_file_id, working_plan_page_number")
          .eq("id", jobId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const list = (files ?? []).map((f) => ({
        id: f.id as string, file_name: f.file_name as string, storage_url: f.storage_url as string,
      }));
      setPlanFiles(list);
      const persisted = (job?.working_plan_file_id as string | null) ?? null;
      const initial =
        persisted && list.some((f) => f.id === persisted)
          ? persisted
          : list[0]?.id ?? null;
      setWorkingFileId(initial);
      if (job?.working_plan_page_number) setPlanPage(Number(job.working_plan_page_number));
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  async function persistWorkingPlan(fileId: string | null, page: number) {
    if (!canEdit) return;
    await supabase
      .from("jobs")
      .update({
        working_plan_file_id: fileId,
        working_plan_page_number: page,
      })
      .eq("id", jobId);
  }

  /* ---------- Load plan page as backdrop image ---------- */
  useEffect(() => {
    let cancelled = false;
    if (!workingFileId) { setLoading(false); setBgUrl(null); setBgSize(null); return; }
    setLoading(true);
    (async () => {
      const f = planFiles.find((p) => p.id === workingFileId) ?? planFiles[0];
      if (!f) { if (!cancelled) setLoading(false); return; }
      setPlanFileId(f.id);
      setPlanFileName(f.file_name);
      const { data: signed } = await supabase.storage
        .from("job-files")
        .createSignedUrl(f.storage_url, 60 * 30);
      if (!signed?.signedUrl) { if (!cancelled) setLoading(false); return; }

      const isPdf = /\.pdf($|\?)/i.test(f.file_name) || /\.pdf($|\?)/i.test(f.storage_url);
      if (isPdf) {
        try {
          const pdfjs = await getPdfJs();
          const pdf = await pdfjs.getDocument({ url: signed.signedUrl }).promise;
          if (!cancelled) setTotalPages(pdf.numPages);
          const safePage = Math.min(Math.max(1, planPage), pdf.numPages);
          const page = await pdf.getPage(safePage);
          const baseVp = page.getViewport({ scale: 1 });
          const targetW = 1600;
          const scale = Math.min(3, targetW / baseVp.width);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          const blob = await new Promise<Blob | null>((r) =>
            canvas.toBlob((b) => r(b), "image/jpeg", 0.85),
          );
          if (!blob || cancelled) return;
          const url = URL.createObjectURL(blob);
          if (cancelled) return;
          setBgUrl(url);
          setBgSize({ w: canvas.width, h: canvas.height });
        } catch (e) {
          console.error("[PlanCanvas] PDF render failed", e);
        }
      } else {
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          setBgUrl(signed.signedUrl);
          setBgSize({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.src = signed.signedUrl;
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [jobId, planPage, workingFileId, planFiles]);

  /* ---------- Load calibration + measurements ---------- */
  useEffect(() => {
    loadCalibration(jobId, planPage).then(setCalibration).catch(() => {});
    loadMeasurements(jobId).then(setMeasurements).catch(() => {});
  }, [jobId, planPage]);

  /** True when the loaded calibration belongs to a different plan file. */
  const calibrationStale =
    !!calibration && !!planFileId && !!calibration.file_id && calibration.file_id !== planFileId;
  const canMeasure = !!calibration && !calibrationStale;

  /* ---------- Mouse → image-space coordinates ---------- */
  function eventToImagePt(e: React.MouseEvent): Pt | null {
    if (!wrapperRef.current || !bgSize) return null;
    const rect = wrapperRef.current.getBoundingClientRect();
    // viewport coords inside the wrapper
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    // undo pan + zoom
    const x = (vx - pan.x) / zoom;
    const y = (vy - pan.y) / zoom;
    return { x, y };
  }

  function startDraft(pt: Pt) { setDraftPoints([pt]); }
  function appendDraft(pt: Pt) { setDraftPoints((d) => [...d, pt]); }
  function clearDraft() { setDraftPoints([]); setHoverPoint(null); }

  function onCanvasClick(e: React.MouseEvent) {
    if (tool === "pan") return;
    if (!canEdit) return;
    const pt = eventToImagePt(e);
    if (!pt) return;
    if (tool === "calibrate") {
      if (draftPoints.length === 0) startDraft(pt);
      else if (draftPoints.length === 1) {
        const pts = [draftPoints[0], pt];
        setCalibPrompt({ pts });
        setDraftPoints([]);
      }
      return;
    }
    if (tool === "line") {
      if (draftPoints.length === 0) startDraft(pt);
      else { commitDraft([draftPoints[0], pt]); setDraftPoints([]); }
      return;
    }
    // poly tools
    if (POLY_TOOLS.includes(tool)) {
      if (draftPoints.length === 0) startDraft(pt);
      else appendDraft(pt);
    }
  }

  function onCanvasDoubleClick() {
    if (!POLY_TOOLS.includes(tool)) return;
    if (draftPoints.length < 2) return clearDraft();
    commitDraft(draftPoints);
    setDraftPoints([]);
  }

  async function commitDraft(points: Pt[]) {
    if (!user || !bgSize) return;
    if (!calibration) {
      toast.error("Calibrate the plan scale before measuring.");
      return;
    }
    if (calibrationStale) {
      toast.error("Calibration is for a previous plan file. Recalibrate before measuring.");
      return;
    }
    const pixelsPerMm = calibration.pixels_per_mm;
    let mt: MeasurementType;
    let label = "";
    if (tool === "line") { mt = "line"; label = "Measured line"; }
    else if (tool === "polyline") { mt = "polyline"; label = "Polyline"; }
    else if (tool === "area") { mt = "area"; label = "Area"; }
    else if (tool === "internal_wall") { mt = "internal_wall"; label = "Internal wall"; }
    else if (tool === "external_perimeter") { mt = "external_perimeter"; label = "External perimeter"; }
    else return;

    try {
      const m = await saveMeasurement({
        jobId, fileId: planFileId, page: planPage, type: mt, label,
        category: tool === "internal_wall" ? wallCategory : null,
        points, pixelsPerMm, createdBy: user.id,
      });
      setMeasurements((prev) => [m, ...prev]);
      toast.success(`${TOOL_LABEL[tool]} saved.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save.";
      toast.error(msg);
    }
  }

  async function confirmCalibration() {
    if (!calibPrompt || !user) return;
    const realMm = Number(calibInputMm);
    if (!realMm || realMm <= 0) { toast.error("Enter a valid mm value."); return; }
    const [a, b] = calibPrompt.pts;
    const dx = b.x - a.x, dy = b.y - a.y;
    const px = Math.hypot(dx, dy);
    if (px <= 0) { toast.error("Points are too close."); return; }
    try {
      const c = await saveCalibration({
        jobId, fileId: planFileId, page: planPage,
        pixels: px, realMm, calibratedBy: user.id,
      });
      setCalibration(c);
      setCalibPrompt(null);
      setCalibInputMm("");
      toast.success("Plan scale calibrated.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save calibration.";
      toast.error(msg);
    }
  }

  async function onConfirmMeasurement(m: PlanMeasurement) {
    try {
      await setMeasurementReviewStatus(m.id, "confirmed");
      setMeasurements((prev) =>
        prev.map((p) => (p.id === m.id ? { ...p, review_status: "confirmed" } : p)),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update.");
    }
  }

  async function onPushMeasurement(
    m: PlanMeasurement,
    payload: { moduleIds: IQModuleId[]; label: string; unit: string; value: number; basis: string | null; notes: string | null },
  ) {
    if (!user) return;
    const evidence =
      `Working Plan page ${m.plan_page_number}, measurement ${m.id.slice(0, 8)}` +
      (m.label ? ` — ${m.label}` : "");
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
          measurementId: m.id,
          page: m.plan_page_number,
          fileId: m.file_id,
          evidence,
          confidence: m.confidence,
        });
        if (r.status === "conflict") conflicts++;
        else inserted++;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not push to ${moduleId}.`);
      }
    }
    if (inserted) toast.success(`Pushed to ${inserted} module${inserted === 1 ? "" : "s"}.`);
    if (conflicts) toast.warning(`${conflicts} conflict${conflicts === 1 ? "" : "s"} flagged Review Required.`);
  }

  async function onDeleteMeasurement(m: PlanMeasurement) {
    try {
      await deleteMeasurement(m.id);
      setMeasurements((prev) => prev.filter((p) => p.id !== m.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete.");
    }
  }

  /* ---------- Pan + zoom interaction ---------- */
  function onMouseDown(e: React.MouseEvent) {
    if (tool !== "pan") return;
    panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent) {
    const pt = eventToImagePt(e);
    setHoverPoint(pt);
    if (panRef.current.active) {
      const dx = e.clientX - panRef.current.lastX;
      const dy = e.clientY - panRef.current.lastY;
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
  }
  function onMouseUp() { panRef.current.active = false; }

  function zoomIn() { setZoom((z) => Math.min(8, z * 1.25)); }
  function zoomOut() { setZoom((z) => Math.max(0.2, z / 1.25)); }
  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }); }

  /* ---------- Live preview readout ---------- */
  const liveReadout = useMemo(() => {
    if (!calibration) return null;
    if (draftPoints.length === 0) return null;
    const last = hoverPoint ?? draftPoints[draftPoints.length - 1];
    if (tool === "calibrate" || tool === "line") {
      const pts = [draftPoints[0], last];
      const px = polylinePixelLength(pts);
      const mm = pxToMm(px, calibration.pixels_per_mm);
      return `${(mm / 1000).toFixed(3)} m`;
    }
    if (tool === "area") {
      const pts = [...draftPoints, last];
      const a = pxAreaToM2(polygonPixelArea(pts), calibration.pixels_per_mm);
      return `${a.toFixed(2)} m²`;
    }
    const pts = [...draftPoints, last];
    const mm = pxToMm(polylinePixelLength(pts), calibration.pixels_per_mm);
    return `${(mm / 1000).toFixed(3)} m`;
  }, [draftPoints, hoverPoint, tool, calibration]);

  /* ---------- Render ---------- */
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!bgUrl || !bgSize) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No working plan available for this job.
      </div>
    );
  }

  const cursor = tool === "pan" ? "grab" : "crosshair";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            Working plan
          </div>
          <div className="text-[12px] font-medium truncate max-w-[280px]">
            {planFileName ?? "Plan"}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">Page</span>
              <select
                value={planPage}
                onChange={(e) => { setPlanPage(Number(e.target.value)); clearDraft(); }}
                className="rounded-md border border-input bg-background px-1.5 py-0.5 text-[11px]"
              >
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className="text-muted-foreground">/ {totalPages}</span>
            </div>
          )}
          <CalibrationBadge calibration={calibration} />
        </div>
        <div className="flex items-center gap-1.5">
          <ToolBtn active={tool === "pan"} onClick={() => { setTool("pan"); clearDraft(); }} icon={Move} label="Pan" />
          <Divider />
          <ToolBtn disabled={!canEdit} active={tool === "calibrate"} onClick={() => { setTool("calibrate"); clearDraft(); }} icon={Ruler} label="Calibrate" />
          <ToolBtn disabled={!canEdit || !canMeasure} active={tool === "line"} onClick={() => { setTool("line"); clearDraft(); }} icon={Ruler} label="Line" />
          <ToolBtn disabled={!canEdit || !canMeasure} active={tool === "polyline"} onClick={() => { setTool("polyline"); clearDraft(); }} icon={Spline} label="Polyline" />
          <ToolBtn disabled={!canEdit || !canMeasure} active={tool === "area"} onClick={() => { setTool("area"); clearDraft(); }} icon={Square} label="Area" />
          <Divider />
          <ToolBtn disabled={!canEdit || !canMeasure} active={tool === "internal_wall"} onClick={() => { setTool("internal_wall"); clearDraft(); }} icon={Spline} label="Internal Wall" />
          <ToolBtn disabled={!canEdit || !canMeasure} active={tool === "external_perimeter"} onClick={() => { setTool("external_perimeter"); clearDraft(); }} icon={Spline} label="Perimeter" />
          <Divider />
          <button onClick={zoomOut} className="h-7 w-7 grid place-items-center rounded-md border border-border bg-card hover:bg-accent" title="Zoom out"><Minus className="h-3.5 w-3.5" /></button>
          <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="h-7 w-7 grid place-items-center rounded-md border border-border bg-card hover:bg-accent" title="Zoom in"><Plus className="h-3.5 w-3.5" /></button>
          <button onClick={resetView} className="h-7 w-7 grid place-items-center rounded-md border border-border bg-card hover:bg-accent" title="Reset view"><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Working plan picker */}
      {planFiles.length > 0 && (
        <div className="px-4 py-1.5 border-b border-border bg-muted/10 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-muted-foreground uppercase tracking-[0.14em] text-[10px]">Working plan file</span>
          <select
            disabled={!canEdit}
            value={workingFileId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setWorkingFileId(id);
              clearDraft();
              persistWorkingPlan(id, planPage);
            }}
            className="rounded-md border border-input bg-background px-2 py-1 text-[11px] max-w-[320px]"
          >
            {planFiles.map((f) => (
              <option key={f.id} value={f.id}>{f.file_name}</option>
            ))}
          </select>
          <span className="text-muted-foreground">Page</span>
          <input
            type="number"
            min={1}
            disabled={!canEdit}
            value={planPage}
            onChange={(e) => {
              const n = Math.max(1, Number(e.target.value) || 1);
              setPlanPage(n);
              clearDraft();
              persistWorkingPlan(workingFileId, n);
            }}
            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-[11px]"
          />
        </div>
      )}

      {calibrationStale && (
        <div className="px-4 py-2 border-b border-border bg-confidence-low/10 text-[11px] text-confidence-low flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          Calibration is for a previous plan file. Recalibrate before measuring.
        </div>
      )}

      {tool === "internal_wall" && (
        <div className="px-4 py-1.5 border-b border-border bg-muted/20 flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground uppercase tracking-[0.14em] text-[10px]">Wall category</span>
          <select
            value={wallCategory}
            onChange={(e) => setWallCategory(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
          >
            {INTERNAL_WALL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Helper text */}
      <div className="px-4 py-1.5 border-b border-border text-[11px] text-muted-foreground bg-muted/30 flex items-center justify-between">
        <span>
          {tool === "pan" && "Drag to pan. Use ＋ / − to zoom."}
          {tool === "calibrate" && "Click two points along a known dimension, then enter the real-world mm length."}
          {tool === "line" && "Click start point, then click end point."}
          {(tool === "polyline" || tool === "internal_wall" || tool === "external_perimeter") &&
            "Click each vertex along the path. Double-click to finish."}
          {tool === "area" && "Click each corner of the area. Double-click to close."}
        </span>
        {liveReadout && (
          <span className="font-medium tabular-nums text-foreground">{liveReadout}</span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={wrapperRef}
        className="relative h-[560px] overflow-hidden bg-[oklch(0.985_0.003_260)] select-none"
        style={{ cursor: panRef.current.active ? "grabbing" : cursor }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onCanvasClick}
        onDoubleClick={onCanvasDoubleClick}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            position: "absolute",
            left: 0,
            top: 0,
          }}
        >
          <img
            src={bgUrl}
            alt="Working plan"
            draggable={false}
            style={{ width: bgSize.w, height: bgSize.h, display: "block" }}
          />
          <svg
            width={bgSize.w}
            height={bgSize.h}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
          >
            {/* Saved measurements */}
            {measurements
              .filter((m) => m.plan_page_number === planPage)
              .map((m) => (
                <MeasurementShape key={m.id} m={m} zoom={zoom} />
              ))}
            {/* Draft */}
            <DraftShape tool={tool} pts={draftPoints} hover={hoverPoint} zoom={zoom} />
          </svg>
        </div>
      </div>

      {/* Measurements list */}
      <div className="border-t border-border">
        <div className="px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Measurements ({measurements.length})
        </div>
        {measurements.length === 0 ? (
          <div className="px-4 pb-4 text-xs text-muted-foreground">
            No measurements yet. {calibration ? "Pick a tool above and click on the plan." : "Calibrate the plan scale first."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {measurements.map((m) => (
              <MeasurementRow
                key={m.id}
                m={m}
                onConfirm={() => onConfirmMeasurement(m)}
                onDelete={() => onDeleteMeasurement(m)}
                onPush={() => setPushFor(m)}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>

      {/* Calibration prompt */}
      {calibPrompt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card border border-border shadow-2xl p-5">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">Calibrate scale</div>
            <div className="mt-1 text-[14px] font-semibold tracking-tight">Enter the real-world length</div>
            <p className="mt-2 text-xs text-muted-foreground">
              You picked two points on the plan. Enter the actual distance between
              them in millimetres (e.g. <span className="font-mono">18249</span>).
            </p>
            <div className="mt-3">
              <input
                autoFocus
                value={calibInputMm}
                onChange={(e) => setCalibInputMm(e.target.value)}
                placeholder="mm"
                inputMode="numeric"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setCalibPrompt(null); setCalibInputMm(""); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
              ><X className="h-3.5 w-3.5" /> Cancel</button>
              <button
                onClick={confirmCalibration}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              ><Check className="h-3.5 w-3.5" /> Save calibration</button>
            </div>
          </div>
        </div>
      )}

      {pushFor && (() => {
        const d = pushDefaults(pushFor);
        const sourceSummary =
          pushFor.measurement_type === "area"
            ? `Area · ${(pushFor.calculated_area_m2 ?? 0).toFixed(2)} m² · page ${pushFor.plan_page_number}`
            : `${pushFor.measurement_type.replace("_", " ")} · ${(pushFor.calculated_length_m ?? 0).toFixed(3)} m · page ${pushFor.plan_page_number}`;
        return (
          <PushToModuleDialog
            open={true}
            onOpenChange={(v) => { if (!v) setPushFor(null); }}
            defaultLabel={pushFor.label ?? pushFor.measurement_type.replace("_", " ")}
            defaultUnit={d.unit}
            defaultValue={d.value}
            defaultBasis="Measured From Plan"
            suggestedModules={MEASUREMENT_TARGETS[pushFor.measurement_type] ?? ["iq-core"]}
            sourceSummary={sourceSummary}
            onSubmit={async (s) => { await onPushMeasurement(pushFor, s); setPushFor(null); }}
          />
        );
      })()}
    </div>
  );
}

function CalibrationBadge({ calibration }: { calibration: Calibration | null }) {
  if (!calibration) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-confidence-low/40 bg-confidence-low/10 text-confidence-low px-2 py-0.5 text-[10px] font-medium">
        <AlertTriangle className="h-3 w-3" /> Not calibrated
      </span>
    );
  }
  const ppm = calibration.pixels_per_mm;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-confidence-high/40 bg-confidence-high/10 text-confidence-high px-2 py-0.5 text-[10px] font-medium">
      <Check className="h-3 w-3" /> Calibrated · {ppm.toFixed(3)} px/mm
    </span>
  );
}

function ToolBtn({
  active, onClick, icon: Icon, label, disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-accent"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function Divider() {
  return <span className="h-5 w-px bg-border mx-0.5" />;
}

function MeasurementShape({ m, zoom }: { m: PlanMeasurement; zoom: number }) {
  const pts = m.points_json;
  if (!pts || pts.length === 0) return null;
  const stroke =
    m.review_status === "confirmed"
      ? "oklch(0.65 0.18 145)"
      : "oklch(0.62 0.2 250)";
  const sw = 2 / Math.max(zoom, 0.5);
  const dotR = 3 / Math.max(zoom, 0.5);
  if (m.measurement_type === "area") {
    const d = `${pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")} Z`;
    return (
      <g>
        <path d={d} fill={stroke} fillOpacity={0.12} stroke={stroke} strokeWidth={sw} />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={dotR} fill={stroke} />)}
      </g>
    );
  }
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  return (
    <g>
      <path d={d} fill="none" stroke={stroke} strokeWidth={sw} />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={dotR} fill={stroke} />)}
    </g>
  );
}

function DraftShape({
  tool, pts, hover, zoom,
}: {
  tool: Tool; pts: Pt[]; hover: Pt | null; zoom: number;
}) {
  if (pts.length === 0) return null;
  const sw = 2 / Math.max(zoom, 0.5);
  const dotR = 3 / Math.max(zoom, 0.5);
  const stroke = "oklch(0.62 0.2 30)";
  const dash = "6 4";
  const live = hover ? [...pts, hover] : pts;
  if (tool === "area" && live.length >= 2) {
    const d = `${live.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")} Z`;
    return (
      <g>
        <path d={d} fill={stroke} fillOpacity={0.08} stroke={stroke} strokeDasharray={dash} strokeWidth={sw} />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={dotR} fill={stroke} />)}
      </g>
    );
  }
  const d = live.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  return (
    <g>
      <path d={d} fill="none" stroke={stroke} strokeDasharray={dash} strokeWidth={sw} />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={dotR} fill={stroke} />)}
    </g>
  );
}

function MeasurementRow({
  m, onConfirm, onDelete, onPush, canEdit,
}: {
  m: PlanMeasurement;
  onConfirm: () => void;
  onDelete: () => void;
  onPush: () => void;
  canEdit: boolean;
}) {
  const valueLabel =
    m.measurement_type === "area"
      ? `${(m.calculated_area_m2 ?? 0).toFixed(2)} m²`
      : `${(m.calculated_length_m ?? 0).toFixed(3)} m`;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground w-28 shrink-0">
          {m.measurement_type.replace("_", " ")}
        </span>
        <span className="font-medium tabular-nums w-20 text-right">{valueLabel}</span>
        <span className="text-muted-foreground truncate">{m.label ?? ""}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
          m.review_status === "confirmed"
            ? "border-confidence-high/40 bg-confidence-high/10 text-confidence-high"
            : "border-confidence-mid/40 bg-confidence-mid/10 text-confidence-mid"
        }`}>
          {m.review_status === "confirmed" ? "Confirmed" : "Review"}
        </span>
        {canEdit && m.review_status !== "confirmed" && (
          <button
            onClick={onConfirm}
            title="Confirm measurement"
            className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:bg-accent"
          ><Check className="h-3 w-3" /></button>
        )}
        {canEdit && (
          <button
            onClick={onPush}
            disabled={m.review_status !== "confirmed"}
            title={m.review_status === "confirmed" ? "Push to module…" : "Confirm measurement before pushing to modules."}
            className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:bg-accent text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          ><Send className="h-3 w-3" /></button>
        )}
        {canEdit && (
          <button
            onClick={onDelete}
            title="Delete measurement"
            className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:bg-accent text-confidence-low"
          ><Trash2 className="h-3 w-3" /></button>
        )}
      </div>
    </div>
  );
}