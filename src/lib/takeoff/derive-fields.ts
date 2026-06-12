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
import type { WindowsByRoom, ScheduleWindowEntry, Opening, OpeningType } from "./takeoff-types";
import type { VectorSymbolOpening, VectorEntrance } from "./geometry-api";
import { classifyGarageDoorAnnotation } from "./classify";
import { round2 } from "./utils";

/**
 * Last-resort fallback width (metres) for an opening whose plan width could not be read.
 * Opening widths vary, so this is a coarse standard — it fires ONLY when no real width
 * exists (null/≤0) and NEVER overwrites an extracted/measured width (gaps only). Every
 * opening that uses it is review-flagged ("width assumed 1.0m — confirm against plan") so
 * the glass/joinery total stays COMPLETE — qty and area move together, never a 0-area
 * phantom row — while a human confirms the value against the plan.
 */
export const ASSUMED_OPENING_WIDTH_M = 1.0;
export const ASSUMED_WIDTH_FLAG = "width assumed 1.0m — confirm against plan";

/**
 * Resolve an opening width in metres. Returns the real width untouched whenever one exists;
 * applies ASSUMED_OPENING_WIDTH_M ONLY for a genuinely missing width (null/≤0). `assumed`
 * tells the caller to attach ASSUMED_WIDTH_FLAG. Never overwrites a real width.
 */
function resolveOpeningWidthM(widthM: number | null | undefined): {
  width_m: number;
  assumed: boolean;
} {
  if (widthM != null && widthM > 0) return { width_m: widthM, assumed: false };
  return { width_m: ASSUMED_OPENING_WIDTH_M, assumed: true };
}

/**
 * Total area of EVERY extracted opening, in m².
 *
 * Windows: the Door & Window Schedule list is the canonical source when present
 * (Σ height × width); otherwise the floor-plan callouts (Σ qty × height × width).
 * Garage door: recovered from the classified size label/annotation.
 * External doors (entrance, ranchsliders read as doors, etc.): summed when a caller
 * supplies dimensioned openings via `externalDoors`.
 *
 * NOTE on completeness: the QS opening total also folds in the entrance + any other
 * external doors. This function now sums them WHEN a caller provides them
 * (`externalDoors`); if a job does not extract external doors as dimensioned openings
 * (e.g. a Door & Window Schedule that lists windows only), they are simply absent and
 * the derived ext-wall area is a known slight OVERSHOOT — the caller should
 * confidence-flag that omission rather than fabricate a figure. This field is only as
 * good as the openings feeding it.
 *
 * Returns null when there are no openings to sum at all.
 */
