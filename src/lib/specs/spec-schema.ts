/**
 * SPECIFICATIONS SCHEMA — single source of truth for the meeting-spec picker
 * and the coded SPECIFICATIONS block on the IQ Import paste sheet.
 *
 * THE CONTRACT (Haydon builds the QS against this — treat as load-bearing):
 *  - Every spec owns a FIXED row on the IQ Import sheet, forever. Append-only:
 *    new specs take new rows; existing rows NEVER move, codes NEVER renumber.
 *    `tests/specs/spec-contract.golden.json` freezes this; CI fails on drift.
 *  - Columns at that row: A = spec id, B = numeric code, C = selected option
 *    label, D = group. The QS reads B by absolute row ('IQ Import'!B112 etc).
 *  - Code semantics: blank = NOT ANSWERED (export never invents a selection —
 *    the H176 doctrine), 0 = explicitly N/A, 1+ = a real selection.
 *  - Code order follows the printed order on Haydon's meeting form (left to
 *    right), with ONE deliberate exception: HEATING uses the order Haydon
 *    specified in the brief — 1 Fully Ducted, 2 High Wall Heatpump, 3 Gas
 *    Fire, 4 Log Fire.
 *  - Source form: Haydon_Edit_Meeting_Form.xlsx → ESTIMATING DETAILS (rows
 *    38–76). Option labels marked (verify) were truncated on the form; the
 *    LABEL may be corrected later but the CODE is permanent.
 */

export const SPEC_CONTRACT_VERSION = 1;

/** First row of the SPECIFICATIONS block on the IQ Import paste sheet. */
export const SPEC_BLOCK_HEADER_ROW = 100;
export const SPEC_FIRST_ROW = 101;
/** Floating blocks (MANUAL ENTRIES + CLADDING) must never reach this row. */
export const SPEC_GUARD_ROW = 95;

export type SpecOption = { code: number; label: string };

export type SpecDef = {
  /** Stable snake_case key — also printed in column A. Never rename. */
  id: string;
  /** Human label shown in the picker. */
  label: string;
  group: SpecGroupId;
  options: SpecOption[];
  /** Fixed IQ Import row. Assigned once, immutable. */
  row: number;
  /**
   * Auto-N/A dependency: when the named spec's answer is one of `codes`,
   * this spec is set to 0 (N/A) in the picker (still user-overridable).
   */
  naWhen?: { spec: string; codes: number[] };
  /** Notes carried into the contract doc (form truncations, duplicates…). */
  note?: string;
};

export type SpecGroupId =
  | "job"
  | "site_services"
  | "structure_exterior"
  | "interior"
  | "bathroom"
  | "ensuite"
  | "kitchen_laundry"
  | "electrical_heating"
  | "flooring";

export const SPEC_GROUPS: Array<{ id: SpecGroupId; label: string }> = [
  { id: "job", label: "Job" },
  { id: "site_services", label: "Site & Services" },
  { id: "structure_exterior", label: "Structure & Exterior" },
  { id: "interior", label: "Interior" },
  { id: "bathroom", label: "Bathroom" },
  { id: "ensuite", label: "Ensuite" },
  { id: "kitchen_laundry", label: "Kitchen & Laundry" },
  { id: "electrical_heating", label: "Electrical & Heating" },
  { id: "flooring", label: "Flooring" },
];

const NA: SpecOption = { code: 0, label: "N/A" };
const YN: SpecOption[] = [
  { code: 1, label: "Yes" },
  { code: 2, label: "No" },
];

/** Residential answer on property_type → rural-only specs auto-N/A. */
const RURAL_ONLY = { spec: "property_type", codes: [1] };

// ─── The contract. Rows assigned sequentially from SPEC_FIRST_ROW; once a
// row ships in the golden file it is permanent. ───────────────────────────
let _row = SPEC_FIRST_ROW;
const r = () => _row++;

