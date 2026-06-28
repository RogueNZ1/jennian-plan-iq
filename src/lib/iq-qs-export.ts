/**
 * QS export library — writes job takeoff data into an IQ data sheet for
 * pasting into the Jennian master QS spreadsheet, and generates an Electrical
 * Schedule CSV for Laser Electrical.
 *
 * Uses the `xlsx` package (already in package.json) for spreadsheet operations.
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { extractJobHeaderFromFile } from "@/lib/takeoff/extract-spec";
import type { ExtractedFile } from "@/lib/takeoff/pdf-text";
import type { MarkupDoorType } from "@/lib/takeoff/types";
import { normaliseRoomName } from "@/lib/takeoff/classify";
import { round2 } from "@/lib/takeoff/utils";
import { fieldFlags, type EnrichedTakeoff } from "@/lib/takeoff/enriched-takeoff";
import type { CrossReferenceResult } from "@/lib/takeoff/cross-reference";
import type { ElevationData } from "@/lib/takeoff/extract-elevations";
import type { SitePlanData } from "@/lib/takeoff/extract-site-plan";
import { computeCladding } from "./cladding/cladding-engine";
import {
  SPECS,
  SPEC_BLOCK_HEADER_ROW,
  SPEC_LAST_ROW,
  optionLabel,
  parseSpecifications,
} from "./specs/spec-schema";
import type { Opening } from "@/lib/takeoff/takeoff-types";
import type { ExtractedQuantity } from "@/lib/takeoff/extracted-quantity-ledger";
import {
  buildExtractedQuantityReadModel,
  type ExtractedQuantityReadModel,
} from "@/lib/takeoff/extracted-quantity-read-model";
import { buildExtractedQuantitiesSheet } from "@/lib/takeoff/extracted-quantity-export";

// All export date stamps are NZT regardless of runtime TZ (12 Jun): CI runs UTC, and the
// previous ISO slice stamped *yesterday* on every export generated after 1pm NZ time.
const NZ_DATE = () =>
  new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
const NZ_DATE_ISO = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

type ModuleItemRow = Database["public"]["Tables"]["module_items"]["Row"];
type OpeningRow = Database["public"]["Tables"]["opening_schedule"]["Row"];

/* ------------------------------------------------------------------ types */

/** Approved beats extracted on every module-sourced field — exported for tests. */
export function pickModuleValue(
  i: { approved_value: string | null; extracted_value: string | null } | undefined,
): string | null {
  return i ? (i.approved_value ?? i.extracted_value ?? null) : null;
}

export function isSuppressedInternalWallDataItem(item: {
  label: string;
  module_id: string;
}): boolean {
  const label = item.label.trim().toLowerCase();
  return (
    (label === "internal walls" || label === "internal wall length") &&
    (item.module_id === "iq-framing" || item.module_id === "iq-linings")
  );
}

export type QSExportData = {
  jobNumber: string;
  clientName: string;
  address: string;
  templateId: string | null;
  createdAt: string;
  /** Meeting-spec answers (spec_id → code) from jobs.specifications. */
  specifications?: import("@/lib/specs/spec-schema").SpecAnswers | null;
  // Geometry
  floorAreaM2: number | null;
  perimeterLm: number | null;
  /** Measured internal wall length (geometry engine) — informational until the QS wires a row. */
  internalWallLm: number | null;
  /** Pipeline safety (12 Jun): "unavailable" when the geometry layer failed for this run. */
  geometryStatus?: string | null;
  /** Gable span candidate: geometry envelope short side, metres. */
  gableSpanM: number | null;
  firstFloorAreaM2: number | null;
  garageAreaM2?: number | null;
  studHeightMm: number | null;
  alfrescoAreaM2: number | null;
  // Roof / cladding / framing
  roofPitch: string | null;
  ridgeType: string | null;
  underlay: string | null;
  claddingType1: string | null;
  claddingType2: string | null;
  /** 1=brick/masonry only · 2=weatherboard/panel only · 3=mixed · null=unknown */
  claddingTypeCode?: number | null;
  /** Elevation extraction results for the ⑤ ELEVATION & SITE PLAN section */
  elevationSummary?: {
    roofType: string | null;
    roofPitchDegrees: number | null;
    externalDoorCount: number;
    gableEndCount: number;
    drivewayConcretM2: number | null;
    patioConcreteM2: number | null;
    totalConcreteM2: number | null;
    windowCountMatch: boolean | null;
    windowCountWarning: string | null;
  } | null;
  // Joinery windows (up to 10 rows)
  windows: Array<{ type: string; qty: number }>;
  // Garage doors (up to 6 rows)
  garageDoors: Array<{ type: string; qty: number }>;
  // Interior doors (up to 8 rows)
  interiorDoors: Array<{ type: string; qty: number }>;
  // Downpipes (up to 3 rows)
  downpipes: Array<{ size: string; qty: number }>;
  // Heating (up to 2 heat pump entries)
  heatPumps: Array<{ model: string; qty: number }>;
  // Extras / PC items (up to 6 rows)
  extras: Array<{ description: string; value: number }>;
  // Skylights (up to 4)
  skylights: Array<{ type: string; qty: number }>;

  // ---- New fields for revised build ----
  clientFirstName: string;
  clientSurname: string;
  streetAddress: string;
  addressLine2: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  jmwNumber: string;
  planVersion: string;
  exteriorWallLengthLm: number | null;
  exteriorWallHeightM: number | null;
  pathsPatioM2: number | null;
  drivewayM2: number | null;
  windowsByRoom: {
    bed1?: { cladding: string; qty: number; height: number; width: number };
    ensuite?: { cladding: string; qty: number; height: number; width: number };
    bed2?: { cladding: string; qty: number; height: number; width: number };
    bed3?: { cladding: string; qty: number; height: number; width: number };
    bed4?: { cladding: string; qty: number; height: number; width: number };
    toilet?: { cladding: string; qty: number; height: number; width: number };
    bathroom?: { cladding: string; qty: number; height: number; width: number };
    kitchen?: { cladding: string; qty: number; height: number; width: number };
    kitchenExtra?: { cladding: string; qty: number; height: number; width: number };
    familyLiving?: { cladding: string; qty: number; height: number; width: number };
    dining?: { cladding: string; qty: number; height: number; width: number };
    lounge?: { cladding: string; qty: number; height: number; width: number };
    garageWindow?: { cladding: string; qty: number; height: number; width: number };
    garageDoor1?: { cladding: string; qty: number; height: number; width: number };
    garageDoor2?: { cladding: string; qty: number; height: number; width: number };
    entrance?: { cladding: string; qty: number; height: number; width: number };
  };
  downpipesWhite: number;
  downpipesColourSteel: number;
  downpipesPvcColoured: number;
  garageDoor48x21Std: number;
  garageDoor48x21Insulated: number;
  garageDoor24x21Std: number;
  garageDoor24x21Insulated: number;
  garageDoor27x21Std: number;
  garageDoor27x21Insulated: number;
  /** True when a HISTORICAL manually-confirmed door count exists (legacy override). */
  doorCountsConfirmed?: boolean;
  /** Which deterministic source produced the interior door counts. null = NO source —
   *  the counts are unbacked zeros and the sheet must flag, not assert (fail-safe doctrine:
   *  a confident 0 with no source is a guess, and the worst kind). */
  doorsSource?: "confirmed" | "engine" | "labels" | "schedule" | null;
  /** Vision's door count — a HINT for the flag text only, never a number on the sheet. */
  intDoorVisionHint?: number | null;
  intDoorStandard: number;
  intDoorUGroove: number;
  intDoorVGroove: number;
  intDoorBarnSlider: number;
  intDoorDouble: number;
  intDoorCavitySlider: number;
  ceilingHatch: number;
  atticStair: number;
  letterboxUrban: number;
  washingLine: number;
  heatPumpWallUnit: number;
  heatPumpDucted: number;
  specItems: Record<string, string>;
  /** Pre-loaded module_items rows — avoids a second DB query in writeIQDataSheetFull */
  moduleItems?: Array<{
    module_id: string;
    label: string;
    extracted_value: string | null;
    approved_value: string | null;
    unit: string | null;
    value_source: string | null;
  }>;
  /**
   * Convergence Slice 6 — per-field review flags carried over from the persisted enriched
   * takeoff (takeoff_runs.takeoff_json). Present (and surfaced in the .xlsx "Review Notes"
   * sheet + the review UI) only when an enriched takeoff exists AND it carries flags; absent
   * for pre-convergence jobs (relational fallback) → export is byte-identical to today.
   */
  reviewFlags?: Array<{ field: string; flags: string[] }>;
  /** Which source built the takeoff fields: the enriched takeoff_json, or the relational rows. */
  takeoffSource?: "enriched" | "relational";
  /**
   * Stage 2a — the flat per-opening list from the enriched takeoff (window/slider/
   * garage_window/sectional_door/pa_door/entrance, each with glazed + area). Read-only
   * data threaded through for the Stage 2b glazed-split/cladding consumer; NOT yet
   * written to any cell. Present only on the enriched path; undefined on the relational
   * fallback. Optional so existing QSExportData literals + the .xlsx output are unaffected.
   */
  openings?: Opening[] | null;
  /** Numbers-first ledger rows from the enriched takeoff. Passive read model for this slice. */
  extractedQuantities?: ExtractedQuantity[] | null;
  /** Grouped numbers-only read model. Clean totals include only status === "extracted". */
  extractedQuantityReadModel?: ExtractedQuantityReadModel | null;
  /** True when the enriched opening engine ran but deliberately blocked pricing/export totals. */
  openingPricingBlocked?: boolean;
};

export type ElectricalItem = {
  description: string;
  qty: number;
  unit: string;
  rate: number;
};

export type ElectricalSchedule = {
  jobNumber: string;
  clientName: string;
  address: string;
  floorAreaM2: number;
  lighting: ElectricalItem[];
  power: ElectricalItem[];
  communications: ElectricalItem[];
  mechanical: ElectricalItem[];
  totalEstimate: number;
};

/* -------------------------------------------------------------- data load */

/**
 * Convergence Slice 6 — load the canonical enriched takeoff (takeoff_runs.takeoff_json) for a
 * job's latest run. GRACEFUL + PERMANENT FALLBACK: returns null on ANY problem — the column
 * absent (pre-migration), no run row, a non-object payload, or any query error — so the caller
 * always falls back to the relational rows. `select("*")` is used deliberately: it never errors
 * on a column that does not exist yet, it simply omits it.
 */
/**
 * How many recent takeoff_runs rows to scan for a usable payload. A failed or incomplete
 * re-run writes a row whose takeoff_json is null; taking only the single latest row made
 * one bad re-run silently flip the whole export onto the relational fallback (the canonical
 * openings — sliders, sectional doors — then never reach the sheets). Scanning a small
 * window returns the most recent run that actually carries the canonical takeoff.
 */
const ENRICHED_RUN_SCAN_LIMIT = 5;

