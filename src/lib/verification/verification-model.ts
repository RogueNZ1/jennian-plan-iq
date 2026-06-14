/**
 * Verification printout model (P-fortnight: "verification page ships with EVERY takeoff").
 *
 * Pure assembly: takes the SAME QSExportData the spreadsheet export consumes, plus the
 * persisted EnrichedTakeoff (takeoff_runs.takeoff_json) for per-field provenance, and
 * produces a render-ready model for the human printout. No fetching, no Date.now side
 * effects beyond the injected `now` — fully unit-testable.
 *
 * Doctrine carried over from the export composer:
 *  - values shown MUST be the values the QS sheet receives (single composer, no parallel math);
 *  - flags are surfaced LOUD, never summarised away;
 *  - an unbacked number is worse than a blank — provenance is printed next to every measure.
 */

import type { QSExportData } from "@/lib/iq-qs-export";
import type { EnrichedTakeoff, FieldValue } from "@/lib/takeoff/enriched-takeoff";
import type { VisualOpeningAuditSummary } from "@/lib/takeoff/visual-opening-audit";
import {
  SPEC_GROUPS,
  specsInGroup,
  optionLabel,
  parseSpecifications,
} from "@/lib/specs/spec-schema";
import {
  buildDoorMarkers,
  buildVisualOpeningMarkers,
  summariseMarkers,
  type DoorMarker,
  type DoorPagePersisted,
  type OverlaySummary,
  type VisualOpeningMarker,
} from "./plan-overlay";

/* ------------------------------------------------------------------ NZT stamps */
// Same Pacific/Auckland discipline as the export composer (12 Jun fix): CI and Pages run
// UTC, and a bare ISO slice stamps *yesterday* on anything generated after 1pm NZ time.

export function nzDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function nzDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/* ------------------------------------------------------------------ model types */

export type SourceTag = "GEO" | "VEC" | "VIS" | "SCH" | "DRV" | "AST" | "FLG" | "MAN" | null;

export type MeasureRow = {
  label: string;
  /** Display-formatted value, "—" when null. */
  value: string;
  unit: string;
  source: SourceTag;
  confidence: "high" | "mid" | "low" | null;
  flagged: boolean;
};

export type RoomWindowRow = {
  room: string;
  cladding: string;
  qty: number;
  /** mm as printed on the sheet rows */
  height: number;
  width: number;
};

export type ScheduleRow = { id: string; height_m: number | null; width_m: number | null };

export type CountRow = { label: string; qty: number };

export type SpecRow = { label: string; answer: string };
export type SpecGroupRows = { group: string; rows: SpecRow[] };

export type ExceptionGroup = { field: string; flags: string[] };

export type VerificationModel = {
  header: {
    jobNumber: string;
    jmwNumber: string;
    clientName: string;
    address: string;
    planVersion: string;
    runIdShort: string | null;
    runStartedNzt: string | null;
    generatedNzt: string;
    takeoffSource: "enriched" | "relational" | null;
  };
  geometryOffline: boolean;
  measures: MeasureRow[];
  windows: {
    byRoom: RoomWindowRow[];
    schedule: ScheduleRow[];
    qsRows: CountRow[]; // the joinery rows exactly as exported
    totals: {
      windowCount: number | null;
      glazedSqm: number | null;
      totalOpeningSqm: number | null;
    };
    unplacedFlags: string[]; // ⚑ UNPLACED entries pulled from window-field flags
  };
  doors: {
    interior: CountRow[];
    interiorTotal: number;
    source: QSExportData["doorsSource"];
    sourceLabel: string;
    visionHint: number | null;
    externalCount: string; // formatted (may be "—")
    garage: CountRow[];
    garageDoorSize: string;
    hardware: CountRow[]; // hatch, attic stair, letterbox, washing line
  };
  roofCladding: MeasureRow[];
  elevation: MeasureRow[];
  elevationWarning: string | null;
  services: {
    downpipes: CountRow[];
    heatPumps: CountRow[];
    skylights: CountRow[];
    extras: Array<{ label: string; value: string }>;
  };
  specs: SpecGroupRows[];
  exceptions: ExceptionGroup[];
  /** Plan-overlay slice (13 Jun): door-engine hits + page identity for the rendered overlay. */
  planOverlay: {
    markers: DoorMarker[];
    visualOpenings: VisualOpeningMarker[];
    visualSummary: VisualOpeningAuditSummary | null;
    visualWarnings: string[];
    page: DoorPagePersisted | null;
    summary: OverlaySummary;
  };
  /** Cross-check guard: export value vs enriched value diverged (should never happen). */
  integrityAlerts: string[];
};

