/**
 * Phase 4, Slice 1 — vector-first seam (TWO proven fields only).
 *
 * The geometry engine now reads two deterministic facts straight from the PDF's text
 * layer (no render/OCR/model) and returns them as `vector_annotations` on the /measure
 * response (see geometry-api.ts → VectorAnnotations). This module is the single place
 * the app *consumes* them, preferring the vector read over the vision read for exactly
 * two fields and falling back to vision when the vector layer is absent or unusable:
 *
 *   1. GARAGE door width — prefer the dimension-pair the engine found nearest a
 *      /garage/i label over the vision-extracted garage annotation. Vision flaked
 *      Harrison's "4.8 × 2.1" to a 2710 single garage; the vector read is exact.
 *
 *   2. SCHEDULE head-datum SAFEGUARD — the engine reports the schedule's shared
 *      head/mounting datum (a tall value repeated across every window column). It is
 *      NOT any window's glazed-pane height. If a schedule window's height was read AS
 *      that datum (the Phase-2f over-read), we REJECT that height (null it) and flag
 *      it — a deterministic anti-2f guard. We never fabricate a replacement height.
 *
 * Design rules (mirror the build brief):
 *   - Backward-compatible: when `vector` is undefined, not usable, or carries no
 *     garage/schedule, every function returns its input unchanged → today's behaviour.
 *   - No per-job literals. The garage label/width and the datum value all come from
 *     the engine, found structurally (label proximity / repetition). Tolerances here
 *     are structural mm bands, not fixture values.
 *   - Dimension parsing routes through the shared tolerant reader
 *     (classifyGarageDoorAnnotation → parseDimsMm), never a new regex.
 */
import type { TakeoffData } from "./takeoff-types";
import type { VectorAnnotations } from "./geometry-api";
import type { WindowScheduleData, ScheduleWindow } from "./extract-window-schedule";
import { classifyGarageDoorAnnotation } from "./classify";
import { computeOpeningAreaM2, computeExternalWallAreaM2 } from "./derive-fields";

/**
 * How close (mm) a schedule window's read height must sit to the engine's head datum
 * before we treat it as the datum mis-read AS a glazed height and reject it. Tight on
 * purpose: the head datum is a tall, distinct value (a window's own pane height is
 * meaningfully shorter), so a small band catches a datum read (2210, 2200) without
 * eating a legitimately tall slider that merely approaches it. Structural, not a value.
 */
const HEAD_DATUM_TOLERANCE_MM = 50;

export type GarageSource = "vector" | "vision";

export interface GarageResolution {
  /** The canonical QS size label (e.g. "4.8×2.1"), or the unchanged vision value. */
  garage_door_size: string | null;
  /** Which layer the value came from — for transparency / the scorecard. */
  source: GarageSource;
  /** True when the vector read was preferred over the vision read. */
  preferred_vector: boolean;
}

/**
 * Resolve the garage door size, preferring the deterministic vector read when the
 * floor-plan page has a usable text layer and the engine found a garage pair that
 * classifies as a real QS garage door. Otherwise returns the vision value untouched.
 *
 * The vector garage's `raw` string ("2,150 x 4,800") is fed through the SAME
 * classifier the vision path uses (classifyGarageDoorAnnotation → parseDimsMm), so the
 * band gate (width 2.4–5.4m, height 2.0–2.4m) and the standard-width snap are
 * identical. A vector pair that is not a garage door (e.g. a 2649×1400 read, or a
 * 6120×5950 room footprint) classifies to null → we keep the vision value.
 */
export function resolveGarageDoorSize(
  visionSize: string | null,
  vector: VectorAnnotations | undefined | null,
): GarageResolution {
  if (vector?.vector_usable && vector.garage) {
    const gd = classifyGarageDoorAnnotation(vector.garage.raw);
    if (gd) {
      return { garage_door_size: gd.label, source: "vector", preferred_vector: true };
    }
  }
  return { garage_door_size: visionSize, source: "vision", preferred_vector: false };
}

