/**
 * IQ Modules — Supabase-backed quantity packages.
 *
 * Each job has a `module_run` per module and a list of `module_items` per
 * run. Item-level edits and approvals persist to Supabase and write to
 * `module_audit_logs`. IQ Core continues to use `extracted_quantities` for
 * its editable quantities; we maintain a `module_runs` row for it so the
 * Job Detail overview is consistent.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Confidence } from "./jennian-data";

export type IQModuleId =
  | "iq-core"
  | "iq-electrical"
  | "iq-plumbing"
  | "iq-linings"
  | "iq-framing"
  | "iq-cladding"
  | "iq-roofing"
  | "iq-margin"
  | "iq-procurement";

export type ModuleRunStatus = "not_started" | "in_progress" | "reviewed" | "approved";
export type ItemReviewStatus = "review_required" | "confirmed" | "excluded";

export type IQItemTemplate = {
  key: string;
  description: string;
  unit: string;
  /** Range (min,max) used to seed deterministic dummy values. */
  range: [number, number];
  decimals?: number;
  basis?: string;
};

export type IQModule = {
  id: IQModuleId;
  name: string;
  shortDescription: string;
  longDescription: string;
  exportSheet: string;
  required: boolean;
  items: IQItemTemplate[];
};

export type ModuleRun = {
  id: string;
  job_id: string;
  module_id: IQModuleId;
  module_name: string;
  status: ModuleRunStatus;
  review_status: string;
  required: boolean;
  confidence_avg: number | null;
  item_count: number;
  last_run_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

export type ModuleItem = {
  id: string;
  run_id: string;
  job_id: string;
  module_id: IQModuleId;
  label: string;
  description: string | null;
  unit: string | null;
  extracted_value: string | null;
  approved_value: string | null;
  confidence: Confidence | null;
  review_status: ItemReviewStatus;
  notes: string | null;
  basis: string | null;
  sort_order: number;
  updated_at: string;
};

export type ModuleAuditLog = {
  id: string;
  job_id: string;
  run_id: string | null;
  item_id: string | null;
  module_id: string | null;
  user_id: string | null;
  action: string;
  previous_value: string | null;
  new_value: string | null;
  notes: string | null;
  created_at: string;
};

/** ---------- Module catalogue ---------- */

export const IQ_MODULES: IQModule[] = [
  {
    id: "iq-core", name: "IQ Core",
    shortDescription: "Architectural quantity review.",
    longDescription: "Core architectural geometry — areas, perimeters, schedules and pitches that drive every downstream trade package.",
    exportSheet: "Core", required: true,
    items: [
      { key: "house_area", description: "House Area", unit: "m²", range: [110, 240], decimals: 2 },
      { key: "foundation_area", description: "Foundation Area", unit: "m²", range: [115, 250], decimals: 2 },
      { key: "roof_area", description: "Roof Area", unit: "m²", range: [130, 280], decimals: 2 },
      { key: "roof_pitch", description: "Roof Pitch", unit: "°", range: [15, 35] },
      { key: "external_perimeter", description: "External Perimeter", unit: "lm", range: [40, 95], decimals: 2 },
      { key: "internal_wall_length", description: "Internal Wall Length", unit: "lm", range: [45, 120], decimals: 2 },
      { key: "garage_area", description: "Garage Area", unit: "m²", range: [18, 42], decimals: 2 },
      { key: "living_area", description: "Living Area", unit: "m²", range: [85, 200], decimals: 2 },
    ],
  },
  {
    id: "iq-electrical", name: "IQ Electrical",
    shortDescription: "Electrical points, lighting and appliance schedule.",
    longDescription: "Electrical takeoff for power, lighting, low-voltage and appliance points. Early-stage allowances until a marked-up electrical plan is available.",
    exportSheet: "Electrical", required: false,
    items: [
      { key: "single_power", description: "Single Power Points", unit: "qty", range: [4, 14], basis: "Appliance-specific allowance" },
      { key: "double_power", description: "Double Power Points", unit: "qty", range: [18, 48], basis: "Room-based allowance" },
      { key: "switches", description: "Switches", unit: "qty", range: [12, 32], basis: "Room-based allowance" },
      { key: "downlights", description: "Downlights", unit: "qty", range: [22, 60], basis: "Room-based allowance" },
      { key: "exterior_lights", description: "Exterior Lights", unit: "qty", range: [4, 12], basis: "Specification allowance" },
      { key: "smoke_detectors", description: "Smoke Detectors", unit: "qty", range: [2, 6], basis: "1 per bedroom + hallway + living" },
      { key: "extractor_fans", description: "Extractor Fans", unit: "qty", range: [1, 4], basis: "1 per bathroom, ensuite, laundry" },
      { key: "cat6_points", description: "Data Points (CAT6)", unit: "qty", range: [2, 8], basis: "Specification allowance" },
      { key: "tv_points", description: "TV Points", unit: "qty", range: [1, 5], basis: "Specification allowance" },
      { key: "exterior_pp", description: "Exterior Power Points", unit: "qty", range: [2, 5], basis: "Specification allowance" },
      { key: "appliance_outlets", description: "Kitchen Appliance Outlets", unit: "qty", range: [4, 10], basis: "Selected kitchen appliances" },
      { key: "garage_motor", description: "Garage Door Outlet", unit: "qty", range: [1, 2], basis: "1 per motorised garage door" },
    ],
  },
  {
    id: "iq-plumbing", name: "IQ Plumbing",
    shortDescription: "Fixture and plumbing schedule.",
    longDescription: "Fixture schedule across kitchen, bathroom, laundry and exterior — feeds the plumbing supplier RFQ.",
    exportSheet: "Plumbing", required: false,
    items: [
      { key: "toilets", description: "Toilets", unit: "qty", range: [1, 4] },
      { key: "vanities", description: "Vanities", unit: "qty", range: [1, 4] },
      { key: "showers", description: "Showers", unit: "qty", range: [1, 3] },
      { key: "baths", description: "Baths", unit: "qty", range: [0, 2] },
      { key: "mixers", description: "Mixers", unit: "qty", range: [4, 10] },
      { key: "towel_rails", description: "Heated Towel Rails", unit: "qty", range: [1, 4] },
      { key: "hot_water_cyl", description: "Hot Water Cylinders", unit: "qty", range: [1, 2] },
      { key: "exterior_taps", description: "Exterior Taps", unit: "qty", range: [2, 5] },
      { key: "kitchen_fixtures", description: "Kitchen Fixtures", unit: "qty", range: [3, 8] },
      { key: "laundry_fixtures", description: "Laundry Fixtures", unit: "qty", range: [2, 5] },
    ],
  },
  {
    id: "iq-linings", name: "IQ Linings",
    shortDescription: "Interior linings and trim.",
    longDescription: "GIB, Aqualine, Hardiegroove, ply and finishing trim across all interior surfaces.",
    exportSheet: "Linings", required: true,
    items: [
      { key: "std_gib_walls", description: "Standard Gib — Walls", unit: "m²", range: [180, 360], decimals: 2 },
      { key: "aqualine_walls", description: "Aqualine — Walls", unit: "m²", range: [25, 70], decimals: 2 },
      { key: "std_ceilings", description: "Standard Ceilings", unit: "m²", range: [110, 220], decimals: 2 },
      { key: "aqualine_ceilings", description: "Aqualine — Ceilings", unit: "m²", range: [8, 30], decimals: 2 },
      { key: "garage_ply", description: "Garage Ply", unit: "m²", range: [40, 90], decimals: 2 },
      { key: "scotia", description: "Scotia", unit: "lm", range: [55, 120], decimals: 2 },
      { key: "skirting", description: "Skirting", unit: "lm", range: [65, 145], decimals: 2 },
      { key: "architraves", description: "Architraves", unit: "lm", range: [80, 180], decimals: 2 },
    ],
  },
  {
    id: "iq-framing", name: "IQ Framing",
    shortDescription: "Framing quantity schedule.",
    longDescription: "Wall framing, openings, lintels, studs and noggings ready for the timber supplier RFQ.",
    exportSheet: "Framing", required: true,
    items: [
      { key: "ext_walls", description: "External Walls", unit: "lm", range: [40, 95], decimals: 2 },
      { key: "int_walls", description: "Internal Walls", unit: "lm", range: [45, 120], decimals: 2 },
      { key: "openings", description: "Openings", unit: "qty", range: [16, 38] },
      { key: "lintels", description: "Lintels", unit: "qty", range: [10, 26] },
      { key: "stud_count", description: "Stud Count", unit: "qty", range: [180, 420] },
      { key: "noggings", description: "Noggings", unit: "lm", range: [120, 280], decimals: 2 },
      { key: "tile_shower_dwangs", description: "Tile Shower Dwangs", unit: "qty", range: [4, 14] },
    ],
  },
  {
    id: "iq-cladding", name: "IQ Cladding",
    shortDescription: "Cladding and brick quantity schedule.",
    longDescription: "Brick, weatherboard and feature cladding — areas, lineal metres, flashings, sills and corners.",
    exportSheet: "Cladding", required: true,
    items: [
      { key: "brick_area", description: "Brick Area", unit: "m²", range: [60, 160], decimals: 2 },
      { key: "brick_lineal", description: "Brick Lineal Metres", unit: "lm", range: [22, 60], decimals: 2 },
      { key: "cladding_area", description: "Cladding Area", unit: "m²", range: [40, 120], decimals: 2 },
      { key: "feature_cladding", description: "Feature Cladding", unit: "m²", range: [4, 28], decimals: 2 },
      { key: "flashings", description: "Flashings", unit: "lm", range: [25, 70], decimals: 2 },
      { key: "sills", description: "Sills", unit: "lm", range: [10, 28], decimals: 2 },
      { key: "corners", description: "Corners", unit: "qty", range: [4, 12] },
    ],
  },
  {
    id: "iq-roofing", name: "IQ Roofing",
    shortDescription: "Roofing quantity schedule.",
    longDescription: "Roof areas, ridges, hips, valleys, fascia, spouting and downpipes for the roofing RFQ.",
    exportSheet: "Roofing", required: true,
    items: [
      { key: "roof_area", description: "Roof Area", unit: "m²", range: [130, 280], decimals: 2 },
      { key: "pitch", description: "Pitch", unit: "°", range: [15, 35] },
      { key: "valleys", description: "Valleys", unit: "lm", range: [0, 14], decimals: 2 },
      { key: "ridges", description: "Ridges", unit: "lm", range: [10, 32], decimals: 2 },
      { key: "hips", description: "Hips", unit: "lm", range: [0, 22], decimals: 2 },
      { key: "gutters", description: "Gutters", unit: "lm", range: [40, 95], decimals: 2 },
      { key: "fascia", description: "Fascia", unit: "lm", range: [40, 95], decimals: 2 },
      { key: "spouting", description: "Spouting", unit: "lm", range: [40, 95], decimals: 2 },
      { key: "downpipes", description: "Downpipes", unit: "qty", range: [3, 8] },
    ],
  },
  {
    id: "iq-margin", name: "IQ Margin",
    shortDescription: "Pre-unconditional risk review.",
    longDescription: "Surfaces missing scope, hidden assumptions and spec gaps before the contract goes unconditional.",
    exportSheet: "Margin", required: false,
    items: [
      { key: "missing_retaining", description: "Missing Retaining", unit: "flag", range: [0, 1] },
      { key: "earthworks_risk", description: "Earthworks Risk", unit: "flag", range: [0, 1] },
      { key: "landscaping_assump", description: "Landscaping Assumptions", unit: "flag", range: [0, 1] },
      { key: "long_driveway", description: "Long Driveway", unit: "flag", range: [0, 1] },
      { key: "missing_drainage", description: "Missing Drainage", unit: "flag", range: [0, 1] },
      { key: "joinery_mismatch", description: "Joinery Allowance Mismatch", unit: "flag", range: [0, 1] },
      { key: "spec_creep", description: "Specification Gap", unit: "flag", range: [0, 1] },
      { key: "scope_gaps", description: "Scope Gaps", unit: "flag", range: [0, 1] },
    ],
  },
  {
    id: "iq-procurement", name: "IQ Procurement",
    shortDescription: "Supplier-ready RFQ packages.",
    longDescription: "Packages approved quantities into RFQs and purchase orders against the preferred supplier list.",
    exportSheet: "Procurement", required: false,
    items: [
      { key: "rfq_summaries", description: "RFQ Summaries", unit: "qty", range: [4, 9] },
      { key: "po_quantities", description: "Purchase Order Quantities", unit: "qty", range: [60, 220] },
      { key: "supplier_codes", description: "Supplier Codes", unit: "qty", range: [80, 280] },
    ],
  },
];

export function findIQModule(id: string): IQModule | undefined {
  return IQ_MODULES.find((m) => m.id === id);
}

export const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "Ready for Review",
  reviewed: "Reviewed",
  approved: "Approved",
  // legacy aliases
  ready: "Ready",
  in_review: "In Review",
};