export async function loadEnrichedTakeoffJson(jobId: string): Promise<EnrichedTakeoff | null> {
  try {
    const res = await supabase
      .from("takeoff_runs")
      .select("*")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .limit(ENRICHED_RUN_SCAN_LIMIT);
    for (const row of (res.data ?? []) as Array<Record<string, unknown>>) {
      const tj = row["takeoff_json"];
      // First (most recent) row carrying a real payload wins; null/absent rows are skipped
      // client-side so a missing column (pre-migration) still degrades gracefully to null.
      if (tj && typeof tj === "object") return tj as EnrichedTakeoff;
    }
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function savedElevationData(value: unknown): ElevationData | null {
  if (!isRecord(value)) return null;
  return value as unknown as ElevationData;
}

function savedSitePlanData(value: unknown): SitePlanData | null {
  if (!isRecord(value)) return null;
  return value as unknown as SitePlanData;
}

function savedCrossReferenceData(value: unknown): CrossReferenceResult | null {
  if (!isRecord(value)) return null;
  return value as unknown as CrossReferenceResult;
}

function firstCladdingType(elevation: ElevationData | null): string | null {
  if (!Array.isArray(elevation?.claddingTypes)) return null;
  return elevation.claddingTypes.find((c) => c.trim() !== "") ?? null;
}

function roofPitchText(elevation: ElevationData | null): string | null {
  return elevation?.roofPitchDegrees != null ? `${elevation.roofPitchDegrees}°` : null;
}

function buildElevationSummary(
  elevation: ElevationData | null,
  sitePlan: SitePlanData | null,
  crossRef: CrossReferenceResult | null,
): QSExportData["elevationSummary"] {
  if (!elevation && !sitePlan && !crossRef) return null;
  return {
    roofType: elevation?.roofType ?? crossRef?.roofType ?? null,
    roofPitchDegrees: elevation?.roofPitchDegrees ?? crossRef?.roofPitchDegrees ?? null,
    externalDoorCount: elevation?.externalDoorCount ?? 0,
    gableEndCount: elevation?.gableEndCount ?? 0,
    drivewayConcretM2: sitePlan?.drivewayConcretM2 ?? null,
    patioConcreteM2: sitePlan?.patioConcreteM2 ?? null,
    totalConcreteM2: sitePlan?.totalConcreteM2 ?? null,
    windowCountMatch: crossRef?.windowCountMatch ?? null,
    windowCountWarning: crossRef?.warnings?.length ? crossRef.warnings.join(" ") : null,
  };
}

/**
 * Stage 2b — derive the fixed-slot windowsByRoom from the flat openings[] list.
 *
 * Mirrors the relational matchWindowOpening keyword routing, but sources the cells from the
 * enriched takeoff's openings[] instead of the relational opening_schedule rows. Each opening
 * is assigned to the FIRST slot (in QS row order) whose keywords match its room, then the slot
 * aggregates: qty = number of openings routed there (the un-merged count), height/width = the
 * first routed opening's dims (the QS sheet holds one row per slot, so same-room openings
 * collapse exactly as today). Glazed window-type openings (window/slider/garage_window) fill the
 * window slots; the solid sectional_door (glazed:false) routes to the garage-door slot, never a
 * window row — the glazed flag's only cell-level role, since the template has no glazed cell.
 * Per-opening cladding is carried onto the slot (unused by the sheet today; available for a
 * future cladding-code cell). Pure; returns a fresh map.
 */
const WINDOW_SLOT_SPECS: ReadonlyArray<{
  key: keyof QSExportData["windowsByRoom"];
  keywords: string[];
}> = [
  { key: "bed1", keywords: ["bed 1", "bedroom 1", "master"] },
  { key: "ensuite", keywords: ["ensuite", "ens"] },
  { key: "bed2", keywords: ["bed 2", "bedroom 2"] },
  { key: "bed3", keywords: ["bed 3", "bedroom 3"] },
  { key: "bed4", keywords: ["bed 4", "bedroom 4"] },
  { key: "toilet", keywords: ["toilet", "wc", "powder"] },
  { key: "bathroom", keywords: ["bathroom", "bath"] },
  { key: "kitchen", keywords: ["kitchen"] },
  { key: "familyLiving", keywords: ["family", "living", "open plan"] },
  { key: "dining", keywords: ["dining"] },
  { key: "lounge", keywords: ["lounge"] },
  { key: "garageWindow", keywords: ["garage"] },
  { key: "entrance", keywords: ["entrance", "entry", "foyer", "hall"] },
];
const WINDOW_TYPES = new Set<Opening["type"]>([
  "window",
  "slider",
  "garage_window",
  "entrance",
  "pa_door",
]);

export function openingsToWindowsByRoom(openings: Opening[]): QSExportData["windowsByRoom"] {
  const slots: QSExportData["windowsByRoom"] = {};
  const put = (key: keyof QSExportData["windowsByRoom"], o: Opening) => {
    const ex = slots[key];
    if (ex) ex.qty += 1;
    else slots[key] = { cladding: o.cladding ?? "", qty: 1, height: o.height_m, width: o.width_m };
  };

  let garageDoorIdx = 0;
  for (const o of openings) {
    if (o.type === "sectional_door") {
      // Solid garage door → the garage-door slot, never a window row.
      put(garageDoorIdx === 0 ? "garageDoor1" : "garageDoor2", o);
      garageDoorIdx += 1;
      continue;
    }
    if (!WINDOW_TYPES.has(o.type)) continue;
    const room = (o.room ?? "").toLowerCase();
    const spec = WINDOW_SLOT_SPECS.find((s) => s.keywords.some((k) => room.includes(k)));
    if (!spec) continue;
    // Kitchen overflow → second+ kitchen window goes to kitchenExtra (mirrors the relational path).
    put(spec.key === "kitchen" && slots.kitchen != null ? "kitchenExtra" : spec.key, o);
  }
  return slots;
}

function fmtOpeningEvidenceMetres(value: number | null | undefined): string | null {
  return value == null ? null : `${Math.round(value * 1000)}mm`;
}

function openingEvidenceFlags(enriched: EnrichedTakeoff): NonNullable<QSExportData["reviewFlags"]> {
  return (enriched.opening_evidence ?? [])
    .filter(
      (candidate) =>
        !candidate.priced ||
        candidate.status !== "priced" ||
        candidate.review_flags.length > 0 ||
        candidate.conflicts.length > 0,
    )
    .map((candidate) => {
      const priced = candidate.priced;
      const status = candidate.status;
      const bits = [
        priced ? "priced" : "not priced",
        status,
        candidate.type ? `type ${candidate.type}` : null,
        candidate.room ? `near ${candidate.room}` : null,
        fmtOpeningEvidenceMetres(candidate.width_m)
          ? `width ${fmtOpeningEvidenceMetres(candidate.width_m)}`
          : null,
        fmtOpeningEvidenceMetres(candidate.height_m)
          ? `height ${fmtOpeningEvidenceMetres(candidate.height_m)}`
          : null,
      ].filter(Boolean);
      const evidence = candidate.evidence
        .map((item) => {
          const dims = [
            fmtOpeningEvidenceMetres(item.width_m)
              ? `width ${fmtOpeningEvidenceMetres(item.width_m)}`
              : null,
            fmtOpeningEvidenceMetres(item.height_m)
              ? `height ${fmtOpeningEvidenceMetres(item.height_m)}`
              : null,
            item.room ? `near ${item.room}` : null,
            item.wall_face_id ? `wall ${item.wall_face_id}` : null,
          ].filter(Boolean);
          return `${item.source} ${item.role}${dims.length ? ` (${dims.join(", ")})` : ""}${
            item.note ? `: ${item.note}` : ""
          }`;
        })
        .filter((line) => line.trim() !== "");
      const conflicts =
        candidate.conflicts.length > 0 ? [`Conflicts: ${candidate.conflicts.join(", ")}`] : [];
      return {
        field: `Opening evidence - ${candidate.id}`,
        flags: [
          `Status: ${bits.join("; ")}`,
          ...candidate.review_flags,
          ...evidence,
          ...conflicts,
        ].filter((flag) => flag.trim() !== ""),
      };
    })
    .filter((entry) => entry.flags.length > 0);
}

function hasOpeningPricingBlock(enriched: EnrichedTakeoff): boolean {
  return (
    (enriched.opening_evidence ?? []).some((candidate) =>
      candidate.conflicts.includes("visual_reconciliation_error"),
    ) ||
    enriched.external_wall_area_m2.discrepancy_flags.some((flag) =>
      flag.startsWith("Opening pricing blocked:"),
    )
  );
}

/**
 * Overlay the enriched takeoff onto a relational QSExportData base. When `enriched` is null
 * (every pre-convergence job) the base is returned UNCHANGED apart from a source tag — the
 * export is byte-identical to today (PERMANENT fallback, not a migration bridge). When present,
 * the converged takeoff VALUES win where they exist, and the per-field discrepancy flags are
 * attached for the .xlsx + review UI.
 */
export function applyEnrichedTakeoff(
  base: QSExportData,
  enriched: EnrichedTakeoff | null,
): QSExportData {
  if (!enriched) return { ...base, takeoffSource: "relational" };
  const perimeter = enriched.external_wall_lm.value;
  const studM = enriched.ceiling_height_m.value;
  const enrichedOpenings = enriched.openings ?? null;
  const openingPricingBlocked = hasOpeningPricingBlock(enriched);
  const extractedQuantities = enriched.extracted_quantities ?? null;
  return {
    ...base,
    floorAreaM2: enriched.floor_area_m2.value ?? base.floorAreaM2,
    perimeterLm: perimeter ?? base.perimeterLm,
    internalWallLm: enriched.internal_wall_lm?.value ?? base.internalWallLm,
    geometryStatus: enriched.geometry_status?.value ?? null,
    gableSpanM: enriched.gable_span_m?.value ?? base.gableSpanM,
    exteriorWallLengthLm: perimeter ?? base.exteriorWallLengthLm,
    garageAreaM2: enriched.garage_area_m2.value ?? base.garageAreaM2 ?? null,
    alfrescoAreaM2: enriched.alfresco_area_m2.value ?? base.alfrescoAreaM2,
    studHeightMm: studM != null ? Math.round(studM * 1000) : base.studHeightMm,
    exteriorWallHeightM: studM ?? base.exteriorWallHeightM,
    reviewFlags: [...fieldFlags(enriched), ...openingEvidenceFlags(enriched)],
    takeoffSource: "enriched",
    // Stage 2a — thread the flat opening list through. Present only on the enriched path;
    // the relational fallback above leaves it undefined.
    openings: enrichedOpenings,
    extractedQuantities,
    extractedQuantityReadModel: extractedQuantities
      ? buildExtractedQuantityReadModel(extractedQuantities)
      : null,
    openingPricingBlocked,
    // Blocked enriched openings must not fall back into stale relational schedule rows.
    windows: openingPricingBlocked ? [] : base.windows,
    // Interior doors — precedence: HISTORICAL confirmed manual counts (legacy jobs) >
    // deterministic door engine > module-item labels > opening-schedule fallback (the
    // latter two are already in base). The engine's counts NEVER include flagged hits.
    intDoorVisionHint: enriched.internal_door_count?.value ?? null,
    ...(!base.doorCountsConfirmed && enriched.door_counts_auto
      ? {
          doorsSource: "engine" as const,
          intDoorStandard: enriched.door_counts_auto.singles,
          intDoorDouble: enriched.door_counts_auto.doubles,
          intDoorCavitySlider: enriched.door_counts_auto.cavitySliders,
          intDoorBarnSlider: enriched.door_counts_auto.barn,
        }
      : {}),
    // Stage 2b — migrate the window CELLS' source: derive the fixed-slot windowsByRoom from
    // openings[] when the enriched takeoff carries them, else keep the relational base map
    // (the live fallback, intact until the Beddis gate passes). The window COUNT is NOT
    // touched here — it stays vector-sourced (enriched.window_count) until the Harrison
    // re-typing lands.
    windowsByRoom: openingPricingBlocked
      ? {}
      : enrichedOpenings != null
        ? openingsToWindowsByRoom(enrichedOpenings)
        : base.windowsByRoom,
  };
}

export async function buildQSExportData(
  jobId: string,
  files?: ExtractedFile[],
): Promise<QSExportData> {
  const [jobRes, itemsRes, openingsRes, doorCountsRes, eqRes] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).single(),
    supabase.from("module_items").select("*").eq("job_id", jobId),
    supabase.from("opening_schedule").select("*").eq("job_id", jobId),
    supabase.from("door_counts").select("*").eq("job_id", jobId).maybeSingle(),
    // Fold extracted_quantities for jobs that have them but no takeoff_json (legacy text-run
    // orphans). Appears in "5. Data Input House" alongside module_items.
    supabase.from("extracted_quantities").select("*").eq("job_id", jobId),
  ]);

  if (jobRes.error) throw new Error(`Failed to load job: ${jobRes.error.message}`);
  if (itemsRes.error) throw new Error(`Failed to load module items: ${itemsRes.error.message}`);
  if (openingsRes.error)
    throw new Error(`Failed to load opening schedule: ${openingsRes.error.message}`);
  if (doorCountsRes.error)
    throw new Error(`Failed to load door counts: ${doorCountsRes.error.message}`);
  const job = jobRes.data;
  const elevationData = savedElevationData((job as Record<string, unknown>).elevation_data);
  const sitePlanData = savedSitePlanData((job as Record<string, unknown>).site_plan_data);
  const crossReferenceData = savedCrossReferenceData(
    (job as Record<string, unknown>).cross_reference_data,
  );
  const elevationSummary = buildElevationSummary(elevationData, sitePlanData, crossReferenceData);
  const moduleItemsBase: ModuleItemRow[] = itemsRes.data ?? [];

  // Merge extracted_quantities rows as synthetic module_items when module_items is empty.
  // This preserves data for jobs that went through the text-extraction path (run.ts Pipeline A)
  // before the wizard-persist path existed. They appear in "5. Data Input House" as iq-core rows.
  const eqRows = eqRes.data ?? [];
  const eqSynthetic: ModuleItemRow[] =
    moduleItemsBase.length === 0 && eqRows.length > 0
      ? eqRows.map(
          (q: {
            id: string;
            quantity_type: string;
            approved_value: number | null;
            extracted_value: number | null;
            confidence: string | null;
            unit: string | null;
          }) =>
            ({
              id: q.id,
              run_id: "",
              job_id: jobId,
              module_id: "iq-core",
              label: q.quantity_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              extracted_value: String(q.approved_value ?? q.extracted_value ?? ""),
              approved_value: q.approved_value != null ? String(q.approved_value) : null,
              confidence: q.confidence ?? "mid",
              review_status: "review_required",
              notes: null,
              basis: null,
              sort_order: 0,
              data_source: "Uploaded Plan Text",
              source_evidence: null,
              measurement_id: null,
              opening_id: null,
              plan_page_number: null,
              file_id: null,
              source: null,
              value_source: "extracted",
              description: null,
              unit: q.unit,
              updated_at: "",
              created_at: "",
            }) as ModuleItemRow,
        )
      : [];
  const items: ModuleItemRow[] = [...moduleItemsBase, ...eqSynthetic];

  // Convergence Slice 6 — the canonical enriched takeoff (takeoff_json) is the PRIMARY source
  // when present; null for every pre-convergence job → relational fallback (overlay applied at
  // the return below).
  const enrichedJson = await loadEnrichedTakeoffJson(jobId);

  function getVal(label: string): string | null {
    const needle = label.toLowerCase();
    // Prefer exact label match to avoid collisions
    // (e.g. "wall length" matching both "external wall length" and "internal wall length").
    // APPROVED WINS: when an estimator has approved/corrected a value in the UI, the
    // export must carry it — exporting the raw extraction over a human correction was
    // silent margin erosion (cladding types, areas, every module-sourced field).
    const pick = pickModuleValue;
    const exact = items.find((i: ModuleItemRow) => i.label?.toLowerCase() === needle);
    if (exact) return pick(exact);
    return pick(items.find((i: ModuleItemRow) => i.label?.toLowerCase().includes(needle)));
  }

  function getNum(label: string): number | null {
    const v = getVal(label);
    if (!v) return null;
    // Strip commas (thousand separators) and any chars except digits, dot, minus.
    // Preserve a leading minus so negative values survive.
    // eslint-disable-next-line no-useless-escape -- kept verbatim — regex is pinned by reference fixtures
    const cleaned = v.replace(/,/g, "").replace(/[^\d.\-]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  // Openings grouped
  const openings: OpeningRow[] = openingsRes.data ?? [];
  const windows = openings
    .filter((o: OpeningRow) => o.opening_type === "window")
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Window", qty: o.quantity ?? 1 }));
  const garageDoors = openings
    .filter((o: OpeningRow) => o.opening_type === "garage_door")
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Garage Door", qty: o.quantity ?? 1 }));
  const interiorDoors = openings
    // AUDIT §5.5 fix: every producer (OpeningScheduleTab, extract-openings, vision
    // normaliser) writes "internal_door"; this filter matched only "interior_door", so
    // EVERY schedule-entered internal door was silently dropped from the export. Accept
    // both — a row carries one type, so no double-count is possible.
    .filter(
      (o: OpeningRow) => o.opening_type === "internal_door" || o.opening_type === "interior_door",
    )
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Interior Door", qty: o.quantity ?? 1 }));
  const skylights = openings
    .filter((o: OpeningRow) => o.opening_type === "skylight")
    .map((o: OpeningRow) => ({ type: o.room_name ?? "Skylight", qty: o.quantity ?? 1 }));

  // Downpipes from items
  const downpipeItems = items.filter((i: ModuleItemRow) =>
    i.label?.toLowerCase().includes("downpipe"),
  );
  const downpipes = downpipeItems.map((i: ModuleItemRow) => ({
    size: i.extracted_value ?? "90mm",
    qty: parseFloat(i.extracted_value ?? "1") || 1,
  }));

  // Heat pumps from items
  const heatPumpItems = items.filter(
    (i: ModuleItemRow) =>
      i.label?.toLowerCase().includes("heat pump") || i.label?.toLowerCase().includes("heating"),
  );
  const heatPumps = heatPumpItems.map((i: ModuleItemRow) => ({
    model: i.extracted_value ?? "Heat Pump",
    qty: 1,
  }));

  // PC / extra items
  const extraLabels = [
    "kitchen appliance",
    "dishwasher",
    "oven",
    "rangehood",
    "bathroom accessory",
    "towel rail",
    "mirror",
  ];
  const extras = items
    .filter((i: ModuleItemRow) => extraLabels.some((l) => i.label?.toLowerCase().includes(l)))
    .slice(0, 6)
    .map((i: ModuleItemRow) => ({
      description: i.label ?? "Extra",
      value: parseFloat(i.extracted_value ?? "0") || 0,
    }));

  // Merge job header from extracted files: Supabase > SMW > plans > fallback
  const smwHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "smw");
  const plansHeader = files?.map(extractJobHeaderFromFile).find((h) => h.source === "plans");
  const resolvedClientName =
    (job.client_name as string | null) ?? smwHeader?.clientName ?? plansHeader?.clientName ?? "";
  const resolvedAddress =
    (job.address as string | null) ?? smwHeader?.addressLine1 ?? plansHeader?.addressLine1 ?? "";
  const resolvedJobNumber =
    (job.job_number as string | null) ?? smwHeader?.jmwNumber ?? plansHeader?.jobNumber ?? jobId;

  // ---- New field population ----

  // Split client name into first/surname
  const nameParts = resolvedClientName.trim().split(/\s+/);
  const clientFirstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
  const clientSurname = nameParts.length > 0 ? nameParts[nameParts.length - 1] : resolvedClientName;

  // Parse address into parts
  const addressParts = resolvedAddress.split(",").map((s) => s.trim());
  const streetAddress = addressParts[0] ?? resolvedAddress;
  const addressLine2 = addressParts[1] ?? null;
  const city = addressParts[2] ?? getVal("city") ?? null;

  // Contact info
  const email = getVal("email") ?? getVal("client email");
  const phone = getVal("phone") ?? getVal("mobile") ?? getVal("contact");

  // Plan version
  const planVersion = getVal("plan version") ?? "1";

  // Wall measurements
  const exteriorWallLengthLm = getNum("exterior wall length") ?? getNum("external wall length");

  // Wall height — module_items first, then plan_context stud height, then NZ default
  const planCtx = (job.plan_context ?? null) as { studHeightMm?: number } | null;
  let exteriorWallHeightM: number | null = getNum("wall height");
  if (exteriorWallHeightM === null) {
    const studH = getNum("stud height");
    if (studH !== null) {
      exteriorWallHeightM = studH > 10 ? studH / 1000 : studH;
    }
  }
  if (exteriorWallHeightM === null && planCtx?.studHeightMm) {
    exteriorWallHeightM = round2(planCtx.studHeightMm / 1000);
  }
  if (exteriorWallHeightM === null) {
    exteriorWallHeightM = 2.4;
  }

  // Concrete / exterior areas
  const pathsPatioM2 =
    getNum("paths") ??
    getNum("patio") ??
    getNum("concrete paths") ??
    sitePlanData?.patioConcreteM2 ??
    null;
  const drivewayM2 = getNum("driveway") ?? sitePlanData?.drivewayConcretM2 ?? null;

  // Windows by room — match opening_schedule window openings by room_name keywords
  function matchWindowOpening(
    keywords: string[],
  ): { cladding: string; qty: number; height: number; width: number } | undefined {
    const opening = openings.find((o: OpeningRow) => {
      if (o.opening_type !== "window") return false;
      const rn = normaliseRoomName(o.room_name ?? "").toLowerCase();
      return keywords.some((k) => rn.includes(k.toLowerCase()));
    });
    if (!opening) return undefined;
    return {
      cladding: opening.notes ?? "",
      qty: opening.quantity ?? 1,
      height: opening.height_mm != null ? opening.height_mm / 1000 : 1.2,
      width: opening.width_mm != null ? opening.width_mm / 1000 : 0.9,
    };
  }

  // Garage door openings by index
  const garageDoorOpenings = openings.filter((o: OpeningRow) => o.opening_type === "garage_door");
  function garageOpeningToEntry(
    o: OpeningRow | undefined,
  ): { cladding: string; qty: number; height: number; width: number } | undefined {
    if (!o) return undefined;
    return {
      cladding: o.notes ?? "",
      qty: o.quantity ?? 1,
      height: o.height_mm != null ? o.height_mm / 1000 : 2.1,
      width: o.width_mm != null ? o.width_mm / 1000 : 2.4,
    };
  }

  const windowsByRoom: QSExportData["windowsByRoom"] = {};
  const bed1 = matchWindowOpening(["bed 1", "bedroom 1", "master"]);
  if (bed1) windowsByRoom.bed1 = bed1;
  const ensuite = matchWindowOpening(["ensuite", "ens"]);
  if (ensuite) windowsByRoom.ensuite = ensuite;
  const bed2 = matchWindowOpening(["bed 2", "bedroom 2"]);
  if (bed2) windowsByRoom.bed2 = bed2;
  const bed3 = matchWindowOpening(["bed 3", "bedroom 3"]);
  if (bed3) windowsByRoom.bed3 = bed3;
  const bed4 = matchWindowOpening(["bed 4", "bedroom 4"]);
  if (bed4) windowsByRoom.bed4 = bed4;
  const toilet = matchWindowOpening(["toilet", "wc", "powder"]);
  if (toilet) windowsByRoom.toilet = toilet;
  const bathroom = matchWindowOpening(["bathroom", "bath"]);
  if (bathroom) windowsByRoom.bathroom = bathroom;

  // Kitchen — find first, then second if exists
  const kitchenOpenings = openings.filter((o: OpeningRow) => {
    if (o.opening_type !== "window") return false;
    const rn = (o.room_name ?? "").toLowerCase();
    return rn.includes("kitchen");
  });
  if (kitchenOpenings[0]) {
    const o = kitchenOpenings[0];
    windowsByRoom.kitchen = {
      cladding: o.notes ?? "",
      qty: o.quantity ?? 1,
      height: o.height_mm != null ? o.height_mm / 1000 : 1.2,
      width: o.width_mm != null ? o.width_mm / 1000 : 0.9,
    };
  }
  if (kitchenOpenings[1]) {
    const o = kitchenOpenings[1];
    windowsByRoom.kitchenExtra = {
      cladding: o.notes ?? "",
      qty: o.quantity ?? 1,
      height: o.height_mm != null ? o.height_mm / 1000 : 1.2,
      width: o.width_mm != null ? o.width_mm / 1000 : 0.9,
    };
  }

  const familyLiving = matchWindowOpening(["family", "living", "lounge/dining", "open plan"]);
  if (familyLiving) windowsByRoom.familyLiving = familyLiving;
  const dining = matchWindowOpening(["dining"]);
  if (dining) windowsByRoom.dining = dining;
  const lounge = matchWindowOpening(["lounge"]);
  if (lounge) windowsByRoom.lounge = lounge;
  const garageWindow = matchWindowOpening(["garage"]);
  if (garageWindow) windowsByRoom.garageWindow = garageWindow;
  const entrance = matchWindowOpening(["entrance", "entry", "foyer", "hall"]);
  if (entrance) windowsByRoom.entrance = entrance;

  // Garage door openings by index
  const gd1 = garageOpeningToEntry(garageDoorOpenings[0]);
  if (gd1) windowsByRoom.garageDoor1 = gd1;
  const gd2 = garageOpeningToEntry(garageDoorOpenings[1]);
  if (gd2) windowsByRoom.garageDoor2 = gd2;

  // Downpipes by type
  let downpipesWhite = 0;
  let downpipesColourSteel = 0;
  let downpipesPvcColoured = 0;

  const dpItems = items.filter((i: ModuleItemRow) => i.label?.toLowerCase().includes("downpipe"));
  if (dpItems.length > 0) {
    for (const item of dpItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "0") || 0;
      if (label.includes("white")) {
        downpipesWhite += qty;
      } else if (label.includes("colour steel") || label.includes("colorsteel")) {
        downpipesColourSteel += qty;
      } else if (label.includes("pvc")) {
        downpipesPvcColoured += qty;
      } else {
        // No specific match, add to white as default
        downpipesWhite += qty;
      }
    }
  } else {
    // Use total from downpipes array
    const total = downpipes.reduce((s, d) => s + d.qty, 0);
    downpipesWhite = total;
  }

  // Garage door types by size/insulation
  let garageDoor48x21Std = 0;
  let garageDoor48x21Insulated = 0;
  let garageDoor24x21Std = 0;
  let garageDoor24x21Insulated = 0;
  let garageDoor27x21Std = 0;
  let garageDoor27x21Insulated = 0;

  const gdItems = items.filter((i: ModuleItemRow) => {
    const l = (i.label ?? "").toLowerCase();
    return l.includes("garage door") || l.includes("panel lift");
  });

  if (gdItems.length > 0) {
    for (const item of gdItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "1") || 1;
      const insulated = label.includes("insulated");
      if (label.includes("4.8") || label.includes("48")) {
        if (insulated) garageDoor48x21Insulated += qty;
        else garageDoor48x21Std += qty;
      } else if (label.includes("2.7") || label.includes("27")) {
        if (insulated) garageDoor27x21Insulated += qty;
        else garageDoor27x21Std += qty;
      } else {
        // Default to 2.4
        if (insulated) garageDoor24x21Insulated += qty;
        else garageDoor24x21Std += qty;
      }
    }
  } else if (garageDoors.length > 0) {
    // Fall back: put count in standard 2.4
    garageDoor24x21Std = garageDoors.reduce((s, d) => s + d.qty, 0);
  }

  // Interior door types
  let doorsSource: "confirmed" | "engine" | "labels" | "schedule" | null = null;
  let intDoorStandard = 0;
  let intDoorUGroove = 0;
  let intDoorVGroove = 0;
  let intDoorBarnSlider = 0;
  let intDoorDouble = 0;
  let intDoorCavitySlider = 0;

  const idItems = items.filter((i: ModuleItemRow) => {
    const l = (i.label ?? "").toLowerCase();
    return l.includes("interior door") || l.includes("internal door");
  });

  if (idItems.length > 0) {
    doorsSource = "labels";
    for (const item of idItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "1") || 1;
      if (label.includes("u groove") || label.includes("u-groove")) {
        intDoorUGroove += qty;
      } else if (label.includes("v groove") || label.includes("v-groove")) {
        intDoorVGroove += qty;
      } else if (
        (label.includes("barn") || label.includes("slider")) &&
        !label.includes("cavity")
      ) {
        intDoorBarnSlider += qty;
      } else if (label.includes("double")) {
        intDoorDouble += qty;
      } else if (label.includes("cavity")) {
        intDoorCavitySlider += qty;
      } else {
        intDoorStandard += qty;
      }
    }
  } else if (interiorDoors.length > 0) {
    // Fall back: put total in standard
    doorsSource = "schedule";
    intDoorStandard = interiorDoors.reduce((s, d) => s + d.qty, 0);
  }

  // Carpentry extras
  const ceilingHatch = getNum("ceiling hatch") ?? 0;
  const atticStair = getNum("attic stair") ?? getNum("attic ladder") ?? 0;
  const letterboxUrban = getNum("letterbox") ?? 0;
  const washingLine = getNum("washing line") ?? 0;

  // Heating types
  let heatPumpWallUnit = 0;
  let heatPumpDucted = 0;

  const hpItems = items.filter((i: ModuleItemRow) => {
    const l = (i.label ?? "").toLowerCase();
    return l.includes("heat pump") || l.includes("heating");
  });

  if (hpItems.length > 0) {
    for (const item of hpItems) {
      const label = (item.label ?? "").toLowerCase();
      const qty = parseFloat(item.extracted_value ?? "1") || 1;
      if (label.includes("ducted")) {
        heatPumpDucted += qty;
      } else {
        heatPumpWallUnit += qty;
      }
    }
  } else if (heatPumps.length > 0) {
    heatPumpWallUnit = heatPumps.length;
  }

  // Door count override — HISTORICAL ONLY. The manual DoorCountPanel is removed from the
  // UI (door counting is the deterministic engine's job now); confirmed rows on existing
  // jobs are still honoured so past exports stay stable. New jobs never create these.
  const confirmedCounts = doorCountsRes.data;
  const doorCountsConfirmed = !!confirmedCounts?.confirmed_at;
  if (confirmedCounts?.confirmed_at) {
    doorsSource = "confirmed";
    intDoorStandard = confirmedCounts.standard;
    intDoorDouble = confirmedCounts.double_doors;
    intDoorCavitySlider = confirmedCounts.cavity_sliders;
    intDoorBarnSlider = confirmedCounts.barn_sliders;
  }

  // All spec items as key-value
  const specItems: Record<string, string> = {};
  for (const item of items) {
    if (item.label) {
      specItems[item.label] = item.extracted_value ?? "";
    }
  }

  const perimeterLm = getNum("perimeter") ?? getNum("external perimeter");

  const base: QSExportData = {
    jobNumber: resolvedJobNumber,
    clientName: resolvedClientName,
    address: resolvedAddress,
    templateId: job.template ?? null,
    createdAt: job.created_at ?? new Date().toISOString(),
    specifications: parseSpecifications(
      (job as { specifications?: unknown }).specifications ?? null,
    ).answers,
    floorAreaM2: getNum("floor area") ?? getNum("total area"),
    perimeterLm,
    firstFloorAreaM2: getNum("first floor") ?? getNum("upper floor"),
    garageAreaM2: getNum("garage area"),
    studHeightMm: getNum("stud height"),
    alfrescoAreaM2: getNum("alfresco") ?? getNum("porch") ?? getNum("deck"),
    internalWallLm: getNum("internal wall length"),
    gableSpanM: null, // no module label carries the envelope — enriched path only
    roofPitch: getVal("roof pitch") ?? roofPitchText(elevationData),
    ridgeType: getVal("ridge type") ?? getVal("ridge"),
    underlay: getVal("underlay"),
    claddingType1:
      getVal("cladding type 1") ??
      getVal("exterior cladding type 1") ??
      firstCladdingType(elevationData),
    claddingType2: getVal("cladding type 2") ?? getVal("exterior cladding type 2"),
    claddingTypeCode:
      elevationData?.claddingTypeCode ?? crossReferenceData?.claddingTypeCode ?? null,
    elevationSummary,
    windows: windows.slice(0, 10),
    garageDoors: garageDoors.slice(0, 6),
    interiorDoors: interiorDoors.slice(0, 8),
    downpipes: downpipes.slice(0, 3),
    heatPumps: heatPumps.slice(0, 2),
    extras: extras,
    skylights: skylights.slice(0, 4),
    // New fields
    clientFirstName,
    clientSurname,
    streetAddress,
    addressLine2,
    city,
    email,
    phone,
    jmwNumber: resolvedJobNumber,
    planVersion,
    exteriorWallLengthLm,
    exteriorWallHeightM,
    pathsPatioM2,
    drivewayM2,
    windowsByRoom,
    downpipesWhite,
    downpipesColourSteel,
    downpipesPvcColoured,
    garageDoor48x21Std,
    garageDoor48x21Insulated,
    garageDoor24x21Std,
    garageDoor24x21Insulated,
    garageDoor27x21Std,
    garageDoor27x21Insulated,
    doorCountsConfirmed,
    doorsSource,
    intDoorStandard,
    intDoorUGroove,
    intDoorVGroove,
    intDoorBarnSlider,
    intDoorDouble,
    intDoorCavitySlider,
    ceilingHatch,
    atticStair,
    letterboxUrban,
    washingLine,
    heatPumpWallUnit,
    heatPumpDucted,
    specItems,
    moduleItems: items.map((i) => ({
      module_id: i.module_id ?? "",
      label: i.label ?? "",
      extracted_value: i.extracted_value ?? null,
      approved_value: i.approved_value ?? null,
      unit: i.unit ?? null,
      value_source: i.value_source ?? null,
    })),
  };

  // Convergence Slice 6 — enriched takeoff_json wins where present (values + flags); null →
  // relational base unchanged (byte-identical to today).
  return applyEnrichedTakeoff(base, enrichedJson);
}

