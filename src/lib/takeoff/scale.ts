/**
 * Scale-text detection. Phase A: text only — we do NOT attempt to derive
 * pixels_per_mm from dimension lines; that's geometry work deferred to
 * Phase B. If we can find a "1:NNN" string + a known page size we write a
 * deterministic calibration row marked review_required. If only the scale
 * text is present we still record it but with low confidence. If neither,
 * no calibration row is written.
 */
import { supabase } from "@/integrations/supabase/client";
import { pageLongEdgeMm, type ExtractedPage } from "./pdf-text";

export type ScaleResult = {
  scaleText: string | null;
  /** Denominator from "1:NNN". */
  scaleDen: number | null;
  pageSize: ExtractedPage["pageSize"];
  pixelsPerMm: number | null;
  status: "Auto-Calibrated" | "Auto-Calibrated — Needs Review" | "Manual Calibration Required";
  confidence: "high" | "mid" | "low";
  evidence: string;
};

const SCALE_RE = /(?:scale[:\s]*)?1\s*[:/]\s*(\d{2,4})(?:\s*@\s*(a\d))?/i;

export function detectScaleFromText(p: ExtractedPage): ScaleResult {
  const m = p.text.match(SCALE_RE);
  if (!m) {
    return {
      scaleText: null, scaleDen: null,
      pageSize: p.pageSize,
      pixelsPerMm: null,
      status: "Manual Calibration Required",
      confidence: "low",
      evidence: `No scale text found on page ${p.pageNumber}.`,
    };
  }
  const den = Number(m[1]);
  const scaleText = m[2] ? `1:${den} @${m[2].toUpperCase()}` : `1:${den}`;
  if (!Number.isFinite(den) || den <= 0) {
    return {
      scaleText, scaleDen: null,
      pageSize: p.pageSize, pixelsPerMm: null,
      status: "Manual Calibration Required",
      confidence: "low",
      evidence: `Scale string "${scaleText}" parsed but denominator invalid.`,
    };
  }

  if (p.pageSize === "unknown") {
    return {
      scaleText, scaleDen: den,
      pageSize: "unknown", pixelsPerMm: null,
      status: "Auto-Calibrated — Needs Review",
      confidence: "low",
      evidence: `Scale "${scaleText}" detected on page ${p.pageNumber} but page size could not be inferred.`,
    };
  }

  // PDF user-units are points (1pt = 1/72in). 1pt = 25.4/72 ≈ 0.3528 mm.
  // For scale 1:N, 1mm of plan = N mm of building, so 1mm of paper covers
  // N/1000 m of building. pixels_per_mm here means "PDF points per real mm":
  // 1 paper-mm = 2.83465 pts → real-mm-to-pts = 2.83465 / N.
  const realMmToPts = 2.83465 / den;
  const pixelsPerMm = realMmToPts;
  return {
    scaleText, scaleDen: den,
    pageSize: p.pageSize,
    pixelsPerMm,
    status: "Auto-Calibrated — Needs Review",
    confidence: "mid",
    evidence: `Scale "${scaleText}" + page size ${p.pageSize} (long edge ${pageLongEdgeMm(p).toFixed(0)}mm).`,
  };
}

export async function writeCalibration(args: {
  jobId: string;
  fileId: string | null;
  pageNumber: number;
  scale: ScaleResult;
  userId: string;
}): Promise<string | null> {
  if (args.scale.pixelsPerMm == null) return null;
  const { data, error } = await supabase
    .from("plan_calibrations")
    .insert({
      job_id: args.jobId,
      file_id: args.fileId,
      plan_page_number: args.pageNumber,
      calibration_line_pixels: 1,
      calibration_real_mm: 1 / args.scale.pixelsPerMm,
      pixels_per_mm: args.scale.pixelsPerMm,
      scale_text: args.scale.scaleText,
      calibration_method: "auto_text",
      calibration_source: "automatic_takeoff",
      confidence: args.scale.confidence,
      calibrated_by: args.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data?.id as string) ?? null;
}