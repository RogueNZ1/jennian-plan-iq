/**
 * IQ Modules — modular quantity / fixture / risk extraction packages.
 *
 * The data here is INTENTIONALLY mock data so the UI can be exercised
 * end-to-end before the real OpenAI extraction pipeline is wired up.
 *
 * Each module declares a list of `IQItemTemplate`s. At runtime, those
 * templates are turned into editable `IQItem` rows — dummy values are
 * generated deterministically per (jobId, moduleId, itemKey) so the same
 * job always shows the same starting numbers, and edits persist via
 * localStorage.
 *
 * To swap in real AI extraction later:
 *   - Replace `runDummyExtraction()` with a server function that calls the
 *     OpenAI extraction worker for the given job/module.
 *   - Keep the IQItem shape (key, description, unit, extractedQuantity,
 *     confidence, notes, finalQuantity?) — the table UI is built around it.
 */

import type { Confidence } from "./jennian-data";

export type IQModuleId =
  | "iq-core"
  | "iq-electrical"
  | "iq-plumbing"
  | "iq-linings"
  | "iq-framing"
  | "iq-cladding"
  | "iq-roofing"
  | "iq-margin"
  | "iq-procurement";

export type IQModuleStatus = "not_started" | "ready" | "in_review" | "approved";

export type IQItemTemplate = {
  key: string;
  description: string;
  unit: string;
  /** Range (min,max) used to seed deterministic dummy values. */
  range: [number, number];
  /** Decimal places for the dummy value. */
  decimals?: number;
};

export type IQModule = {
  id: IQModuleId;
  name: string;
  shortDescription: string;
  longDescription: string;
  exportSheet: string;
  items: IQItemTemplate[];
};

export type IQItem = {
  key: string;
  description: string;
  unit: string;
  extractedQuantity: number;
  finalQuantity: number;
  confidence: Confidence;
  notes: string;
  approved: boolean;
};

/** ---------- Module catalogue ---------- */

const r = (min: number, max: number, decimals = 0): IQItemTemplate["range"] => [min, max] as [number, number] & { _d?: number } extends never ? never : [number, number];
// (range is just a tuple; decimals lives on the template directly)
void r;

