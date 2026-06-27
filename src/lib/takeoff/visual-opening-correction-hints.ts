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
  if (!hints || hints.length === 0) return "";
  const lines = hints.slice(0, 12).map((hint, index) => {
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
  });

  return `
HUMAN CORRECTION MEMORY FOR THIS JOB:
The following records are prior human corrections from the verification overlay for this same job.
Use them as review guidance only. They never authorise pricing and they must not override visible plan evidence.
Apply them when the same visual feature or same local pattern appears again:
- confirm_opening: the feature is a visible physical opening candidate, but still needs normal size/position checks.
- not_opening: reject the same feature/pattern as cladding, hatch, annotation, or another non-opening.
- component_of_opening: do not return it as a separate opening; merge it into the neighbouring opening assembly.
- box_too_small / box_too_large: keep the opening only if visible, but place/describe the full physical opening instead of the bad box.
- wrong_type: keep the physical opening only if visible, but correct its type.
${lines.join("\n")}`;
}

export async function loadVisualOpeningCorrectionHints(
  jobId: string,
): Promise<VisualOpeningHumanCorrectionHint[]> {
  const { data, error } = await supabase
    .from("visual_opening_corrections")
    .select(
      "marker_label, opening_id, correction_type, corrected_type, reason, marker_snapshot, created_at",
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