/* -------------------------------------------------- electrical schedule */

const BASE_AREA_M2 = 165;

/**
 * Builds a scaled electrical schedule from 165m² base quantities.
 * All quantities are rounded to the nearest whole number.
 */
export function buildElectricalSchedule(data: QSExportData): ElectricalSchedule {
  const area = data.floorAreaM2 ?? BASE_AREA_M2;
  const sf = area / BASE_AREA_M2;
  const q = (base: number) => Math.round(base * sf);

  const lighting: ElectricalItem[] = [
    { description: "LED downlights — living/dining/kitchen", qty: q(14), unit: "ea", rate: 45 },
    { description: "LED downlights — bedrooms", qty: q(8), unit: "ea", rate: 45 },
    { description: "LED downlights — hallways", qty: q(4), unit: "ea", rate: 45 },
    { description: "LED downlights — bathrooms/ensuites", qty: q(4), unit: "ea", rate: 45 },
    { description: "Exterior coach lights", qty: q(4), unit: "ea", rate: 80 },
    { description: "Vanity light bar — bathrooms", qty: q(2), unit: "ea", rate: 120 },
    { description: "Attic/storage light", qty: 1, unit: "ea", rate: 45 },
    { description: "Dimmer switches", qty: q(6), unit: "ea", rate: 55 },
    { description: "Switching — single/double", qty: q(18), unit: "ea", rate: 30 },
  ];

  const power: ElectricalItem[] = [
    { description: "Double GPOs — living/dining", qty: q(6), unit: "ea", rate: 40 },
    { description: "Double GPOs — kitchen", qty: q(6), unit: "ea", rate: 40 },
    { description: "Double GPOs — bedrooms", qty: q(8), unit: "ea", rate: 40 },
    { description: "Double GPOs — bathrooms (shaver)", qty: q(2), unit: "ea", rate: 55 },
    { description: "Double GPOs — garage", qty: q(4), unit: "ea", rate: 40 },
    { description: "Stove/oven circuit — 32A", qty: 1, unit: "ea", rate: 180 },
    { description: "Dishwasher circuit", qty: 1, unit: "ea", rate: 85 },
    { description: "Rangehood connection", qty: 1, unit: "ea", rate: 65 },
    { description: "Washing machine circuit", qty: 1, unit: "ea", rate: 85 },
    { description: "Dryer circuit", qty: 1, unit: "ea", rate: 85 },
    {
      description: "Heat pump circuits (indoor + outdoor)",
      qty: data.heatPumps.length || q(1),
      unit: "ea",
      rate: 220,
    },
    {
      description: "Garage door operator circuit",
      qty: data.garageDoors.length || q(1),
      unit: "ea",
      rate: 95,
    },
    { description: "Hot water cylinder connection", qty: 1, unit: "ea", rate: 120 },
    { description: "Mains switchboard (100A)", qty: 1, unit: "ea", rate: 850 },
    { description: "Mains cable to boundary", qty: 1, unit: "lot", rate: 600 },
  ];

  const communications: ElectricalItem[] = [
    { description: "Cat 6 data points — living/office", qty: q(4), unit: "ea", rate: 60 },
    { description: "Cat 6 data points — bedrooms", qty: q(4), unit: "ea", rate: 60 },
    { description: "TV aerial points", qty: q(3), unit: "ea", rate: 75 },
    { description: "Network patch panel", qty: 1, unit: "ea", rate: 220 },
    { description: "Doorbell/video intercom", qty: 1, unit: "ea", rate: 180 },
    { description: "Smoke alarms (interconnected)", qty: q(3), unit: "ea", rate: 95 },
  ];

  const mechanical: ElectricalItem[] = [
    { description: "Bathroom exhaust fans", qty: q(2), unit: "ea", rate: 120 },
    { description: "Kitchen rangehood power point", qty: 1, unit: "ea", rate: 40 },
    { description: "Heated towel rail connections", qty: q(2), unit: "ea", rate: 75 },
  ];

  const allItems = [...lighting, ...power, ...communications, ...mechanical];
  const totalEstimate = allItems.reduce((s, i) => s + i.qty * i.rate, 0);

  return {
    jobNumber: data.jobNumber,
    clientName: data.clientName,
    address: data.address,
    floorAreaM2: area,
    lighting,
    power,
    communications,
    mechanical,
    totalEstimate,
  };
}