export const IQ_MODULES: IQModule[] = [
  {
    id: "iq-core",
    name: "IQ Core",
    shortDescription: "Architectural quantity review.",
    longDescription: "Core architectural geometry — areas, perimeters, schedules and pitches that drive every downstream trade package.",
    exportSheet: "Core",
    items: [
      { key: "house_area",          description: "House Area",           unit: "m²", range: [110, 240], decimals: 2 },
      { key: "foundation_area",     description: "Foundation Area",      unit: "m²", range: [115, 250], decimals: 2 },
      { key: "roof_area",           description: "Roof Area",            unit: "m²", range: [130, 280], decimals: 2 },
      { key: "roof_pitch",          description: "Roof Pitch",           unit: "°",  range: [15, 35],   decimals: 0 },
      { key: "external_perimeter",  description: "External Perimeter",   unit: "lm", range: [40, 95],   decimals: 2 },
      { key: "internal_wall_length",description: "Internal Wall Length", unit: "lm", range: [45, 120],  decimals: 2 },
      { key: "garage_area",         description: "Garage Area",          unit: "m²", range: [18, 42],   decimals: 2 },
      { key: "living_area",         description: "Living Area",          unit: "m²", range: [85, 200],  decimals: 2 },
      { key: "window_schedule",     description: "Window Schedule",      unit: "qty",range: [8, 24] },
      { key: "door_schedule",       description: "Door Schedule",        unit: "qty",range: [10, 22] },
      { key: "wet_area_lengths",    description: "Wet Area Lengths",     unit: "lm", range: [6, 22],    decimals: 2 },
      { key: "cladding_lengths",    description: "Cladding Lengths",     unit: "lm", range: [40, 95],   decimals: 2 },
    ],
  },
  {
    id: "iq-electrical",
    name: "IQ Electrical",
    shortDescription: "Electrical points, lighting and appliance schedule.",
    longDescription: "Electrical takeoff for power, lighting, low-voltage and appliance points. Supports plan-counted quantities and template-based allowances when a marked-up electrical plan is not yet available.",
    exportSheet: "Electrical",
    items: [
      { key: "single_power",     description: "Single Power Points",   unit: "qty", range: [4, 14] },
      { key: "double_power",     description: "Double Power Points",   unit: "qty", range: [18, 48] },
      { key: "switches",         description: "Switches",              unit: "qty", range: [12, 32] },
      { key: "two_way_switches", description: "2-way switches",        unit: "qty", range: [4, 14] },
      { key: "three_way_switches",description: "3-way switches",       unit: "qty", range: [0, 4] },
      { key: "downlights",       description: "Downlights",            unit: "qty", range: [22, 60] },
      { key: "exterior_lights",  description: "Exterior Lights",       unit: "qty", range: [4, 12] },
      { key: "sensor_lights",    description: "Sensor Lights",         unit: "qty", range: [1, 6] },
      { key: "smoke_detectors",  description: "Smoke Detectors",       unit: "qty", range: [2, 6] },
      { key: "extractor_fans",   description: "Extractor Fans",        unit: "qty", range: [1, 4] },
      { key: "cat6_points",      description: "CAT6 Points",           unit: "qty", range: [2, 8] },
      { key: "hdmi_points",      description: "HDMI Points",           unit: "qty", range: [0, 4] },
      { key: "tv_points",        description: "TV Points",             unit: "qty", range: [1, 5] },
      { key: "appliance_outlets",description: "Appliance Outlets",     unit: "qty", range: [4, 10] },
      { key: "garage_motor",     description: "Garage Motor Outlets",  unit: "qty", range: [1, 2] },
    ],
  },
  {
    id: "iq-plumbing",
    name: "IQ Plumbing",
    shortDescription: "Fixture and plumbing schedule.",
    longDescription: "Fixture schedule across kitchen, bathroom, laundry and exterior — feeds the plumbing supplier RFQ.",
    exportSheet: "Plumbing",
    items: [
      { key: "toilets",         description: "Toilets",               unit: "qty", range: [1, 4] },
      { key: "vanities",        description: "Vanities",              unit: "qty", range: [1, 4] },
      { key: "showers",         description: "Showers",               unit: "qty", range: [1, 3] },
      { key: "baths",           description: "Baths",                 unit: "qty", range: [0, 2] },
      { key: "mixers",          description: "Mixers",                unit: "qty", range: [4, 10] },
      { key: "towel_rails",     description: "Towel Rails",           unit: "qty", range: [1, 4] },
      { key: "hot_water_cyl",   description: "Hot Water Cylinders",   unit: "qty", range: [1, 2] },
      { key: "exterior_taps",   description: "Exterior Taps",         unit: "qty", range: [2, 5] },
      { key: "kitchen_fixtures",description: "Kitchen Fixtures",      unit: "qty", range: [3, 8] },
      { key: "laundry_fixtures",description: "Laundry Fixtures",      unit: "qty", range: [2, 5] },
    ],
  },
  {
    id: "iq-linings",
    name: "IQ Linings",
    shortDescription: "Interior linings and trim.",
    longDescription: "GIB, Aqualine, Hardiegroove, ply and finishing trim across all interior surfaces.",
    exportSheet: "Linings",
    items: [
      { key: "std_gib_walls",     description: "Standard Gib Walls",   unit: "m²", range: [180, 360], decimals: 2 },
      { key: "aqualine_walls",    description: "Aqualine Walls",       unit: "m²", range: [25, 70],   decimals: 2 },
      { key: "std_ceilings",      description: "Standard Ceilings",    unit: "m²", range: [110, 220], decimals: 2 },
      { key: "aqualine_ceilings", description: "Aqualine Ceilings",    unit: "m²", range: [8, 30],    decimals: 2 },
      { key: "hardiegroove_walls",description: "Hardiegroove Walls",   unit: "m²", range: [0, 28],    decimals: 2 },
      { key: "garage_ply",        description: "Garage Ply",           unit: "m²", range: [40, 90],   decimals: 2 },
      { key: "scotia",            description: "Scotia",               unit: "lm", range: [55, 120],  decimals: 2 },
      { key: "skirting",          description: "Skirting",             unit: "lm", range: [65, 145],  decimals: 2 },
      { key: "architraves",       description: "Architraves",          unit: "lm", range: [80, 180],  decimals: 2 },
    ],
  },
  {
    id: "iq-framing",
    name: "IQ Framing",
    shortDescription: "Framing quantity schedule.",
    longDescription: "Wall framing, openings, lintels, studs and noggings ready for the timber supplier RFQ.",
    exportSheet: "Framing",
    items: [
      { key: "ext_walls",        description: "External Walls",         unit: "lm",  range: [40, 95],  decimals: 2 },
      { key: "int_walls",        description: "Internal Walls",         unit: "lm",  range: [45, 120], decimals: 2 },
      { key: "openings",         description: "Openings",               unit: "qty", range: [16, 38] },
      { key: "lintels",          description: "Lintels",                unit: "qty", range: [10, 26] },
      { key: "stud_count",       description: "Stud Count",             unit: "qty", range: [180, 420] },
      { key: "noggings",         description: "Noggings",               unit: "lm",  range: [120, 280],decimals: 2 },
      { key: "cavity_slider",    description: "Cavity Slider Framing",  unit: "qty", range: [0, 4] },
      { key: "tile_shower_dwangs",description: "Tile Shower Dwangs",    unit: "qty", range: [4, 14] },
      { key: "wanz_nogging",     description: "WANZ Nogging",           unit: "lm",  range: [3, 10],   decimals: 2 },
    ],
  },
  {
    id: "iq-cladding",
    name: "IQ Cladding",
    shortDescription: "Cladding and brick quantity schedule.",
    longDescription: "Brick, weatherboard and feature cladding — areas, lineal metres, flashings, sills and corners.",
    exportSheet: "Cladding",
    items: [
      { key: "brick_area",       description: "Brick Area",          unit: "m²", range: [60, 160], decimals: 2 },
      { key: "brick_lineal",     description: "Brick Lineal Metres", unit: "lm", range: [22, 60],  decimals: 2 },
      { key: "cladding_area",    description: "Cladding Area",       unit: "m²", range: [40, 120], decimals: 2 },
      { key: "feature_cladding", description: "Feature Cladding",    unit: "m²", range: [4, 28],   decimals: 2 },
      { key: "flashings",        description: "Flashings",           unit: "lm", range: [25, 70],  decimals: 2 },
      { key: "sills",            description: "Sills",               unit: "lm", range: [10, 28],  decimals: 2 },
      { key: "corners",          description: "Corners",             unit: "qty", range: [4, 12] },
    ],
  },
  {
    id: "iq-roofing",
    name: "IQ Roofing",
    shortDescription: "Roofing quantity schedule.",
    longDescription: "Roof areas, ridges, hips, valleys, fascia, spouting and downpipes for the roofing RFQ.",
    exportSheet: "Roofing",
    items: [
      { key: "roof_area",   description: "Roof Area",   unit: "m²", range: [130, 280], decimals: 2 },
      { key: "pitch",       description: "Pitch",       unit: "°",  range: [15, 35] },
      { key: "valleys",     description: "Valleys",     unit: "lm", range: [0, 14],   decimals: 2 },
      { key: "ridges",      description: "Ridges",      unit: "lm", range: [10, 32],  decimals: 2 },
      { key: "hips",        description: "Hips",        unit: "lm", range: [0, 22],   decimals: 2 },
      { key: "gutters",     description: "Gutters",     unit: "lm", range: [40, 95],  decimals: 2 },
      { key: "fascia",      description: "Fascia",      unit: "lm", range: [40, 95],  decimals: 2 },
      { key: "spouting",    description: "Spouting",    unit: "lm", range: [40, 95],  decimals: 2 },
      { key: "downpipes",   description: "Downpipes",   unit: "qty",range: [3, 8] },
    ],
  },
  {
    id: "iq-margin",
    name: "IQ Margin",
    shortDescription: "Pre-unconditional risk engine.",
    longDescription: "Surfaces missing scope, hidden assumptions and spec creep before the contract goes unconditional.",
    exportSheet: "Margin",
    items: [
      { key: "missing_retaining",  description: "Missing Retaining",        unit: "flag", range: [0, 1] },
      { key: "earthworks_risk",    description: "Earthworks Risk",          unit: "flag", range: [0, 1] },
      { key: "landscaping_assump", description: "Landscaping Assumptions",  unit: "flag", range: [0, 1] },
      { key: "long_driveway",      description: "Long Driveway",            unit: "flag", range: [0, 1] },
      { key: "missing_drainage",   description: "Missing Drainage",         unit: "flag", range: [0, 1] },
      { key: "joinery_mismatch",   description: "Joinery Allowance Mismatch",unit:"flag", range: [0, 1] },
      { key: "spec_creep",         description: "Spec Creep",               unit: "flag", range: [0, 1] },
      { key: "scope_gaps",         description: "Scope Gaps",               unit: "flag", range: [0, 1] },
    ],
  },
  {
    id: "iq-procurement",
    name: "IQ Procurement",
    shortDescription: "Supplier-ready export.",
    longDescription: "Packages approved quantities into RFQs and purchase orders against Jennian's preferred supplier list.",
    exportSheet: "Procurement",
    items: [
      { key: "rfq_summaries",  description: "RFQ Summaries",          unit: "qty", range: [4, 9] },
      { key: "po_quantities",  description: "Purchase Order Quantities",unit:"qty", range: [60, 220] },
      { key: "supplier_codes", description: "Supplier Codes",         unit: "qty", range: [80, 280] },
      { key: "csv_export",     description: "CSV Export",             unit: "file",range: [1, 1] },
      { key: "excel_export",   description: "Excel Export",           unit: "file",range: [1, 1] },
    ],
  },
];

