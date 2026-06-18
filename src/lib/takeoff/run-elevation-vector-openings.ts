import { extractPageGeometry } from "../doors/pdf-adapter";
import {
  detectElevationVectorOpenings,
  type ElevationVectorOpening,
} from "./elevation-vector-openings";

export async function runElevationVectorOpenings(
  pdfData: ArrayBuffer | Uint8Array,
  pageNumber = 1,
): Promise<ElevationVectorOpening[]> {
  try {
    const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      try {
        const u = await import("pdfjs-dist-door/legacy/build/pdf.worker.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = (u as { default: string }).default;
      } catch {
        pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
      }
    }
    const doc = await pdfjs.getDocument({
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
      return detectElevationVectorOpenings(geom.segments);
    } finally {
      await doc.destroy().catch(() => {});
    }
  } catch (e) {
    console.warn(
      "[elevation-vector-openings] pass failed - elevation openings stay on AI/image path:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}