export function electricalScheduleToCSV(schedule: ElectricalSchedule): string {
  const rows: string[] = [];

  rows.push(`Jennian Electrical Schedule — Laser Electrical Manawatū`);
  rows.push(`Job,${schedule.jobNumber}`);
  rows.push(`Client,${schedule.clientName}`);
  rows.push(`Address,"${schedule.address}"`);
  rows.push(`Floor Area,${schedule.floorAreaM2} m²`);
  rows.push(`Generated,${NZ_DATE()}`);
  rows.push(``);

  const sectionHeader = (name: string) =>
    rows.push(`${name},,,,`, `Description,Qty,Unit,Rate (NZD),Subtotal`);

  const itemRow = (item: ElectricalItem) =>
    rows.push(
      `"${item.description}",${item.qty},${item.unit},${item.rate.toFixed(2)},${(item.qty * item.rate).toFixed(2)}`,
    );

  sectionHeader("LIGHTING");
  schedule.lighting.forEach(itemRow);
  rows.push(``);

  sectionHeader("POWER");
  schedule.power.forEach(itemRow);
  rows.push(``);

  sectionHeader("COMMUNICATIONS");
  schedule.communications.forEach(itemRow);
  rows.push(``);

  sectionHeader("MECHANICAL");
  schedule.mechanical.forEach(itemRow);
  rows.push(``);

  rows.push(`TOTAL ESTIMATE (excl. GST),,,,"${schedule.totalEstimate.toFixed(2)}"`);
  rows.push(`TOTAL ESTIMATE (incl. 15% GST),,,,"${(schedule.totalEstimate * 1.15).toFixed(2)}"`);

  return rows.join("\n");
}

