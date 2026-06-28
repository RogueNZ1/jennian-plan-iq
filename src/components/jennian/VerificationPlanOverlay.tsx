/**
 * VerificationPlanOverlay renders the plan page as a visual evidence surface for
 * the active extracted quantity ledger. Legacy visual/door markers are not drawn
 * as active quantity markers.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  adapterToUser,
  isWindowCode,
  stitchTextItems,
  type DoorPagePersisted,
  type LedgerOverlayRow,
  type LedgerPlanOverlayModel,
  type RawTextItem,
} from "@/lib/verification/plan-overlay";

type PlacedLedgerRow = LedgerOverlayRow & { vx: number; vy: number };
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
      ledgerRows: PlacedLedgerRow[];
      wcodes: PlacedWCode[];
    };

export type OverlayRenderStatus = OverlayState["status"];

const RENDER_MAX_WIDTH = 1500;
const MIN_CROP_POINTS = 4;

function tagWidth(text: string): number {
  return Math.max(48, text.length * 6 + 10);
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
  markers: readonly { vx: number; vy: number }[],
): CropRect | null {
  if (markers.length < MIN_CROP_POINTS) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const marker of markers) {
    minX = Math.min(minX, marker.vx);
    minY = Math.min(minY, marker.vy);
    maxX = Math.max(maxX, marker.vx);
    maxY = Math.max(maxY, marker.vy);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const padX = Math.max(120, width * 0.08);
  const padY = Math.max(90, height * 0.08);
  const x = clamp(Math.floor(minX - padX), 0, width - 1);
  const y = clamp(Math.floor(minY - padY), 0, height - 1);
  const right = clamp(Math.ceil(maxX + padX), x + 1, width);
  const bottom = clamp(Math.ceil(maxY + padY), y + 1, height);
  const crop = { x, y, width: right - x, height: bottom - y };
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
  return items.map((item) => ({ ...item, vx: item.vx - crop.x, vy: item.vy - crop.y }));
}

function bboxCenter(bbox: [number, number, number, number]): { x: number; y: number } {
  const [x1, y1, x2, y2] = bbox;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

function statusClass(status: string): string {
  if (status === "extracted") return "vov-ledger-extracted";
  if (status === "needs_review") return "vov-ledger-review";
  if (status === "missing_evidence") return "vov-ledger-missing";
  if (status === "conflict") return "vov-ledger-conflict";
  return "vov-ledger-ignored";
}

export function VerificationPlanOverlay({
  jobId,
  ledgerOverlay,
  page,
  onStatusChange,
}: {
  jobId: string;
  ledgerOverlay: LedgerPlanOverlayModel;
  page: DoorPagePersisted | null;
  onStatusChange?: (status: OverlayRenderStatus) => void;
}) {
  const [state, setState] = useState<OverlayState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    (async () => {
      try {
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

          const placedLedgerRows: PlacedLedgerRow[] = page
            ? ledgerOverlay.markedRows
                .filter((row) => row.bbox)
                .map((row) => {
                  const center = bboxCenter(row.bbox!);
                  const { ux, uy } = adapterToUser(center.x, center.y, page.view);
                  const [vx, vy] = viewport.convertToViewportPoint(ux, uy);
                  return { ...row, vx, vy };
                })
            : [];

          const tc = await pdfPage.getTextContent();
          const stitched = stitchTextItems(
            (tc.items as Array<{ str?: string; transform?: number[]; width?: number }>)
              .filter((item) => typeof item.str === "string" && item.transform)
              .map(
                (item): RawTextItem => ({
                  str: item.str!,
                  transform: item.transform!,
                  width: item.width,
                }),
              ),
          );
          const wcodes: PlacedWCode[] = stitched
            .filter((label) => isWindowCode(label.text))
            .map((label) => {
              const [vx, vy] = viewport.convertToViewportPoint(label.ux, label.uy);
              return { text: label.text.trim().toUpperCase(), vx, vy };
            });

          const crop = cropAroundMarkers(canvas.width, canvas.height, placedLedgerRows);
          const outputCanvas = crop ? cropCanvas(canvas, crop) : canvas;
          const imgUrl = outputCanvas.toDataURL("image/jpeg", 0.9);
          if (active) {
            setState({
              status: "ready",
              imgUrl,
              width: outputCanvas.width,
              height: outputCanvas.height,
              ledgerRows: applyCrop(placedLedgerRows, crop),
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
  }, [jobId, ledgerOverlay, page]);

  useEffect(() => {
    onStatusChange?.(state.status);
  }, [onStatusChange, state.status]);

  if (state.status === "loading") return <p className="vempty">Rendering plan overlay...</p>;
  if (state.status === "no-plan") {
    return <p className="vempty">No plan file uploaded for this job - overlay unavailable.</p>;
  }
  if (state.status === "error") {
    return (
      <p className="vempty">
        Plan overlay could not render ({state.message}). The printout above is unaffected.
      </p>
    );
  }

  return (
    <div>
      {ledgerOverlay.markedRows.length === 0 && (
        <div className="vbanner vbanner-compact">
          <div>
            No active ledger rows have drawable bbox evidence for this run. The ledger list below is
            the active authority; legacy visual markers are evidence-only.
          </div>
        </div>
      )}
      <div className="voverlay-wrap" style={{ aspectRatio: `${state.width} / ${state.height}` }}>
        <img src={state.imgUrl} alt="Floor plan with active extracted quantity overlay" />
        <svg viewBox={`0 0 ${state.width} ${state.height}`} preserveAspectRatio="xMinYMin meet">
          {state.ledgerRows.map((row, index) => {
            const tag = row.extractedQuantityId;
            const width = tagWidth(tag);
            const label = labelPlacement(row.vx, row.vy, state.width, state.height, width, index);
            const className = statusClass(row.status);
            return (
              <g
                key={`${row.extractedQuantityId}:${row.visualAnchorId ?? "no-anchor"}`}
                data-extracted-quantity-id={row.extractedQuantityId}
                data-visual-anchor-id={row.visualAnchorId ?? undefined}
              >
                <title>
                  {row.extractedQuantityId} - {row.category} - {row.status}
                  {row.visualAnchorId ? ` - anchor ${row.visualAnchorId}` : ""}
                  {row.evidenceText ? ` - ${row.evidenceText}` : ""}
                </title>
                <line
                  x1={row.vx}
                  y1={row.vy}
                  x2={label.lineEndX}
                  y2={label.lineEndY}
                  className={["vov-leader", className].join(" ")}
                />
                <circle
                  cx={row.vx}
                  cy={row.vy}
                  r={8}
                  className={["vov-opening", className].join(" ")}
                />
                <rect
                  x={label.lx}
                  y={label.ly}
                  width={width}
                  height={16}
                  rx={2}
                  className={["vov-tag-bg", className].join(" ")}
                />
                <text x={label.tx} y={label.ty} className="vov-opening-label">
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