export const REVIEW_STATUS_LABEL: Record<ItemReviewStatus, string> = {
  review_required: "Review Required",
  confirmed: "Confirmed",
  excluded: "Excluded",
};

/* Dummy seeders removed. Module items are now created only from real
 * sources (Measured From Plan, Uploaded Plan/Spec Text, Template Allowance,
 * User Override). See pushMeasurementToModule and the printed-value flow. */

/** ---------- Audit helper ---------- */

async function logAudit(entry: {
  job_id: string;
  run_id?: string | null;
  item_id?: string | null;
  module_id?: string | null;
  action: string;
  previous_value?: string | null;
  new_value?: string | null;
  notes?: string | null;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("module_audit_logs").insert({
    job_id: entry.job_id,
    run_id: entry.run_id ?? null,
    item_id: entry.item_id ?? null,
    module_id: entry.module_id ?? null,
    user_id: u.user.id,
    action: entry.action,
    previous_value: entry.previous_value ?? null,
    new_value: entry.new_value ?? null,
    notes: entry.notes ?? null,
  });
}

/** ---------- Seed ---------- */

/**
 * Idempotent. For any module without a run row, create the run + dummy items.
 * IQ Core gets a run row only (its items live in `extracted_quantities`).
 */
export async function seedAllModulesForJob(jobId: string): Promise<void> {
  const { data: existing, error } = await supabase
    .from("module_runs").select("module_id").eq("job_id", jobId);
  if (error) throw error;
  const have = new Set((existing ?? []).map((r) => r.module_id));
  const now = new Date().toISOString();

  for (const mod of IQ_MODULES) {
    if (have.has(mod.id)) continue;
    const { error: runErr } = await supabase
      .from("module_runs")
      .insert({
        job_id: jobId,
        module_id: mod.id,
        module_name: mod.name,
        status: "not_started",
        review_status: "review_required",
        required: mod.required,
        last_run_at: now,
        item_count: 0,
        confidence_avg: null,
      })
      .select()
      .single();
    if (runErr) throw runErr;
    // No fake module_items are seeded. Items appear only when a real
    // source (measurement, parsed plan/spec text, allowance, override)
    // is pushed in.
  }
}

/** ---------- Reads ---------- */

export async function loadModuleRuns(jobId: string): Promise<ModuleRun[]> {
  const { data, error } = await supabase
    .from("module_runs").select("*").eq("job_id", jobId);
  if (error) throw error;
  return (data ?? []) as unknown as ModuleRun[];
}

export async function loadModuleRun(
  jobId: string,
  moduleId: IQModuleId,
): Promise<{ run: ModuleRun | null; items: ModuleItem[] }> {
  const { data: run, error: rErr } = await supabase
    .from("module_runs").select("*")
    .eq("job_id", jobId).eq("module_id", moduleId).maybeSingle();
  if (rErr) throw rErr;
  if (!run) return { run: null, items: [] };
  const { data: items, error: iErr } = await supabase
    .from("module_items").select("*")
    .eq("run_id", (run as { id: string }).id)
    .order("sort_order", { ascending: true });
  if (iErr) throw iErr;
  return { run: run as unknown as ModuleRun, items: (items ?? []) as unknown as ModuleItem[] };
}

export async function loadModuleAudit(jobId: string, runId?: string, limit = 20): Promise<ModuleAuditLog[]> {
  let q = supabase.from("module_audit_logs").select("*").eq("job_id", jobId);
  if (runId) q = q.eq("run_id", runId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ModuleAuditLog[];
}

/** ---------- Aggregation ---------- */

async function recomputeRunAggregates(runId: string): Promise<void> {
  const { data: items } = await supabase.from("module_items").select("confidence").eq("run_id", runId);
  const list = items ?? [];
  const highs = list.filter((i) => i.confidence === "high").length;
  const conf = list.length ? Math.round((highs / list.length) * 100) : 0;
  await supabase.from("module_runs").update({
    confidence_avg: conf,
    item_count: list.length,
  }).eq("id", runId);
}

export function confidencePercent(items: Array<{ confidence: Confidence | null }>): number {
  if (!items.length) return 0;
  const highs = items.filter((i) => i.confidence === "high").length;
  return Math.round((highs / items.length) * 100);
}

/** ---------- Item edits ---------- */

export type ItemPatch = Partial<{
  approved_value: string;
  notes: string;
  review_status: ItemReviewStatus;
  confidence: Confidence;
}>;

export async function updateModuleItem(
  jobId: string,
  item: ModuleItem,
  patch: ItemPatch,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.from("module_items").update(patch).eq("id", item.id);
  if (error) throw error;
  // Log meaningful changes
  if (patch.approved_value !== undefined && patch.approved_value !== item.approved_value) {
    await logAudit({
      job_id: jobId, run_id: item.run_id, item_id: item.id, module_id: item.module_id,
      action: "edit_quantity",
      previous_value: item.approved_value,
      new_value: patch.approved_value,
      notes: reason ?? null,
    });
  }
  if (patch.review_status && patch.review_status !== item.review_status) {
    await logAudit({
      job_id: jobId, run_id: item.run_id, item_id: item.id, module_id: item.module_id,
      action: "set_review_status",
      previous_value: item.review_status,
      new_value: patch.review_status,
    });
  }
  if (patch.notes !== undefined && patch.notes !== item.notes) {
    await logAudit({
      job_id: jobId, run_id: item.run_id, item_id: item.id, module_id: item.module_id,
      action: "edit_notes",
      previous_value: item.notes,
      new_value: patch.notes,
    });
  }
  await recomputeRunAggregates(item.run_id);
}

/** ---------- Module-level actions ---------- */

export async function markModuleReviewed(jobId: string, moduleId: IQModuleId): Promise<void> {
  const { data: run } = await supabase.from("module_runs").select("id,status").eq("job_id", jobId).eq("module_id", moduleId).maybeSingle();
  if (!run) return;
  await supabase.from("module_runs").update({ status: "reviewed", review_status: "reviewed" }).eq("id", run.id);
  await logAudit({
    job_id: jobId, run_id: run.id, module_id: moduleId,
    action: "mark_reviewed",
    previous_value: run.status,
    new_value: "reviewed",
  });
}

export async function approveModule(jobId: string, moduleId: IQModuleId): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in.");
  const { data: run } = await supabase.from("module_runs").select("id,status").eq("job_id", jobId).eq("module_id", moduleId).maybeSingle();
  if (!run) return;
  await supabase.from("module_runs").update({
    status: "approved",
    review_status: "approved",
    approved_by: u.user.id,
    approved_at: new Date().toISOString(),
  }).eq("id", run.id);
  await logAudit({
    job_id: jobId, run_id: run.id, module_id: moduleId,
    action: "approve_module",
    previous_value: run.status,
    new_value: "approved",
  });
}

export async function recalculateModule(jobId: string, moduleId: IQModuleId): Promise<void> {
  const mod = findIQModule(moduleId);
  if (!mod || mod.id === "iq-core") return;
  const { data: run } = await supabase.from("module_runs").select("id").eq("job_id", jobId).eq("module_id", moduleId).maybeSingle();
  if (!run) return;
  // Real recalculation will reconcile module_items against measurements,
  // openings, and parsed plan/spec values. For now, just bump the run.
  const now = new Date().toISOString();
  await supabase.from("module_runs").update({
    last_run_at: now,
    status: "in_progress",
    review_status: "review_required",
    approved_by: null,
    approved_at: null,
  }).eq("id", run.id);
  await recomputeRunAggregates(run.id);
  await logAudit({
    job_id: jobId, run_id: run.id, module_id: moduleId,
    action: "recalculate_module",
    new_value: now,
  });
}

/** ---------- Roll-up ---------- */

export type JobModuleRollup = {
  total: number;
  required: number;
  requiredApproved: number;
  approvedAll: number;
  reviewedAll: number;
  inProgressAll: number;
  allRequiredApproved: boolean;
  anyInReview: boolean;
};

export async function calculateJobModuleRollup(jobId: string): Promise<JobModuleRollup> {
  const runs = await loadModuleRuns(jobId);
  const required = runs.filter((r) => r.required);
  const requiredApproved = required.filter((r) => r.status === "approved").length;
  const approvedAll = runs.filter((r) => r.status === "approved").length;
  const reviewedAll = runs.filter((r) => r.status === "reviewed").length;
  const inProgressAll = runs.filter((r) => r.status === "in_progress").length;
  return {
    total: runs.length,
    required: required.length,
    requiredApproved,
    approvedAll,
    reviewedAll,
    inProgressAll,
    allRequiredApproved: required.length > 0 && requiredApproved === required.length,
    anyInReview: inProgressAll > 0 || reviewedAll > 0,
  };
}

/** ---------- CSV export ---------- */

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type JobMeta = { id: string; job_number: string; client_name: string; address: string };

export async function exportModuleCsv(job: JobMeta, moduleId: IQModuleId): Promise<void> {
  const mod = findIQModule(moduleId);
  if (!mod) throw new Error("Unknown module.");
  const { data: u } = await supabase.auth.getUser();

  const { items } = await loadModuleRun(job.id, moduleId);
  const headers = [
    "Job Number","Client","Address","Module","Item","Description","Unit",
    "Extracted Quantity","Confirmed Quantity","Confidence","Review Status","Notes",
  ];
  const rows = items.map((i) => [
    job.job_number, job.client_name, job.address, mod.name,
    i.label, i.description, i.unit,
    i.extracted_value, i.approved_value, i.confidence,
    REVIEW_STATUS_LABEL[i.review_status],
    i.notes ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${job.job_number}-${moduleId}.csv`; a.click();
  URL.revokeObjectURL(url);

  if (u.user) {
    await supabase.from("export_logs").insert({
      job_id: job.id,
      exported_by: u.user.id,
      export_type: "csv",
      module_id: moduleId,
      module_name: mod.name,
    });
    await logAudit({ job_id: job.id, module_id: moduleId, action: "export_module_csv" });
  }
}

export async function exportApprovedQuantitiesCsv(job: JobMeta): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  // All approved items across modules
  const { data: items } = await supabase
    .from("module_items").select("*").eq("job_id", job.id);
  // IQ Core from extracted_quantities
  const { data: core } = await supabase
    .from("extracted_quantities").select("*").eq("job_id", job.id);

  const headers = [
    "Job Number","Client","Address","Module","Item","Unit",
    "Confirmed Quantity","Confidence","Review Status","Notes",
  ];
  const rows: (string | number | null)[][] = [];
  for (const c of (core ?? [])) {
    rows.push([
      job.job_number, job.client_name, job.address, "IQ Core",
      c.quantity_type, c.unit,
      c.approved_value ?? c.extracted_value, c.confidence,
      "Approved", c.notes ?? "",
    ]);
  }
  for (const it of (items ?? [])) {
    if (it.review_status === "excluded") continue;
    const mod = findIQModule(it.module_id as IQModuleId);
    rows.push([
      job.job_number, job.client_name, job.address, mod?.name ?? it.module_id,
      it.label, it.unit,
      it.approved_value, it.confidence,
      REVIEW_STATUS_LABEL[it.review_status as ItemReviewStatus] ?? it.review_status,
      it.notes ?? "",
    ]);
  }
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${job.job_number}-approved-quantities.csv`; a.click();
  URL.revokeObjectURL(url);

  if (u.user) {
    await supabase.from("export_logs").insert({
      job_id: job.id, exported_by: u.user.id, export_type: "csv",
      module_id: "all", module_name: "Approved Quantities",
    });
    await logAudit({ job_id: job.id, action: "export_approved_quantities" });
  }
}

/* ---------- Legacy compat (to be removed after route refactor lands) ---------- */
/* Keeps existing /modules, /modules/$moduleId, /review, /upload compiling
   until they are migrated to the Supabase-backed API above. */

/**
 * Backwards-compatible status union.
 * Supports both the new Supabase-backed `ModuleRunStatus` values and
 * legacy values referenced throughout the existing UI.
 */
export type IQModuleStatus =
  | "not_started"
  | "draft"
  | "uploaded"
  | "extracted"
  | "in_progress"
  | "ready"
  | "in_review"
  | "ready_for_review"
  | "review_required"
  | "reviewed"
  | "approved"
  | "exported"
  | "not_required";

/** Human-readable label for any supported status value. */
export function statusLabel(status: IQModuleStatus | string): string {
  const map: Record<string, string> = {
    not_started: "Not Started",
    draft: "Draft",
    uploaded: "Uploaded",
    extracted: "Extracted",
    in_progress: "Ready for Review",
    ready: "Ready",
    in_review: "In Review",
    ready_for_review: "Ready for Review",
    review_required: "Review Required",
    reviewed: "Reviewed",
    approved: "Approved",
    exported: "Exported",
    not_required: "Not Required",
  };
  return map[status] ?? status;
}

/** Tailwind class set for a status badge. */
export function statusBadgeClass(status: IQModuleStatus | string): string {
  switch (status) {
    case "approved":
    case "exported":
    case "ready":
    case "ready_for_review":
      return "bg-confidence-high-bg text-confidence-high border-transparent";
    case "reviewed":
      return "bg-primary/10 text-primary border-transparent";
    case "in_review":
    case "review_required":
    case "in_progress":
      return "bg-confidence-mid-bg text-confidence-mid border-transparent";
    case "not_started":
    case "draft":
    case "uploaded":
    case "extracted":
    case "not_required":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
export type ReviewStatus = ItemReviewStatus;

export type IQItem = {
  key: string;
  description: string;
  unit: string;
  extractedQuantity: number;
  finalQuantity: number;
  confidence: Confidence;
  notes: string;
  approved: boolean;
};

export function buildIQItems(jobKey: string, mod: IQModule): IQItem[] {
  return mod.items.map((t) => {
    const seed = hash(`${jobKey}::${mod.id}::${t.key}`);
    const value = dummyValue(t, seed);
    return {
      key: t.key, description: t.description, unit: t.unit,
      extractedQuantity: value, finalQuantity: value,
      confidence: pickConfidence(seed), notes: "", approved: false,
    };
  });
}

// Legacy localStorage helpers (loadModuleState/saveModuleState/
// runDummyExtraction/electrical allowance) were removed. All module state
// lives in Supabase via module_runs / module_items / module_audit_logs.
