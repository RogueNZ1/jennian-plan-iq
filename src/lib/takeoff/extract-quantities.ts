/**
 * Conservative regex-based extraction of labelled quantities from plan and
 * specification text. Phase A only — we extract values that appear next
 * to an explicit label and a unit. Anything ambiguous is skipped. Each
 * extracted concept is kept separate (Area Over Frame ≠ Total Area).
 */
import { supabase } from "@/integrations/supabase/client";
import type { ExtractedFile, ExtractedPage } from "./pdf-text";

export type QuantityKind =
  | "area_over_frame"
  | "total_floor_area"
  | "coverage_area"
  | "porch_area"
  | "garage_area"
  | "living_area"
  | "cladding_area"
  | "external_perimeter"
  | "internal_wall_length"
  | "roof_pitch"
  | "stud_height"
  | "garage_door_size";

export type ExtractedQty = {
  kind: QuantityKind;
  label: string;
  unit: string;
  value: number;
  /** Optional secondary value (height for door, etc.). */
  secondaryValue?: number;
  evidence: string;
  page: number;
  fileId: string;
  fileName: string;
  fileType: "plan" | "specification";
  confidence: "high" | "mid" | "low";
  /** Where it should land in extracted_quantities.data_source. */
  dataSource: "Uploaded Plan Text" | "Uploaded Specification Text";
};

/* Regex helpers --------------------------------------------------------- */

// Matches a number like 154, 154.6, 1,540.00
const NUM = "(\\d{1,4}(?:[,\\d]{0,5})?(?:\\.\\d{1,3})?)";

function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function snippet(text: string, idx: number, len: number, pad = 24): string {
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + len + pad);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

type LabelDef = {
  kind: QuantityKind;
  label: string;
  /** Label text (case-insensitive). Word-boundary aware. */
  patterns: RegExp[];
  unit: string;
  /** "area" | "length" — drives the unit-suffix regex used after the number. */
  category: "area" | "length";
  confidence: "high" | "mid" | "low";
};

const AREA_LABELS: LabelDef[] = [
  { kind: "area_over_frame",      label: "Area Over Frame",      patterns: [/area\s+over\s+frame/i],                              unit: "m²", category: "area", confidence: "high" },
  { kind: "total_floor_area",     label: "Total Floor Area",     patterns: [/total\s+floor\s+area/i, /total\s+area/i, /floor\s+area\b/i], unit: "m²", category: "area", confidence: "high" },
  { kind: "coverage_area",        label: "Coverage Area",        patterns: [/coverage\s+area/i, /\bcoverage\b/i],                  unit: "m²", category: "area", confidence: "mid" },
  { kind: "porch_area",           label: "Porch Area",           patterns: [/porch\s+area/i, /entry\s+porch/i],                    unit: "m²", category: "area", confidence: "mid" },
  { kind: "garage_area",          label: "Garage Area",          patterns: [/garage\s+area/i],                                     unit: "m²", category: "area", confidence: "high" },
  { kind: "living_area",          label: "Living Area",          patterns: [/living\s+area/i, /\bhabitable\s+area/i],              unit: "m²", category: "area", confidence: "mid" },
  { kind: "cladding_area",        label: "Cladding Area",        patterns: [/cladding\s+area/i],                                   unit: "m²", category: "area", confidence: "high" },
];

const LENGTH_LABELS: LabelDef[] = [
  { kind: "external_perimeter",   label: "External Perimeter",   patterns: [/external\s+perimeter/i, /perimeter/i],                unit: "lm", category: "length", confidence: "mid" },
  { kind: "internal_wall_length", label: "Internal Wall Length", patterns: [/internal\s+wall\s+length/i, /internal\s+walls?\b/i],  unit: "lm", category: "length", confidence: "mid" },
];

