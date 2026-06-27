import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

type CorrectionRow = Tables<"visual_opening_corrections">;

export type VisualOpeningHumanCorrectionType =
  | "confirm_opening"
  | "not_opening"
  | "component_of_opening"
  | "box_too_small"
  | "box_too_large"
  | "wrong_type";

export type VisualOpeningHumanCorrectionHint = {
  jobId: string | null;
  markerLabel: string;
  openingId: string;
  correctionType: VisualOpeningHumanCorrectionType;
  correctedType: string | null;
  reason: string | null;
  marker: {
    type: string | null;
    room: string | null;
    label: string | null;
    width_m: number | null;
    height_m: number | null;
    x: number | null;
    y: number | null;
    evidence: string | null;
    flags: string[];
  };
};

export type VisualOpeningCorrectionPattern = {
  correctionType: VisualOpeningHumanCorrectionType;
  originalType: string | null;
  count: number;
  exampleReason: string | null;
  exampleMarkerLabel: string;
};

export type VisualOpeningCorrectionPromptMemory = {
  jobHints: VisualOpeningHumanCorrectionHint[];
  globalExamples: VisualOpeningHumanCorrectionHint[];
  globalPatterns: VisualOpeningCorrectionPattern[];
};

const CORRECTION_TYPES = new Set<VisualOpeningHumanCorrectionType>([
  "confirm_opening",
  "not_opening",
  "component_of_opening",
  "box_too_small",
  "box_too_large",
  "wrong_type",
]);

