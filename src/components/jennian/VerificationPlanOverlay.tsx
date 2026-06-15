/**
 * VerificationPlanOverlay — renders the floor-plan page with the door-engine hits drawn on
 * (plan-overlay slice, 13 Jun). Coordinate path validated on the Alexandra bench against
 * Haydon's hand-labelled ground truth: persisted adapter-space hit → adapterToUser →
 * viewport.convertToViewportPoint (handles scale + /Rotate).
 *
 * Layers:
 *   - door markers from the PERSISTED run (red = confirmed, amber dashed = flag)
 *   - W-code text matched LIVE from the page's own printed text for table cross-checks only.
 *     The print overlay deliberately does not draw those boxes; they made the marked plan noisy.
 *
 * Degradation is deliberate and quiet-proof:
 *   - no plan file → says so
 *   - render failure → says so, never breaks the printout
 *   - pre-overlay run (no door_hits/door_page) → renders page 1 + W-codes + a re-run note
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  adapterToUser,
  isWindowCode,
  stitchTextItems,
  type DoorMarker,
  type DoorPagePersisted,
  type RawTextItem,
  type VisualOpeningMarker,
} from "@/lib/verification/plan-overlay";

type PlacedMarker = DoorMarker & { vx: number; vy: number };
type PlacedVisualOpening = VisualOpeningMarker & { vx: number; vy: number };
type PlacedWCode = { text: string; vx: number; vy: number };
type CropRect = { x: number; y: number; width: number; height: number };

type OverlayState =
  | { status: "loading" }
  | { status: "no-plan" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      imgUrl: string;
      width: number;
      height: number;
      markers: PlacedMarker[];
      visualOpenings: PlacedVisualOpening[];
      wcodes: PlacedWCode[];
    };

export type OverlayRenderStatus = OverlayState["status"];

const RENDER_MAX_WIDTH = 1500;
const MIN_CROP_POINTS = 4;

function openingTypeLabel(type: VisualOpeningMarker["type"]): string {
  switch (type) {
    case "window":
    case "garage_window":
      return "W";
    case "slider":
      return "SL";
    case "pa_door":
      return "PA";
    case "external_door":
      return "OPEN";
    case "garage_door":
      return "GD";
    default:
      return "?";
  }
}

function doorTypeLabel(type: DoorMarker["type"]): string {
  switch (type) {
    case "hinged":
      return "H";
    case "double":
      return "DBL";
    case "cavity":
      return "CAV";
  }
}

function sizeMm(heightM: number | null, widthM: number | null): string {
  if (heightM == null || widthM == null) return "";
  return `${Math.round(heightM * 1000)}x${Math.round(widthM * 1000)}`;
}

function tagWidth(text: string): number {
  return Math.max(28, text.length * 6 + 10);
}

function labelPlacement(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  labelWidth: number,
  index: number,
) {
  const slots = [
    { dx: 12, dy: -22 },
    { dx: 12, dy: 10 },
    { dx: -labelWidth - 12, dy: -22 },
    { dx: -labelWidth - 12, dy: 10 },
  ];
  const slot = slots[index % slots.length];
  const lx = Math.min(Math.max(4, x + slot.dx), canvasWidth - labelWidth - 4);
  const ly = Math.min(Math.max(4, y + slot.dy), canvasHeight - 18);
  return { lx, ly, tx: lx + 5, ty: ly + 12, lineEndX: lx + labelWidth / 2, lineEndY: ly + 9 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function cropAroundMarkers(
  width: number,
  height: number,
  markers: readonly Array<{ vx: number; vy: number }>,
): CropRect | null {
  if (markers.length < MIN_CROP_POINTS) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of markers) {
    minX = Math.min(minX, m.vx);
    minY = Math.min(minY, m.vy);
    maxX = Math.max(maxX, m.vx);
    maxY = Math.max(maxY, m.vy);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

  const padX = Math.max(120, width * 0.08);
  const padY = Math.max(90, height * 0.08);
  const x = clamp(Math.floor(minX - padX), 0, width - 1);
  const y = clamp(Math.floor(minY - padY), 0, height - 1);
  const right = clamp(Math.ceil(maxX + padX), x + 1, width);
  const bottom = clamp(Math.ceil(maxY + padY), y + 1, height);
  const crop = { x, y, width: right - x, height: bottom - y };

  // If the crop is basically the whole sheet, keeping the original avoids needless
  // resampling. Otherwise this removes title blocks, legends and note tables from print.
  return crop.width * crop.height < width * height * 0.86 ? crop : null;
}

function cropCanvas(canvas: HTMLCanvasElement, crop: CropRect): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = crop.width;
  out.height = crop.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return out;
}

function applyCrop<T extends { vx: number; vy: number }>(items: T[], crop: CropRect | null): T[] {
  if (!crop) return items;
  return items.map((item) => ({
    ...item,
    vx: item.vx - crop.x,
    vy: item.vy - crop.y,
  }));
}

export function VerificationPlanOverlay({
  jobId,
  markers,
  visualOpenings,
  page,
  onStatusChange,
}: {
  jobId: string;
  markers: DoorMarker[];
  visualOpenings: VisualOpeningMarker[];
  page: DoorPagePersisted | null;
  onStatusChange?: (status: OverlayRenderStatus) => void;
}) {
  const [state, setState] = useState<OverlayState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    (async () => {
      try {
        // 1 · latest plan file → signed URL (same source as PlanViewer)
        const { data: files } = await supabase
          .from("uploaded_files")
          .select("storage_url, file_name")
          .eq("job_id", jobId)
          .eq("file_type", "plan")
          .order("uploaded_at", { ascending: false })
          .limit(1);
        const path = files?.[0]?.storage_url;
        if (!path) {
          if (active) setState({ status: "no-plan" });
          return;
        }
        const { data: signed } = await supabase.storage
          .from("job-files")
          .createSignedUrl(path, 60 * 10);
        if (!signed?.signedUrl) throw new Error("could not sign plan URL");
        const bytes = await (await fetch(signed.signedUrl)).arrayBuffer();

        // 2 · render the engine's page with the app's pdf.js (worker via Vite ?url asset)
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        }
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        try {
          const pageNumber = Math.min(Math.max(page?.pageNumber ?? 1, 1), doc.numPages);
          const pdfPage = await doc.getPage(pageNumber);
          const base = pdfPage.getViewport({ scale: 1 });
          const scale = Math.min(2.5, RENDER_MAX_WIDTH / base.width);
          const viewport = pdfPage.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas 2d unavailable");
          await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

          // 3 · door markers: persisted adapter space → user space → viewport
          const placed: PlacedMarker[] = page
            ? markers.map((m) => {
                const { ux, uy } = adapterToUser(m.x, m.y, page.view);
                const [vx, vy] = viewport.convertToViewportPoint(ux, uy);
                return { ...m, vx, vy };
              })
            : [];
          const placedVisualOpenings: PlacedVisualOpening[] = visualOpenings.map((o) => ({
            ...o,
            vx: o.x * canvas.width,
            vy: o.y * canvas.height,
          }));

          // 4 · W-codes: live from the page's own text (stitched — Qt plans split glyphs)
          const tc = await pdfPage.getTextContent();
          const stitched = stitchTextItems(
            (tc.items as Array<{ str?: string; transform?: number[]; width?: number }>)
              .filter((i) => typeof i.str === "string" && i.transform)
              .map((i): RawTextItem => ({ str: i.str!, transform: i.transform!, width: i.width })),
          );
          const wcodes: PlacedWCode[] = stitched
            .filter((l) => isWindowCode(l.text))
            .map((l) => {
              const [vx, vy] = viewport.convertToViewportPoint(l.ux, l.uy);
              return { text: l.text.trim().toUpperCase(), vx, vy };
            });

          const crop = cropAroundMarkers(canvas.width, canvas.height, [
            ...placed,
            ...placedVisualOpenings,
          ]);
          const outputCanvas = crop ? cropCanvas(canvas, crop) : canvas;
          const imgUrl = outputCanvas.toDataURL("image/jpeg", 0.9);
          if (active) {
            setState({
              status: "ready",
              imgUrl,
              width: outputCanvas.width,
              height: outputCanvas.height,
              markers: applyCrop(placed, crop),
              visualOpenings: applyCrop(placedVisualOpenings, crop),
              wcodes: applyCrop(wcodes, crop),
            });
          }
        } finally {
          await doc.destroy().catch(() => {});
        }
      } catch (err) {
        if (active) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [jobId, markers, visualOpenings, page]);

  useEffect(() => {
    onStatusChange?.(state.status);
  }, [onStatusChange, state.status]);

  if (state.status === "loading") {
    return <p className="vempty">Rendering plan overlay…</p>;
  }
  if (state.status === "no-plan") {
    return <p className="vempty">No plan file uploaded for this job — overlay unavailable.</p>;
  }
  if (state.status === "error") {
    return (
      <p className="vempty">
        Plan overlay could not render ({state.message}). The printout above is unaffected.
      </p>
    );
  }

  const openingR = 8;
  const doorR = 7;
  return (
    <div>
      {!page && (
        <div className="vbanner vbanner-compact">
          <div>
            Door positions were not captured on this run (pre-overlay takeoff) — re-run the takeoff
            to enable door markers. Window codes below are read live from the plan.
          </div>
        </div>
      )}
      <div className="voverlay-wrap" style={{ aspectRatio: `${state.width} / ${state.height}` }}>
        <img src={state.imgUrl} alt="Floor plan with takeoff overlay" />
        <svg viewBox={`0 0 ${state.width} ${state.height}`} preserveAspectRatio="xMinYMin meet">
          {state.visualOpenings.map((o, index) => {
            const size = sizeMm(o.height_m, o.width_m);
            const fullTag = `${o.markerLabel} ${openingTypeLabel(o.type)}${size ? ` ${size}` : ""}`;
            const tag =
              o.type === "garage_door"
                ? `${o.markerLabel} GD`
                : `${o.markerLabel} ${openingTypeLabel(o.type)}`;
            const w = tagWidth(tag);
            const label = labelPlacement(o.vx, o.vy, state.width, state.height, w, index);
            return (
              <g key={`vo-${o.markerLabel}`}>
                <title>
                  {fullTag}
                  {o.room ? ` · ${o.room}` : ""}
                  {o.evidence ? ` · ${o.evidence}` : ""}
                </title>
                <line
                  x1={o.vx}
                  y1={o.vy}
                  x2={label.lineEndX}
                  y2={label.lineEndY}
                  className={[
                    "vov-leader",
                    o.type === "garage_door" ? "vov-leader-garage" : "",
                    o.confidence === "low" ? "vov-leader-low" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <circle
                  cx={o.vx}
                  cy={o.vy}
                  r={openingR}
                  className={[
                    "vov-opening",
                    o.confidence === "low" ? "vov-opening-low" : "",
                    o.type === "garage_door" ? "vov-opening-garage" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <rect
                  x={label.lx}
                  y={label.ly}
                  width={w}
                  height={16}
                  rx={2}
                  className={[
                    "vov-tag-bg",
                    o.type === "garage_door" ? "vov-tag-bg-garage" : "",
                    o.confidence === "low" ? "vov-tag-bg-low" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <text x={label.tx} y={label.ty} className="vov-opening-label">
                  {tag}
                </text>
              </g>
            );
          })}
          {state.markers.map((m, index) => {
            const tag = `${m.label} ${doorTypeLabel(m.type)}${m.widthMm}`;
            const w = tagWidth(tag);
            const label = labelPlacement(m.vx, m.vy, state.width, state.height, w, index + 1);
            return (
              <g key={m.label}>
                <title>
                  {tag}
                  {m.note ? ` · ${m.note}` : ""}
                </title>
                <circle
                  cx={m.vx}
                  cy={m.vy}
                  r={doorR}
                  className={m.confidence === "flag" ? "vov-flag" : "vov-door"}
                />
                <line
                  x1={m.vx}
                  y1={m.vy}
                  x2={label.lineEndX}
                  y2={label.lineEndY}
                  className={m.confidence === "flag" ? "vov-door-leader-flag" : "vov-door-leader"}
                />
                <rect
                  x={label.lx}
                  y={label.ly}
                  width={w}
                  height={16}
                  rx={2}
                  className={m.confidence === "flag" ? "vov-door-tag-bg-flag" : "vov-door-tag-bg"}
                />
                <text x={label.tx} y={label.ty} className="vov-label">
                  {tag}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
