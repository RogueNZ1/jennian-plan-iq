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
  await logPlanAudit({
    jobId: args.jobId,
    calibrationId: (data as Calibration).id,
    action: "calibration_created",
    newValue: `${args.pixels.toFixed(1)}px = ${args.realMm}mm (page ${args.page})`,
  });
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
  const m = { ...(data as unknown as PlanMeasurement), points_json: args.points };
  await logPlanAudit({
    jobId: args.jobId,
    measurementId: m.id,
    action: "measurement_created",
    newValue: isArea ? `${areaM2?.toFixed(2)} m²` : `${(lengthM).toFixed(3)} m`,
    notes: `${args.type} on page ${args.page}`,
  });
  return m;
}

export async function setMeasurementReviewStatus(
  id: string,
  status: ReviewStatus,
): Promise<void> {
  // load current to capture previous status + jobId
  const { data: prev } = await supabase
    .from("plan_measurements")
    .select("job_id, review_status")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("plan_measurements")
    .update({ review_status: status })
    .eq("id", id);
  if (error) throw error;
  if (prev) {
    await logPlanAudit({
      jobId: prev.job_id as string,
      measurementId: id,
      action: "review_status_changed",
      previousValue: (prev.review_status as string) ?? null,
      newValue: status,
    });
  }
}

export async function deleteMeasurement(id: string): Promise<void> {
  const { data: prev } = await supabase
    .from("plan_measurements")
    .select("job_id, label, calculated_length_m, calculated_area_m2")
    .eq("id", id)
    .maybeSingle();
  // Flag downstream module items BEFORE deletion so we can read measurement_id
  // links from module_items while the row still has audit context.
  if (prev) {
    const { flagDependentModuleItems } = await import("./iq-modules");
    await flagDependentModuleItems({
      jobId: prev.job_id as string,
      measurementId: id,
      reason: "source_deleted",
      notes: `Measurement deleted${prev.label ? ` — ${prev.label}` : ""}`,
    });
  }
  const { error } = await supabase.from("plan_measurements").delete().eq("id", id);
  if (error) throw error;
  if (prev) {
    await logPlanAudit({
      jobId: prev.job_id as string,
      measurementId: id,
      action: "measurement_deleted",
      previousValue: String(prev.calculated_length_m ?? prev.calculated_area_m2 ?? ""),
      notes: (prev.label as string) ?? null,
    });
  }
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
  fileId?: string | null;
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
      file_id: args.fileId ?? null,
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
  const op = data as Opening;
  await logPlanAudit({
    jobId: args.jobId,
    openingId: op.id,
    action: "opening_created",
    newValue: `${op.opening_type} ${op.width_mm}${op.height_mm ? `x${op.height_mm}` : ""}mm`,
  });
  return op;
}

export async function updateOpening(
  id: string,
  patch: Partial<Pick<Opening,
    "opening_type" | "width_mm" | "height_mm" | "room_name" |
    "quantity" | "review_status" | "notes" | "confidence">>,
): Promise<void> {
  // If a value-bearing field changed, flag dependent module items so
  // approved quantities cannot drift unnoticed.
  const valueFields = ["width_mm", "height_mm", "quantity", "opening_type"] as const;
  const valueChanged = valueFields.some((f) => Object.prototype.hasOwnProperty.call(patch, f));
  let prevJobId: string | null = null;
  if (valueChanged) {
    const { data: prev } = await supabase
      .from("opening_schedule").select("job_id").eq("id", id).maybeSingle();
    prevJobId = (prev?.job_id as string | null) ?? null;
  }
  const { error } = await supabase
    .from("opening_schedule")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
  if (valueChanged && prevJobId) {
    const { flagDependentModuleItems } = await import("./iq-modules");
    await flagDependentModuleItems({
      jobId: prevJobId,
      openingId: id,
      reason: "source_edited",
      notes: "Opening dimensions changed",
    });
    await logPlanAudit({
      jobId: prevJobId, openingId: id, action: "opening_updated",
      notes: "dimensions changed",
    });
  }
}