export function findIQModule(id: string): IQModule | undefined {
  return IQ_MODULES.find((m) => m.id === id);
}

/** ---------- Deterministic dummy generator ---------- */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = (h ^ str.charCodeAt(i)) * 16777619;
  return Math.abs(h | 0);
}

function pickConfidence(seed: number): Confidence {
  const m = seed % 10;
  if (m < 6) return "high";
  if (m < 9) return "mid";
  return "low";
}

function dummyValue(t: IQItemTemplate, seed: number): number {
  const [min, max] = t.range;
  const span = max - min;
  const v = min + ((seed % 1000) / 1000) * span;
  const d = t.decimals ?? 0;
  return Number(v.toFixed(d));
}

/** Build the initial dummy `IQItem[]` for a (job, module). */
export function buildIQItems(jobKey: string, mod: IQModule): IQItem[] {
  return mod.items.map((t) => {
    const seed = hash(`${jobKey}::${mod.id}::${t.key}`);
    const value = dummyValue(t, seed);
    return {
      key: t.key,
      description: t.description,
      unit: t.unit,
      extractedQuantity: value,
      finalQuantity: value,
      confidence: pickConfidence(seed),
      notes: "",
      approved: false,
    };
  });
}

/** ---------- Persistence (localStorage, dummy-only) ---------- */

