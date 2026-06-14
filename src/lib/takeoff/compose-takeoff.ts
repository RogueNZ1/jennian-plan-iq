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
import { correctWindowsByRoom } from "./plan-text";
import {
  deriveOpenings,
  deriveOpeningTotals,
  foldSymbolOpenings,
  foldScheduleEntrance,
  normaliseOpeningsForQs,
  computeExternalWallAreaM2,
} from "./derive-fields";
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
import type { VisualOpeningAudit } from "./visual-opening-audit";

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
  /** Deterministic door-engine result for the working page; null/absent → no door pass. */
  doorEngine?:
    | (import("../doors/door-engine").DoorEngineResult & {
        pageMeta?: import("../doors/run-doors").DoorPageMeta;
        planText?: import("./plan-text").PlanText;
        wallTrace?: import("./wall-trace").WallTrace;
      })
    | null;
  /** Visual QS external-opening audit; additive evidence, not value-driving yet. */
  visualOpeningAudit?: VisualOpeningAudit | null;
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

type FloorAreaDecision = {
  value: number | null;
  source: FieldSource;
  confidence: FieldConfidence;
  flags: string[];
};

function near(a: number | null | undefined, b: number | null | undefined, tolerance = 0.05) {
  return a != null && b != null && Math.abs(a - b) <= tolerance;
}

function foundationOrDefault(v: string | null | undefined): string {
  const cleaned = typeof v === "string" ? v.trim() : "";
  return cleaned || "TC1";
}

/**
 * Geometry is usually the best area source, but not when its own diagnostics prove the
 * floor-area candidate is contaminated. Harrison exposed the failure mode: OCR labelled
 * the printed perimeter (60.4) as living area, the API returned 60.4 as floor_area_m2,
 * and the old seam blindly overwrote the correct vision/title-block area.
 */
function selectFloorArea(
  visionTakeoff: TakeoffData,
  geoResult: GeometryApiResult | null,
  pageFlag: string | null,
): FloorAreaDecision {
  const geoValue = geoResult?.measurements?.floor_area_m2 ?? null;
  const visionValue = visionTakeoff.floor_area_m2 ?? null;
  const geoConfidence = normConf(geoResult?.confidence?.floor_area);
  const notes = geoResult?.confidence?.notes ?? [];

  if (geoValue == null) {
    return {
      value: visionValue,
      source: "vision",
      confidence: null,
      flags: pageFlag ? [pageFlag] : [],
    };
  }

  const floorMismatchNote = notes.find((n) => /^floor_area_m2:/i.test(n));
  const floorLooksLikePerimeter =
    near(geoValue, geoResult?.measurements?.perimeter_m) ||
    near(geoResult?.ocr_raw?.living_area_m2, geoResult?.measurements?.perimeter_m);
  const materialVisionDisagreement =
    visionValue != null &&
    Math.abs(geoValue - visionValue) > Math.max(2, Math.abs(visionValue) * 0.02);

  const geometryContradicted =
    !!floorMismatchNote ||
    floorLooksLikePerimeter ||
    geoConfidence === "low" ||
    (geoConfidence === "mid" && materialVisionDisagreement);

  if (geometryContradicted && visionValue != null) {
    const reasons = [
      floorMismatchNote,
      floorLooksLikePerimeter
        ? `geometry floor-area candidate ${geoValue} matches/looks like the perimeter`
        : null,
      materialVisionDisagreement
        ? `vision/title-block floor area ${visionValue} differs materially from geometry ${geoValue}`
        : null,
    ].filter((x): x is string => !!x);
    return {
      value: visionValue,
      source: "vision",
      confidence: "mid",
      flags: [
        ...(pageFlag ? [pageFlag] : []),
        `Floor area: rejected geometry candidate ${geoValue}; ${reasons.join("; ")}. Using vision/title-block candidate ${visionValue}.`,
      ],
    };
  }

  return {
    value: geoValue,
    source: "geometry",
    confidence: geoConfidence,
    flags: pageFlag ? [pageFlag] : [],
  };
}