/* ------------------------------------------------------------------ helpers */

const SOURCE_MAP: Record<string, SourceTag> = {
  geometry: "GEO",
  vector: "VEC",
  vision: "VIS",
  schedule: "SCH",
  derived: "DRV",
  asserted: "AST",
  "flagged-unknown": "FLG",
  manual: "MAN",
};

export const SOURCE_LEGEND: Array<{ tag: NonNullable<SourceTag>; meaning: string }> = [
  { tag: "GEO", meaning: "Measured by geometry engine" },
  { tag: "VEC", meaning: "Read from PDF vector layer" },
  { tag: "VIS", meaning: "AI vision read" },
  { tag: "SCH", meaning: "Door & Window Schedule" },
  { tag: "DRV", meaning: "Derived from other fields" },
  { tag: "AST", meaning: "Asserted building standard" },
  { tag: "FLG", meaning: "Unknown — needs confirmation" },
  { tag: "MAN", meaning: "Manual override" },
];

function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-NZ", { maximumFractionDigits: dp });
}

function fmtStr(v: string | null | undefined): string {
  return v && v.trim() !== "" ? v : "—";
}

function prov(f: FieldValue<unknown> | undefined | null): {
  source: SourceTag;
  confidence: "high" | "mid" | "low" | null;
  flagged: boolean;
} {
  if (!f) return { source: null, confidence: null, flagged: false };
  return {
    source: SOURCE_MAP[f.source] ?? null,
    confidence: f.confidence,
    flagged: f.discrepancy_flags.length > 0,
  };
}

function measure(
  label: string,
  value: number | string | null | undefined,
  unit: string,
  field?: FieldValue<unknown> | null,
  dp = 2,
): MeasureRow {
  const p = prov(field);
  return {
    label,
    value: typeof value === "string" ? fmtStr(value) : fmtNum(value, dp),
    unit,
    ...p,
  };
}

const ROOM_LABELS: Record<string, string> = {
  bed1: "Bed 1",
  ensuite: "Ensuite",
  bed2: "Bed 2",
  bed3: "Bed 3",
  bed4: "Bed 4",
  toilet: "Toilet",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  kitchenExtra: "Kitchen (extra)",
  familyLiving: "Family / Living",
  dining: "Dining",
  lounge: "Lounge",
  garageWindow: "Garage window",
  garageDoor1: "Garage door 1",
  garageDoor2: "Garage door 2",
  entrance: "Entrance",
};

const DOORS_SOURCE_LABELS: Record<string, string> = {
  confirmed: "Manually confirmed (historical)",
  engine: "Deterministic door engine",
  labels: "Plan label read",
  schedule: "Door & Window Schedule",
};

/* ------------------------------------------------------------------ builder */