type Persisted = {
  items: IQItem[];
  status: IQModuleStatus;
  lastRunAt: string | null;
};

const KEY = (jobKey: string, moduleId: IQModuleId) => `iq:${jobKey}:${moduleId}`;

export function loadModuleState(jobKey: string, mod: IQModule): Persisted {
  if (typeof window === "undefined") {
    return { items: buildIQItems(jobKey, mod), status: "not_started", lastRunAt: null };
  }
  try {
    const raw = localStorage.getItem(KEY(jobKey, mod.id));
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {
    /* ignore */
  }
  return { items: buildIQItems(jobKey, mod), status: "not_started", lastRunAt: null };
}

export function saveModuleState(jobKey: string, moduleId: IQModuleId, state: Persisted) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(jobKey, moduleId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Confidence percentage = share of items with `high` confidence. */
export function confidencePercent(items: IQItem[]): number {
  if (items.length === 0) return 0;
  const highs = items.filter((i) => i.confidence === "high").length;
  return Math.round((highs / items.length) * 100);
}

export const STATUS_LABEL: Record<IQModuleStatus, string> = {
  not_started: "Not Started",
  ready: "Ready",
  in_review: "In Review",
  approved: "Approved",
};

/**
 * Future: replace with a server function that calls the OpenAI extraction
 * worker for the given job + module. Returns updated items.
 */
export async function runDummyExtraction(jobKey: string, mod: IQModule): Promise<IQItem[]> {
  // Re-seed with a fresh per-run nonce so values change after each "run".
  const nonce = Date.now().toString(36);
  return mod.items.map((t) => {
    const seed = hash(`${jobKey}::${mod.id}::${t.key}::${nonce}`);
    const value = dummyValue(t, seed);
    return {
      key: t.key,
      description: t.description,
      unit: t.unit,
      extractedQuantity: value,
      finalQuantity: value,
      confidence: pickConfidence(seed),
      notes: "",
      approved: false,
    };
  });
}

/**
 * Seed every module for a job with deterministic dummy items and mark them
 * `ready` so the Modules Overview shows live counts/confidence immediately
 * after upload + plan review.
 */
export function seedAllModulesForJob(jobKey: string) {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  for (const mod of IQ_MODULES) {
    const existing = (() => {
      try {
        const raw = localStorage.getItem(KEY(jobKey, mod.id));
        return raw ? (JSON.parse(raw) as Persisted) : null;
      } catch {
        return null;
      }
    })();
    // Don't clobber edits already in progress.
    if (existing && existing.status !== "not_started") continue;
    saveModuleState(jobKey, mod.id, {
      items: buildIQItems(jobKey, mod),
      status: "ready",
      lastRunAt: now,
    });
  }
}

/** ---------- IQ Electrical: Template Allowance Mode ---------- */

export type ElectricalMode = "plan_count" | "template_allowance";

export type ReviewStatus = "review_required" | "confirmed" | "excluded";

export type ElectricalAllowanceRow = {
  key: string;
  item: string;
  code: string;
  description: string;
  basis: string;
  allowedQuantity: number;
  confirmedQuantity: number;
  reviewStatus: ReviewStatus;
  notes: string;
};

/** Default early-stage electrical allowance rules.
 *  Allowances are placeholders only — confirm against the electrical plan before procurement. */
export const ELECTRICAL_ALLOWANCE_DEFAULTS: ElectricalAllowanceRow[] = [
  { key: "smoke",      item: "Smoke Detectors",        code: "EL-SMK",  description: "Hardwired interconnected smoke detectors.",
    basis: "1 per bedroom + hallway + living area", allowedQuantity: 4, confirmedQuantity: 4, reviewStatus: "review_required", notes: "" },
  { key: "extractor",  item: "Extractor Fans",         code: "EL-EXT",  description: "Wall or ceiling extractor fan.",
    basis: "1 per bathroom, ensuite, laundry",      allowedQuantity: 3, confirmedQuantity: 3, reviewStatus: "review_required", notes: "" },
  { key: "htr",        item: "Heated Towel Rails",     code: "EL-HTR",  description: "Heated towel rail circuit.",
    basis: "1 per bathroom and ensuite",            allowedQuantity: 2, confirmedQuantity: 2, reviewStatus: "review_required", notes: "Exclude if specified out." },
  { key: "downlights", item: "Downlights",             code: "EL-DL",   description: "LED downlight fittings.",
    basis: "Room-based template allowance",         allowedQuantity: 38, confirmedQuantity: 38, reviewStatus: "review_required", notes: "" },
  { key: "double_pp",  item: "Double Power Points",    code: "EL-DPP",  description: "Standard double power point.",
    basis: "Room-based template allowance",         allowedQuantity: 28, confirmedQuantity: 28, reviewStatus: "review_required", notes: "" },
  { key: "single_pp",  item: "Single Power Points",    code: "EL-SPP",  description: "Single power point for dedicated appliance.",
    basis: "Appliance-specific allowance",          allowedQuantity: 6,  confirmedQuantity: 6,  reviewStatus: "review_required", notes: "" },
  { key: "data",       item: "Data Points",            code: "EL-CAT6", description: "CAT6 data point.",
    basis: "Specification allowance",               allowedQuantity: 4,  confirmedQuantity: 4,  reviewStatus: "review_required", notes: "" },
  { key: "tv",         item: "TV Points",              code: "EL-TV",   description: "TV outlet point.",
    basis: "Specification allowance",               allowedQuantity: 2,  confirmedQuantity: 2,  reviewStatus: "review_required", notes: "" },
  { key: "hdmi",       item: "HDMI Points",            code: "EL-HDMI", description: "HDMI feed point.",
    basis: "Specification allowance",               allowedQuantity: 1,  confirmedQuantity: 1,  reviewStatus: "review_required", notes: "" },
  { key: "ext_pp",     item: "Exterior Power Points",  code: "EL-XPP",  description: "Weatherproof exterior power point.",
    basis: "Specification allowance",               allowedQuantity: 3,  confirmedQuantity: 3,  reviewStatus: "review_required", notes: "" },
  { key: "kitchen",    item: "Kitchen Appliance Outlets", code: "EL-KAP", description: "Dedicated outlets for kitchen appliances.",
    basis: "Selected kitchen appliance schedule",   allowedQuantity: 6,  confirmedQuantity: 6,  reviewStatus: "review_required", notes: "" },
  { key: "garage",     item: "Garage Door Outlet",     code: "EL-GDO",  description: "Outlet for motorised garage door.",
    basis: "1 per motorised garage door",           allowedQuantity: 1,  confirmedQuantity: 1,  reviewStatus: "review_required", notes: "" },
];

const EL_KEY = (jobKey: string) => `iq:${jobKey}:iq-electrical:allowance`;
const EL_MODE_KEY = (jobKey: string) => `iq:${jobKey}:iq-electrical:mode`;

export function loadElectricalAllowance(jobKey: string): ElectricalAllowanceRow[] {
  if (typeof window === "undefined") return ELECTRICAL_ALLOWANCE_DEFAULTS.map((r) => ({ ...r }));
  try {
    const raw = localStorage.getItem(EL_KEY(jobKey));
    if (raw) return JSON.parse(raw) as ElectricalAllowanceRow[];
  } catch { /* ignore */ }
  return ELECTRICAL_ALLOWANCE_DEFAULTS.map((r) => ({ ...r }));
}

export function saveElectricalAllowance(jobKey: string, rows: ElectricalAllowanceRow[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(EL_KEY(jobKey), JSON.stringify(rows)); } catch { /* ignore */ }
}

export function loadElectricalMode(jobKey: string): ElectricalMode {
  if (typeof window === "undefined") return "template_allowance";
  try {
    const raw = localStorage.getItem(EL_MODE_KEY(jobKey));
    if (raw === "plan_count" || raw === "template_allowance") return raw;
  } catch { /* ignore */ }
  return "template_allowance";
}

export function saveElectricalMode(jobKey: string, mode: ElectricalMode) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(EL_MODE_KEY(jobKey), mode); } catch { /* ignore */ }
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  review_required: "Review Required",
  confirmed: "Confirmed",
  excluded: "Excluded",
};