export async function deleteOpening(id: string): Promise<void> {
  const { data: prev } = await supabase
    .from("opening_schedule").select("job_id, opening_type, width_mm").eq("id", id).maybeSingle();
  if (prev) {
    const { flagDependentModuleItems } = await import("./iq-modules");
    await flagDependentModuleItems({
      jobId: prev.job_id as string,
      openingId: id,
      reason: "source_deleted",
      notes: `Opening deleted${prev.opening_type ? ` — ${prev.opening_type} ${prev.width_mm}mm` : ""}`,
    });
    await logPlanAudit({
      jobId: prev.job_id as string, openingId: id, action: "opening_deleted",
    });
  }
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
  measurementId?: string | null;
  openingId?: string | null;
  page?: number | null;
  fileId?: string | null;
  evidence?: string | null;
  /** Inherited from the source measurement/opening. Never auto-promoted. */
  confidence?: string | null;
  /** Optional notes appended to the module item. */
  notes?: string | null;
}): Promise<{ status: "inserted" | "updated" | "conflict"; diffPct?: number }> {
  // Server-side guard: refuse to push from unconfirmed sources, even if the
  // UI fails to disable the action.
  if (args.measurementId) {
    const { data: src } = await supabase
      .from("plan_measurements")
      .select("review_status")
      .eq("id", args.measurementId)
      .maybeSingle();
    if (!src || src.review_status !== "confirmed") {
      throw new Error("Confirm this measurement before pushing to modules.");
    }
  }
  if (args.openingId) {
    const { data: src } = await supabase
      .from("opening_schedule")
      .select("review_status")
      .eq("id", args.openingId)
      .maybeSingle();
    if (!src || src.review_status !== "confirmed") {
      throw new Error("Confirm this opening before pushing to modules.");
    }
  }

  // Inherit confidence from source. Never promote automatically.
  const allowed = new Set(["high", "mid", "low"]);
  const inheritedConfidence = allowed.has(String(args.confidence)) ? String(args.confidence) : "low";

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

  const { data: matching } = await supabase
    .from("module_items")
    .select("id, approved_value, sort_order")
    .eq("run_id", runId)
    .eq("label", args.label)
    .limit(1);
  const existing = matching?.[0];

  // Conflict check: do not silently overwrite an approved value.
  if (existing && existing.approved_value != null && existing.approved_value !== "") {
    const prev = Number(existing.approved_value);
    const diffPct = prev === 0 ? 1 : Math.abs(args.value - prev) / Math.abs(prev);
    if (diffPct > 0.02) {
      await supabase.from("module_items").update({
        extracted_value: String(args.value),
        review_status: "review_required",
        notes:
          `Measured value differs from approved module value. ` +
          `Previous ${prev}, new ${args.value} (Δ${(diffPct * 100).toFixed(1)}%). Review before updating.`,
        data_source: "Measured From Plan",
        source: "calibrated_geometry",
        source_evidence: args.evidence ?? null,
        measurement_id: args.measurementId ?? null,
        opening_id: args.openingId ?? null,
        plan_page_number: args.page ?? null,
        file_id: args.fileId ?? null,
        confidence: inheritedConfidence,
      }).eq("id", existing.id);
      await supabase.from("module_audit_logs").insert({
        job_id: args.jobId, run_id: runId, item_id: existing.id, module_id: args.moduleId,
        user_id: args.createdBy, action: "measurement_push_conflict",
        previous_value: String(prev), new_value: String(args.value),
        notes: `Δ${(diffPct * 100).toFixed(1)}% — review required`,
      });
      await logPlanAudit({
        jobId: args.jobId, measurementId: args.measurementId ?? null,
        openingId: args.openingId ?? null, action: "pushed_to_module",
        previousValue: String(prev), newValue: String(args.value),
        notes: `${args.moduleId} :: ${args.label} — conflict`,
      });
      return { status: "conflict", diffPct };
    }
  }

  if (existing) {
    await supabase.from("module_items").update({
      extracted_value: String(args.value),
      data_source: "Measured From Plan",
      source: "calibrated_geometry",
      source_evidence: args.evidence ?? null,
      measurement_id: args.measurementId ?? null,
      opening_id: args.openingId ?? null,
      plan_page_number: args.page ?? null,
      file_id: args.fileId ?? null,
      basis: args.basis ?? "Measured From Plan",
      unit: args.unit,
      confidence: inheritedConfidence,
      notes: args.notes ?? null,
    }).eq("id", existing.id);
    await supabase.from("module_audit_logs").insert({
      job_id: args.jobId, run_id: runId, item_id: existing.id, module_id: args.moduleId,
      user_id: args.createdBy, action: "measurement_pushed",
      new_value: String(args.value), notes: `${args.label} updated from plan`,
    });
    await logPlanAudit({
      jobId: args.jobId, measurementId: args.measurementId ?? null,
      openingId: args.openingId ?? null, action: "pushed_to_module",
      newValue: String(args.value), notes: `${args.moduleId} :: ${args.label}`,
    });
    return { status: "updated" };
  }

  const { data: tail } = await supabase
    .from("module_items").select("sort_order")
    .eq("run_id", runId).order("sort_order", { ascending: false }).limit(1);
  const nextSort = (tail?.[0]?.sort_order ?? 0) + 1;

  const { error: insErr } = await supabase.from("module_items").insert({
    run_id: runId,
    job_id: args.jobId,
    module_id: args.moduleId,
    label: args.label,
    unit: args.unit,
    extracted_value: String(args.value),
    approved_value: null,
    confidence: inheritedConfidence,
    review_status: "review_required",
    basis: args.basis ?? "Measured From Plan",
    sort_order: nextSort,
    data_source: "Measured From Plan",
    source: "calibrated_geometry",
    source_evidence: args.evidence ?? null,
    measurement_id: args.measurementId ?? null,
    opening_id: args.openingId ?? null,
    plan_page_number: args.page ?? null,
    file_id: args.fileId ?? null,
    notes: args.notes ?? null,
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
  await logPlanAudit({
    jobId: args.jobId, measurementId: args.measurementId ?? null,
    openingId: args.openingId ?? null, action: "pushed_to_module",
    newValue: String(args.value), notes: `${args.moduleId} :: ${args.label}`,
  });
  return { status: "inserted" };
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

/* ---------- Plan-measurement audit log ---------- */

export type PlanAuditAction =
  | "calibration_created"
  | "calibration_updated"
  | "measurement_created"
  | "measurement_updated"
  | "measurement_deleted"
  | "opening_created"
  | "opening_updated"
  | "opening_deleted"
  | "pushed_to_module"
  | "review_status_changed";

export async function logPlanAudit(entry: {
  jobId: string;
  measurementId?: string | null;
  openingId?: string | null;
  calibrationId?: string | null;
  action: PlanAuditAction;
  previousValue?: string | null;
  newValue?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("plan_measurement_audit_logs").insert({
    job_id: entry.jobId,
    measurement_id: entry.measurementId ?? null,
    opening_id: entry.openingId ?? null,
    calibration_id: entry.calibrationId ?? null,
    user_id: u.user.id,
    action: entry.action,
    previous_value: entry.previousValue ?? null,
    new_value: entry.newValue ?? null,
    notes: entry.notes ?? null,
  });
}

/* ---------- Printed quantity persistence (Validation tab) ---------- */

export type PrintedQuantity = {
  id: string;
  job_id: string;
  quantity_type: string;
  unit: string;
  extracted_value: number;
  data_source: string | null;
  source_evidence: string | null;
  plan_page_number: number | null;
  confidence_label: string | null;
  review_status: string;
  notes: string | null;
};

export async function loadPrintedQuantities(
  jobId: string,
): Promise<PrintedQuantity[]> {
  const { data, error } = await supabase
    .from("extracted_quantities")
    .select("*")
    .eq("job_id", jobId)
    .in("data_source", ["Uploaded Plan Text", "Uploaded Specification Text"]);
  if (error) throw error;
  return (data ?? []) as PrintedQuantity[];
}

export async function upsertPrintedQuantity(args: {
  jobId: string;
  quantityType: string;
  unit: string;
  value: number;
  source: "Uploaded Plan Text" | "Uploaded Specification Text";
  evidence?: string | null;
  page?: number | null;
  confidence?: "high" | "mid" | "low";
  confidenceLabel?: "High" | "Medium" | "Low";
}): Promise<void> {
  const conf = args.confidence ?? "mid";
  const confLabel = args.confidenceLabel ?? (conf === "high" ? "High" : conf === "low" ? "Low" : "Medium");
  // Find existing row of same type/source.
  const { data: existing } = await supabase
    .from("extracted_quantities")
    .select("id")
    .eq("job_id", args.jobId)
    .eq("quantity_type", args.quantityType)
    .eq("data_source", args.source)
    .limit(1);
  if (existing && existing[0]) {
    const { error } = await supabase
      .from("extracted_quantities")
      .update({
        extracted_value: args.value,
        unit: args.unit,
        source_evidence: args.evidence ?? null,
        plan_page_number: args.page ?? null,
        confidence: conf,
        confidence_label: confLabel,
      })
      .eq("id", existing[0].id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("extracted_quantities").insert({
    job_id: args.jobId,
    quantity_type: args.quantityType,
    unit: args.unit,
    extracted_value: args.value,
    confidence: conf,
    review_status: "review_required",
    data_source: args.source,
    source_evidence: args.evidence ?? null,
    plan_page_number: args.page ?? null,
    confidence_label: confLabel,
  });
  if (error) throw error;
}