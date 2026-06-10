export type WindowsByRoom = {
  [room: string]: { qty: number; height_m: number; width_m: number };
};

/** Exterior-opening type taxonomy (matches the joinery ground-truth bench). */
export type OpeningType =
  | "window"
  | "slider"
  | "garage_window"
  | "sectional_door"
  | "pa_door"
  | "entrance";

/** Where an opening's dimensions came from. */
export type OpeningSource = "vision" | "vector" | "asserted" | "callout" | "unresolved";

/**
 * A single exterior opening — the flat, per-opening model (Stage 1). Mirrors the
 * joinery bench shape so the bench can grade per-opening + the glazed split directly.
 * Additive: lives alongside windows_by_room, which remains the canonical room map
 * until the export consumer is migrated (Stage 2).
 */
export type Opening = {
  type: OpeningType;
  /** Room label as written on the plan, or null (e.g. a schedule entry with no room link). */
  room: string | null;
  height_m: number;
  width_m: number;
  /** Whether the opening is glazed. False only for the solid sectional/roller garage door. */
  glazed: boolean;
  /** Cladding the opening sits in (Rockcote/Oblique/brick/…), or null when not yet routed. */
  cladding: string | null;
  /** height_m × width_m, rounded to 2dp. */
  area_m2: number;
  /** Primary/width provenance (e.g. "callout" for a label-anchored single-width opening). */
  source: OpeningSource;
  /** Height provenance, when it differs from the width source (Route 2): "asserted" (standard
   * 2.1m), "callout"/"vision" (read), or "unresolved" (unknown — flagged). Optional. */
  height_source?: OpeningSource;
  /** Per-opening review flags (e.g. asserted height, ambiguous/unresolved width). Optional. */
  flags?: string[];
  confidence: "high" | "medium" | "low";
};

/** A single window read from the Door & Window Schedule (Phase 2b). */
export type ScheduleWindowEntry = {
  id: string;
  height_m: number | null;
  width_m: number | null;
};

export type DoorBreakdown = {
  standard: number;
  cavity_sliders: number;
  double_doors: number;
  barn_sliders: number;
};

export type TakeoffData = {
  floor_area_m2: number | null;
  garage_area_m2: number | null;
  alfresco_area_m2: number | null;
  external_wall_lm: number | null;
  internal_wall_lm: number | null;
  /** Plan envelope short side (geometry bbox) — gable span candidate. */
  gable_span_m?: number | null;
  roof_area_m2: number | null;
  window_count: number | null;
  external_door_count: number | null;
  internal_door_count: number | null;
  bathroom_count: number | null;
  ensuite_count: number | null;
  laundry_count: number | null;
  kitchen_count: number | null;
  ceiling_height_m: number | null;
  foundation_type: string | null;
  windows_by_room: WindowsByRoom | null;
  door_breakdown: DoorBreakdown | null;
  garage_door_size: string | null;
  notes: string;
  /**
   * Canonical window list from the Door & Window Schedule (Phase 2b), when a
   * schedule page was read. Optional so existing TakeoffData literals are unaffected;
   * when present it is the authoritative source for window_count + dimensions.
   */
  windows_schedule?: ScheduleWindowEntry[] | null;
  /**
   * Derived (Phase 2d). External wall AREA in m² (QS cell D21) =
   * perimeter × stud_height − total_opening_area, gable ends excluded. Distinct
   * from external_wall_lm (the perimeter in linear metres). Optional so existing
   * TakeoffData literals are unaffected.
   */
  external_wall_area_m2?: number | null;
  /**
   * Derived (Phase 2d). Total floor area incl. alfresco in m² (QS cell D14) =
   * floor_area + alfresco_area. Optional so existing TakeoffData literals are
   * unaffected.
   */
  total_area_m2?: number | null;
  /**
   * Stage 1 — the flat, per-opening list (window/slider/garage_window/sectional_door/
   * pa_door/entrance), derived losslessly from the canonical window set (schedule when
   * present, else windows_by_room) plus the sectional garage door. Additive: present
   * alongside windows_by_room. Optional so existing TakeoffData literals are unaffected.
   */
  openings?: Opening[] | null;
  /** Derived from openings[]: Σ area_m2 over ALL openings (glazed + the sectional door). */
  total_opening_sqm?: number | null;
  /** Derived from openings[]: Σ area_m2 over glazed openings only (excludes the sectional door). */
  glazed_sqm?: number | null;
};
