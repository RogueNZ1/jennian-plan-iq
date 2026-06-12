/**
 * Phase 2b — window reconciliation.
 *
 * Two window sources exist on a developed plan set:
 *  - the floor-plan callouts (windows_by_room from Pass 2) — partial, often split
 *    across pages, no canonical IDs;
 *  - the Door & Window Schedule (W01…Wnn with exact H × W) — authoritative.
 *
 * Rule: when a schedule is present it is the canonical source for the window *set*
 * (count + dimensions). The floor-plan callouts are not added on top — that would
 * double-count windows the schedule already lists. When there is no schedule, fall
 * back to the floor-plan callout count (the pre-2b behaviour).
 *
 * Per-room assignment (linking each W-entry back to its room) is explicitly OUT of
 * scope for 2b and noted as a follow-on.
 */
import type { TakeoffData, WindowsByRoom, ScheduleWindowEntry } from "./takeoff-types";
import type { ScheduleWindow, WindowScheduleData } from "./extract-window-schedule";
import {
  computeOpeningAreaM2,
  computeExternalWallAreaM2,
  deriveOpenings,
  deriveOpeningTotals,
} from "./derive-fields";
import { round2 } from "./utils";

export interface WindowAggregate {
  /** Canonical window count: schedule length when a schedule exists, else callout sum. */
  window_count: number | null;
  /** The canonical window list from the schedule, or null when no schedule was read. */
  windows_schedule: ScheduleWindow[] | null;
  /** Where the count came from — for transparency in the scorecard / notes. */
  source: "schedule" | "floor_plan_callouts" | "none";
}

function calloutCount(windowsByRoom: WindowsByRoom | null | undefined): number | null {
  if (!windowsByRoom) return null;
  const sum = Object.values(windowsByRoom).reduce((acc, w) => acc + (w?.qty ?? 0), 0);
  return sum > 0 ? sum : null;
}

/**
 * Reconcile the schedule against the floor-plan callouts. Schedule wins.
 */
export function aggregateWindows(
  schedule: WindowScheduleData | null | undefined,
  windowsByRoom: WindowsByRoom | null | undefined,
): WindowAggregate {
  const scheduleWindows = schedule?.windows ?? [];
  if (scheduleWindows.length > 0) {
    return {
      window_count: scheduleWindows.length,
      windows_schedule: scheduleWindows,
      source: "schedule",
    };
  }

  const fallback = calloutCount(windowsByRoom);
  return {
    window_count: fallback,
    windows_schedule: null,
    source: fallback !== null ? "floor_plan_callouts" : "none",
  };
}

const mmToM = (mm: number | null): number | null => (mm !== null ? round2(mm / 1000) : null);

/**
 * Phase 2f / Fix B seam: collect dimensioned external-door openings to feed the
 * opening sum on the schedule path. A windows-only Door & Window Schedule does not
 * list external doors with sizes, and IQ does not yet extract them elsewhere as
 * dimensioned openings, so this returns [] today — the entrance/external doors are a
 * documented follow-on sub-task. When a future pass attaches dimensioned external
 * doors to the takeoff, return them here and the opening sum picks them up
 * automatically. Never fabricates a size.
 */
function collectScheduleExternalDoors(
  _takeoff: TakeoffData,
): Array<{ height_m: number | null; width_m: number | null }> {
  return [];
}

/**
 * Apply a window aggregate onto a TakeoffData. When a schedule was read it sets the
 * canonical window_count and attaches the schedule list (converted mm → m); the
 * floor-plan windows_by_room is left intact for room context. Pure — returns a new
 * object, used by both the upload flow and the baseline harness.
 */
export function applyWindowAggregate(takeoff: TakeoffData, agg: WindowAggregate): TakeoffData {
  if (agg.source !== "schedule" || !agg.windows_schedule) {
    // No schedule — keep the floor-plan-derived count already on the takeoff.
    return takeoff;
  }
  const windows_schedule: ScheduleWindowEntry[] = agg.windows_schedule.map((w) => ({
    id: w.id,
    height_m: mmToM(w.heightMm),
    width_m: mmToM(w.widthMm),
  }));

  // Re-derive the external wall area (Phase 2d) now that the canonical schedule
  // window set is known — the floor-plan callouts classifyAnnotations saw were
  // partial/empty on a scheduled job. Stud = the takeoff's ceiling_height_m (2.4),
  // perimeter = external_wall_lm; both already on the takeoff.
  //
  // Phase 2f / Fix B: external doors (entrance etc.) belong in the opening sum, but a
  // windows-only Door & Window Schedule does not list them with dimensions. We pass
  // whatever dimensioned external-door openings are reliably available (none yet on the
  // schedule path) — never fabricated — and confidence-flag the omission below so the
  // derived ext-wall area is a known slight overshoot rather than a tuned figure.
  const externalDoors = collectScheduleExternalDoors(takeoff);
  const opening_area_m2 = computeOpeningAreaM2({
    windowsSchedule: windows_schedule,
    garageDoorSize: takeoff.garage_door_size,
    externalDoors,
  });
  const external_wall_area_m2 = computeExternalWallAreaM2(
    takeoff.external_wall_lm,
    takeoff.ceiling_height_m,
    opening_area_m2,
  );

  const EXT_DOOR_FLAG =
    "external-door openings (entrance etc.) are not extracted from the windows-only schedule and are excluded from the opening sum — external_wall_area_m2 is a slight overshoot; confirm external doors against the QS.";
  // Phase 4, Slice 2 — the ext-wall confidence flag must ride on the FIELD itself in
  // real output (not only in the baseline doc): whenever a glazed window height is
  // unresolved (rejected by the head-datum safeguard, or simply not read) that window
  // is dropped from the opening sum, so external_wall_area_m2 is incomplete — an
  // overshoot — until the heights land. Flag it deterministically so a reviewer never
  // sees a clean-looking number while heights are still unknown.
  const HEIGHTS_INCOMPLETE_FLAG =
    "one or more glazed window heights are unresolved (rejected as head-datum mis-reads or not read) and are excluded from the opening sum — external_wall_area_m2 is incomplete (an overshoot) and remains gated until the glazed pane heights are resolved.";
  const heightsUnresolved = windows_schedule.some((w) => w.height_m == null && w.width_m != null);

  const notes = [
    takeoff.notes,
    externalDoors.length === 0 ? EXT_DOOR_FLAG : "",
    heightsUnresolved ? HEIGHTS_INCOMPLETE_FLAG : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Stage 1 — re-derive the flat opening list from the canonical schedule set (the
  // floor-plan callouts classifyAnnotations saw were partial on a scheduled job),
  // mirroring the ext-wall re-derivation above. Same source preference as
  // computeOpeningAreaM2 → total_opening_sqm tracks opening_area_m2.
  const openings = deriveOpenings({
    windowsSchedule: windows_schedule,
    garageDoorSize: takeoff.garage_door_size,
  });
  const openingTotals = deriveOpeningTotals(openings);

  return {
    ...takeoff,
    window_count: agg.window_count,
    windows_schedule,
    external_wall_area_m2,
    notes,
    openings,
    total_opening_sqm: openingTotals.total_opening_sqm,
    glazed_sqm: openingTotals.glazed_sqm,
  };
}
