export type WindowsByRoom = {
  [room: string]: { qty: number; height_m: number; width_m: number };
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
};
