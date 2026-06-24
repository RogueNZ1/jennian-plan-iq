import { extractPageGeometry } from "../doors/pdf-adapter";
import { detectFrameOpeningSlots } from "./elevation-opening-slots";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
  type ElevationFaceBand,
  type ElevationVectorOpening,
} from "./elevation-vector-openings";
import type { FrameOpeningSlot } from "./elevation-opening-slots";

export type ElevationVectorEvidence = {
  elevationOpenings: ElevationVectorOpening[];
  elevationFaceBands: ElevationFaceBand[];
  elevationOpeningSlots: FrameOpeningSlot[];
};

export async function runElevationVectorOpenings(
  pdfData: ArrayBuffer | Uint8Array,
  pageNumber = 1,
): Promise<ElevationVectorOpening[]> {
  const evidence = await runElevationVectorEvidence(pdfData, pageNumber);
  return evidence.elevationOpenings;
}

export async function runElevationVectorEvidence(
  pdfData: ArrayBuffer | Uint8Array,
  pageNumber = 1,
): Promise<ElevationVectorEvidence> {
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
      const elevationFaceBands = detectElevationFaceBands(geom.segments);
      return {
        elevationOpenings: detectElevationVectorOpenings(geom.segments),
        elevationFaceBands,
        elevationOpeningSlots: detectFrameOpeningSlots({
          segments: geom.segments,
          faceBands: elevationFaceBands,
        }),
      };
    } finally {
      await doc.destroy().catch(() => {});
    }
  } catch (e) {
    console.warn(
      "[elevation-vector-openings] pass failed - elevation openings stay on AI/image path:",
      e instanceof Error ? e.message : e,
    );
    return {
      elevationOpenings: [],
      elevationFaceBands: [],
      elevationOpeningSlots: [],
    };
  }
}
