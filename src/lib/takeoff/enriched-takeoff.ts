/**
 * EnrichedTakeoff — per-QS-field provenance shape (Convergence Slice 2).
 *
 * Slice 1 produced a bare `TakeoffData` (each field a raw value). Slice 2 wraps every QS
 * field in a `FieldValue`: the value PLUS where it came from, how confident we are, and the
 * honesty flags that apply to THAT field. One shape serves three needs the design locked
 * (CONVERGENCE_DESIGN.md §4): flag survival (M2), the audit trail, and a future consistency
 * layer that reads provenance to know which paths to cross-check.
 *
 * This is ADDITIVE and in-memory only — it does not mutate the shared bare `TakeoffData`
 * (which the vision producers, `/upload`, and the QS export still build/consume). The
 * enrichment WRAPS the already-computed bare values; `unwrapTakeoff` projects straight back
 * to the bare shape (used by `/upload` and proven value-preserving against the Slice 1
 * golden). Persistence + schema for this shape are Slices 3+.
 */
import type {
  TakeoffData,
  WindowsByRoom,
  DoorBreakdown,
  ScheduleWindowEntry,
  Opening,
} from "./takeoff-types";

/** Where a field's value came from (the provenance we already track in the seam). */
export type FieldSource =
  | "geometry" // measured by the geometry engine (floor area, perimeter, …)
  | "vector" // deterministic PDF vector layer (garage/openings/W-codes)
  | "vision" // the AI vision pass
  | "schedule" // the Door & Window Schedule
  | "derived" // computed from other fields (ext-wall area, total area)
  | "asserted" // a building standard we assert (entry-door height 2.1m)
  | "flagged-unknown" // genuinely unknown, surfaced for confirmation (entry width)
  | "manual"; // a human override (none yet in this pipeline)

export type FieldConfidence = "high" | "mid" | "low" | null;

/**
 * A single QS field with its provenance. `discrepancy_flags` carries the honesty rails for
 * THIS field (the same strings that were previously concatenated into the global notes).
 */
export type FieldValue<T> = {
  value: T | null;
  source: FieldSource;
  confidence: FieldConfidence;
  discrepancy_flags: string[];
};

export type EnrichedTakeoff = {
  floor_area_m2: FieldValue<number>;
  garage_area_m2: FieldValue<number>;
  alfresco_area_m2: FieldValue<number>;
  external_wall_lm: FieldValue<number>;
  internal_wall_lm: FieldValue<number>;
  roof_area_m2: FieldValue<number>;
  window_count: FieldValue<number>;
  external_door_count: FieldValue<number>;
  internal_door_count: FieldValue<number>;
  bathroom_count: FieldValue<number>;
  ensuite_count: FieldValue<number>;
  laundry_count: FieldValue<number>;
  kitchen_count: FieldValue<number>;
  ceiling_height_m: FieldValue<number>;
  foundation_type: FieldValue<string>;
  windows_by_room: FieldValue<WindowsByRoom>;
  windows_schedule: FieldValue<ScheduleWindowEntry[]>;
  door_breakdown: FieldValue<DoorBreakdown>;
  garage_door_size: FieldValue<string>;
  external_wall_area_m2: FieldValue<number>;
  total_area_m2: FieldValue<number>;
  /**
   * Global, backward-compatible view: every field's discrepancy_flags concatenated in the
   * legacy order — byte-for-byte the same string the bare `TakeoffData.notes` carried. Kept
   * so existing notes consumers (and `unwrapTakeoff`) need no change.
   */
  notes: string;
  /**
   * Stage 2a — flat per-opening list carried through additively (raw passthrough, not a
   * provenance-wrapped FieldValue: each Opening already carries its own source/confidence).
   * Optional so pre-Stage-2 enriched payloads round-trip unchanged. Persisted + read by the
   * QS export consumer (Stage 2b); not yet written to any cell.
   */
  openings?: Opening[] | null;
  total_opening_sqm?: number | null;
  glazed_sqm?: number | null;
};

/** Build a FieldValue with sensible defaults. */
export function fv<T>(
  value: T | null | undefined,
  source: FieldSource,
  confidence: FieldConfidence = null,
  discrepancy_flags: string[] = [],
): FieldValue<T> {
  return { value: value ?? null, source, confidence, discrepancy_flags };
}

