export type WindowsByRoom = {
  [room: string]: { qty: number; height_m: number; width_m: number };
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
};
