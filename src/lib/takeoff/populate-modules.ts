/**
 * Phase A — populate draft module_items from source-backed extracted
 * quantities and openings. Never confirms anything. Never overwrites
 * approved values. Only inserts rows when there is real source data.
 */
import { supabase } from "@/integrations/supabase/client";
import type { IQModuleId } from "@/lib/iq-modules";
import type { ExtractedQty } from "./extract-quantities";
import type { ExtractedOpening } from "./extract-openings";

type ModuleDraft = {
  moduleId: IQModuleId;
  label: string;
  unit: string;
  value: number;
  dataSource: string;
  evidence: string;
  confidence: "high" | "mid" | "low";
  page: number | null;
  fileId: string | null;
};

function quantityToDrafts(q: ExtractedQty): ModuleDraft[] {
  const base = {
    dataSource: q.dataSource,
    evidence: q.evidence,
    confidence: q.confidence,
    page: q.page,
    fileId: q.fileId,
  };
  const drafts: ModuleDraft[] = [];
  switch (q.kind) {
    case "external_perimeter":
      drafts.push({ ...base, moduleId: "iq-cladding", label: "External Perimeter", unit: "lm", value: q.value });
      drafts.push({ ...base, moduleId: "iq-framing",  label: "External Walls",      unit: "lm", value: q.value });
      break;
    case "internal_wall_length":
      drafts.push({ ...base, moduleId: "iq-framing", label: "Internal Walls",        unit: "lm", value: q.value });
      drafts.push({ ...base, moduleId: "iq-linings", label: "Internal Wall Length",  unit: "lm", value: q.value });
      break;
    case "cladding_area":
      drafts.push({ ...base, moduleId: "iq-cladding", label: "Cladding Area", unit: "m²", value: q.value });
      break;
    case "roof_pitch":
      drafts.push({ ...base, moduleId: "iq-roofing", label: "Pitch", unit: "°", value: q.value });
      break;
    case "coverage_area":
      drafts.push({ ...base, moduleId: "iq-roofing", label: "Coverage Area", unit: "m²", value: q.value });
      break;
    case "garage_door_size":
      // Width-only into cladding as a flagged garage opening.
      drafts.push({ ...base, moduleId: "iq-cladding", label: "Garage Door Opening", unit: "mm", value: q.value });
      break;
    default:
      // Areas (area_over_frame, total_floor_area, garage_area, living_area, porch_area)
      // belong on IQ Core (extracted_quantities) and are not duplicated here.
      break;
  }
  return drafts;
}

function openingsToDrafts(all: ExtractedOpening[]): ModuleDraft[] {
  if (all.length === 0) return [];
  const totalCount = all.reduce((s, o) => s + o.quantity, 0);
  const exemplar = all[0];
  const evidence = `${all.length} candidate openings extracted from text — review before approval.`;
  const drafts: ModuleDraft[] = [];

  drafts.push({
    moduleId: "iq-framing",
    label: "Openings",
    unit: "qty",
    value: totalCount,
    dataSource: exemplar.source,
    evidence,
    confidence: "low",
    page: exemplar.page,
    fileId: exemplar.fileId,
  });

  const garage = all.find((o) => o.kind === "garage_door");
  if (garage) {
    drafts.push({
      moduleId: "iq-cladding",
      label: "Garage Door Opening",
      unit: "mm",
      value: garage.width_mm,
      dataSource: garage.source,
      evidence: `Garage door ${garage.width_mm}×${garage.height_mm ?? "?"} — ${garage.evidence}`,
      confidence: garage.confidence,
      page: garage.page,
      fileId: garage.fileId,
    });
  }

  return drafts;
}

/**
 * Insert or update one draft module_item. Approved values are never
 * overwritten. Re-run flags drift > 2% as review_required.
 */
export type DraftPersistResult =
  | { status: "inserted" | "updated" | "conflict" | "skipped"; label: string; moduleId: string }
  | { status: "error"; label: string; moduleId: string; error: string };

