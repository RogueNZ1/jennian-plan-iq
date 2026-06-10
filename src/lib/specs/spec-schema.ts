/**
 * SPECIFICATIONS SCHEMA — single source of truth for the meeting-spec picker
 * and the coded SPECIFICATIONS block on the IQ Import paste sheet.
 *
 * THE CONTRACT (Haydon builds the QS against this — treat as load-bearing):
 *  - Every spec owns a FIXED row on the IQ Import sheet, forever. Append-only:
 *    new specs take new rows; existing rows NEVER move, codes NEVER renumber.
 *    `tests/specs/spec-contract.golden.json` freezes this; CI fails on drift.
 *  - Columns at that row: A = spec id, B = numeric code, C = selected option
 *    label, D = area. The QS reads B by absolute row ('IQ Import'!B102 etc).
 *  - Code semantics: blank = NOT ANSWERED (export never invents a selection —
 *    the H176 doctrine), 0 = explicitly N/A, 1+ = a real selection.
 *  - Coding convention:
 *      • Selectors: 1 = standard/base inclusion, ascending by value/spec.
 *      • Upgrade toggles: 1 = No (base spec), 2 = Yes — so QS lines read
 *        uniformly as =IF(B{row}=2, cost, 0).
 *      • Heating codes are fixed by Haydon's brief: 1 Fully Ducted,
 *        2 High Wall, 3 Gas Fire, 4 Log Fire.
 *
 * SCOPE: deliberately lean. Anything the IQ engine reads off the plans
 * (foundations, roof, gables, stud height, ceiling form, skylights…) is NOT
 * a spec — the drawings already encode it. This block captures only what is
 * DECIDED IN THE MEETING and cannot be read from a plan.
 *
 * Source: Haydon_Edit_Meeting_Form.xlsx, restructured with Haydon into 10
 * areas (11 Jun 2026). Kitchen PC bands replace the form's 9–22K with
 * 10/15/20/25/30K per Haydon.
 */

export const SPEC_CONTRACT_VERSION = 2;

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
  /** Notes carried into the contract doc. */
  note?: string;
};

export type SpecGroupId =
  | "services"
  | "kitchen"
  | "laundry"
  | "appliances"
  | "hot_water"
  | "heating"
  | "bathrooms"
  | "interior"
  | "insulation"
  | "flooring";

export const SPEC_GROUPS: Array<{ id: SpecGroupId; label: string }> = [
  { id: "services", label: "Services" },
  { id: "kitchen", label: "Kitchen" },
  { id: "laundry", label: "Laundry" },
  { id: "appliances", label: "Appliances" },
  { id: "hot_water", label: "Hot Water" },
  { id: "heating", label: "Heating" },
  { id: "bathrooms", label: "Bathrooms" },
  { id: "interior", label: "Interior" },
  { id: "insulation", label: "Insulation" },
  { id: "flooring", label: "Flooring" },
];

/** Upgrade toggle: 1 = No (base), 2 = Yes. */
const TOGGLE: SpecOption[] = [
  { code: 1, label: "No (standard)" },
  { code: 2, label: "Yes" },
];

// ─── The contract. Rows assigned sequentially from SPEC_FIRST_ROW; once a
// row ships in the golden file it is permanent. ───────────────────────────
let _row = SPEC_FIRST_ROW;
const r = () => _row++;

export const SPECS: SpecDef[] = [
  // ── 1 · Services ──
  {
    id: "services",
    label: "Services",
    group: "services",
    row: r(),
    options: [
      { code: 1, label: "Residential" },
      { code: 2, label: "Rural" },
    ],
  },

  // ── 2 · Kitchen ──
  {
    id: "kitchen_pc",
    label: "Kitchen PC sum",
    group: "kitchen",
    row: r(),
    options: [
      { code: 1, label: "$10K" },
      { code: 2, label: "$15K" },
      { code: 3, label: "$20K" },
      { code: 4, label: "$25K" },
      { code: 5, label: "$30K" },
    ],
  },

  // ── 3 · Laundry ──
  {
    id: "laundry_pc",
    label: "Laundry PC sum",
    group: "laundry",
    row: r(),
    options: [
      { code: 1, label: "$2K" },
      { code: 2, label: "$4K" },
      { code: 3, label: "Robinhood" },
    ],
  },

  // ── 4 · Appliances ──
  {
    id: "cooktop",
    label: "Cooktop",
    group: "appliances",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Gas" },
      { code: 3, label: "Induction" },
    ],
  },
  {
    id: "oven",
    label: "Oven",
    group: "appliances",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Double" },
      { code: 3, label: "Freestanding" },
    ],
  },
  {
    id: "dishwasher",
    label: "Dishwasher",
    group: "appliances",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Double draw" },
      { code: 3, label: "Single draw" },
    ],
  },

  // ── 5 · Hot Water ──
  {
    id: "hot_water",
    label: "Hot water",
    group: "hot_water",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Rinnai 26" },
      { code: 3, label: "Hot water heat pump" },
    ],
  },

  // ── 6 · Heating ──
  {
    id: "heating",
    label: "Heating",
    group: "heating",
    row: r(),
    options: [
      { code: 1, label: "Fully ducted" },
      { code: 2, label: "High wall heat pump" },
      { code: 3, label: "Gas fire" },
      { code: 4, label: "Log fire" },
    ],
    note: "Codes fixed by Haydon's brief — ducted=1, high wall=2.",
  },

  // ── 7 · Bathrooms ──
  {
    id: "shower",
    label: "Shower",
    group: "bathrooms",
    row: r(),
    options: [
      { code: 1, label: "Acrylic" },
      { code: 2, label: "Tiled wet-floor" },
    ],
  },
  {
    id: "bath",
    label: "Bath",
    group: "bathrooms",
    row: r(),
    options: [
      { code: 1, label: "Tiled-in cradle" },
      { code: 2, label: "Freestanding" },
    ],
  },

  // ── 8 · Interior ──
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
    id: "ceiling_hatch",
    label: "Ceiling hatch",
    group: "interior",
    row: r(),
    options: [
      { code: 1, label: "Standard" },
      { code: 2, label: "Fakro attic stairs" },
    ],
  },

  // ── 9 · Insulation (independent upgrade toggles — they stack) ──
  {
    id: "insulation_acoustic",
    label: "Acoustic insulation",
    group: "insulation",
    row: r(),
    options: TOGGLE,
  },
  {
    id: "insulation_underslab",
    label: "Underslab insulation",
    group: "insulation",
    row: r(),
    options: TOGGLE,
  },
  {
    id: "insulation_hot_edge",
    label: "Hot edge insulation",
    group: "insulation",
    row: r(),
    options: TOGGLE,
  },

  // ── 10 · Flooring ──
  { id: "garage_carpet", label: "Garage carpet", group: "flooring", row: r(), options: TOGGLE },
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
