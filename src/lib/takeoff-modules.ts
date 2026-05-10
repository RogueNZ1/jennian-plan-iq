import type { Confidence } from "./jennian-data";

export type ModuleId =
  | "base-geometry"
  | "windows-doors"
  | "cladding"
  | "interior-linings"
  | "interior-trim"
  | "roofing"
  | "foundation"
  | "risk-flags";

export type TakeoffModule = {
  id: ModuleId;
  name: string;
  description: string;
  exportSheet: string;
};

export const MODULES: TakeoffModule[] = [
  { id: "base-geometry",    name: "Base Geometry",    description: "Areas, perimeters, pitches and core geometry.",            exportSheet: "Geometry"  },
  { id: "windows-doors",    name: "Windows & Doors",  description: "Window and door schedules, openings and deductions.",     exportSheet: "Schedule"  },
  { id: "cladding",         name: "Cladding",         description: "Wall cladding by elevation, with opening deductions.",    exportSheet: "Cladding"  },
  { id: "interior-linings", name: "Interior Linings", description: "GIB, bracing and interior lining quantities.",            exportSheet: "Linings"   },
  { id: "interior-trim",    name: "Interior Trim",    description: "Skirting, architraves, scotia and finishing trim.",       exportSheet: "Trim"      },
  { id: "roofing",          name: "Roofing",          description: "Roof area, ridge, eaves, fascia and flashings.",          exportSheet: "Roofing"   },
  { id: "foundation",       name: "Foundation",       description: "Slab, footings, perimeter and concrete volumes.",         exportSheet: "Foundation"},
  { id: "risk-flags",       name: "Risk Flags",       description: "Items requiring designer or estimator confirmation.",     exportSheet: "Risk"      },
];

/** Map an extracted quantity_type string to a module. */
export function moduleForQuantity(quantityType: string): ModuleId {
  const t = quantityType.toLowerCase();
  if (t.includes("roof")) return "roofing";
  if (t.includes("foundation") || t.includes("slab") || t.includes("footing")) return "foundation";
  if (t.includes("cladding") || t.includes("brick") || t.includes("weatherboard") || t.includes("linea")) return "cladding";
  if (t.includes("window") || t.includes("door")) return "windows-doors";
  if (t.includes("gib") || t.includes("lining")) return "interior-linings";
  if (t.includes("skirting") || t.includes("architrave") || t.includes("scotia") || t.includes("trim")) return "interior-trim";
  if (t.includes("risk") || t.includes("flag")) return "risk-flags";
  return "base-geometry";
}

/* ---------- Windows & Doors mock schedules ---------- */

export type WindowRow = {
  opening_id: string;
  elevation: string;
  room: string;
  width_mm: number;
  height_mm: number;
  type: string;
  glazing: string;
  cladding_behind: string;
  sill_head: string;
  confidence: Confidence;
  notes: string;
};

export type DoorRow = {
  door_id: string;
  location: string;
  width_mm: number;
  height_mm: number;
  door_type: string;
  internal_external: "Internal" | "External";
  architrave_required: string;
  jamb_required: string;
  confidence: Confidence;
  notes: string;
};

export const MOCK_WINDOWS: WindowRow[] = [
  {
    opening_id: "W01", elevation: "A", room: "Living",
    width_mm: 2180, height_mm: 1800, type: "Sliding window", glazing: "Clear",
    cladding_behind: "Brick veneer", sill_head: "Standard brick sill",
    confidence: "mid", notes: "Verify head height against ceiling batten.",
  },
  {
    opening_id: "W02", elevation: "B", room: "Bathroom",
    width_mm: 800, height_mm: 600, type: "Awning window", glazing: "Obscure",
    cladding_behind: "Brick veneer", sill_head: "Standard brick sill",
    confidence: "high", notes: "",
  },
];

export const MOCK_DOORS: DoorRow[] = [
  {
    door_id: "D01", location: "Entry",
    width_mm: 860, height_mm: 1980, door_type: "Aluminium front door",
    internal_external: "External", architrave_required: "Yes – internally", jamb_required: "Yes",
    confidence: "high", notes: "",
  },
  {
    door_id: "GD01", location: "Garage",
    width_mm: 2700, height_mm: 2100, door_type: "Sectional garage door",
    internal_external: "External", architrave_required: "No", jamb_required: "No",
    confidence: "high", notes: "",
  },
];

/* ---------- Cladding mock schedule ---------- */

export type CladdingRow = {
  cladding_type: string;
  elevation: string;
  gross_wall_length_lm: number;
  gross_wall_area_m2: number;
  opening_deductions_m2: number;
  net_cladding_area_m2: number;
  sill_length_lm: number;
  confidence: Confidence;
  notes: string;
};

export const MOCK_CLADDING: CladdingRow[] = [
  { cladding_type: "Brick veneer",     elevation: "A", gross_wall_length_lm: 14.2, gross_wall_area_m2: 34.08, opening_deductions_m2: 6.92, net_cladding_area_m2: 27.16, sill_length_lm: 4.36, confidence: "high", notes: "" },
  { cladding_type: "Brick veneer",     elevation: "B", gross_wall_length_lm: 13.8, gross_wall_area_m2: 33.12, opening_deductions_m2: 1.56, net_cladding_area_m2: 31.56, sill_length_lm: 0.80, confidence: "high", notes: "" },
  { cladding_type: "Linea weatherboard", elevation: "C", gross_wall_length_lm: 14.2, gross_wall_area_m2: 34.08, opening_deductions_m2: 0.00, net_cladding_area_m2: 34.08, sill_length_lm: 0.00, confidence: "mid",  notes: "Confirm gable end coverage." },
  { cladding_type: "Brick veneer",     elevation: "D", gross_wall_length_lm: 13.8, gross_wall_area_m2: 33.12, opening_deductions_m2: 3.92, net_cladding_area_m2: 29.20, sill_length_lm: 2.18, confidence: "mid",  notes: "Verify W03 location." },
];