import * as pdfjsLib from "pdfjs-dist";
// pdfjs-dist v5: the GlobalWorkerOptions.workerSrc getter throws if the value
// is falsy (empty string no longer works as "inline" mode).  Use Vite's ?url
// import so the worker bundle is emitted as a hashed static asset and the URL
// is injected at build time.  The worker runs in a real Web Worker thread.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/**
 * Render the first page of a PDF File into a JPEG Blob suitable for a thumbnail.
 * Returns null if rendering fails.
 */
export async function renderPdfThumbnail(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<Blob | null> {
  const { maxWidth = 480, quality = 0.82 } = opts;
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    return blob;
  } catch (e) {
    console.warn("PDF thumbnail render failed:", e);
    return null;
  }
}
