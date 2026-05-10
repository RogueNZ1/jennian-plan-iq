/**
 * IQ Measurements — Plan Measurement Engine API.
 *
 * Stores and retrieves:
 *   - plan_calibrations  (pixel↔mm scale per plan page)
 *   - plan_measurements  (lines, polylines, areas, walls, perimeters)
 *   - opening_schedule   (windows / doors / openings)
 *
 * Also provides geometry helpers and a "push to module_items" helper that
 * writes confirmed measurements into the existing IQ module data layer.
 */

import { supabase } from "@/integrations/supabase/client";

export type Pt = { x: number; y: number };

export type MeasurementType =
  | "line"
  | "polyline"
  | "area"
  | "internal_wall"
  | "external_perimeter"
  | "count";

export type ReviewStatus = "review_required" | "confirmed" | "excluded";

export type DataSource =
  | "Uploaded Plan Text"
  | "Uploaded Specification Text"
  | "Measured From Plan"
  | "Template Allowance"
  | "User Override"
  | "Demo Value";

export type Calibration = {
  id: string;
  job_id: string;
  file_id: string | null;
  plan_page_number: number;
  calibration_line_pixels: number;
  calibration_real_mm: number;
  pixels_per_mm: number;
  scale_text: string | null;
  calibration_source: string;
  confidence: string;
  calibrated_by: string;
  calibrated_at: string;
};