function findArea(text: string, def: LabelDef): { value: number; evidence: string } | null {
  for (const labelRe of def.patterns) {
    const labelM = text.match(labelRe);
    if (!labelM || labelM.index == null) continue;
    // Search forward up to 80 chars for: NUMBER + (m²|m2|sqm|sq m)
    const searchFrom = labelM.index + labelM[0].length;
    const tail = text.slice(searchFrom, searchFrom + 80);
    const valueRe = new RegExp(`${NUM}\\s*(?:m²|m2|sqm|sq\\s*m)`, "i");
    const vm = tail.match(valueRe);
    if (!vm) continue;
    const v = parseNum(vm[1]);
    if (v == null || v <= 0 || v > 10000) continue;
    return { value: v, evidence: snippet(text, labelM.index, labelM[0].length + (vm.index ?? 0) + vm[0].length) };
  }
  return null;
}

function findLength(text: string, def: LabelDef): { value: number; evidence: string } | null {
  for (const labelRe of def.patterns) {
    const labelM = text.match(labelRe);
    if (!labelM || labelM.index == null) continue;
    const searchFrom = labelM.index + labelM[0].length;
    const tail = text.slice(searchFrom, searchFrom + 80);
    // Length like "54.6 m" or "54600mm" or "54.6 lm"
    const valueRe = new RegExp(`${NUM}\\s*(m|lm|metres?|lin\\.?\\s*m|mm)\\b`, "i");
    const vm = tail.match(valueRe);
    if (!vm) continue;
    let v = parseNum(vm[1]);
    if (v == null || v <= 0) continue;
    if (vm[2].toLowerCase() === "mm") v = v / 1000;
    if (v > 5000) continue; // sanity cap
    return { value: v, evidence: snippet(text, labelM.index, labelM[0].length + (vm.index ?? 0) + vm[0].length) };
  }
  return null;
}

function findRoofPitch(text: string): { value: number; evidence: string } | null {
  // "Roof Pitch: 25°" or "Pitch 25 deg"
  const re = /(?:roof\s+)?pitch[:\s]*?(\d{1,2}(?:\.\d)?)\s*(?:°|deg|degrees|degree)/i;
  const m = text.match(re);
  if (!m || m.index == null) return null;
  const v = parseNum(m[1]);
  if (v == null || v < 5 || v > 60) return null;
  return { value: v, evidence: snippet(text, m.index, m[0].length) };
}

function findStudHeight(text: string): { value: number; evidence: string } | null {
  // "Stud Height: 2.4m" or "stud height 2400 mm"
  const re = /stud\s+height[:\s]*?(\d(?:\.\d{1,2})?|\d{4})\s*(m|mm)\b/i;
  const m = text.match(re);
  if (!m || m.index == null) return null;
  let v = parseNum(m[1]);
  if (v == null) return null;
  if (m[2].toLowerCase() === "mm") v = v / 1000;
  if (v < 2 || v > 5) return null;
  return { value: v, evidence: snippet(text, m.index, m[0].length) };
}

function findGarageDoor(text: string): { width: number; height: number; evidence: string } | null {
  // "Garage Door: 4800 x 2100"
  const re = /garage\s+door[:\s]*?(\d{3,5})\s*[x×]\s*(\d{3,5})/i;
  const m = text.match(re);
  if (!m || m.index == null) return null;
  const w = parseNum(m[1]);
  const h = parseNum(m[2]);
  if (w == null || h == null || w < 2000 || w > 7500 || h < 1500 || h > 3500) return null;
  return { width: w, height: h, evidence: snippet(text, m.index, m[0].length) };
}

/* Public API ------------------------------------------------------------ */