/**
 * Project an EnrichedTakeoff straight back to the bare `TakeoffData` shape — the
 * backward-compatible view consumed by `/upload`, the QS export, and the Slice 1 golden.
 * Unwrapping every field's `.value` must reproduce exactly the takeoff the seam produced
 * (the "values preserved" proof). Optional fields are reconstructed faithfully: the derived
 * areas are always present in this pipeline; `windows_schedule` is included only when a
 * schedule was actually read (mirrors the bare object, which omitted it otherwise).
 */
export function unwrapTakeoff(e: EnrichedTakeoff): TakeoffData {
  const bare: TakeoffData = {
    floor_area_m2: e.floor_area_m2.value,
    garage_area_m2: e.garage_area_m2.value,
    alfresco_area_m2: e.alfresco_area_m2.value,
    external_wall_lm: e.external_wall_lm.value,
    internal_wall_lm: e.internal_wall_lm.value,
    roof_area_m2: e.roof_area_m2.value,
    window_count: e.window_count.value,
    external_door_count: e.external_door_count.value,
    internal_door_count: e.internal_door_count.value,
    bathroom_count: e.bathroom_count.value,
    ensuite_count: e.ensuite_count.value,
    laundry_count: e.laundry_count.value,
    kitchen_count: e.kitchen_count.value,
    ceiling_height_m: e.ceiling_height_m.value,
    foundation_type: e.foundation_type.value,
    windows_by_room: e.windows_by_room.value,
    door_breakdown: e.door_breakdown.value,
    garage_door_size: e.garage_door_size.value,
    notes: e.notes,
    external_wall_area_m2: e.external_wall_area_m2.value,
    total_area_m2: e.total_area_m2.value,
  };
  if (e.windows_schedule.value != null) {
    bare.windows_schedule = e.windows_schedule.value;
  }
  // Stage 2a — project the flat opening list back when the enriched payload carries it
  // (absent on pre-Stage-2 payloads → bare omits it, mirroring windows_schedule).
  if (e.openings != null) bare.openings = e.openings;
  if (e.total_opening_sqm != null) bare.total_opening_sqm = e.total_opening_sqm;
  if (e.glazed_sqm != null) bare.glazed_sqm = e.glazed_sqm;
  return bare;
}

/** Every field's discrepancy_flags, flattened (for a quick "are there any flags?" view). */
export function allDiscrepancyFlags(e: EnrichedTakeoff): string[] {
  const fields: FieldValue<unknown>[] = [
    e.floor_area_m2,
    e.garage_area_m2,
    e.alfresco_area_m2,
    e.external_wall_lm,
    e.internal_wall_lm,
    e.roof_area_m2,
    e.window_count,
    e.external_door_count,
    e.internal_door_count,
    e.bathroom_count,
    e.ensuite_count,
    e.laundry_count,
    e.kitchen_count,
    e.ceiling_height_m,
    e.foundation_type,
    e.windows_by_room,
    e.windows_schedule,
    e.door_breakdown,
    e.garage_door_size,
    e.external_wall_area_m2,
    e.total_area_m2,
  ];
  return fields.flatMap((f) => f.discrepancy_flags);
}

/**
 * Per-field review flags with human-readable field labels — for surfacing in the QS export
 * and the review UI. Only fields that actually carry a discrepancy flag are returned.
 */
export function fieldFlags(e: EnrichedTakeoff): Array<{ field: string; flags: string[] }> {
  const entries: Array<[string, FieldValue<unknown>]> = [
    ["Floor area", e.floor_area_m2],
    ["Garage area", e.garage_area_m2],
    ["Alfresco area", e.alfresco_area_m2],
    ["External wall (lm)", e.external_wall_lm],
    ["Internal wall (lm)", e.internal_wall_lm],
    ["Roof area", e.roof_area_m2],
    ["Window count", e.window_count],
    ["External doors", e.external_door_count],
    ["Internal doors", e.internal_door_count],
    ["Bathrooms", e.bathroom_count],
    ["Ensuites", e.ensuite_count],
    ["Laundries", e.laundry_count],
    ["Kitchens", e.kitchen_count],
    ["Ceiling height", e.ceiling_height_m],
    ["Foundation", e.foundation_type],
    ["Windows by room", e.windows_by_room],
    ["Window schedule", e.windows_schedule],
    ["Door breakdown", e.door_breakdown],
    ["Garage door", e.garage_door_size],
    ["External wall area", e.external_wall_area_m2],
    ["Total area", e.total_area_m2],
  ];
  return entries
    .filter(([, v]) => v.discrepancy_flags.length > 0)
    .map(([field, v]) => ({ field, flags: v.discrepancy_flags }));
}
