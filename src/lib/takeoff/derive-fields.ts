/**
 * Phase 2d — derived QS fields.
 *
 * Two QS fields are pure arithmetic on values IQ already extracts. The formulas are
 * validated by hand against BOTH ground-truth jobs:
 *   - External wall area (QS D21) = perimeter × stud_height − total_opening_area
 *       Beddis  63.8 × 2.4 − 43.92 = 109.2
 *       Harrison 60.4 × 2.4 − 46.89 = 98.07
 *   - Total area (QS D14) = floor_area + alfresco_area
 *       Beddis  165.4 + 1.7 = 167.1
 *       Harrison 170.79 + 1.2 = 171.99
 *
 * These helpers are pure and literal-free — no per-job constants. They are only as
 * accurate as the openings/areas feeding them (documented per call site).
 */
import type { WindowsByRoom, ScheduleWindowEntry } from "./takeoff-types";
import { classifyGarageDoorAnnotation } from "./classify";
import { round2 } from "./utils";

/**
 * Total area of EVERY extracted opening, in m².
 *
 * Windows: the Door & Window Schedule list is the canonical source when present
 * (Σ height × width); otherwise the floor-plan callouts (Σ qty × height × width).
 * Garage door: recovered from the classified size label/annotation.
 *
 * NOTE on completeness: the QS opening total also folds in the entrance + any other
 * external doors. IQ does not yet extract those as dimensioned openings, so they are
 * NOT included here — this field inherits whatever the opening extraction omits (or
 * over-reads). That is expected: the derived ext-wall area is only as good as the
 * openings feeding it.
 *
 * Returns null when there are no openings to sum at all.
 */
export function computeOpeningAreaM2(args: {
  windowsSchedule?: ScheduleWindowEntry[] | null;
  windowsByRoom?: WindowsByRoom | null;
  garageDoorSize?: string | null;
}): number | null {
  let total = 0;
  let counted = false;

  const sched = args.windowsSchedule;
  if (sched && sched.length > 0) {
    for (const w of sched) {
      if (w.height_m != null && w.width_m != null) {
        total += w.height_m * w.width_m;
        counted = true;
      }
    }
  } else if (args.windowsByRoom) {
    for (const w of Object.values(args.windowsByRoom)) {
      if (w && w.height_m > 0 && w.width_m > 0) {
        total += w.qty * w.height_m * w.width_m;
        counted = true;
      }
    }
  }

  // Garage door: parse the size label ("4.8×2.1") or raw annotation back to mm and
  // add its area. classifyGarageDoorAnnotation returns null for an unclassified raw
  // value (e.g. a non-standard width left for manual review) → not added.
  if (args.garageDoorSize) {
    const gd = classifyGarageDoorAnnotation(args.garageDoorSize);
    if (gd) {
      total += (gd.widthMm / 1000) * (gd.heightMm / 1000);
      counted = true;
    }
  }

  return counted ? round2(total) : null;
}

/**
 * External wall AREA (m², QS D21) = perimeter × stud_height − opening area.
 *
 * `studHeightM` must be the value IQ reports for the takeoff (e.g. 2.4), NOT a raw
 * OCR read (2.42) — the QS uses the rounded stud and 2.42 overshoots. Gable ends are
 * excluded by construction: perimeter × stud is the rectangular wall area with no
 * gable triangles, which matches the QS definition ("openings removed, excl. gables").
 *
 * Returns null if perimeter or stud is missing. A missing opening area is treated as
 * 0 (gross wall area), so the field still lands rather than nulling.
 */
export function computeExternalWallAreaM2(
  perimeterM: number | null | undefined,
  studHeightM: number | null | undefined,
  openingAreaM2: number | null | undefined,
): number | null {
  if (perimeterM == null || studHeightM == null) return null;
  return round2(perimeterM * studHeightM - (openingAreaM2 ?? 0));
}

/**
 * Total area (m², QS D14) = floor_area + alfresco_area.
 * Alfresco is treated as 0 when not read (so the field still lands on the floor area).
 * Returns null only when floor area is missing.
 */
export function computeTotalAreaM2(
  floorAreaM2: number | null | undefined,
  alfrescoAreaM2: number | null | undefined,
): number | null {
  if (floorAreaM2 == null) return null;
  return round2(floorAreaM2 + (alfrescoAreaM2 ?? 0));
}
