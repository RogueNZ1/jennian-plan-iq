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
import { classifyGarageDoorAnnotation, parseDimsMm } from "./classify";
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

// ── Phase 4, Slice 2 — opening WIDTHS + window COUNT (vector-preferred) ─────────
//
// The engine reads two further deterministic facts off the floor-plan vector layer:
// each opening's WIDTH (the non-datum side of a positioned "datum × width" pair) and
// the distinct positioned W-code COUNT. Both are preferred over the vision reads —
// the vector value is the printed number — and fall back to vision when the vector
// layer is absent, not usable, or carries no openings (a scan / older engine).
//
// SCOPE NOTE (heights still gated): this slice firms up width + count determinism so
// the external-wall opening area snaps together cleanly once per-window glazed HEIGHTS
// land (a later slice, gated on a second schedule-bearing ground-truth job). It does
// NOT resolve external_wall_area_m2 — that needs H×W and heights are still unresolved.
// preferVectorOpenings therefore deliberately does not recompute the ext-wall area.

export type CountSource = "vector_schedule" | "vector_openings" | "vision";

export interface WindowCountResolution {
  /** The canonical window count, vector-preferred. */
  window_count: number | null;
  /** Which layer the count came from — for transparency / the scorecard. */
  source: CountSource;
  /** True when a vector count was preferred over the vision count. */
  preferred_vector: boolean;
}

/**
 * Resolve the canonical window count, preferring the deterministic vector read when the
 * floor-plan page has a usable text layer. A Door & Window Schedule's W-code count wins
 * first (it is the authoritative window set); otherwise the floor-plan W-code count
 * (the only vector count available on a no-schedule template such as Harrison). Falls
 * back to the vision count when no usable vector count exists.
 */
export function resolveWindowCount(
  visionCount: number | null | undefined,
  vector: VectorAnnotations | undefined | null,
): WindowCountResolution {
  if (vector?.vector_usable) {
    const sched = vector.schedule?.window_count;
    if (typeof sched === "number" && sched > 0) {
      return { window_count: sched, source: "vector_schedule", preferred_vector: true };
    }
    const op = vector.openings?.window_count;
    if (typeof op === "number" && op > 0) {
      return { window_count: op, source: "vector_openings", preferred_vector: true };
    }
  }
  return { window_count: visionCount ?? null, source: "vision", preferred_vector: false };
}

export type WidthsSource = "vector" | "vision";

export interface OpeningWidthsResolution {
  /** Opening widths in mm, ascending. Vector-preferred when a usable layer carries them. */
  widths_mm: number[];
  source: WidthsSource;
  preferred_vector: boolean;
}

/**
 * The vision opening-width multiset (mm) carried by a takeoff: the schedule widths when
 * a schedule was read, otherwise the floor-plan callout widths (expanded by qty). This
 * is the fallback the vector widths are preferred over.
 */
export function visionOpeningWidthsMm(takeoff: TakeoffData): number[] {
  const out: number[] = [];
  const sched = takeoff.windows_schedule;
  if (sched && sched.length > 0) {
    for (const w of sched) {
      if (w.width_m != null && w.width_m > 0) out.push(Math.round(w.width_m * 1000));
    }
  } else if (takeoff.windows_by_room) {
    for (const w of Object.values(takeoff.windows_by_room)) {
      if (w && w.width_m > 0) {
        const qty = w.qty > 0 ? w.qty : 1;
        for (let i = 0; i < qty; i++) out.push(Math.round(w.width_m * 1000));
      }
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Resolve the opening-width multiset, preferring the vector reads when a usable layer
 * carries them. Each vector width arrives as its raw printed token and is parsed here
 * through the SAME shared dimension reader the vision path uses (parseDimsMm) — no
 * second, divergent parser. Falls back to the supplied vision widths when the vector
 * layer is absent, not usable, or carries no opening widths.
 */
export function resolveOpeningWidths(
  visionWidthsMm: number[],
  vector: VectorAnnotations | undefined | null,
): OpeningWidthsResolution {
  if (vector?.vector_usable && vector.openings && vector.openings.widths_raw.length > 0) {
    const widths_mm = vector.openings.widths_raw
      .map((raw) => parseDimsMm(raw)[0])
      .filter((v): v is number => typeof v === "number" && v > 0)
      .sort((a, b) => a - b);
    if (widths_mm.length > 0) {
      return { widths_mm, source: "vector", preferred_vector: true };
    }
  }
  return { widths_mm: [...visionWidthsMm].sort((a, b) => a - b), source: "vision", preferred_vector: false };
}

/**
 * Apply the vector-preferred window COUNT onto a takeoff. Pure — returns a new object
 * only when the vector count is preferred AND differs from what is already on the
 * takeoff; otherwise the input is returned untouched.
 *
 * Deliberately does NOT recompute external_wall_area_m2: the opening area depends on
 * per-window HEIGHTS, which remain unresolved/flagged this slice, so the ext-wall area
 * stays gated (see SCOPE NOTE above). Only the count — a height-independent fact — is
 * updated here. The widths are resolved separately (resolveOpeningWidths) for the
 * scorecard and to firm up determinism ahead of the heights slice.
 */
export function preferVectorOpenings(
  takeoff: TakeoffData,
  vector: VectorAnnotations | undefined | null,
): TakeoffData {
  const res = resolveWindowCount(takeoff.window_count, vector);
  if (!res.preferred_vector || res.window_count === takeoff.window_count) {
    return takeoff;
  }
  return { ...takeoff, window_count: res.window_count };
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