export function computeOpeningAreaM2(args: {
  windowsSchedule?: ScheduleWindowEntry[] | null;
  windowsByRoom?: WindowsByRoom | null;
  garageDoorSize?: string | null;
  externalDoors?: Array<{ height_m: number | null; width_m: number | null }> | null;
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

  // External doors (when a caller extracts them with dimensions). Kept separate from
  // the window sources above so a schedule job that lists windows only still adds its
  // doors when another pass supplies them — never fabricated here.
  if (args.externalDoors && args.externalDoors.length > 0) {
    for (const d of args.externalDoors) {
      if (d.height_m != null && d.width_m != null && d.height_m > 0 && d.width_m > 0) {
        total += d.height_m * d.width_m;
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
 * Stage 1 — build the flat per-opening list from the canonical window set.
 *
 * LOSSLESS by construction and source-aligned with computeOpeningAreaM2: the Door &
 * Window Schedule is the canonical window source when present (one Opening per W-entry,
 * individual H × W preserved); otherwise the floor-plan callouts (each windows_by_room
 * room un-merged into `qty` individual Opening entries). The sectional garage door is
 * appended from its classified size label. No fabrication — an entry is emitted only
 * for a window/garage value that already exists on the takeoff.
 *
 * Stage 1 type fidelity: vision does not yet separate sliders / garage windows / PA /
 * entrance from plain windows, so every glazed entry is typed "window" here and the
 * garage door "sectional_door". Finer typing + glazed/cladding routing are later stages;
 * this stage only proves the flat list maps the CURRENT extraction without loss.
 */
export function deriveOpenings(args: {
  windowsSchedule?: ScheduleWindowEntry[] | null;
  windowsByRoom?: WindowsByRoom | null;
  garageDoorSize?: string | null;
}): Opening[] {
  const openings: Opening[] = [];

  const sched = args.windowsSchedule;
  if (sched && sched.length > 0) {
    // Schedule path: one opening per W-entry, individual dims preserved. A schedule entry
    // whose WIDTH could not be read gets the last-resort assumed width (flagged), so the
    // glass total stays complete — never a 0-area phantom. (A null HEIGHT is a separate,
    // out-of-scope gap and still yields area 0 here.)
    for (const w of sched) {
      const h = w.height_m ?? 0;
      const { width_m: wd, assumed } = resolveOpeningWidthM(w.width_m);
      openings.push({
        type: "window",
        room: w.id ?? null,
        height_m: h,
        width_m: wd,
        glazed: true,
        cladding: null,
        area_m2: round2(h * wd) ?? 0,
        source: "vision",
        ...(assumed ? { flags: [ASSUMED_WIDTH_FLAG] } : {}),
        confidence: "high",
      });
    }
  } else if (args.windowsByRoom) {
    // Callout path: un-merge each room's qty into individual entries (same dims). A room
    // whose width could not be read gets the last-resort assumed width (flagged), never 0-area.
    for (const [room, w] of Object.entries(args.windowsByRoom)) {
      if (!w) continue;
      const { width_m: wd, assumed } = resolveOpeningWidthM(w.width_m);
      for (let i = 0; i < w.qty; i++) {
        openings.push({
          type: "window",
          room,
          height_m: w.height_m,
          width_m: wd,
          glazed: true,
          cladding: null,
          area_m2: round2(w.height_m * wd) ?? 0,
          source: "vision",
          ...(assumed ? { flags: [ASSUMED_WIDTH_FLAG] } : {}),
          confidence: "medium",
        });
      }
    }
  }

  // Sectional garage door: solid (glazed:false), recovered from the classified label.
  if (args.garageDoorSize) {
    const gd = classifyGarageDoorAnnotation(args.garageDoorSize);
    if (gd) {
      const h = gd.heightMm / 1000;
      const wd = gd.widthMm / 1000;
      openings.push({
        type: "sectional_door",
        room: "Garage",
        height_m: round2(h) ?? 0,
        width_m: round2(wd) ?? 0,
        glazed: false,
        cladding: null,
        area_m2: round2(h * wd) ?? 0,
        source: "vision",
        confidence: "medium",
      });
    }
  }

  return openings;
}

/**
 * Route 2 — fold the label-anchored single-width openings (vector symbol_openings, no-schedule
 * path) into openings[]. Each gets its WIDTH from the printed callout (source "callout") and an
 * ASSERTED standard 2.1m height (flagged) — except a garage window, whose height is left
 * unresolved (flagged), never fabricated. glazed=false only for the sectional door.
 *
 * Reconciles to avoid double-count: the callout sectional REPLACES any garage-door-derived
 * sectional already in openings[] (callout wins — fixes a garbled vision garage read) and
 * returns the canonical garage_door_size label; the callout entry REPLACES any entrance-room
 * opening the vision/entrance path produced. slider / garage_window / PA door are appended.
 *
 * Pure. Returns the merged openings plus the reconciled garage_door_size (unchanged when no
 * sectional callout). A no-op (returns the inputs) when symbolOpenings is empty/absent.
 */
const STANDARD_OPENING_HEIGHT_M = 2.1;
const ASSERTED_HEIGHT_FLAG =
  "height assumed standard 2.1m — confirm against the elevation/joinery schedule";
const SYMBOL_ROOM: Record<VectorSymbolOpening["type"], string> = {
  sectional_door: "Garage",
  garage_window: "Garage",
  pa_door: "Garage",
  slider: "Lounge",
  entrance: "Entry",
};
const ENTRY_ROOM_RE = /entr|entry|foyer|porch/i;

/** Title-case + strip punctuation from a vector room label ("DINING" → "Dining"). */
function normRoomLabel(label?: string): string | null {
  if (!label) return null;
  const cleaned = label
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve an opening HEIGHT on the symbol (Route 2) path, mirroring the
 * resolveOpeningWidths contract: a real extracted height ALWAYS wins and is never
 * overwritten; an unresolved height is ASSERTED to the standard and FLAGGED
 * ("height assumed — confirm"), never left at 0 — a 0 height zeroes the opening's
 * area_m2 (understating glazing and overstating external wall area) and drops its
 * height cell from the QS export.
 *
 * SCOPE: the symbol path ONLY. The deriveOpenings schedule branch must NOT route
 * through this — its head-datum safeguard intentionally rejects suspect heights, and
 * asserting a standard over that rejection regresses the Beddis baseline.
 */
export function resolveOpeningHeightM(extractedHeightMm?: number | null): {
  height_m: number;
  height_source: NonNullable<Opening["height_source"]>;
  flag: string | null;
} {
  if (extractedHeightMm != null && extractedHeightMm > 0) {
    return {
      height_m: round2(extractedHeightMm / 1000) ?? 0,
      height_source: "callout",
      flag: null,
    };
  }
  return {
    height_m: STANDARD_OPENING_HEIGHT_M,
    height_source: "asserted",
    flag: ASSERTED_HEIGHT_FLAG,
  };
}

function symbolToOpening(s: VectorSymbolOpening): Opening {
  const width_m = round2(s.width_mm / 1000) ?? 0;
  const glazed = s.type !== "sectional_door";
  const flags: string[] = [];
  // Every symbol type — including garage_window, which was previously pinned to an
  // unresolved 0 height — resolves through the shared height resolver: an extracted
  // height (newer engines) wins; otherwise the standard is asserted and flagged.
  const resolved = resolveOpeningHeightM(s.height_mm);
  const height_m = resolved.height_m;
  const height_source = resolved.height_source;
  if (resolved.flag) flags.push(resolved.flag);
  return {
    type: s.type as OpeningType,
    // Room from the matched anchor label (e.g. the slider's "DINING"), so it lands in its real
    // QS slot instead of the fixed default; fall back to the default only when no label came through.
    room: normRoomLabel(s.room_label) ?? SYMBOL_ROOM[s.type],
    height_m,
    width_m,
    glazed,
    cladding: null,
    area_m2: round2(height_m * width_m) ?? 0,
    source: "callout",
    height_source,
    flags,
    confidence: "medium", // width exact (callout); height asserted → medium, flagged
  };
}

function entranceFallbackOpening(v: VectorEntrance): Opening {
  // Present-but-flagged entry: the plan has an entry/porch. Width from vector_text when the
  // plan printed a frame-to-frame number; otherwise the last-resort assumed width (flagged),
  // so the entry contributes its glass area and never lands as a 0-area phantom. Height
  // asserted 2.1m. Counted, flagged, never dropped.
  const printed = v.width_mm != null ? (round2(v.width_mm / 1000) ?? null) : null;
  const { width_m, assumed } = resolveOpeningWidthM(printed);
  const flags = [ASSERTED_HEIGHT_FLAG];
  if (assumed) flags.push(ASSUMED_WIDTH_FLAG);
  return {
    type: "entrance",
    room: "Entry",
    height_m: STANDARD_OPENING_HEIGHT_M,
    width_m,
    glazed: true,
    cladding: null,
    area_m2: round2(STANDARD_OPENING_HEIGHT_M * width_m) ?? 0,
    source: assumed ? "unresolved" : "callout",
    height_source: "asserted",
    flags,
    confidence: assumed ? "low" : "medium",
  };
}

export function foldSymbolOpenings(
  openings: Opening[],
  symbolOpenings: VectorSymbolOpening[] | null | undefined,
  garageDoorSize: string | null,
  vectorEntrance?: VectorEntrance | null,
): { openings: Opening[]; garage_door_size: string | null } {
  // symbol_openings present == the no-schedule path (the engine only returns it then). The
  // whole fold — including the entry fallback — is gated on it, so schedule/datum jobs
  // (which also carry a vector.entrance) are a strict no-op and stay byte-unchanged.
  const hasSyms = !!symbolOpenings && symbolOpenings.length > 0;
  if (!hasSyms) {
    return { openings, garage_door_size: garageDoorSize };
  }
  const recovered = symbolOpenings!.map(symbolToOpening);
  const hasSectional = recovered.some((o) => o.type === "sectional_door");
  const hasEntrance = recovered.some((o) => o.type === "entrance");

  // Drop the entries the callouts supersede, to avoid double-count:
  //  - any existing sectional_door (the garage-door-derived one) when a callout sectional exists;
  //  - any existing entrance-room opening (vision typed it "window") when a callout entry exists.
  const kept = openings.filter((o) => {
    if (hasSectional && o.type === "sectional_door") return false;
    if (hasEntrance && o.type !== "sectional_door" && ENTRY_ROOM_RE.test(o.room ?? ""))
      return false;
    return true;
  });

  // Reconcile garage_door_size: the callout sectional wins (fixes a garbled vision read).
  const sectional = recovered.find((o) => o.type === "sectional_door");
  const garage_door_size = sectional
    ? `${sectional.width_m}×${sectional.height_m}`
    : garageDoorSize;

  const merged = [...kept, ...recovered];

  // Entry fallback: if no entrance opening was recovered (no clean callout) but the plan
  // carries an entry/porch (vector.entrance), emit it present-but-flagged — never dropped.
  const hasEntry =
    merged.some((o) => o.type === "entrance") ||
    merged.some((o) => ENTRY_ROOM_RE.test(o.room ?? ""));
  if (!hasEntry && vectorEntrance) {
    merged.push(entranceFallbackOpening(vectorEntrance));
  }

  return { openings: merged, garage_door_size };
}

/**
 * Schedule-path analogue of the route-2 entry fold. The Door & Window Schedule lists windows
 * only — never the entry door — so on the schedule path the entrance is missing from openings[]
 * (and thus from glazed_sqm / total_opening_sqm / the ext-wall deduction). This appends it
 * ONCE, from the SAME single source the route-2 path uses: the vector entrance, built by the
 * shared entranceFallbackOpening (asserted standard height; the printed width when present,
 * else the ASSUMED_OPENING_WIDTH_M fallback, flagged). Counted once — a no-op when an entrance
 * (or any entry-room opening) is already present, mirroring foldSymbolOpenings' dedup. The
 * caller gates this to the schedule path (no symbol_openings) so the route-2 fold is never
 * double-applied. Pure: returns a new array only when an entrance is appended; else the input.
 */
export function foldScheduleEntrance(
  openings: Opening[],
  vectorEntrance: VectorEntrance | null | undefined,
): Opening[] {
  if (!vectorEntrance) return openings;
  const alreadyHasEntry = openings.some(
    (o) => o.type === "entrance" || ENTRY_ROOM_RE.test(o.room ?? ""),
  );
  if (alreadyHasEntry) return openings;
  return [...openings, entranceFallbackOpening(vectorEntrance)];
}

/**
 * Stage 1 — totals derived from the flat opening list.
 *  - window_count: glazed window-type openings (window/slider/garage_window) — doors
 *    excluded, matching the bench's window_count semantics and the existing field.
 *  - total_opening_sqm: Σ area over ALL openings (incl. the sectional door).
 *  - glazed_sqm: Σ area over glazed openings only.
 */
export function deriveOpeningTotals(openings: Opening[]): {
  window_count: number | null;
  total_opening_sqm: number | null;
  glazed_sqm: number | null;
} {
  if (openings.length === 0) {
    return { window_count: null, total_opening_sqm: null, glazed_sqm: null };
  }
  const WINDOW_TYPES = new Set<Opening["type"]>(["window", "slider", "garage_window"]);
  const window_count = openings.filter((o) => WINDOW_TYPES.has(o.type)).length || null;
  const total_opening_sqm = round2(openings.reduce((s, o) => s + o.area_m2, 0));
  const glazed_sqm = round2(openings.filter((o) => o.glazed).reduce((s, o) => s + o.area_m2, 0));
  return { window_count, total_opening_sqm, glazed_sqm };
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