export const SPECS: SpecDef[] = [
  // ── Job ──
  {
    id: "priority",
    label: "Priority",
    group: "job",
    row: r(),
    options: [
      { code: 1, label: "Green" },
      { code: 2, label: "Yellow" },
      { code: 3, label: "Red" },
    ],
  },

  // ── Site & Services ──
  {
    id: "property_type",
    label: "Property type",
    group: "site_services",
    row: r(),
    options: [
      { code: 1, label: "Residential" },
      { code: 2, label: "Rural" },
    ],
    note: "First question — branches the rural-only services set below.",
  },
  { id: "soil_test", label: "Soil test required", group: "site_services", row: r(), options: YN },
  { id: "survey", label: "Survey required", group: "site_services", row: r(), options: YN },
  {
    id: "council_services",
    label: "Council services",
    group: "site_services",
    row: r(),
    options: YN,
  },
  {
    id: "septic_tank",
    label: "Septic tank",
    group: "site_services",
    row: r(),
    options: [NA, { code: 1, label: "Hynds" }, { code: 2, label: "Other" }],
    naWhen: RURAL_ONLY,
  },
  {
    id: "water_tanks",
    label: "Water tanks",
    group: "site_services",
    row: r(),
    options: [NA, { code: 1, label: "Plastic" }, { code: 2, label: "Concrete" }],
    naWhen: RURAL_ONLY,
  },
  {
    id: "water_tank_base",
    label: "Water tank base",
    group: "site_services",
    row: r(),
    options: [NA, { code: 1, label: "Level base" }, { code: 2, label: "Half buried (verify)" }],
    naWhen: RURAL_ONLY,
    note: "Form text truncated after 'LEVEL BASE  1/2 B…' — labels to verify, codes fixed.",
  },
  {
    id: "water_pump",
    label: "Water pump",
    group: "site_services",
    row: r(),
    options: [
      NA,
      { code: 1, label: "External with shed" },
      { code: 2, label: "Grundfos submersible" },
    ],
    naWhen: RURAL_ONLY,
  },
  {
    id: "rural_access",
    label: "Rural access way / hardfill",
    group: "site_services",
    row: r(),
    options: [NA, { code: 1, label: "Yes" }, { code: 2, label: "No" }],
    naWhen: RURAL_ONLY,
  },
  {
    id: "vehicle_crossing",
    label: "Vehicle crossing required",
    group: "site_services",
    row: r(),
    options: YN,
  },
  { id: "fencing", label: "Fencing required", group: "site_services", row: r(), options: YN },

  // ── Structure & Exterior ──
  {
    id: "foundations",
    label: "Foundations",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Engineered" },
      { code: 3, label: "Ribraft" },
    ],
  },
  {
    id: "roof_style",
    label: "Roof style",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "Hip" },
      { code: 2, label: "Gable" },
      { code: 3, label: "Mono" },
    ],
    note: "Meeting-confirmed design intent; extraction also reports gables independently.",
  },
  {
    id: "roof_material",
    label: "Roof material",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "Colourtile" },
      { code: 2, label: "Longrun" },
    ],
  },
  {
    id: "stud_height",
    label: "Stud height",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "2.4m" },
      { code: 2, label: "2.55m" },
      { code: 3, label: "2.7m" },
    ],
    note: "Extraction also feeds ceiling height to B22 — QS can cross-check the two.",
  },
  {
    id: "ceiling_feature",
    label: "Ceiling",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "Standard flat" },
      { code: 2, label: "Vaulted" },
      { code: 3, label: "Cathedral" },
    ],
  },
  {
    id: "posts",
    label: "Posts",
    group: "structure_exterior",
    row: r(),
    options: [NA, { code: 1, label: "Timber, painted" }, { code: 2, label: "Clad" }],
  },
  {
    id: "garage_door",
    label: "Garage door",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Insulated" },
    ],
    note: "Meeting-confirmed spec for the H175–180 block — retires the silent H176 insulated default once the QS reads it.",
  },
  {
    id: "window_glazing",
    label: "Window glazing",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Tinted" },
      { code: 3, label: "Low-E Max" },
      { code: 4, label: "Tinted + Low-E (verify)" },
    ],
    note: "Form text truncated after 'TINTED  LOW-E MAX  BOXE…' — labels to verify, codes fixed.",
  },
  {
    id: "front_door",
    label: "Front door",
    group: "structure_exterior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Double" },
      { code: 3, label: "Sidelights" },
      { code: 4, label: "Double + sidelights" },
    ],
  },
  { id: "cat_flap", label: "Cat flap", group: "structure_exterior", row: r(), options: YN },

  // ── Interior ──
  {
    id: "insulation",
    label: "Insulation",
    group: "interior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Incl. garage" },
      { code: 3, label: "50mm Expol" },
      { code: 4, label: "Garage + 50mm Expol" },
    ],
  },
  { id: "acoustic_system", label: "Acoustic system", group: "interior", row: r(), options: YN },
  {
    id: "gib_cove",
    label: "GIB cove",
    group: "interior",
    row: r(),
    options: [
      { code: 1, label: "Std 55mm" },
      { code: 2, label: "Square stop" },
      { code: 3, label: "Other" },
    ],
  },
  {
    id: "interior_door_type",
    label: "Interior door type",
    group: "interior",
    row: r(),
    options: [
      { code: 1, label: "Std flush" },
      { code: 2, label: "U groove" },
      { code: 3, label: "V groove" },
    ],
  },
  {
    id: "master_robe",
    label: "Master robe",
    group: "interior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Melteca" },
      { code: 3, label: "PC sum" },
    ],
  },
  {
    id: "ceiling_hatch",
    label: "Ceiling hatch",
    group: "interior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Fakro attic stair" },
    ],
  },

  // ── Bathroom ──
  {
    id: "bathroom_vanity",
    label: "Bathroom vanity",
    group: "bathroom",
    row: r(),
    options: [
      { code: 1, label: "900mm" },
      { code: 2, label: "1200mm" },
      { code: 3, label: "1500 double" },
    ],
  },
  {
    id: "taps",
    label: "Taps",
    group: "bathroom",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Milano" },
      { code: 3, label: "Waipori" },
    ],
  },
  {
    id: "mirror",
    label: "Mirror",
    group: "bathroom",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Anti-fog" },
    ],
  },
  {
    id: "bath",
    label: "Bath",
    group: "bathroom",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Contro" },
      { code: 3, label: "No bath" },
    ],
  },
  {
    id: "tiles_around_bath",
    label: "Tiles around bath",
    group: "bathroom",
    row: r(),
    options: [
      NA,
      { code: 1, label: "Flush" },
      { code: 2, label: "Plinth" },
      { code: 3, label: "Full-wall" },
    ],
    naWhen: { spec: "bath", codes: [3] },
  },
  {
    id: "shower",
    label: "Shower",
    group: "bathroom",
    row: r(),
    options: [
      { code: 1, label: "Standard acrylic" },
      { code: 2, label: "Fully tiled" },
    ],
  },
  {
    id: "towel_rail",
    label: "Towel rail",
    group: "bathroom",
    row: r(),
    options: [
      { code: 1, label: "Standard heated" },
      { code: 2, label: "Not heated" },
      { code: 3, label: "Two-rail" },
    ],
  },
  {
    id: "toilet",
    label: "Toilet",
    group: "bathroom",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Cygnet Neu" },
      { code: 3, label: "Urbane" },
    ],
  },
  {
    id: "basin_in_toilet",
    label: "Basin in separate WC",
    group: "bathroom",
    row: r(),
    options: YN,
  },

  // ── Ensuite ──
  {
    id: "ensuite_vanity",
    label: "Ensuite vanity",
    group: "ensuite",
    row: r(),
    options: [
      { code: 1, label: "900mm" },
      { code: 2, label: "1200mm" },
      { code: 3, label: "1500 double" },
    ],
  },
  {
    id: "ensuite_mirror",
    label: "Ensuite mirror",
    group: "ensuite",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Anti-fog" },
    ],
  },
  {
    id: "ensuite_bath",
    label: "Ensuite bath",
    group: "ensuite",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Contro" },
      { code: 3, label: "No bath" },
    ],
  },
  {
    id: "ensuite_tiles_around_bath",
    label: "Ensuite tiles around bath",
    group: "ensuite",
    row: r(),
    options: [
      NA,
      { code: 1, label: "Flush" },
      { code: 2, label: "Plinth" },
      { code: 3, label: "Full-wall" },
    ],
    naWhen: { spec: "ensuite_bath", codes: [3] },
  },
  {
    id: "ensuite_shower",
    label: "Ensuite shower",
    group: "ensuite",
    row: r(),
    options: [
      { code: 1, label: "Standard acrylic" },
      { code: 2, label: "Fully tiled" },
    ],
  },
  {
    id: "ensuite_towel_rail",
    label: "Ensuite towel rail",
    group: "ensuite",
    row: r(),
    options: [
      { code: 1, label: "Standard heated" },
      { code: 2, label: "Not heated" },
      { code: 3, label: "Two-rail" },
    ],
    note: "Form lists towel rail twice (rows 39 & 69) — assumed second set is ensuite. Verify.",
  },
  {
    id: "ensuite_toilet",
    label: "Ensuite toilet",
    group: "ensuite",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Cygnet Neu" },
      { code: 3, label: "Urbane" },
    ],
    note: "Form lists toilet twice (rows 40 & 70) — assumed second set is ensuite. Verify.",
  },

  // ── Kitchen & Laundry ──
  {
    id: "kitchen_pc",
    label: "Kitchen PC sum",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "$9K" },
      { code: 2, label: "$12K" },
      { code: 3, label: "$15K" },
      { code: 4, label: "$18K" },
      { code: 5, label: "$22K" },
    ],
  },
  {
    id: "walkin_pantry",
    label: "Walk-in pantry",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 0, label: "None" },
      { code: 1, label: "$2.5K" },
      { code: 2, label: "$3.5K" },
      { code: 3, label: "$5.0K" },
      { code: 4, label: "$7.0K" },
    ],
  },
  {
    id: "benchtop",
    label: "Benchtop",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Laminate" },
      { code: 2, label: "Engineered stone" },
    ],
  },
  {
    id: "splashback",
    label: "Splashback",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Tiled" },
    ],
  },
  {
    id: "waste_disposal",
    label: "Waste",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Other (verify)" },
    ],
    note: "Form prints only 'STD' — option 2 reserved. Verify.",
  },
  {
    id: "dishwasher",
    label: "Dishwasher",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Single drawer" },
      { code: 3, label: "Double drawer" },
    ],
  },
  {
    id: "cooktop",
    label: "Cooktop",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Touch & slide" },
      { code: 3, label: "Gas" },
      { code: 4, label: "Induction" },
    ],
  },
  {
    id: "oven",
    label: "Oven",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Two ovens" },
      { code: 3, label: "Double" },
      { code: 4, label: "Freestanding 900" },
    ],
  },
  {
    id: "fridge_plumbing",
    label: "Fridge water connection",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "No" },
      { code: 2, label: "Water" },
    ],
  },
  {
    id: "laundry_unit",
    label: "Laundry unit",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "$2.5K" },
      { code: 3, label: "Client supplied" },
    ],
  },
  {
    id: "hot_water",
    label: "Hot water",
    group: "kitchen_laundry",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Rinnai 26" },
    ],
  },

  // ── Electrical & Heating ──
  {
    id: "electrical_spec",
    label: "Electrical spec",
    group: "electrical_heating",
    row: r(),
    options: [
      { code: 1, label: "Residential" },
      { code: 2, label: "Rural" },
    ],
    note: "Own form line (D52); picker pre-suggests from property type but it is its own answer.",
  },
  { id: "home_hub", label: "Home hub", group: "electrical_heating", row: r(), options: YN },
  {
    id: "alarm",
    label: "Alarm system",
    group: "electrical_heating",
    row: r(),
    options: [
      { code: 0, label: "None" },
      { code: 1, label: "Prewire" },
      { code: 2, label: "Full installation" },
    ],
  },
  { id: "doorbell", label: "Doorbell", group: "electrical_heating", row: r(), options: YN },
  { id: "solar_power", label: "Solar power", group: "electrical_heating", row: r(), options: YN },
  {
    id: "feature_lighting",
    label: "Feature lighting",
    group: "electrical_heating",
    row: r(),
    options: YN,
  },
  {
    id: "heating",
    label: "Heating",
    group: "electrical_heating",
    row: r(),
    options: [
      { code: 1, label: "Fully ducted heatpump" },
      { code: 2, label: "High wall heatpump" },
      { code: 3, label: "Gas fire" },
      { code: 4, label: "Log fire" },
    ],
    note: "Code order set by Haydon's brief (ducted=1, high wall=2) — the one deliberate deviation from form print order.",
  },
  {
    id: "heat_transfer_kit",
    label: "Heat transfer kit",
    group: "electrical_heating",
    row: r(),
    options: YN,
  },
  { id: "ventilation", label: "Ventilation", group: "electrical_heating", row: r(), options: YN },
  {
    id: "solatube",
    label: "Solatube",
    group: "electrical_heating",
    row: r(),
    options: [NA, ...YN],
  },
  {
    id: "beam_vacuum",
    label: "Beam vacuum",
    group: "electrical_heating",
    row: r(),
    options: [NA, ...YN],
  },
  {
    id: "skylights",
    label: "Skylights",
    group: "electrical_heating",
    row: r(),
    options: [NA, ...YN],
  },

  // ── Flooring ──
  {
    id: "carpet",
    label: "Carpet",
    group: "flooring",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Entry" },
      { code: 3, label: "Other" },
    ],
  },
  {
    id: "vinyl",
    label: "Vinyl",
    group: "flooring",
    row: r(),
    options: [
      { code: 1, label: "Std planking" },
      { code: 2, label: "Sheet vinyl" },
      { code: 3, label: "Other" },
    ],
  },
  {
    id: "underlay",
    label: "Underlay",
    group: "flooring",
    row: r(),
    options: [
      { code: 1, label: "9.5mm" },
      { code: 2, label: "11mm" },
    ],
  },
  {
    id: "tiled_floor_entry",
    label: "Tiled floor — Entry",
    group: "flooring",
    row: r(),
    options: [NA, ...YN],
  },
  {
    id: "tiled_floor_bath",
    label: "Tiled floor — Bathroom",
    group: "flooring",
    row: r(),
    options: [NA, ...YN],
  },
  {
    id: "tiled_floor_ensuite",
    label: "Tiled floor — Ensuite",
    group: "flooring",
    row: r(),
    options: [NA, ...YN],
  },
  {
    id: "tiled_floor_kitchen",
    label: "Tiled floor — Kitchen",
    group: "flooring",
    row: r(),
    options: [NA, ...YN],
  },
  {
    id: "tiled_floor_dining",
    label: "Tiled floor — Dining",
    group: "flooring",
    row: r(),
    options: [NA, ...YN],
  },
  {
    id: "tiled_floor_laundry",
    label: "Tiled floor — Laundry",
    group: "flooring",
    row: r(),
    options: [NA, ...YN],
  },
  { id: "garage_carpet", label: "Garage carpet", group: "flooring", row: r(), options: YN },
  { id: "wall_tiling", label: "Wall tiling", group: "flooring", row: r(), options: YN },
];