export type PlanMeasurement = {
  id: string;
  job_id: string;
  file_id: string | null;
  plan_page_number: number;
  measurement_type: MeasurementType;
  label: string | null;
  category: string | null;
  module_id: string | null;
  points_json: Pt[];
  calculated_length_mm: number | null;
  calculated_length_m: number | null;
  calculated_area_m2: number | null;
  count_value: number | null;
  source: string;
  confidence: string;
  review_status: ReviewStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Opening = {
  id: string;
  job_id: string;
  plan_page_number: number;
  opening_type: string;
  width_mm: number;
  height_mm: number | null;
  room_name: string | null;
  quantity: number;
  source: string;
  source_evidence: string | null;
  confidence: string;
  review_status: ReviewStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/* ---------- Geometry helpers ---------- */

export function pixelDistance(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

export function polylinePixelLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += pixelDistance(pts[i - 1], pts[i]);
  return s;
}

/** Shoelace area (signed → abs) in pixels². */
export function polygonPixelArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Convert pixels → millimetres using calibration. */
export function pxToMm(px: number, pixelsPerMm: number): number {
  return px / pixelsPerMm;
}

export function pxAreaToM2(pxArea: number, pixelsPerMm: number): number {
  const mm2 = pxArea / (pixelsPerMm * pixelsPerMm);
  return mm2 / 1_000_000;
}

/* ---------- Calibration ---------- */

export async function loadCalibration(
  jobId: string,
  page: number,
): Promise<Calibration | null> {
  const { data, error } = await supabase
    .from("plan_calibrations")
    .select("*")
    .eq("job_id", jobId)
    .eq("plan_page_number", page)
    .order("calibrated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Calibration | null;
}

export async function saveCalibration(args: {
  jobId: string;
  fileId?: string | null;
  page: number;
  pixels: number;
  realMm: number;
  scaleText?: string | null;
  calibratedBy: string;
}): Promise<Calibration> {
  const pixels_per_mm = args.pixels / args.realMm;
  const { data, error } = await supabase
    .from("plan_calibrations")
    .insert({
      job_id: args.jobId,
      file_id: args.fileId ?? null,
      plan_page_number: args.page,
      calibration_line_pixels: args.pixels,
      calibration_real_mm: args.realMm,
      pixels_per_mm,
      scale_text: args.scaleText ?? null,
      calibration_source: "user_two_point",
      confidence: "high",
      calibrated_by: args.calibratedBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Calibration;
}

/* ---------- Measurements ---------- */

export async function loadMeasurements(
  jobId: string,
): Promise<PlanMeasurement[]> {
  const { data, error } = await supabase
    .from("plan_measurements")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    points_json: (r.points_json as unknown as Pt[]) ?? [],
  })) as PlanMeasurement[];
}

export async function saveMeasurement(args: {
  jobId: string;
  fileId?: string | null;
  page: number;
  type: MeasurementType;
  label?: string | null;
  category?: string | null;
  moduleId?: string | null;
  points: Pt[];
  pixelsPerMm: number;
  createdBy: string;
  notes?: string | null;
}): Promise<PlanMeasurement> {
  const pxLen = polylinePixelLength(args.points);
  const lengthMm = pxToMm(pxLen, args.pixelsPerMm);
  const lengthM = lengthMm / 1000;
  const isArea = args.type === "area";
  const areaM2 = isArea
    ? pxAreaToM2(polygonPixelArea(args.points), args.pixelsPerMm)
    : null;

  const { data, error } = await supabase
    .from("plan_measurements")
    .insert({
      job_id: args.jobId,
      file_id: args.fileId ?? null,
      plan_page_number: args.page,
      measurement_type: args.type,
      label: args.label ?? null,
      category: args.category ?? null,
      module_id: args.moduleId ?? null,
      points_json: args.points as unknown as never,
      calculated_length_mm: isArea ? null : lengthMm,
      calculated_length_m: isArea ? null : lengthM,
      calculated_area_m2: areaM2,
      source: "Measured From Plan",
      confidence: "mid",
      review_status: "review_required",
      notes: args.notes ?? null,
      created_by: args.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { ...(data as unknown as PlanMeasurement), points_json: args.points };
}

export async function setMeasurementReviewStatus(
  id: string,
  status: ReviewStatus,
): Promise<void> {
  const { error } = await supabase
    .from("plan_measurements")
    .update({ review_status: status })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from("plan_measurements").delete().eq("id", id);
  if (error) throw error;
}

export async function updateMeasurementLabel(
  id: string,
  label: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("plan_measurements")
    .update({ label })
    .eq("id", id);
  if (error) throw error;
}

/* ---------- Openings ---------- */

export async function loadOpenings(jobId: string): Promise<Opening[]> {
  const { data, error } = await supabase
    .from("opening_schedule")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Opening[];
}

export async function createOpening(args: {
  jobId: string;
  page?: number;
  width_mm: number;
  height_mm?: number | null;
  opening_type?: string;
  room_name?: string | null;
  quantity?: number;
  source?: string;
  source_evidence?: string | null;
  confidence?: string;
  createdBy: string;
  notes?: string | null;
}): Promise<Opening> {
  const { data, error } = await supabase
    .from("opening_schedule")
    .insert({
      job_id: args.jobId,
      plan_page_number: args.page ?? 1,
      opening_type: args.opening_type ?? "unknown_opening",
      width_mm: args.width_mm,
      height_mm: args.height_mm ?? null,
      room_name: args.room_name ?? null,
      quantity: args.quantity ?? 1,
      source: args.source ?? "Uploaded Plan Text",
      source_evidence: args.source_evidence ?? null,
      confidence: args.confidence ?? "mid",
      review_status: "review_required",
      notes: args.notes ?? null,
      created_by: args.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Opening;
}

export async function updateOpening(
  id: string,
  patch: Partial<Pick<Opening,
    "opening_type" | "width_mm" | "height_mm" | "room_name" |
    "quantity" | "review_status" | "notes" | "confidence">>,
): Promise<void> {
  const { error } = await supabase
    .from("opening_schedule")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOpening(id: string): Promise<void> {
  const { error } = await supabase.from("opening_schedule").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- Push measurement → module_items ---------- */

/**
 * Push a confirmed measurement value into a module's item list. The new row
 * is added with source = "Measured From Plan" so the module audit trail
 * shows where it came from. Approved items are NOT overwritten — caller
 * should mark conflicting rows for review separately.
 */
export async function pushMeasurementToModule(args: {
  jobId: string;
  moduleId: string;
  label: string;
  unit: string;
  value: number;
  basis?: string | null;
  createdBy: string;
}): Promise<void> {
  // find or create the run
  const { data: runs, error: runErr } = await supabase
    .from("module_runs")
    .select("id")
    .eq("job_id", args.jobId)
    .eq("module_id", args.moduleId)
    .limit(1);
  if (runErr) throw runErr;
  const runId = runs?.[0]?.id;
  if (!runId) throw new Error("Module not initialised for this job.");

  const { data: existing } = await supabase
    .from("module_items")
    .select("id, sort_order")
    .eq("run_id", runId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;

  const { error: insErr } = await supabase.from("module_items").insert({
    run_id: runId,
    job_id: args.jobId,
    module_id: args.moduleId,
    label: args.label,
    unit: args.unit,
    extracted_value: String(args.value),
    approved_value: null,
    confidence: "mid",
    review_status: "review_required",
    basis: args.basis ?? "Measured From Plan",
    sort_order: nextSort,
  });
  if (insErr) throw insErr;

  await supabase.from("module_audit_logs").insert({
    job_id: args.jobId,
    run_id: runId,
    module_id: args.moduleId,
    user_id: args.createdBy,
    action: "measurement_pushed",
    new_value: String(args.value),
    notes: `${args.label} (${args.unit}) from plan measurement`,
  });
}

/* ---------- Validation against printed reference ---------- */

export type ValidationStatus = "match" | "minor" | "review_required" | "missing";

export function validateAgainstPrinted(
  printed: number | null | undefined,
  measured: number | null | undefined,
  tolerance = 0.02,
): ValidationStatus {
  if (printed == null || measured == null) return "missing";
  if (printed === 0) return "review_required";
  const diff = Math.abs(measured - printed) / printed;
  if (diff <= tolerance) return "match";
  if (diff <= tolerance * 3) return "minor";
  return "review_required";
}