/**
 * composeTakeoff — the shared, PURE plan-to-takeoff seam (Convergence Slices 1–2).
 *
 * This is the single implementation of "given the (already-fetched) vision takeoff +
 * geometry + window schedule, produce the reconciled takeoff". It was extracted from the
 * interactive `/upload` flow (Pipeline B) so the production path (`run.ts`, Pipeline A) can
 * call the exact same logic — the two paths then differ ONLY in I/O (ephemeral vs
 * persisted), and the divergence the audit found becomes impossible to recur. See
 * CONVERGENCE_DESIGN.md.
 *
 * Slice 2: the output is now an `EnrichedTakeoff` — every QS field wrapped in a
 * `FieldValue` (value + source + confidence + discrepancy_flags). VALUES are unchanged from
 * Slice 1 (unwrapTakeoff(enriched) deep-equals the Slice 1 golden); the enrichment only
 * ADDS provenance and migrates the global flags onto the field they belong to. A global
 * `notes` view is preserved byte-for-byte for backward-compat.
 *
 * PURITY CONTRACT (unchanged):
 *   - Inputs → output, nothing else. NO model/vision call, NO geometry fetch, NO network,
 *     NO clock, NO Math.random, NO Supabase/IO, NO React state, NO toast.
 *   - Every impure dependency (the AI passes, the geometry measurement, the schedule read)
 *     is performed by the CALLER and handed in as data; the caller owns all side-effects.
 *   - Identical inputs ⇒ deterministic output.
 */
import type { TakeoffData } from "./takeoff-types";
import type { GeometryApiResult } from "./geometry-api";
import type { WindowScheduleData } from "./extract-window-schedule";
import {
  preferVectorGarage,
  safeguardScheduleHeights,
  headDatumSafeguardNote,
  preferVectorOpenings,
  preferVectorEntrance,
  entranceAssumptionNote,
  type ScheduleSafeguardResult,
} from "./vector-annotations";
import { aggregateWindows, applyWindowAggregate } from "./aggregate-windows";
import { deriveOpenings, deriveOpeningTotals, foldSymbolOpenings } from "./derive-fields";
import {
  reconcileVectorVision,
  type ReconciliationReport,
  type FieldReconciliation,
} from "./reconcile-annotations";
import { reconcileGeometryPage, type PageReconciliation } from "./page-of-truth";
import {
  fv,
  type EnrichedTakeoff,
  type FieldConfidence,
  type FieldSource,
} from "./enriched-takeoff";

export type ComposeTakeoffInput = {
  /** The vision-extracted takeoff (already returned by extractConceptTakeoffs). */
  visionTakeoff: TakeoffData;
  /** The geometry measurement + vector_annotations (already fetched), or null. */
  geometry: GeometryApiResult | null | undefined;
  /** The (already-read) Door & Window Schedule, or null when there is no schedule page. */
  schedule: WindowScheduleData | null | undefined;
  /**
   * The 0-based page index we asked geometry to measure (the AI-classified floor plan),
   * or undefined when no page was pinned. Reconciled against `geometry.page_used`.
   */
  geometryPageIndex: number | undefined;
};

export type ComposeTakeoffResult = {
  /** The enriched takeoff — per-field value + source + confidence + discrepancy_flags. */
  enriched: EnrichedTakeoff;
  /** The F-022 vector↔vision cross-check report (its flags are also on the fields). */
  reconciliation: ReconciliationReport;
  /** Did geometry measure the page we pinned? Returned so the caller can surface a toast. */
  pageReconcile: PageReconciliation;
  /** The head-datum safeguard result (flagged window ids + detected datum). */
  scheduleSafeguard: ScheduleSafeguardResult;
};

/** Normalise geometry's confidence vocabulary ("medium") to the FieldValue vocabulary. */
function normConf(c: "high" | "medium" | "low" | null | undefined): FieldConfidence {
  if (c === "medium") return "mid";
  if (c === "high" || c === "low") return c;
  return null;
}