/**
 * Pure compose. Mirrors the `/upload` seam exactly (geometry overrides → vector garage →
 * head-datum safeguard → window aggregate → vector openings → asserted entrance → F-022),
 * then wraps the result in per-field provenance. Ext-wall area is NOT recomputed — it stays
 * gated on the per-window heights.
 */
export function composeTakeoff(input: ComposeTakeoffInput): ComposeTakeoffResult {
  const {
    visionTakeoff,
    geometry,
    schedule: scheduleRaw,
    geometryPageIndex,
    doorEngine,
    visualOpeningAudit,
  } = input;

  const geoResult = geometry ?? null;
  const m = geoResult?.measurements;
  const geoRoomCount = m?.room_count ?? 0;
  const vectorAnnotations = geoResult?.vector_annotations;
  const aiRoomLabels = (visionTakeoff as { roomLabels?: string[] }).roomLabels;

  // ── Plan-text cross-checks (13 Jun 2026 — JM-0032 lessons, all three) ──────────
  const planText = doorEngine?.planText;
  const planGarage = planText?.rooms.find((r) => /^GARAGE\b/i.test(r.name)) ?? null;
  const titleVals = planText
    ? Object.values(planText.titleAreas).filter((v): v is number => v != null)
    : [];
  const visionGarage = (visionTakeoff as { garage_area_m2?: number | null }).garage_area_m2 ?? null;
  // Title-block grab: vision's garage area equals a title-block stat (the 46.7
  // CLADDING AREA grab). Deterministic room footprint wins when present.
  const garageTitleGrab =
    visionGarage != null && titleVals.some((v) => Math.abs(v - visionGarage) <= 0.3);
  const garageDisagrees =
    planGarage != null &&
    visionGarage != null &&
    Math.abs(visionGarage - planGarage.areaM2) / planGarage.areaM2 > 0.25;
  const garageOverride =
    planGarage != null && (garageTitleGrab || garageDisagrees || visionGarage == null);
  const garageFlags: string[] = [];
  if (garageOverride && planGarage) {
    garageFlags.push(
      `reconciliation: garage area taken from the plan's printed room dims (${planGarage.widthMm}×${planGarage.depthMm} = ${planGarage.areaM2} m²)` +
        (visionGarage != null ? ` — vision read ${visionGarage} m²` : "") +
        (garageTitleGrab ? " which equals a TITLE-BLOCK stat (cladding/total area grab)" : "") +
        ".",
    );
  } else if (garageTitleGrab) {
    garageFlags.push(
      "⚑ vision's garage area equals a title-block stat — likely a title-block grab; confirm against the plan.",
    );
  }
  // ── flags, tracked per-field as they are generated ──────────────────────────────
  // Phase 3 — page divergence: geometry measured a different page than we pinned.
  const pageReconcile = reconcileGeometryPage(geometryPageIndex, geoResult?.page_used);
  const pageFlag = !pageReconcile.agreed && pageReconcile.note ? pageReconcile.note : null;
  const floorAreaDecision = selectFloorArea(visionTakeoff, geoResult, pageFlag);

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

  // ── the value seam ──────────────────────────────────────────────────────────────
  // Geometry usually wins for measured fields, but floor area is candidate-selected:
  // geometry cannot override when its own diagnostics show a contaminated area read.
  const floorAreaNotes = floorAreaDecision.flags.filter((f) => f !== pageFlag);
  const merged: TakeoffData = {
    ...visionTakeoff,
    floor_area_m2: floorAreaDecision.value,
    ...(m?.perimeter_m != null ? { external_wall_lm: m.perimeter_m } : {}),
    ...(m?.internal_wall_length_m != null
      ? { internal_wall_lm: m.internal_wall_length_m }
      : { internal_wall_lm: null }),
    ...(m?.garage_area_m2 != null ? { garage_area_m2: m.garage_area_m2 } : {}),
    ...(m?.alfresco_area_m2 != null ? { alfresco_area_m2: m.alfresco_area_m2 } : {}),
    ...(m?.stud_height_mm != null ? { ceiling_height_m: m.stud_height_mm / 1000 } : {}),
    ...(internalWallNotes.length > 0 || floorAreaNotes.length > 0
      ? {
          notes: [visionTakeoff.notes, ...internalWallNotes, ...floorAreaNotes]
            .filter(Boolean)
            .join(" "),
        }
      : {}),
  };

  // Vector-first garage. Capture the VISION garage size BEFORE the override (F-022 + source).
  const visionGarageSize = merged.garage_door_size;
  const mergedVec = preferVectorGarage(merged, vectorAnnotations);
  const garageChanged = mergedVec.garage_door_size !== merged.garage_door_size;

  // Head-datum safeguard before aggregating.
  const scheduleSafeguard = safeguardScheduleHeights(scheduleRaw, vectorAnnotations);
  const schedule = scheduleSafeguard.schedule;

  // Plan-text window auto-correction (13 Jun 2026, "flags aren't fixes"): on a
  // schedule-less job, the printed codes ARE the schedule the job never had --
  // spatially routed to their rooms and corrected INTO windows_by_room before
  // aggregation, so counts, openings, glazing and the QS slots all flow from
  // corrected routing. A real schedule still outranks everything. Every change
  // is logged verbatim onto the field's flags -- fixes are loud, never silent.
  let windowChanges: Array<{ room: string; change: string }> = [];
  let mergedVecW = mergedVec;
  if (!schedule?.windows?.length && planText) {
    const corrected = correctWindowsByRoom(mergedVec.windows_by_room, planText);
    if (corrected.changes.length > 0) {
      windowChanges = corrected.changes;
      mergedVecW = { ...mergedVec, windows_by_room: corrected.windowsByRoom };
    }
  }

  const windowAggregate = aggregateWindows(schedule, mergedVecW.windows_by_room);
  // Post-correction checks (13 Jun 2026): mismatch + bedroom alarms judge the
  // CORRECTED map — a fixed window must never be re-flagged as broken.
  const codeMismatch: string[] = [];
  const correctedWbr = (mergedVecW.windows_by_room ?? {}) as Record<
    string,
    { qty?: number; height_m?: number; width_m?: number }
  >;
  const codes = planText?.windowCodes ?? [];
  if (codes.length > 0) {
    for (const [room, w] of Object.entries(correctedWbr)) {
      if (w?.height_m == null || w?.width_m == null) continue;
      const h = Math.round(w.height_m * 1000),
        wd = Math.round(w.width_m * 1000);
      if (!codes.some((c) => c.heightMm === h && c.widthMm === wd))
        codeMismatch.push(
          `⚑ ${room} window ${w.height_m}×${w.width_m} matches NO printed joinery code on the plan — verify dims.`,
        );
    }
  }
  const bedNoWindow: string[] = [];
  if (planText) {
    const bedCanon = (raw: string): string | null => {
      const n = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (n.includes("MASTER")) return "BED1";
      const m = n.match(/BED(?:ROOM)?(\d)/);
      return m ? `BED${m[1]}` : null;
    };
    const wbrBeds = Object.keys(correctedWbr)
      .map(bedCanon)
      .filter((k): k is string => k != null);
    for (const r of planText.rooms) {
      const canon = bedCanon(r.name);
      if (!canon) continue;
      if (!wbrBeds.includes(canon))
        bedNoWindow.push(
          `⚑ ${r.name} is printed on the plan (${r.widthMm}×${r.depthMm}) but has NO routed window — bedrooms require natural light; check the takeoff.`,
        );
    }
  }

  const notesBeforeAgg = mergedVecW.notes ?? "";
  let mergedWithWindows = applyWindowAggregate(mergedVecW, windowAggregate);
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
  // Entry-door note: flags the asserted height + the width source (printed, or the assumed
  // last-resort fallback). The entrance is folded into the opening set on every path (route-2
  // symbol fold or the schedule entry fold), and the ext-wall area is recomputed accordingly,
  // so entranceAssumptionNote no longer claims "not added"/"not recomputed" — no clause to strip.
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
  // Schedule path — the windows-only Door & Window Schedule omits the entry door, so fold it
  // into openings[] from the SAME vector entrance + shared builder the route-2 path uses, so
  // glazed_sqm / total_opening_sqm / the ext-wall deduction all include it (counted once).
  // Strictly gated OFF when symbol_openings fired (route-2 already added the entrance) → no
  // double-count; foldScheduleEntrance's own dedup is a further backstop.
  const hasSymbolOpenings = !!(
    vectorAnnotations?.symbol_openings && vectorAnnotations.symbol_openings.length > 0
  );
  const rawComposedOpenings = hasSymbolOpenings
    ? folded.openings
    : foldScheduleEntrance(folded.openings, vectorAnnotations?.entrance);
  const composedOpenings = normaliseOpeningsForQs(rawComposedOpenings);
  const composedGarageDoorSize = folded.garage_door_size;
  const garageDoorConfirmedFromSectionalCallout = composedGarageDoorSize !== t.garage_door_size;
  const composedOpeningTotals = deriveOpeningTotals(composedOpenings);
  // Re-derive the external wall AREA from the now-richer opening total (perimeter × stud −
  // Σ opening area) whenever the opening set grew — the route-2 symbol fold OR the schedule
  // entry fold above — so external_wall_area_m2 and glazed_sqm move together by the same
  // amount. A strict no-op otherwise (composedOpenings === baseOpenings → same reference), so
  // jobs with neither fold keep their existing ext-wall value untouched.
  const composedExtWallAreaM2 =
    composedOpenings !== baseOpenings && composedOpeningTotals.total_opening_sqm != null
      ? computeExternalWallAreaM2(
          t.external_wall_lm,
          t.ceiling_height_m,
          composedOpeningTotals.total_opening_sqm,
        )
      : t.external_wall_area_m2;
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
  const windowsBySrc: FieldSource =
    windowAggregate.source === "schedule"
      ? "schedule"
      : windowChanges.length > 0
        ? "vector"
        : "vision";

  const enriched: EnrichedTakeoff = {
    floor_area_m2: fv(
      t.floor_area_m2,
      floorAreaDecision.source,
      floorAreaDecision.confidence,
      floorAreaDecision.flags,
    ),
    garage_area_m2: fv(
      garageOverride && planGarage ? planGarage.areaM2 : t.garage_area_m2,
      garageOverride ? "vector" : measuredSrc(m?.garage_area_m2 != null),
      null,
      garageFlags.length ? garageFlags : undefined,
    ),
    alfresco_area_m2: fv(t.alfresco_area_m2, measuredSrc(m?.alfresco_area_m2 != null)),
    external_wall_lm: fv(
      t.external_wall_lm,
      measuredSrc(m?.perimeter_m != null),
      normConf(geoResult?.confidence?.perimeter),
    ),
    internal_wall_lm:
      doorEngine?.wallTrace != null && doorEngine.wallTrace.internalWallLm > 10
        ? fv(doorEngine.wallTrace.internalWallLm, "vector", "mid", [
            `⚑ ribbon-trace v1 — deterministic from the plan's wall pairs (${doorEngine.wallTrace.ribbonCount} ribbons); known ~+25% joinery bias, VERIFY before pricing. Not exported.`,
            ...roomFlags,
          ])
        : fv(
            t.internal_wall_lm,
            measuredSrc(m?.internal_wall_length_m != null),
            normConf(m?.internal_wall_confidence),
            roomFlags,
          ),
    // Gable span candidate = geometry envelope's SHORT side. Measured (not guessed);
    // the rectangular-envelope assumption is flagged at the consumer (cladding adapter).
    gable_span_m: fv(
      m?.bounding_box_m != null ? Math.min(m.bounding_box_m.width, m.bounding_box_m.height) : null,
      measuredSrc(m?.bounding_box_m != null),
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
    foundation_type: fv(
      foundationOrDefault(t.foundation_type),
      t.foundation_type && t.foundation_type.trim() ? "vision" : "asserted",
    ),
    windows_by_room: fv(
      t.windows_by_room,
      windowsBySrc,
      null,
      flagsFor(
        entranceNote,
        safeguardNote,
        reconFlag("entrance_door_width"),
        ...windowChanges.map((c) => c.change),
        ...codeMismatch,
        ...bedNoWindow,
      ),
    ),
    windows_schedule: fv(t.windows_schedule ?? null, schedule ? "schedule" : "vision"),
    door_breakdown: fv(t.door_breakdown, "vision"),
    garage_door_size: fv(
      // Route 2 — the sectional callout reconciles the garage size (e.g. fixes a garbled vision
      // read); composedGarageDoorSize == t.garage_door_size when no sectional callout applied.
      composedGarageDoorSize,
      garageDoorConfirmedFromSectionalCallout ? "vector" : garageChanged ? "vector" : "vision",
      garageDoorConfirmedFromSectionalCallout
        ? "high"
        : reconConf(reconStatusOf("garage_door_width")),
      flagsFor(garageDoorConfirmedFromSectionalCallout ? null : reconFlag("garage_door_width")),
    ),
    external_wall_area_m2: fv(composedExtWallAreaM2, "derived", null, extWallFlags),
    total_area_m2: fv(t.total_area_m2, "derived"),
    // Global, backward-compatible view: identical to the bare TakeoffData.notes string.
    notes: t.notes,
    // Stage 2a — flat opening list + glazed-split totals (additive passthrough).
    openings: composedOpenings,
    total_opening_sqm: composedOpeningTotals.total_opening_sqm,
    glazed_sqm: composedOpeningTotals.glazed_sqm,
    ...(visualOpeningAudit ? { visual_opening_audit: visualOpeningAudit } : {}),
    // Persist the geometry room footprints (labels + dims) — the crop-on-anomaly gate and
    // the crop localizer need them after the run. Conditional spread: payloads from
    // geometry-less runs stay byte-identical to today.
    ...(m?.rooms && m.rooms.length > 0 ? { rooms: m.rooms } : {}),
    // Door engine passthrough — counts + review flags persist with the takeoff. Conditional
    // spread: runs without a door pass stay byte-identical to today.
    ...(doorEngine
      ? {
          door_counts_auto: doorEngine.counts,
          door_flags: doorEngine.flags as unknown as Array<Record<string, unknown>>,
          // Plan-overlay slice (13 Jun): every hit (confirmed + flagged) with its page-space
          // position, for the verification printout's plan overlay. Additive: pre-overlay
          // payloads and goldens (which run without a doorEngine) are byte-identical.
          door_hits: [
            ...doorEngine.hinged,
            ...doorEngine.doubles,
            ...doorEngine.cavity,
            ...doorEngine.flags,
          ].map((h) => ({
            type: h.type,
            widthMm: h.widthMm,
            x: h.x,
            y: h.y,
            ...(h.arcMm != null ? { arcMm: h.arcMm } : {}),
            confidence: h.confidence,
            ...(h.note ? { note: h.note } : {}),
          })),
          ...(doorEngine.pageMeta ? { door_page: doorEngine.pageMeta } : {}),
          // Plan-text pass — additive; absent pre-pass payloads round-trip untouched.
          ...(doorEngine.planText
            ? {
                plan_text: {
                  rooms: doorEngine.planText.rooms.map(({ name, widthMm, depthMm, areaM2 }) => ({
                    name,
                    widthMm,
                    depthMm,
                    areaM2,
                  })),
                  windowCodes: doorEngine.planText.windowCodes.map(({ heightMm, widthMm }) => ({
                    heightMm,
                    widthMm,
                  })),
                  titleAreas: Object.fromEntries(
                    Object.entries(doorEngine.planText.titleAreas).filter(([, v]) => v != null),
                  ) as Record<string, number>,
                },
              }
            : {}),
        }
      : {}),
    // Pipeline safety (12 Jun): a geometry-less run must be LOUD, never silent — the
    // catch→null fallback hid a dead geometry service for two days while takeoffs ran
    // vision-only with no warning. Conditional spread: geometry-present runs stay
    // byte-identical; absence on older stored payloads simply reads as pre-flag era.
    ...(geoResult
      ? {}
      : {
          geometry_status: fv(
            "unavailable",
            "flagged-unknown",
            "low",
            flagsFor(
              "GEOMETRY LAYER UNAVAILABLE — deterministic measurement and cross-checks did not run; every value on this takeoff is vision-only. Investigate /api/geometry (health AND auth) before relying on or pricing from this takeoff.",
            ),
          ),
        }),
  };

  return { enriched, reconciliation, pageReconcile, scheduleSafeguard };
}
