/**
 * PDF text + page-size extraction for the Automatic Takeoff Engine.
 * Browser-only — pdfjs-dist references DOM globals that don't exist on the
 * server, so this module must be imported lazily from client code.
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

export type PageSize = "A1" | "A2" | "A3" | "A4" | "unknown";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  /** PDF user-units, 1/72 inch each. */
  widthPts: number;
  heightPts: number;
  pageSize: PageSize;
};

export type ExtractedFile = {
  fileId: string;
  fileName: string;
  fileType: "plan" | "specification";
  pages: ExtractedPage[];
};

function classifyPageSize(widthPts: number, heightPts: number): PageSize {
  // pdfjs returns user-units (1pt = 1/72in). ISO sizes in mm:
  // A1 594x841, A2 420x594, A3 297x420, A4 210x297. 1mm = 2.83465pt.
  const longerMm = Math.max(widthPts, heightPts) / 2.83465;
  const shorterMm = Math.min(widthPts, heightPts) / 2.83465;
  const within = (a: number, b: number, tol = 12) => Math.abs(a - b) <= tol;
  if (within(longerMm, 841) && within(shorterMm, 594)) return "A1";
  if (within(longerMm, 594) && within(shorterMm, 420)) return "A2";
  if (within(longerMm, 420) && within(shorterMm, 297)) return "A3";
  if (within(longerMm, 297) && within(shorterMm, 210)) return "A4";
  return "unknown";
}

/** mm length of the longer page edge — needed for pixels-per-mm calc. */
export function pageLongEdgeMm(p: ExtractedPage): number {
  return Math.max(p.widthPts, p.heightPts) / 2.83465;
}

async function readPdfBytes(storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from("job-files").download(storagePath);
  if (error || !data) throw new Error(`Could not download ${storagePath}: ${error?.message ?? "no data"}`);
  return await data.arrayBuffer();
}

export async function extractFile(args: {
  fileId: string;
  fileName: string;
  fileType: "plan" | "specification";
  storagePath: string;
  maxPages?: number;
}): Promise<ExtractedFile> {
  const pdfjs = await getPdfJs();
  const buf = await readPdfBytes(args.storagePath);
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const total = Math.min(pdf.numPages, args.maxPages ?? 50);
  const pages: ExtractedPage[] = [];
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    let text = "";
    try {
      const tc = await page.getTextContent();
      const pieces: string[] = [];
      for (const item of tc.items as Array<{ str?: string }>) {
        if (typeof item.str === "string") pieces.push(item.str);
      }
      text = pieces.join(" ");
    } catch {
      /* image-only page → empty text */
    }
    pages.push({
      pageNumber: i,
      text,
      widthPts: viewport.width,
      heightPts: viewport.height,
      pageSize: classifyPageSize(viewport.width, viewport.height),
    });
  }
  return {
    fileId: args.fileId,
    fileName: args.fileName,
    fileType: args.fileType,
    pages,
  };
}

export async function loadJobFiles(jobId: string): Promise<Array<{
  id: string; file_name: string; file_type: "plan" | "specification"; storage_url: string;
}>> {
  const { data, error } = await supabase
    .from("uploaded_files")
    .select("id, file_name, file_type, storage_url")
    .eq("job_id", jobId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string; file_name: string; file_type: "plan" | "specification"; storage_url: string;
  }>;
}