/** Map an F-022 reconciliation status to a field confidence. */
function reconConf(status: FieldReconciliation["status"] | undefined): FieldConfidence {
  if (status === "agree") return "high";
  if (status === "disagree") return "low";
  return null; // uncheckable / missing → we don't claim a confidence
}

/** The notes added by a step = the suffix `after` has beyond `before` (1 combined entry). */
function noteDelta(before: string, after: string): string[] {
  if (!after) return [];
  if (before && after.startsWith(before)) {
    const d = after.slice(before.length).trim();
    return d ? [d] : [];
  }
  return before === after ? [] : [after];
}

/**
 * Pure compose. Mirrors the `/upload` seam exactly (geometry overrides → vector garage →
 * head-datum safeguard → window aggregate → vector openings → asserted entrance → F-022),
 * then wraps the result in per-field provenance. Ext-wall area is NOT recomputed — it stays
 * gated on the per-window heights.
 */
export function composeTakeoff(input: ComposeTakeoffInput): ComposeTakeoffResult {
  const { visionTakeoff, geometry, schedule: scheduleRaw, geometryPageIndex } = input;

  const geoResult = geometry ?? null;
  const m = geoResult?.measurements;
  const geoRoomCount = m?.room_count ?? 0;
  const vectorAnnotations = geoResult?.vector_annotations;
  const aiRoomLabels = (visionTakeoff as { roomLabels?: string[] }).roomLabels;

  // ── flags, tracked per-field as they are generated ──────────────────────────────
  // Phase 3 — page divergence: geometry measured a different page than we pinned.
  const pageReconcile = reconcileGeometryPage(geometryPageIndex, geoResult?.page_used);
  const pageFlag = !pageReconcile.agreed && pageReconcile.note ? pageReconcile.note : null;

  // Internal-wall confidence note (geometry rooms vs AI room labels).
  const roomFlags: string[] = [];
  if (geoRoomCount > 0 && aiRoomLabels && aiRoomLabels.length > 0) {
    if (geoRoomCount > aiRoomLabels.length) {
      roomFlags.push(
        `Geometry found ${geoRoomCount} room dims; AI found ${aiRoomLabels.length} room labels.`,
      );
    }
  } else if (geoRoomCount === 0 && m != null) {
    roomFlags.push("Internal wall: not extracted — no room dimension annotations found in plan.");
  }

  // Same order the seam has always used: page note first, then the room note(s).
  const internalWallNotes = [pageFlag, ...roomFlags].filter(Boolean) as string[];

  // ── the value seam (unchanged behaviour) ────────────────────────────────────────
  // Geometry overrides AI for measurement fields — geometry API is more accurate.
  const merged: TakeoffData = {
    ...visionTakeoff,
    ...(m?.floor_area_m2 != null ? { floor_area_m2: m.floor_area_m2 } : {}),
    ...(m?.perimeter_m != null ? { external_wall_lm: m.perimeter_m } : {}),
    ...(m?.internal_wall_length_m != null
      ? { internal_wall_lm: m.internal_wall_length_m }
      : { internal_wall_lm: null }),
    ...(m?.garage_area_m2 != null ? { garage_area_m2: m.garage_area_m2 } : {}),
    ...(m?.alfresco_area_m2 != null ? { alfresco_area_m2: m.alfresco_area_m2 } : {}),
    ...(m?.stud_height_mm != null ? { ceiling_height_m: m.stud_height_mm / 1000 } : {}),
    ...(internalWallNotes.length > 0
      ? { notes: [visionTakeoff.notes, ...internalWallNotes].filter(Boolean).join(" ") }
      : {}),
  };

  // Vector-first garage. Capture the VISION garage size BEFORE the override (F-022 + source).
  const visionGarageSize = merged.garage_door_size;
  const mergedVec = preferVectorGarage(merged, vectorAnnotations);
  const garageChanged = mergedVec.garage_door_size !== merged.garage_door_size;

  // Head-datum safeguard before aggregating.
  const scheduleSafeguard = safeguardScheduleHeights(scheduleRaw, vectorAnnotations);
  const schedule = scheduleSafeguard.schedule;

  const windowAggregate = aggregateWindows(schedule, mergedVec.windows_by_room);
  const notesBeforeAgg = mergedVec.notes ?? "";
  let mergedWithWindows = applyWindowAggregate(mergedVec, windowAggregate);
  // The ext-wall (in)complete / overshoot note, if the aggregate added one → ext-wall field.
  const extWallFlags = noteDelta(notesBeforeAgg, mergedWithWindows.notes ?? "");

  // Vector-preferred window COUNT. Capture the VISION count BEFORE the override.
  const visionWindowCount = mergedWithWindows.window_count;
  mergedWithWindows = preferVectorOpenings(mergedWithWindows, vectorAnnotations);
  const windowCountChanged = mergedWithWindows.window_count !== visionWindowCount;

  // Entry door: asserted standard HEIGHT (2.1m), data-driven-or-unresolved WIDTH. Capture
  // the VISION entry-door width BEFORE the override for F-022. Does NOT recompute ext-wall.
  const visionEntranceWidthMm =
    mergedWithWindows.windows_by_room?.entrance?.width_m != null
      ? Math.round(mergedWithWindows.windows_by_room.entrance.width_m * 1000)
      : null;
  mergedWithWindows = preferVectorEntrance(mergedWithWindows, vectorAnnotations);
  const entranceNote = entranceAssumptionNote(vectorAnnotations);
  if (entranceNote) {
    mergedWithWindows = {
      ...mergedWithWindows,
      notes: [mergedWithWindows.notes, entranceNote].filter(Boolean).join(" "),
    };
  }

  const safeguardNote = headDatumSafeguardNote(scheduleSafeguard);
  if (safeguardNote) {
    mergedWithWindows = {
      ...mergedWithWindows,
      notes: [mergedWithWindows.notes, safeguardNote].filter(Boolean).join(" "),
    };
  }

  // F-022 — vector ↔ vision cross-check. Adds the missing SIGNAL by flagging any field
  // where the two paths materially disagreed. No value changes here.
  const reconciliation = reconcileVectorVision(
    visionGarageSize,
    visionWindowCount,
    vectorAnnotations,
    visionEntranceWidthMm,
  );
  if (reconciliation.note) {
    mergedWithWindows = {
      ...mergedWithWindows,
      notes: [mergedWithWindows.notes, reconciliation.note].filter(Boolean).join(" "),
    };
  }

  // ── enrichment: wrap the final bare values in per-field provenance ───────────────
  const t = mergedWithWindows;
  // Stage 2a — re-derive the flat opening list from the FINAL composed window set
  // (post vector + aggregate), so the persisted/exported openings reflect the same
  // window set the QS fields do. Additive passthrough — not yet written to any cell.
  const baseOpenings = deriveOpenings({
    windowsSchedule: t.windows_schedule ?? null,
    windowsByRoom: t.windows_by_room,
    garageDoorSize: t.garage_door_size,
  });
  // Route 2 — fold in the label-anchored single-width openings (no-schedule path only).
  // A no-op when the engine returns no symbol_openings (schedule/datum jobs) → those takeoffs
  // are unchanged. Reconciles the sectional callout against the garage door size.
  const folded = foldSymbolOpenings(
    baseOpenings,
    vectorAnnotations?.symbol_openings,
    t.garage_door_size,
    vectorAnnotations?.entrance,
  );
  const composedOpenings = folded.openings;
  const composedGarageDoorSize = folded.garage_door_size;
  const composedOpeningTotals = deriveOpeningTotals(composedOpenings);
  const reconFlag = (field: string): string | null =>
    reconciliation.fields.find((f) => f.field === field)?.flag ?? null;
  const reconStatusOf = (field: string): FieldReconciliation["status"] | undefined =>
    reconciliation.fields.find((f) => f.field === field)?.status;
  const flagsFor = (...xs: (string | null | undefined)[]): string[] =>
    xs.filter((x): x is string => typeof x === "string" && x.length > 0);

  // Sources inferred from the provenance the seam already tracks (which path SET the value).
  const measuredSrc = (present: boolean): FieldSource => (present ? "geometry" : "vision");
  const windowCountSrc: FieldSource = windowCountChanged
    ? "vector"
    : windowAggregate.source === "schedule"
      ? "schedule"
      : "vision";
  const windowsBySrc: FieldSource = windowAggregate.source === "schedule" ? "schedule" : "vision";

  const enriched: EnrichedTakeoff = {
    floor_area_m2: fv(
      t.floor_area_m2,
      measuredSrc(m?.floor_area_m2 != null),
      normConf(geoResult?.confidence?.floor_area),
      flagsFor(pageFlag),
    ),
    garage_area_m2: fv(t.garage_area_m2, measuredSrc(m?.garage_area_m2 != null)),
    alfresco_area_m2: fv(t.alfresco_area_m2, measuredSrc(m?.alfresco_area_m2 != null)),
    external_wall_lm: fv(
      t.external_wall_lm,
      measuredSrc(m?.perimeter_m != null),
      normConf(geoResult?.confidence?.perimeter),
    ),
    internal_wall_lm: fv(
      t.internal_wall_lm,
      measuredSrc(m?.internal_wall_length_m != null),
      normConf(m?.internal_wall_confidence),
      roomFlags,
    ),
    roof_area_m2: fv(t.roof_area_m2, "vision"),
    window_count: fv(
      t.window_count,
      windowCountSrc,
      reconConf(reconStatusOf("window_count")),
      flagsFor(reconFlag("window_count")),
    ),
    external_door_count: fv(t.external_door_count, "vision"),
    internal_door_count: fv(t.internal_door_count, "vision"),
    bathroom_count: fv(t.bathroom_count, "vision"),
    ensuite_count: fv(t.ensuite_count, "vision"),
    laundry_count: fv(t.laundry_count, "vision"),
    kitchen_count: fv(t.kitchen_count, "vision"),
    ceiling_height_m: fv(t.ceiling_height_m, measuredSrc(m?.stud_height_mm != null)),
    foundation_type: fv(t.foundation_type, "vision"),
    windows_by_room: fv(
      t.windows_by_room,
      windowsBySrc,
      null,
      flagsFor(entranceNote, safeguardNote, reconFlag("entrance_door_width")),
    ),
    windows_schedule: fv(t.windows_schedule ?? null, schedule ? "schedule" : "vision"),
    door_breakdown: fv(t.door_breakdown, "vision"),
    garage_door_size: fv(
      // Route 2 — the sectional callout reconciles the garage size (e.g. fixes a garbled vision
      // read); composedGarageDoorSize == t.garage_door_size when no sectional callout applied.
      composedGarageDoorSize,
      composedGarageDoorSize !== t.garage_door_size ? "vector" : garageChanged ? "vector" : "vision",
      reconConf(reconStatusOf("garage_door_width")),
      flagsFor(reconFlag("garage_door_width")),
    ),
    external_wall_area_m2: fv(t.external_wall_area_m2, "derived", null, extWallFlags),
    total_area_m2: fv(t.total_area_m2, "derived"),
    // Global, backward-compatible view: identical to the bare TakeoffData.notes string.
    notes: t.notes,
    // Stage 2a — flat opening list + glazed-split totals (additive passthrough).
    openings: composedOpenings,
    total_opening_sqm: composedOpeningTotals.total_opening_sqm,
    glazed_sqm: composedOpeningTotals.glazed_sqm,
  };

  return { enriched, reconciliation, pageReconcile, scheduleSafeguard };
}