async function persistDraft(
  jobId: string,
  draft: ModuleDraft,
  takeoffRunId: string,
): Promise<DraftPersistResult> {
  const tag = { label: draft.label, moduleId: draft.moduleId };
  const { data: runs, error: runsErr } = await supabase
    .from("module_runs")
    .select("id")
    .eq("job_id", jobId)
    .eq("module_id", draft.moduleId)
    .limit(1);
  if (runsErr) {
    return { status: "error", ...tag, error: `Could not load module run: ${runsErr.message}` };
  }
  const runId = runs?.[0]?.id;
  if (!runId) {
    return {
      status: "error",
      ...tag,
      error: `Missing module_runs row for ${draft.moduleId} — module_items.run_id cannot be set.`,
    };
  }

  const { data: matching, error: matchErr } = await supabase
    .from("module_items")
    .select("id, approved_value, extracted_value, data_source, review_status")
    .eq("run_id", runId)
    .eq("label", draft.label)
    .limit(1);
  if (matchErr) {
    return { status: "error", ...tag, error: `Lookup failed: ${matchErr.message}` };
  }
  const existing = matching?.[0] as
    | { id: string; approved_value: string | null; extracted_value: string | null; data_source: string | null; review_status: string | null }
    | undefined;

  // Never overwrite a User Override.
  if (existing?.data_source === "User Override") return { status: "skipped", ...tag };

  const newValueStr = String(draft.value);

  if (existing) {
    // Approved value present? Only flag drift, never overwrite.
    if (existing.approved_value != null && existing.approved_value !== "") {
      const prev = Number(existing.approved_value);
      const drift = prev === 0 ? 1 : Math.abs(draft.value - prev) / Math.abs(prev);
      if (drift > 0.02) {
        const { error: upErr } = await supabase.from("module_items").update({
          extracted_value: newValueStr,
          review_status: "review_required",
          notes: `Automatic takeoff value ${draft.value} differs from approved ${prev} (Δ${(drift * 100).toFixed(1)}%). Review before approval.`,
        }).eq("id", existing.id);
        if (upErr) return { status: "error", ...tag, error: `Conflict update failed: ${upErr.message}` };
        return { status: "conflict", ...tag };
      }
      // Within tolerance — refresh extracted_value but leave approved alone.
      const { error: upErr } = await supabase.from("module_items").update({
        extracted_value: newValueStr,
        source_evidence: draft.evidence,
        plan_page_number: draft.page,
        file_id: draft.fileId,
      }).eq("id", existing.id);
      if (upErr) return { status: "error", ...tag, error: `Refresh failed: ${upErr.message}` };
      return { status: "updated", ...tag };
    }
    // No approved value — refresh draft fields.
    const { error: upErr } = await supabase.from("module_items").update({
      extracted_value: newValueStr,
      unit: draft.unit,
      data_source: draft.dataSource,
      source_evidence: draft.evidence,
      confidence: draft.confidence,
      review_status: "review_required",
      plan_page_number: draft.page,
      file_id: draft.fileId,
    }).eq("id", existing.id);
    if (upErr) return { status: "error", ...tag, error: `Draft refresh failed: ${upErr.message}` };
    return { status: "updated", ...tag };
  }

  const { error: insErr } = await supabase.from("module_items").insert({
    run_id: runId,
    job_id: jobId,
    module_id: draft.moduleId,
    label: draft.label,
    unit: draft.unit,
    extracted_value: newValueStr,
    approved_value: null,
    confidence: draft.confidence,
    review_status: "review_required",
    data_source: draft.dataSource,
    source_evidence: draft.evidence,
    plan_page_number: draft.page,
    file_id: draft.fileId,
    basis: draft.dataSource,
    notes: `Automatic takeoff run ${takeoffRunId}.`,
    sort_order: 100,
  });
  if (insErr) return { status: "error", ...tag, error: `Insert failed: ${insErr.message}` };
  return { status: "inserted", ...tag };
}

export async function populateModulesFromTakeoff(args: {
  jobId: string;
  quantities: ExtractedQty[];
  openings: ExtractedOpening[];
  takeoffRunId: string;
}): Promise<{ inserted: number; updated: number; conflicts: number; skipped: number; errors: string[] }> {
  const drafts: ModuleDraft[] = [];
  for (const q of args.quantities) drafts.push(...quantityToDrafts(q));
  drafts.push(...openingsToDrafts(args.openings));

  let inserted = 0, updated = 0, conflicts = 0, skipped = 0;
  const errors: string[] = [];
  for (const d of drafts) {
    try {
      const r = await persistDraft(args.jobId, d, args.takeoffRunId);
      if (r.status === "inserted") inserted++;
      else if (r.status === "updated") updated++;
      else if (r.status === "conflict") conflicts++;
      else if (r.status === "skipped") skipped++;
      else if (r.status === "error") {
        errors.push(`Failed to insert module item: ${d.moduleId} / ${d.label} — ${r.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      errors.push(`Failed to insert module item: ${d.moduleId} / ${d.label} — ${msg}`);
    }
  }
  return { inserted, updated, conflicts, skipped, errors };
}