// Re-export Carters loads so callers can import everything from one place
export { exportCartersLoads } from "@/lib/iq-carters-loads";

/* --------------------------------- QS-aligned data input sheet ------------ */

/**
 * Builds the "IQ Data Input" sheet whose cells align 1-to-1 with the
 * Jennian_QS_IQ_Updated.xlsm "Data Input" sheet.  All value cells are
 * highlighted yellow so the estimator can filter/copy them straight into QS.
 */
/**
 * Convergence Slice 6 — the "Review Notes" worksheet: one row per per-field discrepancy flag
 * carried over from the enriched takeoff, so a QS sees them before pricing. Returns null when
 * there are no flags (relational/pre-convergence jobs) so the workbook is unchanged from today.
 */
export function buildReviewNotesSheet(
  reviewFlags: QSExportData["reviewFlags"],
): XLSX.WorkSheet | null {
  if (!reviewFlags || reviewFlags.length === 0) return null;
  const ws: XLSX.WorkSheet = {};
  const set = (addr: string, v: string) => {
    ws[addr] = { v, t: "s" };
  };
  set("A1", "⚠ CONFIDENCE / REVIEW NOTES — confirm each against the plan before pricing");
  set("A3", "Field");
  set("B3", "Flag");
  let r = 4;
  for (const f of reviewFlags) {
    for (const flag of f.flags) {
      set(`A${r}`, f.field);
      set(`B${r}`, flag);
      r += 1;
    }
  }
  ws["!ref"] = `A1:B${Math.max(r - 1, 3)}`;
  ws["!cols"] = [{ wch: 22 }, { wch: 110 }];
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// DROP-IN PASTE SHEET — positional clone of Jennian Master_Updated_8_DROPIN
// Cell addresses must match the master's "IQ Input" tab exactly (D4/E4/F4,
// rows 41-72 for windows, H175-H180 for garage, H187/190/192/193 for doors).
// All values are plain numbers/text (no formulas) — Ctrl+A → copy → paste-values.
// ─────────────────────────────────────────────────────────────────────────────

/** Slot key → row in the master's IQ Input sheet. */
/**
 * Master row ownership, VERIFIED against "5. Data Input House" (Master .xlsm): each room
 * owns its named row plus the blank row(s) beneath it — the master's F73 window total
 * sums F×D across rows 41-72 INCLUDING those blanks (and excluding garage-door rows
 * 67/68), so they are live overflow rows. A room's openings with DIFFERING dims each get
 * their own row; same-dims openings aggregate qty on one row. Rows 69 and 71 are inside
 * the total but their ownership is ambiguous in the master — deliberately unused.
 */
/**
 * IQ Import tab slot rows (LIVE QS master v4_1) — POSITIONAL; the QS reads them by row.
 * overflow = the Data Input House row an extra dim-group should be typed into manually.
 */
const IQ_SLOT_ROW: Record<string, { row: number; label: string; overflow?: number }> = {
  bed1: { row: 33, label: "Bed 1", overflow: 42 },
  ensuite: { row: 34, label: "Ensuite", overflow: 44 },
  bed2: { row: 35, label: "Bed 2", overflow: 46 },
  bed3: { row: 36, label: "Bed 3", overflow: 48 },
  bed4: { row: 37, label: "Bed 4", overflow: 50 },
  bathroom: { row: 38, label: "Bathroom", overflow: 53 },
  kitchen: { row: 39, label: "Kitchen", overflow: 55 },
  familyLiving: { row: 40, label: "Family / Living", overflow: 57 },
  dining: { row: 41, label: "Dining", overflow: 60 },
  lounge: { row: 42, label: "Lounge", overflow: 63 },
  garageWindow: { row: 43, label: "Garage Windows", overflow: 66 },
  garageDoor1: { row: 44, label: "Garage Door 1" },
  entrance: { row: 45, label: "Entrance" },
};

const DROP_IN_SLOT_ROWS: Record<string, ReadonlyArray<number>> = {
  bed1: [41, 42],
  ensuite: [43, 44],
  bed2: [45, 46],
  bed3: [47, 48],
  bed4: [49, 50],
  toilet: [51], // WC maps to Toilet row (no spare)
  bathroom: [52, 53],
  kitchen: [54, 55],
  familyLiving: [56, 57, 58],
  dining: [59, 60, 61],
  lounge: [62, 63, 64],
  garageWindow: [65, 66],
  entrance: [72],
  pa_door: [70],
  // garageDoor1 / garageDoor2 handled via H175-H180 garage block + rows 67/68
  // Laundry window: no slot → dropped
};
// All window/PA-door/entrance rows (named + overflow) zeroed before writing actuals
const ALL_OPENING_ROWS = [
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
  65, 66, 67, 68, 70, 72,
];

/**
 * Standard sectional garage-door widths (m) → the drop-in H-row of the STANDARD
 * (non-insulated) count cell. Canonical openings[] carry no insulation information, so a
 * canonical-sourced door always lands in the standard bin; the relational item-label path
 * (which can read "insulated") wins whenever it has data — see the dedupe rule in
 * buildDropInSheet's garage block.
 */
const GARAGE_DOOR_STD_H_ROW_BY_WIDTH_M: ReadonlyArray<{ width_m: number; row: number }> = [
  { width_m: 4.8, row: 175 },
  { width_m: 2.4, row: 177 },
  { width_m: 2.7, row: 179 },
];
/** Width tolerance (m) when matching a sectional door to a standard H-row bin. */
const GARAGE_DOOR_WIDTH_TOL_M = 0.05;
/**
 * Master rows for NON-STANDARD-width sectional doors — the dims-capable "Garage Door"
 * rows (D=qty, E=height m, F=width m, like the window rows). A width with no H-bin
 * (e.g. a 3.0) is written here with its real dimensions, NEVER silently re-binned to a
 * standard size and never dropped. Both rows are already zeroed via ALL_OPENING_ROWS.
 */
const NON_STANDARD_GARAGE_DOOR_ROWS = [67, 68] as const;

/**
 * The IQ Import block as clipboard-ready TSV — the estimator clicks Copy in the app
 * and pastes at 'IQ Import'!A1 in the live QS master. No xlsx download round-trip.
 * Excel parses tab-separated clipboard text natively, including blank cells.
 */
export function dropInSheetToTSV(data: QSExportData): string {
  const ws = buildDropInSheet(data);
  const ref = String(ws["!ref"] ?? "A1:F50");
  const maxRow = Number(ref.split(":")[1]?.replace(/[A-Z]/g, "") ?? 50);
  const cols = ["A", "B", "C", "D", "E", "F"];
  const lines: string[] = [];
  for (let r = 1; r <= maxRow; r++) {
    lines.push(
      cols
        .map((c) => {
          const v = (ws[`${c}${r}`] as { v?: unknown } | undefined)?.v;
          return v == null ? "" : String(v).replace(/[\t\n]/g, " ");
        })
        .join("\t"),
    );
  }
  return lines.join("\n");
}

export function buildDropInSheet(data: QSExportData): XLSX.WorkSheet {
  // ════ IQ IMPORT SHEET — retargeted to the LIVE QS master (Jennian_QS_IQ_Updated_v4_1) ════
  // The live "5. Data Input House" no longer takes pastes: its cells are IFERROR formulas
  // pulling from an 'IQ Import' tab. This sheet IS that tab's content — the estimator
  // pastes it at 'IQ Import'!A1. Verified against the live workbook (structure dump,
  // 10 Jun 2026):
  //   meta:    B1 job#, B2 client, B3 address, B9 floor m², B11 alfresco, B12 ext-wall lm,
  //            B22 ceiling m, B24 garage-door size string (H176 compares B24=="4.8x2.1")
  //   doors:   B27 standard, B28 cavity, B29 doubles, B30 barn (→ H187/H193/H192/H190)
  //   windows: FIXED slot rows 33-45, columns B=Qty, C=HEIGHT(m), D=WIDTH(m).
  //            The QS pulls E(Height)←C and F(Width)←D — the OLD export wrote Width in C,
  //            transposing every window in the live QS (and corrupting the brick-sill
  //            total). Height-in-C here fixes that by construction. Room order is
  //            POSITIONAL: 33 Bed1, 34 Ensuite, 35 Bed2, 36 Bed3, 37 Bed4, 38 Bathroom,
  //            39 Kitchen, 40 Family, 41 Dining, 42 Lounge, 43 GarageWindows,
  //            44 GarageDoor1, 45 Entrance.
  //   manual in the live QS (no IQ feed): Toilet (row 51), Dining qty (D59), Lounge qty
  //            (D62), overflow rows (42,44,…63,64,66), Garage Door 2 (68), Laundry door
  //            (70), garage H-rows other than H176. Anything we can't feed goes into a
  //            visible MANUAL ENTRIES block from row 47 — an unfilled cell beats a wrong
  //            cell, and the estimator sees exactly what to type and where.
  const ws: XLSX.WorkSheet = {};
  const yellow = { fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
  function put(addr: string, v: number | string) {
    ws[addr] = { v, t: typeof v === "number" ? "n" : "s", s: yellow };
  }
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const dim = (n: number) => String(r3(n)); // 4.8 → "4.8", 3 → "3" (H176 string compare)

  // ── meta block (rows 1-24) — every QS-read cell written explicitly ──
  put("A1", "Job Number");
  put("B1", data.jmwNumber ?? "");
  put("A2", "Client Name");
  put("B2", data.clientName ?? "");
  put("A3", "Address");
  put("B3", [data.streetAddress, data.city].filter(Boolean).join(", "));
  put("A4", "Plan Type");
  put("B4", "Jennian IQ");
  put("A5", "Date Generated");
  put("B5", NZ_DATE_ISO());
  put("A8", "Item");
  put("B8", "Quantity");
  put("C8", "Unit");
  put("D8", "Notes");
  put("A9", "Floor area");
  put("B9", data.floorAreaM2 ?? 0);
  put("C9", "m²");
  put("A10", "Garage area");
  put("B10", data.garageAreaM2 ?? "");
  put("C10", "m²");
  if (data.garageAreaM2 == null) put("D10", "Measure manually / verify on plan");
  put("A11", "Alfresco / deck area");
  put("B11", data.alfrescoAreaM2 ?? "");
  put("C11", "m²");
  if (data.alfrescoAreaM2 == null) put("D11", "N/A or not extracted — verify on plan");
  put("A12", "External wall length");
  put("B12", data.perimeterLm ?? 0);
  put("C12", "lm");
  put("A13", "Internal wall length");
  // P2 pending (12 Jun): the engine's room-based internal-wall estimate is known wrong-low
  // (live audit: 7 lm vs ~50+ real). Never surface a priceable number until the ribbon-trace
  // method ships — blank value + explicit flag instead.
  put("B13", "");
  put("C13", "lm");
  put(
    "D13",
    "⚑ UNVERIFIED — engine estimate unreliable (P2 ribbon-trace pending); measure manually",
  );
  put("A14", "Roof area");
  put("B14", "");
  put("C14", "m²"); // never invented
  // Fail-safe doctrine: door counts with NO deterministic source are unbacked zeros —
  // blank the cells and flag, never assert. (JM-0021: engine null, no labels, no schedule
  // → sheet said 0 doors while vision saw ~9. A confident 0 on a quote is a guess.)
  const doorsUnresolved = (data.doorsSource ?? null) === null;
  put("A17", "Internal doors");
  put(
    "B17",
    doorsUnresolved
      ? ""
      : data.intDoorStandard +
          data.intDoorDouble +
          data.intDoorCavitySlider +
          data.intDoorBarnSlider,
  );
  put("A22", "Ceiling height");
  put("B22", data.studHeightMm != null ? r3(data.studHeightMm / 1000) : "");
  put("C22", "m");
  put("A23", "Foundation type");
  put("B23", "");

  // ── interior doors (rows 26-30) — precedence already resolved upstream ──
  put("A26", "Door Breakdown");
  put("B26", "Qty");
  put("C26", "Type");
  put("A27", "— Standard hinged");
  put("B27", doorsUnresolved ? "" : data.intDoorStandard);
  put("A28", "— Cavity sliders");
  put("B28", doorsUnresolved ? "" : data.intDoorCavitySlider);
  put("A29", "— Double doors");
  put("B29", doorsUnresolved ? "" : data.intDoorDouble);
  put("A30", "— Barn sliders");
  put("B30", doorsUnresolved ? "" : data.intDoorBarnSlider);

  // ── window slot accumulation (same grouping semantics as before) ──
  const slotGroups: Record<string, Array<{ qty: number; height_m: number; width_m: number }>> = {};
  function addToSlot(slotKey: string, h: number, w: number) {
    const groups = (slotGroups[slotKey] ??= []);
    const g = groups.find((x) => x.height_m === h && x.width_m === w);
    if (g) g.qty += 1;
    else groups.push({ qty: 1, height_m: h, width_m: w });
  }
  const sectionalDoors: Opening[] = [];
  const manual: string[] = []; // human-visible MANUAL ENTRIES lines
  // Fix (12 Jun, JM-0027/JM-0029 audit): NO WINDOW IS EVER SILENTLY DROPPED.
  // Anything without an IQ slot collects here, counts toward the B15 total, and
  // surfaces as a flagged manual line with full dims. A flagged manual entry
  // beats a silently missing window — always.
  const unplaced: Array<{ room: string; qty: number; h: number; w: number; hint?: string }> = [];
  function addUnplaced(room: string, qty: number, h: number, w: number, hint?: string) {
    const g = unplaced.find((x) => x.room === room && x.h === h && x.w === w && x.hint === hint);
    if (g) g.qty += qty;
    else unplaced.push({ room, qty, h, w, hint });
  }
  if (doorsUnresolved) {
    const hint = data.intDoorVisionHint
      ? ` — vision suggests ~${data.intDoorVisionHint}, verify`
      : "";
    manual.push(
      `⚑ Internal doors NOT deterministically counted${hint}; count on the plan and enter at B27–30 before pricing`,
    );
  }

  if (data.openingPricingBlocked) {
    manual.unshift(
      "OPENING PRICING BLOCKED - unresolved opening reconciliation; do not price windows or cladding from this export until Review Notes are resolved.",
    );
  }

  if (data.openingPricingBlocked) {
    // Partial candidate evidence may be present for review, but the IQ paste rows
    // must stay unpriced while aggregate opening pricing is blocked.
  } else if (data.openings != null) {
    for (const o of data.openings) {
      if (o.type === "sectional_door") {
        sectionalDoors.push(o);
        continue;
      }
      if (o.type === "entrance") {
        addToSlot("entrance", o.height_m, o.width_m);
        continue;
      }
      if (o.type === "pa_door") {
        manual.push(
          `Laundry/PA door ${dim(o.height_m)}H × ${dim(o.width_m)}W → Data Input House row 70`,
        );
        continue; // row 70 has no IQ feed in the live QS
      }
      const room = (o.room ?? "").toLowerCase();
      if (room.includes("laundry")) {
        addUnplaced(
          "Laundry",
          1,
          o.height_m,
          o.width_m,
          "no laundry IQ slot — enter on Data Input House",
        );
        continue;
      }
      if (room.includes("toilet") || /\bwc\b/.test(room)) {
        addUnplaced("Toilet", 1, o.height_m, o.width_m, "Data Input House row 51");
        continue; // toilet has no IQ slot
      }
      const spec = WINDOW_SLOT_SPECS.find((s) => s.keywords.some((k) => room.includes(k)));
      if (!spec || !((spec.key as string) in IQ_SLOT_ROW)) {
        addUnplaced(o.room?.trim() || "Unknown room", 1, o.height_m, o.width_m);
        continue;
      }
      addToSlot(spec.key as string, o.height_m, o.width_m);
    }
  } else {
    const wbr = data.windowsByRoom;
    for (const [slotKey, val] of Object.entries(wbr)) {
      if (!val) continue;
      if (slotKey === "garageDoor1" || slotKey === "garageDoor2") continue;
      const key = slotKey === "kitchenExtra" ? "kitchen" : slotKey;
      if (key === "toilet") {
        addUnplaced("Toilet", val.qty, val.height, val.width, "Data Input House row 51");
        continue;
      }
      if (!(key in IQ_SLOT_ROW)) {
        addUnplaced(key, val.qty, val.height, val.width);
        continue;
      }
      for (let i = 0; i < val.qty; i++) addToSlot(key, val.height, val.width);
    }
  }

  // ── write slots: rows 33-45, B=Qty C=Height D=Width; ALL slots written (zeros kill
  //    stale paste residue). Group 1 lands in the slot; further dim-groups go to the
  //    MANUAL block with their Data Input House overflow row — the live QS has no second
  //    IQ row per room, and a flagged manual line beats a silently folded wrong dim. ──
  put("A32", "Windows by Room");
  put("B32", "Qty");
  put("C32", "Height (m)");
  put("D32", "Width (m)");
  for (const [key, slot] of Object.entries(IQ_SLOT_ROW)) {
    if (key === "garageDoor1") continue; // written from sectionals below
    const groups = slotGroups[key] ?? [];
    const g = groups[0];
    put(`A${slot.row}`, slot.label);
    put(`B${slot.row}`, g ? g.qty : 0);
    put(`C${slot.row}`, g && g.height_m > 0 ? r3(g.height_m) : 0);
    put(`D${slot.row}`, g && g.width_m > 0 ? r3(g.width_m) : 0);
    for (const extra of groups.slice(1)) {
      manual.push(
        `${slot.label}: ${extra.qty} more @ ${dim(extra.height_m)}H × ${dim(extra.width_m)}W → Data Input House overflow row ${slot.overflow ?? "(under " + slot.label + ")"}`,
      );
    }
  }
  if ((slotGroups["dining"] ?? []).length > 0)
    manual.push("Dining QTY is manual in the QS (D59) — dims auto-fill, enter the count");
  if ((slotGroups["lounge"] ?? []).length > 0)
    manual.push("Lounge QTY is manual in the QS (D62) — dims auto-fill, enter the count");

  // ── garage door 1 (row 44) + size string (B24, read by H176) ──
  const gdSlot = IQ_SLOT_ROW["garageDoor1"];
  put(`A${gdSlot.row}`, gdSlot.label);
  // Source rule unchanged: relational item-label counters win (they know insulation);
  // canonical sectionals fill only when the relational path is empty.
  const rel = [
    { n: data.garageDoor48x21Std, sz: "4.8x2.1", lbl: "4.8×2.1 Standard" },
    { n: data.garageDoor48x21Insulated, sz: "4.8x2.1", lbl: "4.8×2.1 Insulated" },
    { n: data.garageDoor24x21Std, sz: "2.4x2.1", lbl: "2.4×2.1 Standard" },
    { n: data.garageDoor24x21Insulated, sz: "2.4x2.1", lbl: "2.4×2.1 Insulated" },
    { n: data.garageDoor27x21Std, sz: "2.7x2.1", lbl: "2.7×2.1 Standard" },
    { n: data.garageDoor27x21Insulated, sz: "2.7x2.1", lbl: "2.7×2.1 Insulated" },
  ].filter((x) => x.n > 0);
  if (rel.length > 0) {
    const first = rel[0];
    const [w, h] = first.sz.split("x").map(Number);
    put("A24", "Garage door size");
    put("B24", first.sz);
    put(`B${gdSlot.row}`, first.n);
    put(`C${gdSlot.row}`, h);
    put(`D${gdSlot.row}`, w);
    for (const x of rel.slice(1))
      manual.push(`Garage door ${x.lbl} ×${x.n} → Data Input House garage block (H175-180)`);
    manual.push(
      "Garage H-block: only H176 (4.8×2.1 Insulated) auto-fills in the QS — verify/enter the rest manually",
    );
  } else if (sectionalDoors.length > 0) {
    const groups: Array<{ qty: number; h: number; w: number }> = [];
    for (const o of sectionalDoors) {
      const g = groups.find((x) => x.h === o.height_m && x.w === o.width_m);
      if (g) g.qty += 1;
      else groups.push({ qty: 1, h: o.height_m, w: o.width_m });
    }
    const first = groups[0];
    put("A24", "Garage door size");
    put("B24", `${dim(first.w)}x${dim(first.h)}`);
    put(`B${gdSlot.row}`, first.qty);
    put(`C${gdSlot.row}`, r3(first.h));
    put(`D${gdSlot.row}`, r3(first.w));
    for (const g of groups.slice(1))
      manual.push(
        `Garage door ${dim(g.w)}×${dim(g.h)} ×${g.qty} → Data Input House row 68 / garage block`,
      );
  } else {
    put("A24", "Garage door size");
    put("B24", "");
    put(`B${gdSlot.row}`, 0);
    put(`C${gdSlot.row}`, 0);
    put(`D${gdSlot.row}`, 0);
  }

  // window count meta (B15) = everything in slots + manual-noted toilet lines stay manual
  const slotWindowTotal = Object.entries(slotGroups)
    .filter(([k]) => k !== "garageDoor1")
    .reduce((s, [, gs]) => s + (gs[0]?.qty ?? 0), 0);
  const unplacedWindowTotal = unplaced.reduce((s, u) => s + u.qty, 0);
  const trueWindowTotal = data.openingPricingBlocked
    ? null
    : data.openings != null
      ? data.openings.filter((o) => o.glazed).length
      : slotWindowTotal + unplacedWindowTotal;
  const manualOrOverflowWindowTotal = Math.max(
    0,
    (trueWindowTotal ?? 0) - slotWindowTotal - unplacedWindowTotal,
  );
  put("A15", "Windows");
  put("B15", trueWindowTotal ?? "");
  if (unplacedWindowTotal > 0 || manualOrOverflowWindowTotal > 0) {
    const reviewTotal = unplacedWindowTotal + manualOrOverflowWindowTotal;
    put("C15", `${slotWindowTotal} in rows 33-45 + ${reviewTotal} manual/overflow below`);
    if (manualOrOverflowWindowTotal > 0) {
      manual.unshift(
        `⚑ ${manualOrOverflowWindowTotal} of ${trueWindowTotal} QS openings require manual/overflow entry — listed below with dims; enter on Data Input House before pricing`,
      );
    }
  }
  if (unplacedWindowTotal > 0) {
    manual.unshift(
      `⚑ ${unplacedWindowTotal} of ${trueWindowTotal} windows have NO IQ slot — listed below with dims; enter on Data Input House before pricing`,
    );
  }
  for (const u of unplaced) {
    manual.push(
      `⚑ UNPLACED — ${u.room}: ${u.qty} window(s) @ ${dim(u.h)}H × ${dim(u.w)}W${u.hint ? ` → ${u.hint}` : " — no IQ slot, enter manually"}`,
    );
  }
  // Hard sanity flag: a dwelling with zero windows is physically impossible. Fires only
  // when extraction actually ran (openings array present, or callouts populated).
  const extractionRan = data.openings != null || Object.keys(data.windowsByRoom).length > 0;
  if (trueWindowTotal === 0 && extractionRan && !data.openingPricingBlocked) {
    manual.unshift(
      `⚑⚑ ZERO WINDOWS EXTRACTED — physically impossible for a dwelling. Extraction failed on this plan; DO NOT price windows or cladding from this export.`,
    );
  }
  // Pipeline safety (12 Jun): geometry-offline takeoffs are vision-only — say so at the top.
  if (data.geometryStatus === "unavailable") {
    manual.unshift(
      `⚑⚑ GEOMETRY LAYER OFFLINE — vision-only takeoff; deterministic measurement and cross-checks did not run. Verify all measurements against the plan before pricing.`,
    );
  }

  // ── MANUAL ENTRIES block (row 47+) — the visible flag set ──
  // Capped so the floating blocks can never reach the fixed SPECIFICATIONS
  // rows (guard tested): ≤25 lines printed, remainder summarised.
  const MANUAL_LINE_CAP = 25;
  put(
    "A47",
    manual.length > 0
      ? "MANUAL ENTRIES — no IQ feed; enter directly on '5. Data Input House':"
      : "MANUAL ENTRIES: none — all extracted values feed automatically.",
  );
  const manualShown = manual.slice(0, MANUAL_LINE_CAP);
  manualShown.forEach((m, i) => put(`A${48 + i}`, "• " + m));
  if (manual.length > MANUAL_LINE_CAP) {
    put(
      `A${48 + MANUAL_LINE_CAP}`,
      `• …plus ${manual.length - MANUAL_LINE_CAP} more — see Review Notes sheet`,
    );
  }
  const manualRows = Math.min(manual.length, MANUAL_LINE_CAP + 1);

  // ── CLADDING (ENGINE) — deterministic, fail-safe; every term sourced, flags visible ──
  // Inputs available today: measured perimeter, extracted stud height + pitch + gable
  // count + cladding types, canonical openings. Gable SPAN is not yet measured →
  // gabled houses carry a flag instead of a guess (V1.1 wires the geometry bbox).
  const adapterFlags: string[] = [];
  const gables = data.elevationSummary?.gableEndCount ?? null;
  if (gables == null)
    adapterFlags.push("gable count not extracted — net assumes no gables, VERIFY on elevations");
  if ((gables ?? 0) > 0 && data.gableSpanM != null)
    adapterFlags.push(
      `gable span ${data.gableSpanM}m = plan envelope short side — verify for non-rectangular plans`,
    );
  const clad = data.openingPricingBlocked
    ? null
    : computeCladding({
        perimeterLm: data.perimeterLm,
        studHeightM: data.studHeightMm != null ? data.studHeightMm / 1000 : null,
        roofPitchDeg: data.elevationSummary?.roofPitchDegrees ?? null,
        gableEndCount: gables ?? 0,
        gableSpanM: data.gableSpanM,
        openings: (data.openings ?? []).map((o) => ({ height_m: o.height_m, width_m: o.width_m })),
        claddingTypes: [data.claddingType1, data.claddingType2].filter((t): t is string => !!t),
      });
  const cladStart = 49 + manualRows;
  put(`A${cladStart}`, "CLADDING (ENGINE) — provable terms; flags need a human:");
  const fmt = (n: number | null) => (n == null ? "NOT COMPUTED" : `${n} m²`);
  put(`A${cladStart + 1}`, `• Wall (perimeter × stud): ${fmt(clad?.wallRectAreaM2 ?? null)}`);
  put(`A${cladStart + 2}`, `• Gables: ${fmt(clad?.gableAreaM2 ?? null)}`);
  put(
    `A${cladStart + 3}`,
    data.openingPricingBlocked
      ? "• Less openings: NOT COMPUTED - opening pricing blocked"
      : `• Less openings: ${clad?.glazingDeductionM2 ?? 0} m²`,
  );
  put(`A${cladStart + 4}`, `• NET CLADDING: ${fmt(clad?.netCladdingAreaM2 ?? null)}`);
  let cr = cladStart + 5;
  for (const pc of clad?.perCladding ?? []) {
    put(`A${cr}`, `   – ${pc.type}: ${fmt(pc.areaM2)}`);
    cr++;
  }
  const claddingFlags = data.openingPricingBlocked
    ? ["opening pricing blocked - resolve opening review before calculating cladding"]
    : (clad?.flags ?? []);
  for (const f of [...adapterFlags, ...claddingFlags]) {
    put(`A${cr}`, `⚑ ${f}`);
    cr++;
  }

  // ── SPECIFICATIONS (CODED) — fixed-row contract block ──
  // The QS reads column B by ABSOLUTE row ('IQ Import'!B{row}). Rows are
  // permanent (append-only schema, frozen by tests/specs/spec-contract.golden.json).
  // blank B = not answered (never invented), 0 = N/A, 1+ = selection.
  // Floating blocks above must stay below SPEC_GUARD_ROW — guarded by test.
  const specAnswers = data.specifications ?? {};
  put(
    `A${SPEC_BLOCK_HEADER_ROW}`,
    "SPECIFICATIONS (CODED) — QS reads column B by fixed row · blank = not selected · 0 = N/A",
  );
  put(`B${SPEC_BLOCK_HEADER_ROW}`, "Code");
  put(`C${SPEC_BLOCK_HEADER_ROW}`, "Selection");
  put(`D${SPEC_BLOCK_HEADER_ROW}`, "Group");
  for (const s of SPECS) {
    put(`A${s.row}`, s.id);
    const code = specAnswers[s.id];
    if (code != null && s.options.some((o) => o.code === code)) {
      put(`B${s.row}`, code);
      put(`C${s.row}`, optionLabel(s, code) ?? "");
    }
    // unanswered → B and C stay blank by construction
    put(`D${s.row}`, s.group);
  }

  ws["!ref"] = `A1:F${Math.max(cr, SPEC_LAST_ROW)}`;
  return ws;
}

export function buildQSDataInputSheet(data: QSExportData): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};

  // --- styles ---
  const yellowStyle = { fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } } };
  const redHeaderStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "E71B23" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 },
  };
  const sectionStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "404040" } },
    font: { bold: true, color: { rgb: "FFFFFF" } },
  };
  const labelStyle = { font: { color: { rgb: "666666" } } };
  const instructionStyle = { font: { italic: true, color: { rgb: "444444" } } };

  function lbl(addr: string, v: string, style: object = labelStyle) {
    ws[addr] = { v, t: "s", s: style };
  }

  // Write a value cell only when v is a non-null, non-zero, non-empty value.
  // Per spec: leave QS cells empty rather than writing 0 for missing data.
  function val(addr: string, v: string | number | null | undefined) {
    if (v === null || v === undefined || v === "" || v === 0) return;
    const out = typeof v === "number" ? (round2(v) ?? v) : v;
    ws[addr] = { v: out, t: typeof out === "number" ? "n" : "s", s: yellowStyle };
  }

  // --- Row 1: banner ---
  lbl("A1", "JENNIAN IQ — Data Input Export", redHeaderStyle);

  // --- Row 2: instructions ---
  lbl(
    "A2",
    "Open your QS file. Filter this sheet by yellow fill, copy all yellow cells, and paste (values only) into the matching cells in your QS Data Input sheet. Yellow cell addresses match QS exactly.",
    instructionStyle,
  );

  // --- ① JOB INFORMATION ---
  lbl("A4", "① JOB INFORMATION", sectionStyle);
  lbl("A5", "Client Name");
  lbl("A6", "Site Address");
  lbl("A7", "City");
  lbl("A8", "JMW Number");
  lbl("A9", "Date");

  val("I3", data.clientName || undefined);
  val("I4", data.streetAddress || undefined);
  // City always has a value — default to Palmerston North per QS convention
  ws["I5"] = { v: data.city || "Palmerston North", t: "s", s: yellowStyle };
  val("I8", data.jmwNumber || undefined);
  ws["B9"] = { v: NZ_DATE(), t: "s", s: yellowStyle };

  // --- ② CORE MEASUREMENTS ---
  lbl("A11", "② CORE MEASUREMENTS", sectionStyle);
  lbl("A12", "Floor Area (m²)");
  lbl("A13", "Alfresco Area (m²)");
  lbl("A15", "Perimeter (lm)");
  lbl("A16", "First Floor Area (m²)");
  lbl("A19", "External Wall Length (lm)");
  lbl("A20", "External Wall Height (m)");

  val("D12", data.floorAreaM2 ?? undefined);
  val("D13", data.alfrescoAreaM2 ?? undefined);
  val("D15", data.perimeterLm ?? undefined);
  val("F4", data.firstFloorAreaM2 ?? undefined);
  val("D19", data.exteriorWallLengthLm ?? undefined);
  // exteriorWallHeightM defaults to 2.4 in buildQSExportData, so always write it
  if (data.exteriorWallHeightM != null) {
    ws["D20"] = { v: data.exteriorWallHeightM, t: "n", s: yellowStyle };
  }

  // --- ③ WINDOWS & OPENINGS ---
  // BRANCHED: enriched path (data.openings present) → flat per-opening block (one row per
  // opening, no keyword routing, no collapse, no silent drops). Relational path (openings
  // absent) → old per-room slot block, unchanged — exact fallback for legacy/null jobs.
  lbl("A38", "③ WINDOWS & OPENINGS", sectionStyle);

  if (data.openings != null) {
    // ── FLAT PER-OPENING BLOCK (enriched path) ────────────────────────────────────────
    // Column headers: Type | Room | H (m) | W (m) | Area (m²) | Glazed | Cladding/Notes
    lbl("A39", "Type", labelStyle);
    lbl("B39", "Room", labelStyle);
    lbl("C39", "H (m)", labelStyle);
    lbl("D39", "W (m)", labelStyle);
    lbl("E39", "Area (m²)", labelStyle);
    lbl("F39", "Glazed", labelStyle);
    lbl("G39", "Cladding / Notes", labelStyle);

    // Solid (non-glazed) rows use a light-grey fill so reviewers can see the sectional
    // door at a glance. All other openings (incl. entrance w=0) use the standard yellow.
    const solidStyle = { fill: { patternType: "solid", fgColor: { rgb: "EBEBEB" } } };
    let r = 40;
    for (const o of data.openings) {
      const s = o.glazed ? yellowStyle : solidStyle;
      ws[`A${r}`] = { v: o.type, t: "s", s };
      ws[`B${r}`] = { v: o.room ?? "", t: "s", s };
      ws[`C${r}`] = { v: o.height_m, t: "n", s };
      ws[`D${r}`] = { v: o.width_m, t: "n", s }; // 0 = unresolved; shown, not dropped
      ws[`E${r}`] = { v: o.area_m2, t: "n", s };
      ws[`F${r}`] = { v: o.glazed ? "Y" : "N", t: "s", s };
      ws[`G${r}`] = {
        v: data.openingPricingBlocked
          ? `REVIEW ONLY - opening pricing blocked${o.flags?.length ? `; ${o.flags.join("; ")}` : ""}`
          : (o.cladding ?? o.flags?.join("; ") ?? ""),
        t: "s",
        s,
      };
      r++;
    }
    if (data.openingPricingBlocked) {
      lbl(
        `A${r}`,
        "OPENING PRICING BLOCKED - see Review Notes before pricing windows, openings, or cladding.",
        instructionStyle,
      );
      r++;
    }

    if (!data.openingPricingBlocked) {
      const totalOpeningAreaM2 = round2(data.openings.reduce((sum, o) => sum + o.area_m2, 0));
      const garageDoorAreaM2 = round2(
        data.openings
          .filter((o) => o.type === "sectional_door")
          .reduce((sum, o) => sum + o.area_m2, 0),
      );
      const qsGlazedOpeningAreaM2 = round2(
        data.openings.filter((o) => o.glazed).reduce((sum, o) => sum + o.area_m2, 0),
      );
      const summaryRow = r + 1;
      lbl(`A${summaryRow}`, "Opening totals (QS tab 5 contract)", sectionStyle);
      lbl(
        `A${summaryRow + 1}`,
        "Total wall openings incl. sectional garage door (G73; D21 deduction)",
        labelStyle,
      );
      val(`E${summaryRow + 1}`, totalOpeningAreaM2);
      lbl(
        `A${summaryRow + 2}`,
        "Sectional garage door openings excluded from QS glazing",
        labelStyle,
      );
      val(`E${summaryRow + 2}`, garageDoorAreaM2);
      lbl(
        `A${summaryRow + 3}`,
        "QS/glazed openings excl. sectional garage door (G75-style)",
        labelStyle,
      );
      val(`E${summaryRow + 3}`, qsGlazedOpeningAreaM2);
    }
  } else {
    // ── RELATIONAL SLOT BLOCK (unchanged — exact fallback for old/null-openings jobs) ──
    // Rows match "5. Data Input House " sheet exactly: C=cladding type (1=brick/2=other),
    // D=qty, E=height(m), F=width(m)
    lbl("C39", "Cladding type (1/2) — enter in QS");
    lbl("D39", "Qty");
    lbl("E39", "H (m)");
    lbl("F39", "W (m)");

    const windowRooms: Array<{
      key: keyof QSExportData["windowsByRoom"];
      roomLabel: string;
      row: number;
    }> = [
      { key: "bed1", roomLabel: "Bed 1 (Master)", row: 41 },
      { key: "ensuite", roomLabel: "Ensuite", row: 43 },
      { key: "bed2", roomLabel: "Bed 2", row: 45 },
      { key: "bed3", roomLabel: "Bed 3", row: 47 },
      { key: "bed4", roomLabel: "Bed 4", row: 49 },
      { key: "bathroom", roomLabel: "Bathroom", row: 52 },
      { key: "kitchen", roomLabel: "Kitchen", row: 54 },
      { key: "familyLiving", roomLabel: "Family/Living", row: 56 },
      { key: "dining", roomLabel: "Dining", row: 59 },
      { key: "lounge", roomLabel: "Lounge", row: 62 },
      { key: "garageWindow", roomLabel: "Garage Window", row: 65 },
      { key: "garageDoor1", roomLabel: "Garage Door", row: 67 },
      { key: "entrance", roomLabel: "Entrance", row: 72 },
    ];

    for (const { key, roomLabel, row } of windowRooms) {
      lbl(`A${row}`, roomLabel);
      const room = data.windowsByRoom[key];
      if (room) {
        // Write cladding type code to C column when derived from elevation data
        if (data.claddingTypeCode != null) {
          ws[`C${row}`] = { v: data.claddingTypeCode, t: "n", s: yellowStyle };
        }
        val(`D${row}`, room.qty);
        val(`E${row}`, room.height);
        val(`F${row}`, room.width);
      }
    }
  }

  // --- Downpipes ---
  lbl("A143", "Downpipes");
  lbl("A145", "White");
  lbl("A146", "Colorsteel");
  lbl("A147", "PVC Coloured");

  val("E145", data.downpipesWhite > 0 ? data.downpipesWhite : undefined);
  val("E146", data.downpipesColourSteel > 0 ? data.downpipesColourSteel : undefined);
  val("E147", data.downpipesPvcColoured > 0 ? data.downpipesPvcColoured : undefined);

  // --- ④ DOORS & GARAGE ---
  lbl("A174", "④ DOORS & GARAGE", sectionStyle);
  // Rows realigned to the master "5. Data Input House": H175/177/179 = Standard,
  // H176/178/180 = Insulated. H181 is the master's TRAVEL line — writing a door count
  // there silently bought $50 of travel per door. Never write it.
  lbl("A175", "Garage Door 4.8×2.1 Standard");
  lbl("A176", "Garage Door 4.8×2.1 Insulated");
  lbl("A177", "Garage Door 2.4×2.1 Standard");
  lbl("A178", "Garage Door 2.4×2.1 Insulated");
  lbl("A179", "Garage Door 2.7×2.1 Standard");
  lbl("A180", "Garage Door 2.7×2.1 Insulated");

  val("H175", data.garageDoor48x21Std > 0 ? data.garageDoor48x21Std : undefined);
  val("H176", data.garageDoor48x21Insulated > 0 ? data.garageDoor48x21Insulated : undefined);
  val("H177", data.garageDoor24x21Std > 0 ? data.garageDoor24x21Std : undefined);
  val("H178", data.garageDoor24x21Insulated > 0 ? data.garageDoor24x21Insulated : undefined);
  val("H179", data.garageDoor27x21Std > 0 ? data.garageDoor27x21Std : undefined);
  val("H180", data.garageDoor27x21Insulated > 0 ? data.garageDoor27x21Insulated : undefined);

  // --- Interior doors ---
  lbl("A185", "Interior Doors");
  lbl("A187", "Standard hinged");
  lbl("A192", "Double doors");
  lbl("A193", "Cavity sliders");

  val("H187", data.intDoorStandard > 0 ? data.intDoorStandard : undefined);
  val("H192", data.intDoorDouble > 0 ? data.intDoorDouble : undefined);
  val("H193", data.intDoorCavitySlider > 0 ? data.intDoorCavitySlider : undefined);

  // --- ⑤ ELEVATION & SITE PLAN DATA (auto-derived from elevation/site plan PDFs) ---
  if (data.elevationSummary) {
    const ev = data.elevationSummary;
    lbl("A197", "⑤ ELEVATION & SITE PLAN DATA", sectionStyle);
    lbl("A199", "Cladding type code (1=brick · 2=weatherboard · 3=mixed)");
    if (data.claddingTypeCode != null) val("D199", data.claddingTypeCode);
    lbl("A200", "Roof type");
    if (ev.roofType) lbl("D200", ev.roofType, { font: {} });
    lbl("A201", "Roof pitch (degrees)");
    if (ev.roofPitchDegrees != null) val("D201", ev.roofPitchDegrees);
    lbl("A203", "Gable end count");
    if (ev.gableEndCount > 0) val("D203", ev.gableEndCount);
    lbl("A205", "Driveway concrete (m²)");
    if (ev.drivewayConcretM2 != null) val("D205", ev.drivewayConcretM2);
    lbl("A206", "Paths / patio concrete (m²)");
    if (ev.patioConcreteM2 != null) val("D206", ev.patioConcreteM2);
    lbl("A207", "Total concrete (m²)");
    if (ev.totalConcreteM2 != null) val("D207", ev.totalConcreteM2);
    if (ev.windowCountWarning) {
      lbl("A209", `⚠ ${ev.windowCountWarning}`, {
        font: { color: { rgb: "FF8C00" }, italic: true },
      });
    }
    if (ev.windowCountMatch === true) {
      lbl("A209", "✓ Window count verified — floor plan and elevations agree", {
        font: { color: { rgb: "008000" } },
      });
    }
  }

  // --- sheet metadata ---
  ws["!cols"] = [
    { wch: 35 }, // A — labels
    { wch: 12 }, // B — date reference
    { wch: 15 }, // C — window cladding
    { wch: 15 }, // D — measurements / window qty
    { wch: 15 }, // E — window height / downpipes
    { wch: 15 }, // F — first floor / window width
    { wch: 22 }, // G — Cladding / Notes (flat-block path)
    { wch: 15 }, // H — garage door / interior door counts
    { wch: 25 }, // I — job info values
  ];
  ws["!ref"] = "A1:I210";

  return ws;
}

