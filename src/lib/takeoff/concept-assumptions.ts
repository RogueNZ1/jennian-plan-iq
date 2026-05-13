/**
 * Jennian standard assumptions for concept-mode jobs.
 *
 * When plan_type = 'concept', the takeoff engine calls applyConceptAssumptions()
 * after the normal text extraction. It reads what was already extracted and fills
 * in any missing items using these standard allowances, marking them clearly as
 * value_source = 'assumed' and confidence = 'low'.
 *
 * Each assumed item has its description set to "[ASSUMED — Jennian standard]"
 * so it is visually distinct in the review UI and QS export.
 */

import { supabase } from "@/integrations/supabase/client";

export type ConceptAssumptionContext = {
  jobId: string;
  runId: string;
  /** Floor area in m², null if not extracted */
  floorAreaM2: number | null;
  /** Existing module_item labels already inserted by the takeoff engine */
  existingLabels: Set<string>;
};

export type AssumptionResult = {
  inserted: number;
  skipped: number;
  confidenceScore: number;
};

const ASSUMED_BASIS = "[ASSUMED — Jennian standard]";

type AssumptionSpec = {
  moduleId: string;
  label: string;
  /** Value or a factory that receives floor area (defaults to null if factory returns null) */
  value: string | ((floorM2: number) => string | null);
  unit: string | null;
  description: string;
  sortOrder: number;
};

/** Returns the full list of Jennian standard assumptions. */
function buildAssumptions(floorM2: number): AssumptionSpec[] {
  return [
    // ── Windows (bedroom / bathroom defaults) ───────────────────────────────
    { moduleId: "iq-core", label: "Window — Bed 1 (assumed)", value: "1300x1000", unit: "mm H×W", description: "3× bedroom window default", sortOrder: 100 },
    { moduleId: "iq-core", label: "Window — Bed 2 (assumed)", value: "1200x1000", unit: "mm H×W", description: "Standard bedroom window", sortOrder: 101 },
    { moduleId: "iq-core", label: "Window — Bed 3 (assumed)", value: "1200x1000", unit: "mm H×W", description: "Standard bedroom window", sortOrder: 102 },
    { moduleId: "iq-core", label: "Window — Bathroom (assumed)", value: "600x900", unit: "mm H×W", description: "600×900 obscure glass", sortOrder: 103 },
    { moduleId: "iq-core", label: "Window — Living (assumed)", value: (_m) => `${Math.round(_m * 0.6 * 100) / 100}m wide`, unit: "approx. W", description: "2/3 of room width estimate", sortOrder: 104 },
    // ── Doors ───────────────────────────────────────────────────────────────
    { moduleId: "iq-core", label: "Door — Entry (assumed)", value: "1200", unit: "mm W", description: "Jennian standard entry door", sortOrder: 110 },
    { moduleId: "iq-core", label: "Door — Passage (assumed)", value: "810", unit: "mm W", description: "Standard passage door", sortOrder: 111 },
    { moduleId: "iq-core", label: "Door — WC / Laundry (assumed)", value: "760", unit: "mm W", description: "Compact internal door", sortOrder: 112 },
    // ── Foundation ──────────────────────────────────────────────────────────
    { moduleId: "iq-framing", label: "Foundation — Raft slab (assumed)", value: (_m) => String(Math.round(_m * 0.13)), unit: "m³", description: "130 L/m² concrete allowance", sortOrder: 200 },
    // ── Insulation ──────────────────────────────────────────────────────────
    { moduleId: "iq-linings", label: "Insulation — Floor (assumed)", value: (_m) => String(Math.round(_m)), unit: "m²", description: "Full floor area insulation", sortOrder: 300 },
    { moduleId: "iq-linings", label: "Insulation — Ceiling (assumed)", value: (_m) => String(Math.round(_m)), unit: "m²", description: "Full ceiling area insulation", sortOrder: 301 },
    // ── Electrical ──────────────────────────────────────────────────────────
    { moduleId: "iq-electrical", label: "Electrical — Standard allowance (assumed)", value: (_m) => String(Math.round(_m * 85)), unit: "NZD", description: "$85/m² Jennian electrical budget", sortOrder: 400 },
    // ── Plumbing ────────────────────────────────────────────────────────────
    { moduleId: "iq-plumbing", label: "Plumbing — Hot water cylinder (assumed)", value: "180", unit: "L", description: "Jennian standard HWC", sortOrder: 500 },
    { moduleId: "iq-plumbing", label: "Plumbing — Shower (assumed)", value: "1", unit: "ea", description: "1 shower per bathroom", sortOrder: 501 },
    { moduleId: "iq-plumbing", label: "Plumbing — Bath (assumed)", value: "1", unit: "ea", description: "Standard bath allowance", sortOrder: 502 },
    { moduleId: "iq-plumbing", label: "Plumbing — WC (assumed)", value: "2", unit: "ea", description: "2 WC standard", sortOrder: 503 },
    // ── Roofing ─────────────────────────────────────────────────────────────
    { moduleId: "iq-roofing", label: "Roofing — Coverage area (assumed)", value: (_m) => String(Math.round(_m * 1.1)), unit: "m²", description: "Floor area × 1.1 coverage factor", sortOrder: 600 },
    { moduleId: "iq-roofing", label: "Roofing — Ridge length (assumed)", value: (_m) => String(Math.round(Math.sqrt(_m) * 0.5)), unit: "lm", description: "Estimated from floor area", sortOrder: 601 },
    { moduleId: "iq-roofing", label: "Roofing — Eaves (assumed)", value: (_m) => String(Math.round(Math.sqrt(_m) * 3)), unit: "lm", description: "Perimeter estimate", sortOrder: 602 },
    // ── Cladding ────────────────────────────────────────────────────────────
    { moduleId: "iq-cladding", label: "Cladding area (assumed)", value: (_m) => String(Math.round(_m * 1.2)), unit: "m²", description: "Floor × 1.2 wall area estimate", sortOrder: 700 },
  ];
}

