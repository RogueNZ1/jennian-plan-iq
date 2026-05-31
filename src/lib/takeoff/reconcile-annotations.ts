/**
 * F-022 — vector ↔ vision cross-check (reconciliation slice).
 *
 * Slices 1+2 made the garage width, opening widths and window count deterministic from
 * the PDF vector layer, preferring the vector value with a vision fallback. But where
 * BOTH a vector and a vision value exist for the same quantity, the app preferred vector
 * SILENTLY — it never surfaced that the two paths disagreed. The canonical case is live
 * in our fixtures: Harrison's garage read 2710 from vision and 4800 from vector. We got
 * the right answer (vector), but a reviewer was never told vision was badly wrong — next
 * time the silent disagreement could go the other way.
 *
 * This module turns path disagreement into a CONFIDENCE SIGNAL. It does NOT change which
 * value is used (vector still wins, deterministically); it adds a flag, on the same
 * channel as the Slice 2 ext-wall note (takeoff.notes), pointing a live reviewer at
 * exactly the fields where the two paths materially diverged.
 *
 * Design rules (mirror the build brief):
 *   - Reconciles EXISTING cross-checkable values only — it adds no new extraction.
 *   - Cross-checks the scalar quantities where BOTH paths measure the SAME thing:
 *     the garage door WIDTH (the canonical flake — and itself the widest opening width)
 *     and the window COUNT. Per-opening width reconciliation needs opening-level
 *     correspondence across the two paths (the vision schedule lists windows only; the
 *     vector openings include the garage door) which we do not have, so a blanket width
 *     multiset compare would false-positive on a windows-only schedule — it is a
 *     documented follow-on. The garage door width IS an opening width, so the canonical
 *     width agreement / disagreement is still cross-checked here.
 *   - No per-job literals. The "material" threshold is PROPORTIONAL (a relative
 *     difference), never a hard mm/count literal: a rounding-level diff (2.21 vs 2.2,
 *     or a ±1 count on ~15 windows) stays under it; a gross path divergence (2710 vs
 *     4800) trips it. Field-agnostic — the same scalar comparator serves every field.
 *   - Backward-compatible: when the vector layer is absent/unusable, or a vision value
 *     is missing, the field is "uncheckable" and never flagged → today's behaviour.
 */
import type { VectorAnnotations } from "./geometry-api";
import { parseDimsMm } from "./classify";

/**
 * The PROPORTIONAL material-disagreement threshold: two values for the same field
 * disagree materially when their relative difference exceeds this. Chosen structurally,
 * not from any fixture value — it must (a) absorb rounding/quantisation noise (2210 vs
 * 2200 = 0.5%, a ±1 count on ~15 windows = 6.7%) so honest agreement is never flagged,
 * yet (b) trip on a genuine path divergence (a vision garage flake 2710 vs vector 4800 =
 * 44%). 10% sits cleanly between those regimes. Relative, so it scales with the value —
 * no hard-coded mm or count band.
 */
export const MATERIAL_REL_TOLERANCE = 0.1;

export type ReconStatus = "agree" | "disagree" | "uncheckable";

export interface FieldReconciliation {
  /** The cross-checked field, e.g. "garage_door_width" | "window_count". */
  field: string;
  /** The vision-path value (mm or count), or null when vision had none. */
  visionValue: number | null;
  /** The deterministic vector-path value, or null when the layer carried none. */
  vectorValue: number | null;
  /** Relative difference |a−b| / max(|a|,|b|), or null when uncheckable. */
  relDiff: number | null;
  status: ReconStatus;
  /** A reviewer-facing note when status is "disagree"; null otherwise. */
  flag: string | null;
}

export interface ReconciliationReport {
  /** One entry per cross-checkable field (checkable or not), for the scorecard. */
  fields: FieldReconciliation[];
  /** The disagreement flags only (status === "disagree"). */
  flags: string[];
  /** The flags joined for appending to takeoff.notes; "" when nothing disagreed. */
  note: string;
}

/** Relative difference of two numbers; 0 when both are 0. */
function relativeDifference(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  return denom === 0 ? 0 : Math.abs(a - b) / denom;
}

/**
 * Pure scalar cross-check for one field. Prefers nothing and changes no value — it only
 * CLASSIFIES the vision and vector readings as agree / disagree / uncheckable and, on a
 * material disagreement, returns a reviewer-facing flag. `unit` is appended to the values
 * in the flag text (e.g. "mm", " windows").
 */
