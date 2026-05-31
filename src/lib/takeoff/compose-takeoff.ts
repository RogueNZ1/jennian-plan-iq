/**
 * composeTakeoff — the shared, PURE plan-to-takeoff seam (Convergence Slice 1).
 *
 * This is the single implementation of "given the (already-fetched) vision takeoff +
 * geometry + window schedule, produce the reconciled TakeoffData". It was extracted
 * VERBATIM from the interactive `/upload` flow (Pipeline B) so that the production path
 * (`run.ts`, Pipeline A) can call the exact same logic — the two paths then differ ONLY
 * in I/O (ephemeral vs persisted), and the divergence the audit found becomes structurally
 * impossible to recur. See CONVERGENCE_DESIGN.md.
 *
 * PURITY CONTRACT (the whole point of this boundary):
 *   - Inputs → output, nothing else. NO model/vision call, NO geometry fetch, NO network,
 *     NO clock, NO `Math.random`, NO Supabase/IO, NO React state, NO `toast`.
 *   - Every impure dependency (the AI passes, the geometry measurement, the schedule read)
 *     is performed by the CALLER and handed in as data. The caller also owns all
 *     side-effects (toasts, setState, persistence).
 *   - Therefore: identical inputs ⇒ byte-identical output. This is what lets us pin a
 *     deterministic baseline off the Phase 1 cached vision fixture (downstream of the
 *     non-deterministic model), see tests/convergence/compose-takeoff.baseline.test.ts.
 *
 * Slice 1 is a PURE REFACTOR: this returns the CURRENT bare `TakeoffData` shape with no
 * behaviour change. The `FieldValue` enrichment (value + provenance + confidence +
 * discrepancy_flags) is a later, additive slice.
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
import { reconcileVectorVision, type ReconciliationReport } from "./reconcile-annotations";
import { reconcileGeometryPage, type PageReconciliation } from "./page-of-truth";

export type ComposeTakeoffInput = {
  /** The vision-extracted takeoff (already returned by extractConceptTakeoffs). */
  visionTakeoff: TakeoffData;
  /** The geometry measurement + vector_annotations (already fetched), or null. */
  geometry: GeometryApiResult | null | undefined;
  /** The (already-read) Door & Window Schedule, or null when there is no schedule page. */
  schedule: WindowScheduleData | null | undefined;
  /**
   * The 0-based page index we asked geometry to measure (the AI-classified floor plan),
   * or undefined when no page was pinned and geometry self-selected. Used only to
   * reconcile against `geometry.page_used` — never re-measures.
   */
  geometryPageIndex: number | undefined;
};

export type ComposeTakeoffResult = {
  /** The reconciled takeoff (geometry-preferred measurements, vector-preferred openings,
   *  asserted entrance, all honesty flags folded into `notes`). */
  takeoff: TakeoffData;
  /** The F-022 vector↔vision cross-check report (its note is already in takeoff.notes). */
  reconciliation: ReconciliationReport;
  /** Did geometry measure the page we pinned? Returned so the caller can surface a toast. */
  pageReconcile: PageReconciliation;
  /** The head-datum safeguard result (flagged window ids + detected datum). */
  scheduleSafeguard: ScheduleSafeguardResult;
};

/**
 * Pure compose. Mirrors the `/upload` seam exactly:
 *   geometry overrides → vector garage → schedule head-datum safeguard → window aggregate
 *   → vector openings → asserted entrance → F-022 reconciliation, accumulating honesty
 *   flags into `takeoff.notes`. Ext-wall area is NOT recomputed — it stays gated on the
 *   per-window heights.
 */
export function composeTakeoff(input: ComposeTakeoffInput): ComposeTakeoffResult {
  const { visionTakeoff, geometry, schedule: scheduleRaw, geometryPageIndex } = input;

  const geoResult = geometry ?? null;
  const m = geoResult?.measurements;
  const geoRoomCount = m?.room_count ?? 0;
  const vectorAnnotations = geoResult?.vector_annotations;

  // Cross-reference geometry rooms against AI-extracted room labels for an internal-wall
  // confidence note. (roomLabels is an optional extra the vision pass may attach.)
  const aiRoomLabels = (visionTakeoff as { roomLabels?: string[] }).roomLabels;
  const internalWallNotes: string[] = [];

  // Phase 3 — defence-in-depth: confirm geometry measured the floor-plan page we pinned.
  // The note is generated here (pure); the caller decides whether to toast it.
  const pageReconcile = reconcileGeometryPage(geometryPageIndex, geoResult?.page_used);
  if (!pageReconcile.agreed && pageReconcile.note) {
    internalWallNotes.push(pageReconcile.note);
  }

  if (geoRoomCount > 0 && aiRoomLabels && aiRoomLabels.length > 0) {
    if (geoRoomCount > aiRoomLabels.length) {
      internalWallNotes.push(
        `Geometry found ${geoRoomCount} room dims; AI found ${aiRoomLabels.length} room labels.`,
      );
    }
  } else if (geoRoomCount === 0 && m != null) {
    internalWallNotes.push(
      "Internal wall: not extracted — no room dimension annotations found in plan.",
    );
  }

  // Geometry overrides AI for measurement fields — geometry API is more accurate.
  const merged: TakeoffData = {
    ...visionTakeoff,
    ...(m?.floor_area_m2 != null ? { floor_area_m2: m.floor_area_m2 } : {}),
    ...(m?.perimeter_m != null ? { external_wall_lm: m.perimeter_m } : {}),
    // internal_wall_lm: geometry OCR rooms are the source of truth; null when not found.
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

  // Phase 4, Slice 1 — vector-first garage. Capture the VISION garage size BEFORE the
  // override so F-022 can cross-check the two paths.
  const visionGarageSize = merged.garage_door_size;
  const mergedVec = preferVectorGarage(merged, vectorAnnotations);

  // Phase 4, Slice 1 — head-datum safeguard: reject any schedule window height read AS
  // the shared mounting datum before aggregating. A rejected height becomes null + flag.
  const scheduleSafeguard = safeguardScheduleHeights(scheduleRaw, vectorAnnotations);
  const schedule = scheduleSafeguard.schedule;

  const windowAggregate = aggregateWindows(schedule, mergedVec.windows_by_room);
  let mergedWithWindows = applyWindowAggregate(mergedVec, windowAggregate);

  // Phase 4, Slice 2 — vector-preferred window COUNT (+ firmed widths). Capture the
  // VISION count BEFORE the override.
  const visionWindowCount = mergedWithWindows.window_count;
  mergedWithWindows = preferVectorOpenings(mergedWithWindows, vectorAnnotations);

  // Phase 4, Slice 3 — entry door: asserted standard HEIGHT (2.1m), data-driven WIDTH.
  // Capture the VISION entry-door width (if any) BEFORE the override for F-022. Does NOT
  // recompute ext-wall: it stays gated on the unresolved window heights.
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
  // where the two paths materially disagreed. No value changes here; the flag rides on
  // takeoff.notes — the same channel as the ext-wall note.
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

  return {
    takeoff: mergedWithWindows,
    reconciliation,
    pageReconcile,
    scheduleSafeguard,
  };
}