function obj(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function str(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flags(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export function visualOpeningCorrectionHintFromRow(
  row: Pick<
    CorrectionRow,
    | "job_id"
    | "marker_label"
    | "opening_id"
    | "correction_type"
    | "corrected_type"
    | "reason"
    | "marker_snapshot"
  >,
): VisualOpeningHumanCorrectionHint | null {
  if (!CORRECTION_TYPES.has(row.correction_type as VisualOpeningHumanCorrectionType)) return null;
  const marker = obj(row.marker_snapshot);
  return {
    jobId: row.job_id,
    markerLabel: row.marker_label,
    openingId: row.opening_id,
    correctionType: row.correction_type as VisualOpeningHumanCorrectionType,
    correctedType: row.corrected_type,
    reason: row.reason,
    marker: {
      type: str(marker.type),
      room: str(marker.room),
      label: str(marker.label),
      width_m: num(marker.width_m),
      height_m: num(marker.height_m),
      x: num(marker.x),
      y: num(marker.y),
      evidence: str(marker.evidence),
      flags: flags(marker.flags),
    },
  };
}

export function formatVisualOpeningCorrectionHints(
  hints: readonly VisualOpeningHumanCorrectionHint[] | null | undefined,
): string {
  return formatVisualOpeningCorrectionMemory({
    jobHints: hints ? [...hints] : [],
    globalExamples: [],
    globalPatterns: [],
  });
}

function formatHintLine(hint: VisualOpeningHumanCorrectionHint, index: number): string {
  const marker = hint.marker;
  const dims =
    marker.width_m != null && marker.height_m != null
      ? `${Math.round(marker.height_m * 1000)}x${Math.round(marker.width_m * 1000)}`
      : (marker.label ?? "unknown size");
  const pos =
    marker.x != null && marker.y != null
      ? `x=${marker.x.toFixed(3)}, y=${marker.y.toFixed(3)}`
      : "position unknown";
  const room = marker.room ? `room=${marker.room}` : "room unknown";
  const reason = hint.reason ? ` reason=${hint.reason}` : "";
  return `${index + 1}. ${hint.markerLabel}/${hint.openingId}: prior human correction=${hint.correctionType}; original=${marker.type ?? "unknown"} ${dims}; ${room}; ${pos}.${reason}`;
}

export function correctionPatternsFromHints(
  hints: readonly VisualOpeningHumanCorrectionHint[],
): VisualOpeningCorrectionPattern[] {
  const byKey = new Map<string, VisualOpeningCorrectionPattern>();
  for (const hint of hints) {
    const marker = hint.marker;
    const key = `${hint.correctionType}:${marker.type ?? "unknown"}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.exampleReason && hint.reason) existing.exampleReason = hint.reason;
      continue;
    }
    byKey.set(key, {
      correctionType: hint.correctionType,
      originalType: marker.type,
      count: 1,
      exampleReason: hint.reason,
      exampleMarkerLabel: hint.markerLabel,
    });
  }
  return [...byKey.values()]
    .filter((pattern) => pattern.count >= 2)
    .sort((a, b) => b.count - a.count || a.correctionType.localeCompare(b.correctionType))
    .slice(0, 8);
}

export function formatVisualOpeningCorrectionMemory(
  memory: VisualOpeningCorrectionPromptMemory | null | undefined,
): string {
  if (
    !memory ||
    (memory.jobHints.length === 0 &&
      memory.globalExamples.length === 0 &&
      memory.globalPatterns.length === 0)
  ) {
    return "";
  }

  const sections: string[] = [];

  if (memory.globalPatterns.length > 0) {
    const lines = memory.globalPatterns.map((pattern, index) => {
      const original = pattern.originalType ? ` originally marked ${pattern.originalType}` : "";
      const reason = pattern.exampleReason ? ` Example reason: ${pattern.exampleReason}` : "";
      return `${index + 1}. ${pattern.count} prior corrections: ${pattern.correctionType}${original}.${reason}`;
    });
    sections.push(`GLOBAL HUMAN-CORRECTION PATTERNS:
These are repeated correction patterns from prior accessible jobs. Treat them as caution rules, not proof.
${lines.join("\n")}`);
  }

  if (memory.globalExamples.length > 0) {
    sections.push(`GLOBAL HUMAN-CORRECTION EXAMPLES:
These are recent examples from other accessible jobs. Use them to avoid repeated visual mistakes, but do not copy them blindly to this plan.
${memory.globalExamples.slice(0, 6).map(formatHintLine).join("\n")}`);
  }

  if (memory.jobHints.length > 0) {
    sections.push(`JOB-SPECIFIC HUMAN CORRECTION MEMORY:
The following records are prior human corrections from the verification overlay for this same job.
Use them as stronger review guidance when the same visual feature or same local pattern appears again.
${memory.jobHints.slice(0, 12).map(formatHintLine).join("\n")}`);
  }

  return `
HUMAN CORRECTION MEMORY:
Use them as review guidance only. They never authorise pricing and they must not override visible plan evidence.
- confirm_opening: the feature is a visible physical opening candidate, but still needs normal size/position checks.
- not_opening: reject the same feature/pattern as cladding, hatch, annotation, or another non-opening.
- component_of_opening: do not return it as a separate opening; merge it into the neighbouring opening assembly.
- box_too_small / box_too_large: keep the opening only if visible, but place/describe the full physical opening instead of the bad box.
- wrong_type: keep the physical opening only if visible, but correct its type.
${sections.join("\n\n")}`;
}

async function loadRecentVisualOpeningCorrectionRows(
  jobId: string | null,
  limit: number,
): Promise<CorrectionRow[]> {
  let query = supabase
    .from("visual_opening_corrections")
    .select(
      "job_id, marker_label, opening_id, correction_type, corrected_type, reason, marker_snapshot, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CorrectionRow[];
}

function latestHintsByMarker(rows: readonly CorrectionRow[]): VisualOpeningHumanCorrectionHint[] {
  const latestByMarker = new Map<string, CorrectionRow>();
  for (const row of rows) {
    const key = `${row.job_id}:${row.marker_label}`;
    if (!latestByMarker.has(key)) latestByMarker.set(key, row);
  }
  return [...latestByMarker.values()]
    .map(visualOpeningCorrectionHintFromRow)
    .filter((hint): hint is VisualOpeningHumanCorrectionHint => hint != null);
}

export async function loadVisualOpeningCorrectionPromptMemory(
  jobId?: string | null,
): Promise<VisualOpeningCorrectionPromptMemory> {
  const [jobRows, globalRows] = await Promise.all([
    jobId ? loadRecentVisualOpeningCorrectionRows(jobId, 30) : Promise.resolve([]),
    loadRecentVisualOpeningCorrectionRows(null, 120),
  ]);

  const jobHints = latestHintsByMarker(jobRows);
  const globalHints = latestHintsByMarker(globalRows).filter(
    (hint) => !jobId || hint.jobId !== jobId,
  );
  return {
    jobHints,
    globalExamples: globalHints.slice(0, 12),
    globalPatterns: correctionPatternsFromHints(globalHints),
  };
}

export async function loadVisualOpeningCorrectionHints(
  jobId: string,
): Promise<VisualOpeningHumanCorrectionHint[]> {
  const { data, error } = await supabase
    .from("visual_opening_corrections")
    .select(
      "job_id, marker_label, opening_id, correction_type, corrected_type, reason, marker_snapshot, created_at",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  const latestByMarker = new Map<string, (typeof data)[number]>();
  for (const row of data ?? []) {
    if (!latestByMarker.has(row.marker_label)) latestByMarker.set(row.marker_label, row);
  }
  return [...latestByMarker.values()]
    .map(visualOpeningCorrectionHintFromRow)
    .filter((hint): hint is VisualOpeningHumanCorrectionHint => hint != null);
}