export function extractQuantitiesFromFile(file: ExtractedFile): ExtractedQty[] {
  const out: ExtractedQty[] = [];
  const dataSource: ExtractedQty["dataSource"] =
    file.fileType === "specification" ? "Uploaded Specification Text" : "Uploaded Plan Text";

  const seen = new Set<QuantityKind>();
  for (const page of file.pages) {
    if (!page.text) continue;
    const push = (kind: QuantityKind, q: Omit<ExtractedQty, "fileId" | "fileName" | "fileType" | "page" | "dataSource" | "kind">) => {
      if (seen.has(kind)) return; // first occurrence wins, deterministic
      seen.add(kind);
      out.push({
        kind,
        ...q,
        page: page.pageNumber,
        fileId: file.fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        dataSource,
      });
    };

    for (const def of AREA_LABELS) {
      const r = findArea(page.text, def);
      if (r) push(def.kind, {
        label: def.label, unit: def.unit, value: r.value,
        evidence: `${def.label} — ${r.evidence}`,
        confidence: def.confidence,
      });
    }
    for (const def of LENGTH_LABELS) {
      const r = findLength(page.text, def);
      if (r) push(def.kind, {
        label: def.label, unit: def.unit, value: r.value,
        evidence: `${def.label} — ${r.evidence}`,
        confidence: def.confidence,
      });
    }
    const pitch = findRoofPitch(page.text);
    if (pitch) push("roof_pitch", {
      label: "Roof Pitch", unit: "°", value: pitch.value,
      evidence: `Roof Pitch — ${pitch.evidence}`, confidence: "high",
    });
    const stud = findStudHeight(page.text);
    if (stud) push("stud_height", {
      label: "Stud Height", unit: "m", value: stud.value,
      evidence: `Stud Height — ${stud.evidence}`, confidence: "high",
    });
    const gd = findGarageDoor(page.text);
    if (gd) push("garage_door_size", {
      label: "Garage Door Size", unit: "mm", value: gd.width, secondaryValue: gd.height,
      evidence: `Garage Door — ${gd.evidence}`, confidence: "high",
    });
  }
  return out;
}

/* DB writer — never overwrites an approved value. */

function quantityTypeKey(kind: QuantityKind): string {
  return kind;
}

export async function persistQuantity(args: {
  jobId: string;
  q: ExtractedQty;
}): Promise<{ status: "inserted" | "updated" | "conflict"; existingId?: string }> {
  const qtype = quantityTypeKey(args.q.kind);
  // Look for an existing row with same job + quantity_type + data_source.
  const { data: existing } = await supabase
    .from("extracted_quantities")
    .select("id, extracted_value, approved_value")
    .eq("job_id", args.jobId)
    .eq("quantity_type", qtype)
    .eq("data_source", args.q.dataSource)
    .limit(1);

  const evidenceWithFile = `${args.q.fileName} p${args.q.page} — ${args.q.evidence.slice(0, 200)}`;
  const confLabel = args.q.confidence === "high" ? "High" : args.q.confidence === "low" ? "Low" : "Medium";

  if (existing && existing[0]) {
    const row = existing[0] as { id: string; extracted_value: number | null; approved_value: number | null };
    // Never silently overwrite an approved_value — flag for review if drift.
    const existingNum = row.approved_value ?? row.extracted_value;
    const drift = existingNum != null && existingNum !== 0
      ? Math.abs(args.q.value - Number(existingNum)) / Math.abs(Number(existingNum))
      : null;
    if (row.approved_value != null && drift != null && drift > 0.02) {
      // Keep approved_value untouched, refresh extracted_value, set review_required.
      await supabase.from("extracted_quantities").update({
        extracted_value: args.q.value,
        unit: args.q.unit,
        source_evidence: evidenceWithFile,
        plan_page_number: args.q.page,
        confidence: args.q.confidence,
        confidence_label: confLabel,
        review_status: "review_required",
        notes: `Re-extracted ${args.q.value} differs from approved ${row.approved_value} (Δ${(drift * 100).toFixed(1)}%).`,
      }).eq("id", row.id);
      return { status: "conflict", existingId: row.id };
    }
    await supabase.from("extracted_quantities").update({
      extracted_value: args.q.value,
      unit: args.q.unit,
      source_evidence: evidenceWithFile,
      plan_page_number: args.q.page,
      confidence: args.q.confidence,
      confidence_label: confLabel,
    }).eq("id", row.id);
    return { status: "updated", existingId: row.id };
  }

  await supabase.from("extracted_quantities").insert({
    job_id: args.jobId,
    quantity_type: qtype,
    unit: args.q.unit,
    extracted_value: args.q.value,
    confidence: args.q.confidence,
    confidence_label: confLabel,
    review_status: "review_required",
    data_source: args.q.dataSource,
    source_evidence: evidenceWithFile,
    plan_page_number: args.q.page,
  });
  return { status: "inserted" };
}