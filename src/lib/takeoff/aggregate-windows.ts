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
  return { ...takeoff, window_count: agg.window_count, windows_schedule };
}
