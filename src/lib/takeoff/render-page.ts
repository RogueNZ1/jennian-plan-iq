/**
 * Phase B — Browser-side PDF page renderer for Vision Takeoff.
 *
 * Renders a single page of a plan PDF to a high-resolution PNG, uploads
 * the image to the `plan_pdfs` storage bucket, and registers it in
 * `vision_takeoff_pages` so the server-side vision runner can locate it.
 *
 * Browser-only — pdfjs-dist references DOM globals that don't exist on
 * the server.
 */
import { supabase } from "@/integrations/supabase/client";

type PdfJs = typeof import("pdfjs-dist");
let _pdfjs: PdfJs | null = null;
async function getPdfJs(): Promise<PdfJs> {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

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
};

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

/**
 * Render a single PDF page and upload it as PNG.
 * - scale defaults to 2.0 (~144 DPI) which is enough for plan dimension text.
 * - Skips re-render when an existing vision_takeoff_pages row matches.
 */
export async function renderAndUploadPlanPage(args: {
  jobId: string;
  fileId: string;
  fileName: string;
  fileBucket?: string;        // bucket containing the source PDF
  fileStoragePath: string;    // storage path of the source PDF
  pageNumber: number;
  pageType?: string | null;
  scale?: number;             // pdfjs viewport scale
}): Promise<RenderedPage> {
  const sourceBucket = args.fileBucket ?? "job-files";
  const targetBucket = "plan_pdfs";
  const scale = args.scale ?? 2.0;

  const { data: userResp } = await supabase.auth.getUser();
  const userId = userResp.user?.id;
  if (!userId) throw new Error("You must be signed in to render plan pages.");

  // Check for an existing rendered page (idempotency).
  const { data: existing } = await supabase
    .from("vision_takeoff_pages")
    .select("id, storage_bucket, storage_path, render_resolution, page_type")
    .eq("job_id", args.jobId)
    .eq("file_id", args.fileId)
    .eq("page_number", args.pageNumber)
    .maybeSingle();

  const pdfjs = await getPdfJs();
  const buf = await downloadPdfBytes(sourceBucket, args.fileStoragePath);
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  if (args.pageNumber < 1 || args.pageNumber > pdf.numPages) {
    throw new Error(
      `Page ${args.pageNumber} is out of range for ${args.fileName} (${pdf.numPages} pages).`,
    );
  }
  const page = await pdf.getPage(args.pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D canvas context.");
  // White background so flat plans don't render with transparent voids.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // pdfjs typings vary across versions — pass the canvas explicitly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (page as any).render({ canvasContext: ctx, viewport, canvas }).promise;

  const blob = await blobFromCanvas(canvas);
  const storagePath = `vision/${args.jobId}/${args.fileId}/page-${args.pageNumber}.png`;
  const { error: upErr } = await supabase.storage
    .from(targetBucket)
    .upload(storagePath, blob, { contentType: "image/png", upsert: true });
  if (upErr) throw new Error(`Could not upload rendered page: ${upErr.message}`);

  // Register / refresh the registry row.
  const renderResolution = Math.round(viewport.width); // px width as an integer marker
  if (existing) {
    const { error: updErr } = await supabase
      .from("vision_takeoff_pages")
      .update({
        storage_bucket: targetBucket,
        storage_path: storagePath,
        render_resolution: renderResolution,
        page_type: args.pageType ?? existing.page_type ?? null,
      })
      .eq("id", existing.id);
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
    };
  }

  const { data: ins, error: insErr } = await supabase
    .from("vision_takeoff_pages")
    .insert({
      job_id: args.jobId,
      file_id: args.fileId,
      page_number: args.pageNumber,
      page_type: args.pageType ?? null,
      render_resolution: renderResolution,
      storage_bucket: targetBucket,
      storage_path: storagePath,
      created_by: userId,
    })
    .select("id")
    .single();
  if (insErr || !ins) throw new Error(`Could not record vision page: ${insErr?.message ?? "no row"}`);

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
  };
}