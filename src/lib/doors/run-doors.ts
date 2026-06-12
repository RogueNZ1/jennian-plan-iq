/**
 * Door engine runner — loads the plan through a PINNED pdf.js 4.x build
 * (npm alias "pdfjs-dist-door") because the adapter's constructPath handling is
 * 4.x-specific ("touch this and every label corrupts" — see pdf-adapter.ts).
 * The app's own pdf.js 5.x stays untouched. Lazy-imported so the 4.x bundle
 * loads only when a takeoff actually runs.
 *
 * FAIL-SAFE: never throws. Any failure → null → the export's door cells simply
 * stay on the next precedence source. An unfilled cell beats a wrong cell.
 */
import { detectInteriorDoors, DEFAULT_CONFIG, type DoorEngineResult } from "./door-engine";
import { extractPageGeometry } from "./pdf-adapter";
import { parsePlanText, type PlanText } from "../takeoff/plan-text";

/**
 * Which page the engine ran on, in the adapter's coordinate contract — persisted with the
 * takeoff so the verification overlay can map page-space hits (pdf points, y-down, origin
 * top-left of the UNROTATED page view) back onto a rendered page via the inverse transform
 * + the renderer's viewport (which handles /Rotate). `view` is the raw pdf.js page.view box.
 */
export type DoorPageMeta = {
  pageNumber: number;
  view: number[]; // [x0, y0, x1, y1]
  width: number;
  height: number;
  scaleText: string | null;
};

/** Parse "1:100" → 100. Returns null when the scale text is unusable. */
export function scaleDenominator(scaleText: string | null | undefined): number | null {
  const m = /1\s*[:/]\s*(\d{2,4})/.exec(scaleText ?? "");
  return m ? Number(m[1]) : null;
}

export async function runDoorEngine(
  pdfData: ArrayBuffer | Uint8Array,
  pageNumber: number, // 1-based floor-plan page
  scaleText: string | null | undefined,
): Promise<(DoorEngineResult & { pageMeta?: DoorPageMeta; planText?: PlanText }) | null> {
  try {
    const scale = scaleDenominator(scaleText);
    if (!scale) return null; // no usable scale → no door pass (fail-safe)
    const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
    // pdf.js refuses a falsy workerSrc even on the fake-worker path. In Vite
    // builds the ?url import emits the worker as a hashed asset (same pattern
    // as pdf-pages.ts); in plain Node/vitest that import throws and the bare
    // specifier fallback lets the fake worker dynamic-import from node_modules.
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      try {
        const u = await import("pdfjs-dist-door/legacy/build/pdf.worker.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = (u as { default: string }).default;
      } catch {
        pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
      }
    }
    const doc = await pdfjs.getDocument({
      // pdf.js rejects Node Buffer (a Uint8Array SUBCLASS, so instanceof passes
      // it through) — always hand over a true Uint8Array view, zero-copy.
      data:
        pdfData instanceof Uint8Array
          ? new Uint8Array(pdfData.buffer, pdfData.byteOffset, pdfData.byteLength)
          : new Uint8Array(pdfData),
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    } as Parameters<typeof pdfjs.getDocument>[0]).promise;
    try {
      const page = await doc.getPage(pageNumber);
      const geom = await extractPageGeometry(page as Parameters<typeof extractPageGeometry>[0]);
      const result = detectInteriorDoors(geom, { ...DEFAULT_CONFIG, scale });
      // Plan-text pass (13 Jun 2026) — same labels, zero extra extraction cost.
      // Deterministic room footprints, printed window codes, title-block areas.
      const planText = parsePlanText(geom.labels);
      // Overlay meta — additive: callers that only read counts/flags are untouched.
      const view = (page as { view?: number[] }).view ?? [0, 0, geom.width, geom.height];
      return {
        ...result,
        planText,
        pageMeta: {
          pageNumber,
          view: [...view],
          width: geom.width,
          height: geom.height,
          scaleText: scaleText ?? null,
        },
      };
    } finally {
      await doc.destroy().catch(() => {});
    }
  } catch (e) {
    console.warn(
      "[door-engine] pass failed — door cells fall back:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
