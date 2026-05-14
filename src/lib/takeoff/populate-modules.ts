/**
 * Phase A — populate draft module_items from source-backed extracted
 * quantities, openings, and specification rows. Never confirms anything.
 * Never overwrites approved values. Only inserts rows when there is real
 * source data.
 */
import { supabase } from "@/integrations/supabase/client";
import { IQ_MODULES, type IQModuleId } from "@/lib/iq-modules";
import type { ExtractedQty } from "./extract-quantities";
import type { ExtractedOpening } from "./extract-openings";
import type { SpecRow } from "./extract-spec";

type ModuleDraft = {
  moduleId: IQModuleId;
  label: string;
  unit: string;
  /** Text or numeric value (string-stored — module_items.extracted_value is text). */
  value: string;
  dataSource: string;
  evidence: string;
  confidence: "high" | "mid" | "low";
  page: number | null;
  fileId: string | null;
  note?: string | null;
};

function quantityToDrafts(q: ExtractedQty): ModuleDraft[] {
  const base = {
    dataSource: q.dataSource,
    evidence: q.evidence,
    confidence: q.confidence,
    page: q.page,
    fileId: q.fileId,
  };
  const v = String(q.value);
  const drafts: ModuleDraft[] = [];
  switch (q.kind) {
    case "external_perimeter":
      drafts.push({ ...base, moduleId: "iq-cladding", label: "External Perimeter", unit: "lm", value: v });
      drafts.push({ ...base, moduleId: "iq-framing",  label: "External Walls",      unit: "lm", value: v });
      break;
    case "internal_wall_length":
      drafts.push({ ...base, moduleId: "iq-framing", label: "Internal Walls",        unit: "lm", value: v });
      drafts.push({ ...base, moduleId: "iq-linings", label: "Internal Wall Length",  unit: "lm", value: v });
      break;
    case "cladding_area":
      drafts.push({ ...base, moduleId: "iq-cladding", label: "Cladding Area", unit: "m²", value: v });
      break;
    case "roof_pitch":
      drafts.push({ ...base, moduleId: "iq-roofing", label: "Pitch", unit: "°", value: v });
      break;
    case "coverage_area":
      drafts.push({ ...base, moduleId: "iq-roofing", label: "Coverage Area", unit: "m²", value: v });
      break;
    case "garage_door_size":
      drafts.push({ ...base, moduleId: "iq-cladding", label: "Garage Door Opening", unit: "mm", value: v });
      break;
    default:
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
    value: String(totalCount),
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
      value: String(garage.width_mm),
      dataSource: garage.source,
      evidence: `Garage door ${garage.width_mm}×${garage.height_mm ?? "?"} — ${garage.evidence}`,
      confidence: garage.confidence,
      page: garage.page,
      fileId: garage.fileId,
    });
  }

  return drafts;
}

function specRowsToDrafts(rows: SpecRow[]): ModuleDraft[] {
  return rows.map((r) => ({
    moduleId: r.moduleId,
    label: r.label,
    unit: r.unit,
    value: r.value,
    dataSource: r.dataSource,
    evidence: r.evidence,
    confidence: r.confidence,
    page: r.page,
    fileId: r.fileId,
    note: r.note,
  }));
}

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
  let runId = runs?.[0]?.id as string | undefined;
  if (!runId) {
    const moduleDef = IQ_MODULES.find((m) => m.id === draft.moduleId);
    const { data: created, error: createErr } = await supabase
      .from("module_runs")
      .insert({
        job_id: jobId,
        module_id: draft.moduleId,
        module_name: moduleDef?.name ?? draft.moduleId,
        status: "in_progress",
        review_status: "review_required",
        required: moduleDef?.required ?? true,
        item_count: 0,
        last_run_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (createErr || !created?.id) {
      return {
        status: "error",
        ...tag,
        error: `Could not create module_runs row for ${draft.moduleId}: ${createErr?.message ?? "no id returned"}`,
      };
    }
    runId = created.id as string;
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

  if (existing?.data_source === "User Override") return { status: "skipped", ...tag };

  const newValueStr = draft.value;
  const newValueNum = Number(draft.value);
  const isNumeric = Number.isFinite(newValueNum);

  if (existing) {
    if (existing.approved_value != null && existing.approved_value !== "") {
      const prev = Number(existing.approved_value);
      const prevIsNumeric = Number.isFinite(prev);
      let drift: number;
      if (isNumeric && prevIsNumeric) {
        drift = prev === 0 ? 1 : Math.abs(newValueNum - prev) / Math.abs(prev);
      } else {
        drift = existing.approved_value === newValueStr ? 0 : 1;
      }
      if (drift > 0.02) {
        const { error: upErr } = await supabase.from("module_items").update({
          extracted_value: newValueStr,
          review_status: "review_required",
          notes: `Automatic takeoff value "${newValueStr}" differs from approved "${existing.approved_value}". Review before approval.`,
        }).eq("id", existing.id);
        if (upErr) return { status: "error", ...tag, error: `Conflict update failed: ${upErr.message}` };
        return { status: "conflict", ...tag };
      }
      const { error: upErr } = await supabase.from("module_items").update({
        extracted_value: newValueStr,
        source_evidence: draft.evidence,
        plan_page_number: draft.page,
        file_id: draft.fileId,
      }).eq("id", existing.id);
      if (upErr) return { status: "error", ...tag, error: `Refresh failed: ${upErr.message}` };
      return { status: "updated", ...tag };
    }
    const { error: upErr } = await supabase.from("module_items").update({
      extracted_value: newValueStr,
      unit: draft.unit,
      data_source: draft.dataSource,
      source_evidence: draft.evidence,
      confidence: draft.confidence,
      review_status: "review_required",
      plan_page_number: draft.page,
      file_id: draft.fileId,
      notes: draft.note ?? null,
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
    notes: draft.note ?? `Automatic takeoff run ${takeoffRunId}.`,
    sort_order: 100,
  });
  if (insErr) return { status: "error", ...tag, error: `Insert failed: ${insErr.message}` };
  return { status: "inserted", ...tag };
}

export async function populateModulesFromTakeoff(args: {
  jobId: string;
  quantities: ExtractedQty[];
  openings: ExtractedOpening[];
  specRows?: SpecRow[];
  takeoffRunId: string;
}): Promise<{ inserted: number; updated: number; conflicts: number; skipped: number; errors: string[] }> {
  const drafts: ModuleDraft[] = [];
  for (const q of args.quantities) drafts.push(...quantityToDrafts(q));
  drafts.push(...openingsToDrafts(args.openings));
  if (args.specRows && args.specRows.length > 0) {
    drafts.push(...specRowsToDrafts(args.specRows));
  }

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