export function buildVerificationModel(
  data: QSExportData,
  enriched: EnrichedTakeoff | null,
  run: { id: string; started_at: string } | null,
  now: Date = new Date(),
): VerificationModel {
  const e = enriched;

  /* header ------------------------------------------------------- */
  const header: VerificationModel["header"] = {
    jobNumber: fmtStr(data.jobNumber),
    jmwNumber: fmtStr(data.jmwNumber),
    clientName: fmtStr(data.clientName),
    address: fmtStr(data.address),
    planVersion: fmtStr(data.planVersion),
    runIdShort: run ? run.id.slice(0, 8) : null,
    runStartedNzt: run ? nzDateTime(new Date(run.started_at)) : null,
    generatedNzt: nzDateTime(now),
    takeoffSource: data.takeoffSource ?? null,
  };

  /* geometry banner ---------------------------------------------- */
  const geometryOffline =
    data.geometryStatus === "unavailable" || (e?.geometry_status?.value ?? null) === "unavailable";

  /* key measures -------------------------------------------------- */
  const measures: MeasureRow[] = [
    measure("Floor area (living)", data.floorAreaM2, "m²", e?.floor_area_m2),
    measure("Garage area", e?.garage_area_m2?.value ?? null, "m²", e?.garage_area_m2),
    measure("Alfresco area", data.alfrescoAreaM2, "m²", e?.alfresco_area_m2),
    measure("First-floor area", data.firstFloorAreaM2, "m²", null),
    measure("Total area", e?.total_area_m2?.value ?? null, "m²", e?.total_area_m2),
    measure(
      "External wall length",
      data.exteriorWallLengthLm ?? data.perimeterLm,
      "lm",
      e?.external_wall_lm,
    ),
    measure("External wall height", data.exteriorWallHeightM, "m", null),
    measure(
      "External wall area",
      e?.external_wall_area_m2?.value ?? null,
      "m²",
      e?.external_wall_area_m2,
    ),
    // Internal walls: the export still refuses to write this number, and the
    // printout matches. P2 ribbon-trace v1 (13 Jun 2026) now produces a
    // VERIFY-grade value — shown WITH its bias warning when present; the bare
    // measure-manually line remains for pre-v1 runs.
    e?.internal_wall_lm?.source === "vector" && typeof e.internal_wall_lm.value === "number"
      ? {
          label: "Internal walls — ribbon-trace v1 (verify; ~+25% joinery bias; not exported)",
          value: String(e.internal_wall_lm.value),
          unit: "lm",
          source: "VEC" as const,
          confidence: "mid" as const,
          flagged: true,
        }
      : {
          label: "Internal walls — measure manually (P2 ribbon-trace pending)",
          value: "—",
          unit: "",
          source: null,
          confidence: null,
          flagged: true,
        },
    measure("Roof area", e?.roof_area_m2?.value ?? null, "m²", e?.roof_area_m2),
    measure("Gable span (envelope short side)", data.gableSpanM, "m", e?.gable_span_m),
    measure("Stud height", data.studHeightMm, "mm", null, 0),
    measure("Ceiling height", e?.ceiling_height_m?.value ?? null, "m", e?.ceiling_height_m),
    measure("Foundation", e?.foundation_type?.value ?? null, "", e?.foundation_type),
  ];

  /* windows -------------------------------------------------------- */
  const byRoom: RoomWindowRow[] = Object.entries(data.windowsByRoom ?? {})
    .filter(([, v]) => v && v.qty > 0)
    .map(([key, v]) => ({
      room: ROOM_LABELS[key] ?? key,
      cladding: fmtStr(v!.cladding),
      qty: v!.qty,
      height: v!.height,
      width: v!.width,
    }));

  const schedule: ScheduleRow[] = (e?.windows_schedule?.value ?? []).map((s) => ({
    id: s.id,
    height_m: s.height_m,
    width_m: s.width_m,
  }));

  const qsRows: CountRow[] = (data.windows ?? [])
    .filter((w) => w.qty > 0 || (w.type && w.type.trim() !== ""))
    .map((w) => ({ label: fmtStr(w.type), qty: w.qty }));

  const windowFieldFlags = [
    ...(e?.window_count?.discrepancy_flags ?? []),
    ...(e?.windows_by_room?.discrepancy_flags ?? []),
    ...(e?.windows_schedule?.discrepancy_flags ?? []),
  ];
  const unplacedFlags = windowFieldFlags.filter((f) => f.toUpperCase().includes("UNPLACED"));

  /* doors ---------------------------------------------------------- */
  const interior: CountRow[] = [
    { label: "Standard", qty: data.intDoorStandard },
    { label: "U-groove", qty: data.intDoorUGroove },
    { label: "V-groove", qty: data.intDoorVGroove },
    { label: "Double", qty: data.intDoorDouble },
    { label: "Cavity slider", qty: data.intDoorCavitySlider },
    { label: "Barn slider", qty: data.intDoorBarnSlider },
  ];
  const interiorTotal = interior.reduce((s, r) => s + (r.qty || 0), 0);

  const garage: CountRow[] = [
    { label: "4.8 × 2.1 standard", qty: data.garageDoor48x21Std },
    { label: "4.8 × 2.1 insulated", qty: data.garageDoor48x21Insulated },
    { label: "2.7 × 2.1 standard", qty: data.garageDoor27x21Std },
    { label: "2.7 × 2.1 insulated", qty: data.garageDoor27x21Insulated },
    { label: "2.4 × 2.1 standard", qty: data.garageDoor24x21Std },
    { label: "2.4 × 2.1 insulated", qty: data.garageDoor24x21Insulated },
  ].filter((r) => r.qty > 0);

  const hardware: CountRow[] = [
    { label: "Ceiling hatch", qty: data.ceilingHatch },
    { label: "Attic stair", qty: data.atticStair },
    { label: "Letterbox (urban)", qty: data.letterboxUrban },
    { label: "Washing line", qty: data.washingLine },
  ].filter((r) => r.qty > 0);

  const doors: VerificationModel["doors"] = {
    interior,
    interiorTotal,
    source: data.doorsSource ?? null,
    sourceLabel: data.doorsSource
      ? (DOORS_SOURCE_LABELS[data.doorsSource] ?? data.doorsSource)
      : "⚑ NO SOURCE — counts are unbacked zeros, do not price",
    visionHint: data.intDoorVisionHint ?? null,
    externalCount: fmtNum(
      e?.external_door_count?.value ?? data.elevationSummary?.externalDoorCount ?? null,
      0,
    ),
    garage,
    garageDoorSize: fmtStr(e?.garage_door_size?.value ?? null),
    hardware,
  };

  /* roof / cladding ------------------------------------------------ */
  const roofCladding: MeasureRow[] = [
    measure("Roof pitch", data.roofPitch, "", null),
    measure("Ridge type", data.ridgeType, "", null),
    measure("Underlay", data.underlay, "", null),
    measure("Cladding 1", data.claddingType1, "", null),
    measure("Cladding 2", data.claddingType2, "", null),
    measure(
      "Cladding code",
      data.claddingTypeCode != null
        ? `${data.claddingTypeCode} — ${{ 1: "brick/masonry only", 2: "weatherboard/panel only", 3: "mixed" }[data.claddingTypeCode] ?? "?"}`
        : null,
      "",
      null,
    ),
  ];

  /* elevation & site ----------------------------------------------- */
  const el = data.elevationSummary;
  const elevation: MeasureRow[] = el
    ? [
        measure("Roof type (elevations)", el.roofType, "", null),
        measure("Roof pitch (elevations)", el.roofPitchDegrees, "°", null, 1),
        measure("External doors (elevations)", el.externalDoorCount, "", null, 0),
        measure("Gable ends", el.gableEndCount, "", null, 0),
        measure("Driveway concrete", el.drivewayConcretM2 ?? data.drivewayM2, "m²", null),
        measure("Paths / patio concrete", el.patioConcreteM2 ?? data.pathsPatioM2, "m²", null),
        measure("Total concrete", el.totalConcreteM2, "m²", null),
      ]
    : [
        measure("Driveway concrete", data.drivewayM2, "m²", null),
        measure("Paths / patio concrete", data.pathsPatioM2, "m²", null),
      ];
  const elevationWarning = el?.windowCountWarning ?? null;

  /* services / extras ---------------------------------------------- */
  const services: VerificationModel["services"] = {
    downpipes: [
      { label: "White PVC", qty: data.downpipesWhite },
      { label: "Coloursteel", qty: data.downpipesColourSteel },
      { label: "PVC coloured", qty: data.downpipesPvcColoured },
    ].filter((r) => r.qty > 0),
    heatPumps: (data.heatPumps ?? [])
      .filter((h) => h.qty > 0)
      .map((h) => ({ label: fmtStr(h.model), qty: h.qty })),
    skylights: (data.skylights ?? [])
      .filter((s) => s.qty > 0)
      .map((s) => ({ label: fmtStr(s.type), qty: s.qty })),
    extras: (data.extras ?? [])
      .filter((x) => x.description && x.description.trim() !== "")
      .map((x) => ({
        label: x.description,
        value: x.value ? `$${x.value.toLocaleString("en-NZ")}` : "—",
      })),
  };

  /* specs ----------------------------------------------------------- */
  // QSExportData.specifications is the already-parsed flat SpecAnswers (spec_id → code);
  // the {v, answers} jsonb branch is a safety net for callers handing the raw column.
  const rawSpecs = data.specifications as unknown;
  const answers: Record<string, number> =
    rawSpecs && typeof rawSpecs === "object" && "answers" in (rawSpecs as object)
      ? parseSpecifications(rawSpecs).answers
      : ((rawSpecs as Record<string, number> | null | undefined) ?? {});
  const specs: SpecGroupRows[] = SPEC_GROUPS.map((g) => ({
    group: g.label,
    rows: specsInGroup(g.id).map((s) => {
      const code = answers[s.id];
      const ans = code != null ? optionLabel(s, code) : null;
      return { label: s.label, answer: ans ?? "— not set" };
    }),
  })).filter((g) => g.rows.length > 0);

  /* plan overlay ----------------------------------------------------- */
  const overlayMarkers = buildDoorMarkers(e?.door_hits ?? null);
  const visualOpenings = buildVisualOpeningMarkers(e?.visual_opening_audit?.openings ?? null);
  const planOverlay: VerificationModel["planOverlay"] = {
    markers: overlayMarkers,
    visualOpenings,
    visualSummary: e?.visual_opening_audit?.summary ?? null,
    visualWarnings: e?.visual_opening_audit?.warnings ?? [],
    page: e?.door_page ?? null,
    summary: summariseMarkers(overlayMarkers),
  };

  /* exceptions ------------------------------------------------------ */
  const exceptions: ExceptionGroup[] = (data.reviewFlags ?? [])
    .filter((f) => f.flags.length > 0)
    .map((f) => ({ field: f.field, flags: f.flags }));

  /* integrity guard -------------------------------------------------- */
  // Same-composer doctrine means these can never diverge; if they do, something upstream
  // broke and the printout must say so rather than print two truths.
  const integrityAlerts: string[] = [];
  if (e) {
    if (
      e.floor_area_m2.value != null &&
      data.floorAreaM2 != null &&
      Math.abs(e.floor_area_m2.value - data.floorAreaM2) > 0.01
    ) {
      integrityAlerts.push(
        `Floor area diverges: export ${data.floorAreaM2} m² vs takeoff ${e.floor_area_m2.value} m²`,
      );
    }
    const exportWindowQty = (data.windows ?? []).reduce((s, w) => s + (w.qty || 0), 0);
    if (
      e.window_count.value != null &&
      exportWindowQty > 0 &&
      e.window_count.value !== exportWindowQty
    ) {
      integrityAlerts.push(
        `Window count diverges: export rows total ${exportWindowQty} vs takeoff ${e.window_count.value}`,
      );
    }
  }

  return {
    header,
    geometryOffline,
    measures,
    windows: {
      byRoom,
      schedule,
      qsRows,
      totals: {
        windowCount: e?.window_count?.value ?? null,
        glazedSqm: e?.glazed_sqm ?? null,
        totalOpeningSqm: e?.total_opening_sqm ?? null,
      },
      unplacedFlags,
    },
    doors,
    roofCladding,
    elevation,
    elevationWarning,
    services,
    specs,
    exceptions,
    planOverlay,
    integrityAlerts,
  };
}