export function reconcileScalar(
  field: string,
  visionValue: number | null | undefined,
  vectorValue: number | null | undefined,
  unit: string,
): FieldReconciliation {
  if (visionValue == null || vectorValue == null) {
    return {
      field,
      visionValue: visionValue ?? null,
      vectorValue: vectorValue ?? null,
      relDiff: null,
      status: "uncheckable",
      flag: null,
    };
  }
  const rel = relativeDifference(visionValue, vectorValue);
  if (rel <= MATERIAL_REL_TOLERANCE) {
    return { field, visionValue, vectorValue, relDiff: rel, status: "agree", flag: null };
  }
  const pct = Math.round(rel * 100);
  const flag =
    `reconciliation: ${field} disagreed across paths — vision read ${visionValue}${unit}, ` +
    `the deterministic vector layer read ${vectorValue}${unit} (${pct}% apart). The vector ` +
    `value was preferred; confirm ${field.replace(/_/g, " ")} against the plan.`;
  return { field, visionValue, vectorValue, relDiff: rel, status: "disagree", flag };
}

/**
 * The vision garage door WIDTH (mm) implied by a garage-size value. Accepts either the
 * canonical "W×2.1" label or a raw annotation ("2,710", "4800x2210") and routes it
 * through the shared parseDimsMm — the garage width is the larger side. Returns null when
 * the string carries no dimension (vision found no garage).
 */
export function garageWidthMm(garageSize: string | null | undefined): number | null {
  if (!garageSize) return null;
  const dims = parseDimsMm(garageSize);
  if (dims.length === 0) return null;
  return Math.max(...dims);
}

/** The deterministic vector window count: a schedule's W-codes win, else the openings'. */
function vectorWindowCount(vector: VectorAnnotations): number | null {
  const sched = vector.schedule?.window_count;
  if (typeof sched === "number" && sched > 0) return sched;
  const op = vector.openings?.window_count;
  if (typeof op === "number" && op > 0) return op;
  return null;
}

/**
 * Cross-check every field for which BOTH a vector and a vision value exist, preferring
 * nothing (the prefer-vector seam already chose the value) and surfacing a flag wherever
 * the two paths materially disagree.
 *
 * Inputs are the VISION-path readings captured BEFORE the prefer-vector overrides:
 *   - `visionGarageSize` — the vision garage size on the takeoff before preferVectorGarage.
 *   - `visionWindowCount` — the window count on the takeoff before preferVectorOpenings.
 *   - `visionEntranceWidthMm` — the vision entry-door width (mm) before preferVectorEntrance,
 *     when vision read one. Optional; cross-checked only when the vector layer carries an
 *     asserted entrance. In our fixtures vision produces no entry door, so this is normally
 *     uncheckable (never flagged) — but where a job DOES read one, the asserted/printed
 *     vector width is cross-checked against it (e.g. a printed frame-to-frame 1430).
 *
 * Returns a report whose `note` is appended to takeoff.notes so the disagreement reaches
 * the live reviewer (not just the baseline doc). Empty/clean when the vector layer is
 * absent or every checkable field agrees.
 */
export function reconcileVectorVision(
  visionGarageSize: string | null | undefined,
  visionWindowCount: number | null | undefined,
  vector: VectorAnnotations | null | undefined,
  visionEntranceWidthMm?: number | null | undefined,
): ReconciliationReport {
  const fields: FieldReconciliation[] = [];

  if (vector?.vector_usable) {
    fields.push(
      reconcileScalar(
        "garage_door_width",
        garageWidthMm(visionGarageSize),
        vector.garage?.width_mm ?? null,
        "mm",
      ),
    );
    fields.push(
      reconcileScalar(
        "window_count",
        visionWindowCount ?? null,
        vectorWindowCount(vector),
        " windows",
      ),
    );
    // Entry door width: only when the vector layer asserted an entrance. Single-source
    // in our fixtures (vision reads no entry door) → uncheckable, never a false flag.
    if (vector.entrance) {
      fields.push(
        reconcileScalar(
          "entrance_door_width",
          visionEntranceWidthMm ?? null,
          vector.entrance.width_mm,
          "mm",
        ),
      );
    }
  }

  const flags = fields
    .map((f) => f.flag)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  return { fields, flags, note: flags.join(" ") };
}