/**
 * Inserts Jennian standard assumption items for a concept-mode job.
 * Skips any label that already has an item in the run (was extracted from plans).
 * Returns confidence score = extracted / (extracted + assumed) × 100.
 */
export async function applyConceptAssumptions(
  ctx: ConceptAssumptionContext,
): Promise<AssumptionResult> {
  const floorM2 = ctx.floorAreaM2 ?? 120; // sensible default if not extracted
  const specs = buildAssumptions(floorM2);

  // Filter to only those not already extracted
  const toInsert = specs.filter((s) => !ctx.existingLabels.has(s.label));
  const skipped = specs.length - toInsert.length;

  if (toInsert.length === 0) {
    const score = Math.round((ctx.existingLabels.size / (ctx.existingLabels.size + 1)) * 100);
    return { inserted: 0, skipped, confidenceScore: Math.min(score, 95) };
  }

  const rows = toInsert.map((s) => {
    const rawValue = typeof s.value === "function" ? s.value(floorM2) : s.value;
    return {
      job_id: ctx.jobId,
      run_id: ctx.runId,
      module_id: s.moduleId,
      label: s.label,
      extracted_value: rawValue ?? "—",
      confidence: "low",
      basis: ASSUMED_BASIS,
      description: s.description,
      unit: s.unit,
      sort_order: s.sortOrder,
      value_source: "assumed",
      review_status: "review_required",
      source: "ai_inferred",
    };
  });

  const { error } = await supabase.from("module_items").insert(rows);
  if (error) {
    console.warn("concept-assumptions insert error:", error.message);
  }

  const totalExtracted = ctx.existingLabels.size;
  const totalAssumed = toInsert.length;
  const confidenceScore = totalExtracted + totalAssumed > 0
    ? Math.round((totalExtracted / (totalExtracted + totalAssumed)) * 100)
    : 0;

  return {
    inserted: toInsert.length,
    skipped,
    confidenceScore,
  };
}