/* --------------------------------- concept mode IQ data sheet (async, full) */

/**
 * Generates an IQ data workbook with Cover + Data + QS Data Input sheets,
 * loading plan type, confidence score, and module_items from Supabase when
 * jobId is provided.
 * Cover sheet: job info, plan type, confidence %, and assumed items list.
 * Data sheet: module_items with amber fill for assumed rows.
 * IQ Data Input sheet: values at exact QS cell addresses, yellow-highlighted.
 */
export async function writeIQDataSheetFull(
  data: QSExportData & { jobId?: string },
): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new();

  let confidenceScore: number | null = null;
  let allItems: Array<{
    module_id: string;
    label: string;
    extracted_value: string | null;
    approved_value: string | null;
    unit: string | null;
    value_source: string | null;
  }> = [];

  if (data.jobId) {
    const jobRes = await supabase
      .from("jobs")
      .select("confidence_score")
      .eq("id", data.jobId)
      .single();
    if (jobRes.error) throw new Error(`Failed to load job: ${jobRes.error.message}`);
    confidenceScore = (jobRes.data?.confidence_score as number | null) ?? null;
    if (data.moduleItems) {
      allItems = data.moduleItems;
    } else {
      const itemsRes = await supabase
        .from("module_items")
        .select("module_id, label, extracted_value, approved_value, unit, value_source")
        .eq("job_id", data.jobId)
        .order("sort_order", { ascending: true });
      if (itemsRes.error) throw new Error(`Failed to load module items: ${itemsRes.error.message}`);
      allItems = (itemsRes.data ?? []) as typeof allItems;
    }
  }

  const assumedItems = allItems.filter((i) => i.value_source === "assumed");

  // Cover sheet
  const coverRows: (string | number | null)[][] = [
    ["Jennian Homes — IQ Data Sheet"],
    [],
    ["Job Number", data.jobNumber],
    ["Client", data.clientName],
    ["Address", data.address],
    ["Date", NZ_DATE()],
    ...(confidenceScore != null ? [["Confidence Score", `${confidenceScore}%`]] : []),
    [],
  ];

  if (assumedItems.length > 0) {
    coverRows.push(["ASSUMED ITEMS (Jennian standard allowances)"]);
    coverRows.push(["Module", "Label", "Value", "Unit"]);
    for (const item of assumedItems) {
      coverRows.push([
        item.module_id.replace("iq-", "").toUpperCase(),
        item.label,
        pickModuleValue(item) ?? "—", // approved beats the raw assumption
        item.unit ?? "",
      ]);
    }
  }

  const wsCover = XLSX.utils.aoa_to_sheet(coverRows);
  wsCover["!cols"] = [{ wch: 20 }, { wch: 40 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsCover, "Cover");

  // Convergence Slice 6 — Review Notes sheet: the per-field confidence flags carried over from
  // the enriched takeoff, placed prominently (right after the Cover) so a QS sees them before
  // pricing. Added ONLY when there are flags → a pre-convergence/relational export (no flags)
  // is byte-identical to today.
  const wsFlags = buildReviewNotesSheet(data.reviewFlags);
  if (wsFlags) XLSX.utils.book_append_sheet(wb, wsFlags, "Review Notes");
  const wsExtractedQuantities = buildExtractedQuantitiesSheet(data.extractedQuantityReadModel);
  if (wsExtractedQuantities) {
    XLSX.utils.book_append_sheet(wb, wsExtractedQuantities, "Extracted Quantities");
  }

  // Data sheet with amber fill for assumed rows
  const dataHeader = ["Module", "Label", "Value", "Unit", "Source"];
  const dataRows: (string | number | null)[][] = [dataHeader];
  for (const item of allItems) {
    const suppressedInternalWall = isSuppressedInternalWallDataItem(item);
    if (suppressedInternalWall) {
      item.approved_value = null;
      item.extracted_value = "—";
      item.value_source = "review";
    }
    dataRows.push([
      item.module_id.replace("iq-", "").toUpperCase(),
      item.label,
      pickModuleValue(item) ?? "—",
      item.unit ?? "",
      item.approved_value != null ? "approved" : (item.value_source ?? "extracted"),
    ]);
  }

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 12 }];

  // Apply amber fill style to assumed rows
  const amberFill = { patternType: "solid", fgColor: { rgb: "FFF3CD" } };
  for (let r = 1; r < dataRows.length; r++) {
    const src = dataRows[r][4];
    if (src === "assumed") {
      for (let c = 0; c < 5; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!wsData[addr]) wsData[addr] = { v: "", t: "s" };
        (wsData[addr] as XLSX.CellObject).s = { fill: amberFill };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsData, "5. Data Input House ");

  // Drop-in paste sheet — cell addresses match the master's IQ Input tab exactly.
  // Ctrl+A → copy → paste-values into master. Replaces the retired D12-style sheet.
  const wsDropIn = buildDropInSheet(data);
  XLSX.utils.book_append_sheet(wb, wsDropIn, "IQ Import");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
