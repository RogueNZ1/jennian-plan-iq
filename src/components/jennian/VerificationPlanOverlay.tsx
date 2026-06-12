/**
 * VerificationPlanOverlay — renders the floor-plan page with the door-engine hits drawn on
 * (plan-overlay slice, 13 Jun). Coordinate path validated on the Alexandra bench against
 * Haydon's hand-labelled ground truth: persisted adapter-space hit → adapterToUser →
 * viewport.convertToViewportPoint (handles scale + /Rotate).
 *
 * Layers:
 *   - door markers from the PERSISTED run (red = confirmed, amber dashed = flag)
 *   - W-code boxes matched LIVE from the page's own printed text (no persistence, no claim —
 *     it circles what the plan itself says, for the schedule cross-check)
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
} from "@/lib/verification/plan-overlay";

type PlacedMarker = DoorMarker & { vx: number; vy: number };
type PlacedWCode = { text: string; vx: number; vy: number };

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
      wcodes: PlacedWCode[];
    };

const RENDER_MAX_WIDTH = 1500;

export function VerificationPlanOverlay({
  jobId,
  markers,
  page,
}: {
  jobId: string;
  markers: DoorMarker[];
  page: DoorPagePersisted | null;
}) {
  const [state, setState] = useState<OverlayState>({ status: "loading" });

  useEffect(() => {
    let active = true;
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

          const imgUrl = canvas.toDataURL("image/jpeg", 0.9);
          if (active) {
            setState({
              status: "ready",
              imgUrl,
              width: canvas.width,
              height: canvas.height,
              markers: placed,
              wcodes,
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
  }, [jobId, markers, page]);

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

  const r = 13; // marker radius in render px
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
      <div className="voverlay-wrap">
        <img src={state.imgUrl} alt="Floor plan with takeoff overlay" />
        <svg viewBox={`0 0 ${state.width} ${state.height}`} preserveAspectRatio="xMinYMin meet">
          {state.wcodes.map((w, i) => (
            <g key={`w-${i}`}>
              <rect
                x={w.vx - 6}
                y={w.vy - 18}
                width={46}
                height={24}
                className="vov-wcode"
                rx={3}
              />
            </g>
          ))}
          {state.markers.map((m) => (
            <g key={m.label}>
              <circle
                cx={m.vx}
                cy={m.vy}
                r={r}
                className={m.confidence === "flag" ? "vov-flag" : "vov-door"}
              />
              <text x={m.vx + r + 3} y={m.vy - r + 4} className="vov-label">
                {m.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
