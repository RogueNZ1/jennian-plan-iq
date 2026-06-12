/**
 * Phase B — Browser-side PDF page renderer for Vision Takeoff.
 *
 * Renders a single page of a plan PDF to a high-resolution PNG, uploads it
 * to the `plan_pdfs` storage bucket, and registers it in `vision_takeoff_pages`.
 *
 * Resolution strategy
 * -------------------
 * PDF.js viewport units are 1/72 inch per CSS pixel (the "base" scale).
 * An A3 sheet (420 × 297mm) has a base width of ~1190px.
 *
 * Targets:
 *   Floorplan / dimension floorplan  →  scale 5.0, capped so width ≤ 7000px
 *     A3: ~5950px  A2: ~7000px  A1: ~7000px (capped)   (~360 / 300 / 212 DPI)
 *   Unknown / flattened fallback     →  scale 4.5 (could be a detailed plan)
 *   Elevations / sections            →  scale 2.5
 *   Everything else                  →  scale 3.0
 *
 * Cache invalidation
 * ------------------
 * If a vision_takeoff_pages row exists AND its stored render_resolution is
 * already >= the minimum for that page type, the existing file is reused
 * (no re-download, no re-upload).  If it is below the threshold, the page is
 * re-rendered at the target scale and the storage object is overwritten with
 * upsert:true (requires the UPDATE policy added in migration 090001).
 *
 * Browser-only — pdfjs-dist references DOM globals unavailable on the server.
 */
import { supabase } from "@/integrations/supabase/client";

// ---- Resolution constants -----------------------------------------------

/** Floorplan target scale (5 × 1/72-inch-per-px base ≈ 360 DPI for A3). */
const FLOORPLAN_SCALE = 5.0;
/** Hard cap: no dimension needs more than 7000px across for AI inference. */
const FLOORPLAN_MAX_PX = 7000;
/** Reuse a cached floorplan render only if it is this wide or better. */
const CACHE_MIN_FLOORPLAN_PX = 4000;

const ELEVATION_SCALE = 2.5;
const UNKNOWN_SCALE = 4.5; // flattened / unclassified could be a detailed plan
const DEFAULT_SCALE = 3.0;
/** Reuse a cached non-floorplan render only if it is this wide or better. */
const CACHE_MIN_DEFAULT_PX = 2000;

// ---- Helpers ----------------------------------------------------------------

function isFloorplanType(pageType: string | null | undefined): boolean {
  const t = (pageType ?? "").toLowerCase();
  return t.includes("floorplan") || t.includes("floor plan");
}

function isElevationType(pageType: string | null | undefined): boolean {
  const t = (pageType ?? "").toLowerCase();
  return t.includes("elevation") || t.includes("section");
}

function isUnknownType(pageType: string | null | undefined): boolean {
  const t = (pageType ?? "").toLowerCase();
  return !pageType || t === "" || t.includes("unknown") || t.includes("fallback");
}

function cacheMinWidthFor(pageType: string | null | undefined): number {
  return isFloorplanType(pageType) ? CACHE_MIN_FLOORPLAN_PX : CACHE_MIN_DEFAULT_PX;
}

/**
 * Compute the render scale for a given page type and base viewport width.
 * An explicit `override` (from the caller) takes precedence.
 */
export function computeRenderScale(
  pageType: string | null | undefined,
  baseWidthPx: number,
  override?: number,
): number {
  if (override != null) return override;
  if (isFloorplanType(pageType)) {
    const capScale = FLOORPLAN_MAX_PX / baseWidthPx;
    return Math.min(FLOORPLAN_SCALE, capScale);
  }
  if (isElevationType(pageType)) return ELEVATION_SCALE;
  if (isUnknownType(pageType)) return Math.min(UNKNOWN_SCALE, FLOORPLAN_MAX_PX / baseWidthPx);
  return DEFAULT_SCALE;
}

// ---- PDF.js loader ----------------------------------------------------------

type PdfJs = typeof import("pdfjs-dist");
let _pdfjs: PdfJs | null = null;
async function getPdfJs(): Promise<PdfJs> {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  _pdfjs = pdfjs;
  return pdfjs;
}

// ---- Storage helpers --------------------------------------------------------