/**
 * Apply the garage resolution onto a takeoff. When the vector read is preferred AND it
 * changes the size value, the opening area and external wall area (QS D21) are
 * re-derived so they stay consistent with the new garage — exactly as
 * classifyAnnotations derives them from the vision garage. Pure: returns a new object.
 *
 * Note: when the resolved value equals what is already on the takeoff (the common
 * case on the fixtures, where vision and vector agree on 4.8×2.1), nothing is
 * recomputed — only the value's provenance changes, which callers may record separately.
 */
export function preferVectorGarage(
  takeoff: TakeoffData,
  vector: VectorAnnotations | undefined | null,
): TakeoffData {
  const res = resolveGarageDoorSize(takeoff.garage_door_size, vector);
  if (!res.preferred_vector || res.garage_door_size === takeoff.garage_door_size) {
    return takeoff;
  }
  // The garage size changed — re-derive the opening-dependent fields. Use whichever
  // window source the takeoff already carries (schedule list if present, else the
  // floor-plan callouts) so the recompute matches the current pipeline stage.
  const opening_area_m2 = computeOpeningAreaM2({
    windowsSchedule: takeoff.windows_schedule ?? null,
    windowsByRoom: takeoff.windows_by_room ?? null,
    garageDoorSize: res.garage_door_size,
  });
  const external_wall_area_m2 = computeExternalWallAreaM2(
    takeoff.external_wall_lm,
    takeoff.ceiling_height_m,
    opening_area_m2,
  );
  return { ...takeoff, garage_door_size: res.garage_door_size, external_wall_area_m2 };
}

export interface ScheduleSafeguardResult {
  /** The schedule with any datum-mis-read heights rejected (nulled). */
  schedule: WindowScheduleData | null;
  /** IDs whose height was rejected because it matched the head datum. */
  flaggedIds: string[];
  /** The head datum (mm) used for the check, when one was available. */
  headDatumMm: number | null;
}

/**
 * Head-datum SAFEGUARD: given the engine's detected schedule head datum, null out any
 * schedule window whose read height equals that datum (within a tight mm band). This
 * catches the Phase-2f over-read where a window's glazed height is mistakenly read as
 * the floor-to-head mounting datum (e.g. 2210). The width is left intact; only the
 * suspect height is rejected. We never substitute a fabricated height — a nulled
 * height simply means "unknown", which is honest and keeps the opening sum from
 * over-shooting on a wrong tall value.
 *
 * Backward-compatible: returns the schedule unchanged when there is no usable vector
 * layer, no detected schedule datum, or no window matches it.
 */
export function safeguardScheduleHeights(
  schedule: WindowScheduleData | null | undefined,
  vector: VectorAnnotations | undefined | null,
): ScheduleSafeguardResult {
  const headDatumMm =
    vector?.vector_usable && vector.schedule ? vector.schedule.head_datum_mm : null;

  if (!schedule || schedule.windows.length === 0 || headDatumMm == null) {
    return { schedule: schedule ?? null, flaggedIds: [], headDatumMm };
  }

  const flaggedIds: string[] = [];
  const windows: ScheduleWindow[] = schedule.windows.map((w) => {
    if (w.heightMm != null && Math.abs(w.heightMm - headDatumMm) <= HEAD_DATUM_TOLERANCE_MM) {
      flaggedIds.push(w.id);
      return { ...w, heightMm: null };
    }
    return w;
  });

  return { schedule: { ...schedule, windows }, flaggedIds, headDatumMm };
}

/**
 * Human-readable note for a fired safeguard, for appending to takeoff.notes. Returns
 * an empty string when nothing was flagged so callers can `.filter(Boolean)` it away.
 */
export function headDatumSafeguardNote(res: ScheduleSafeguardResult): string {
  if (res.flaggedIds.length === 0 || res.headDatumMm == null) return "";
  return (
    `window height safeguard: ${res.flaggedIds.length} schedule window(s) ` +
    `(${res.flaggedIds.join(", ")}) read a height matching the schedule head/mounting ` +
    `datum (${res.headDatumMm}mm) and were rejected as mis-reads — confirm the glazed ` +
    `pane heights against the schedule.`
  );
}