export const SPEC_LAST_ROW = _row - 1;

// ─── Answer shape persisted at jobs.specifications ─────────────────────────
export type SpecAnswers = Record<string, number>;
export type JobSpecifications = {
  v: number;
  answers: SpecAnswers;
  updatedAt?: string;
};

export function emptySpecifications(): JobSpecifications {
  return { v: SPEC_CONTRACT_VERSION, answers: {} };
}

/** Parse whatever is in the jsonb column into a safe shape. */
export function parseSpecifications(raw: unknown): JobSpecifications {
  if (raw && typeof raw === "object" && "answers" in (raw as object)) {
    const o = raw as { v?: number; answers?: unknown; updatedAt?: string };
    const answers: SpecAnswers = {};
    if (o.answers && typeof o.answers === "object") {
      for (const [k, v] of Object.entries(o.answers as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isInteger(v) && v >= 0) answers[k] = v;
      }
    }
    return { v: o.v ?? SPEC_CONTRACT_VERSION, answers, updatedAt: o.updatedAt };
  }
  return emptySpecifications();
}

export function specById(id: string): SpecDef | undefined {
  return SPECS.find((s) => s.id === id);
}

export function optionLabel(spec: SpecDef, code: number | undefined): string | null {
  if (code == null) return null;
  return spec.options.find((o) => o.code === code)?.label ?? null;
}

export function specsInGroup(group: SpecGroupId): SpecDef[] {
  return SPECS.filter((s) => s.group === group);
}

export function answeredCount(answers: SpecAnswers): { answered: number; total: number } {
  let answered = 0;
  for (const s of SPECS) if (answers[s.id] != null) answered++;
  return { answered, total: SPECS.length };
}

/** Specs that should auto-set to N/A given the current answers. */
export function autoNaTargets(answers: SpecAnswers): string[] {
  const out: string[] = [];
  for (const s of SPECS) {
    if (!s.naWhen) continue;
    const driver = answers[s.naWhen.spec];
    if (driver != null && s.naWhen.codes.includes(driver) && answers[s.id] == null) out.push(s.id);
  }
  return out;
}