async function downloadPdfBytes(bucket: string, path: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Could not download PDF (${bucket}/${path}): ${error?.message ?? "no data"}`);
  }
  return data.arrayBuffer();
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null."))),
      "image/png",
    );
  });
}

// ---- Public API -------------------------------------------------------------

export type RenderedPage = {
  pageId: string;
  jobId: string;
  fileId: string;
  pageNumber: number;
  pageType: string | null;
  bucket: string;
  storagePath: string;
  renderResolution: number;
  widthPx: number;
  heightPx: number;
  /** True when a cached render was reused, false when freshly rendered. */
  cached: boolean;
};

/**
 * Render a single PDF page and upload it as a high-resolution PNG.
 *
 * Resolution is chosen adaptively (see module docblock).  An existing cached
 * render is reused when its resolution already meets the threshold for its
 * page type; otherwise the page is re-rendered at the target scale.
 */
export async function renderAndUploadPlanPage(args: {
  jobId: string;
  fileId: string;
  fileName: string;
  fileBucket?: string;
  fileStoragePath: string;
  pageNumber: number;
  pageType?: string | null;
  /** Explicit scale override — omit to let adaptive logic decide. */
  scale?: number;
}): Promise<RenderedPage> {
  const sourceBucket = args.fileBucket ?? "job-files";
  const targetBucket = "plan_pdfs";

  const { data: userResp } = await supabase.auth.getUser();
  const userId = userResp.user?.id;
  if (!userId) throw new Error("You must be signed in to render plan pages.");

  // Check for an existing rendered page.
  const { data: existing } = await supabase
    .from("vision_takeoff_pages")
    .select("id, storage_bucket, storage_path, render_resolution, page_type")
    .eq("job_id", args.jobId)
    .eq("file_id", args.fileId)
    .eq("page_number", args.pageNumber)
    .maybeSingle();

  const storagePath = `vision/${args.jobId}/${args.fileId}/page-${args.pageNumber}.png`;

  // Reuse cached render if it already meets the resolution bar for this type.
  const cacheMin = cacheMinWidthFor(args.pageType);
  if (existing && (existing.render_resolution as number) >= cacheMin) {
    return {
      pageId: existing.id as string,
      jobId: args.jobId,
      fileId: args.fileId,
      pageNumber: args.pageNumber,
      pageType: args.pageType ?? (existing.page_type as string | null) ?? null,
      bucket: existing.storage_bucket as string,
      storagePath: existing.storage_path as string,
      renderResolution: existing.render_resolution as number,
      widthPx: existing.render_resolution as number,
      heightPx: existing.render_resolution as number,
      cached: true,
    };
  }

  // ---- (Re-)render at target resolution ----

  const pdfjs = await getPdfJs();
  const buf = await downloadPdfBytes(sourceBucket, args.fileStoragePath);
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  if (args.pageNumber < 1 || args.pageNumber > pdf.numPages) {
    throw new Error(
      `Page ${args.pageNumber} is out of range for ${args.fileName} (${pdf.numPages} pages).`,
    );
  }
  const page = await pdf.getPage(args.pageNumber);

  // Determine the scale using the actual base viewport width.
  const baseViewport = page.getViewport({ scale: 1.0 });
  const scale = computeRenderScale(args.pageType, baseViewport.width, args.scale);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D canvas context.");
  // White background so flat plans don't render transparent voids.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const blob = await blobFromCanvas(canvas);
  const renderResolution = canvas.width;

  // Upload — upsert:true overwrites an existing low-res file (requires the
  // UPDATE storage policy from migration 090001 to be applied).
  const { error: upErr } = await supabase.storage
    .from(targetBucket)
    .upload(storagePath, blob, { contentType: "image/png", upsert: true });
  if (upErr) throw new Error(`Could not upload rendered page: ${upErr.message}`);

  // Register or refresh the registry row.
  const registryFields = {
    storage_bucket: targetBucket,
    storage_path: storagePath,
    render_resolution: renderResolution,
    page_type: args.pageType ?? null,
  };

  if (existing) {
    const { error: updErr } = await supabase
      .from("vision_takeoff_pages")
      .update(registryFields)
      .eq("id", existing.id as string);
    if (updErr) throw new Error(`Could not update vision page record: ${updErr.message}`);
    return {
      pageId: existing.id as string,
      jobId: args.jobId,
      fileId: args.fileId,
      pageNumber: args.pageNumber,
      pageType: args.pageType ?? (existing.page_type as string | null) ?? null,
      bucket: targetBucket,
      storagePath,
      renderResolution,
      widthPx: canvas.width,
      heightPx: canvas.height,
      cached: false,
    };
  }

  const { data: ins, error: insErr } = await supabase
    .from("vision_takeoff_pages")
    .insert({
      ...registryFields,
      job_id: args.jobId,
      file_id: args.fileId,
      page_number: args.pageNumber,
      created_by: userId,
    })
    .select("id")
    .single();
  if (insErr || !ins)
    throw new Error(`Could not record vision page: ${insErr?.message ?? "no row"}`);

  return {
    pageId: ins.id as string,
    jobId: args.jobId,
    fileId: args.fileId,
    pageNumber: args.pageNumber,
    pageType: args.pageType ?? null,
    bucket: targetBucket,
    storagePath,
    renderResolution,
    widthPx: canvas.width,
    heightPx: canvas.height,
    cached: false,
  };
}
