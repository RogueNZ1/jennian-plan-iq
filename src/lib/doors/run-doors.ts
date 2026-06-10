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

/** Parse "1:100" → 100. Returns null when the scale text is unusable. */
export function scaleDenominator(scaleText: string | null | undefined): number | null {
  const m = /1\s*[:/]\s*(\d{2,4})/.exec(scaleText ?? "");
  return m ? Number(m[1]) : null;
}

export async function runDoorEngine(
  pdfData: ArrayBuffer | Uint8Array,
  pageNumber: number, // 1-based floor-plan page
  scaleText: string | null | undefined,
): Promise<DoorEngineResult | null> {
  try {
    const scale = scaleDenominator(scaleText);
    if (!scale) return null; // no usable scale → no door pass (fail-safe)
    const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
    // Worker not needed for operator-list extraction in the legacy build.
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    const doc = await pdfjs.getDocument({
      data: pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData),
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    } as Parameters<typeof pdfjs.getDocument>[0]).promise;
    try {
      const page = await doc.getPage(pageNumber);
      const geom = await extractPageGeometry(page as Parameters<typeof extractPageGeometry>[0]);
      return detectInteriorDoors(geom, { ...DEFAULT_CONFIG, scale });
    } finally {
      await doc.destroy().catch(() => {});
    }
  } catch (e) {
    console.warn("[door-engine] pass failed — door cells fall back:", e instanceof Error ? e.message : e);
    return null;
  }
}
