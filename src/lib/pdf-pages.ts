import * as pdfjsLib from "pdfjs-dist";
// pdfjs-dist v5: the GlobalWorkerOptions.workerSrc getter throws if the value
// is falsy (empty string no longer works as "inline" mode).  Use Vite's ?url
// import so the worker bundle is emitted as a hashed static asset and the URL
// is injected at build time.  The worker runs in a real Web Worker thread.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Pure page-classification + ranking logic lives in pdf-page-classify.ts so it can
// be unit-tested without pdfjs. Re-exported here so existing importers are unchanged.
import {
  type PageType,
  type PageConfidence,
  classifyText,
  scoreFor,
} from "./pdf-page-classify";

export {
  type PageType,
  type PageConfidence,
  PAGE_TYPE_LABEL,
  CONFIDENCE_LABEL,
  FLOORPLAN_SCORE,
  classifyText,
  scoreFor,
  pickPrimaryFloorplan,
  pickWindowSchedule,
  type ScoredPage,
} from "./pdf-page-classify";

export type PageAnalysis = {
  pageNumber: number;
  thumbnailBlob: Blob;
  thumbnailUrl: string;
  pageType: PageType;
  confidence: PageConfidence;
  /** Higher = better candidate for primary floorplan extraction. */
  score: number;
  /** Raw lowercase title text used for classification (debug). */
  excerpt: string;
};

async function renderPageThumbnail(
  page: pdfjsLib.PDFPageProxy,
  maxWidth: number,
  quality: number,
): Promise<Blob | null> {
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
  return await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
}

export type AnalyzeOptions = {
  /** Max pages to analyse (perf cap). Defaults to 24. */
  maxPages?: number;
  maxWidth?: number;
  quality?: number;
  onProgress?: (done: number, total: number) => void;
};

/** Render thumbnails + classify every page (up to maxPages). */
export async function analyzePdfPages(
  file: File,
  opts: AnalyzeOptions = {},
): Promise<PageAnalysis[]> {
  const { maxPages = 24, maxWidth = 360, quality = 0.78, onProgress } = opts;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = Math.min(pdf.numPages, maxPages);
  const out: PageAnalysis[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    let text = "";
    let dimHits = 0;
    try {
      const tc = await page.getTextContent();
      const pieces: string[] = [];
      for (const item of tc.items as Array<{ str?: string }>) {
        if (typeof item.str === "string") pieces.push(item.str);
      }
      text = pieces.join(" ");
      const dimMatches = text.match(/\b\d{2,5}\b/g);
      dimHits = dimMatches ? dimMatches.length : 0;
    } catch {
      /* ignore — image-only page */
    }

    const blob = await renderPageThumbnail(page, maxWidth, quality);
    if (!blob) continue;

    const { type, confidence } = classifyText(text, dimHits);
    const url = URL.createObjectURL(blob);
    out.push({
      pageNumber: i,
      thumbnailBlob: blob,
      thumbnailUrl: url,
      pageType: type,
      confidence,
      score: scoreFor(type, confidence),
      excerpt: text.slice(0, 240).toLowerCase(),
    });
    onProgress?.(i, total);
  }
  return out;
}

/**
 * Render a single PDF page at high resolution for AI analysis.
 * Returns a JPEG blob suitable for base64 encoding and sending to a vision model.
 * maxWidth defaults to 1400px — a good balance between detail and payload size.
 */
export async function renderPageForAnalysis(
  file: File,
  pageNumber: number,
  maxWidth = 1400,
): Promise<Blob | null> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(pageNumber);
  return renderPageThumbnail(page, maxWidth, 0.92);
}

export function disposePageAnalyses(pages: PageAnalysis[]) {
  for (const p of pages) URL.revokeObjectURL(p.thumbnailUrl);
}
