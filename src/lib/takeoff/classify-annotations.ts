import type { RawAnnotations } from "./extract-annotations";
import type { PlanContext } from "./plan-context";
import type { TakeoffData, WindowsByRoom } from "./takeoff-types";
import { normaliseRoomName, classifyGarageDoorAnnotation, parseDimsMm } from "./classify";
import {
  computeOpeningAreaM2,
  computeExternalWallAreaM2,
  computeTotalAreaM2,
  deriveOpenings,
  deriveOpeningTotals,
} from "./derive-fields";
import { round2 } from "./utils";

interface ParsedDimension {
  heightMm: number;
  widthMm: number;
}

/**
 * A window callout is exactly two dimension numbers. We reuse the shared
 * parseDimsMm reader (classify.ts) so commas and spaces are tolerated identically
 * to the garage path — Harrison's newer template prints "2,150 x 2,100", older
 * templates "1300x1800"; both must read the same. The pair's *order* carries the
 * format: first number is the height under HEIGHT_x_WIDTH, the width otherwise.
 * Anything that isn't a clean two-number callout (a lone leaf size like "810", or
 * a noisy string) returns null and is skipped, exactly as before.
 */
function parseDimension(
  text: string,
  format: PlanContext["dimensionFormat"],
): ParsedDimension | null {
  const dims = parseDimsMm(text);
  if (dims.length !== 2) return null;
  const [a, b] = dims;
  return format === "HEIGHT_x_WIDTH" ? { heightMm: a, widthMm: b } : { heightMm: b, widthMm: a };
}

/**
 * Room-dimension boxes (e.g. "4300×3600", "4555×5720") are room footprints, not
 * window openings. The reliable discriminator is Pass-1's `nearOpening` flag —
 * verified on both Harrison and McAlevey: every real opening is nearOpening:true,
 * room boxes are not — and the loop already gates on it. This size check is only a
 * conservative backstop for a room box mis-flagged as an opening: it fires solely
 * when BOTH dims reach room scale (≥3000mm). No window is 3m tall, so a genuine
 * opening — including Harrison's tall 2150×2400 sliders — can never trip it; only a
 * room footprint (both sides ≥3m) can. The old >2000×2000 guard wrongly ate those
 * sliders; this keeps them while still dropping room boxes.
 */
const ROOM_BOX_MIN_MM = 3000;

export function classifyAnnotations(raw: RawAnnotations, context: PlanContext): TakeoffData {
  // ── Windows by room ─────────────────────────────────────────────────────────
  const windowsMap: { [room: string]: { qty: number; heightMm: number; widthMm: number } } = {};

  for (const ann of raw.openingAnnotations) {
    if (!ann.nearOpening) continue;
    const dim = parseDimension(ann.text, context.dimensionFormat);
    if (!dim) continue;
    // Backstop: drop only genuine room footprints (both dims ≥ room scale), never
    // a tall slider. nearOpening (gated above) is the primary discriminator.
    if (dim.heightMm >= ROOM_BOX_MIN_MM && dim.widthMm >= ROOM_BOX_MIN_MM) continue;
    const room = normaliseRoomName(ann.nearestRoomLabel ?? "Unknown");
    if (windowsMap[room]) {
      windowsMap[room].qty += 1;
    } else {
      windowsMap[room] = { qty: 1, heightMm: dim.heightMm, widthMm: dim.widthMm };
    }
  }

  const windows_by_room: WindowsByRoom = {};
  for (const [room, { qty, heightMm, widthMm }] of Object.entries(windowsMap)) {
    windows_by_room[room] = {
      qty,
      height_m: round2(heightMm / 1000) ?? 0,
      width_m: round2(widthMm / 1000) ?? 0,
    };
  }

  const window_count = Object.values(windows_by_room).reduce((sum, w) => sum + w.qty, 0) || null;

  // ── Garage door ──────────────────────────────────────────────────────────────
  // Classify by the height+width combination (F-003), not a single literal. Garage
  // doors are normal-height (~2.1m) and identified by width, so the strict NxM
  // parseDimension used for windows is wrong here — it rejects "2,210 x 4,800" (commas,
  // spaces) and the no-`x` "4800" form. classifyGarageDoorAnnotation recovers the width
  // either way and maps it to the canonical QS size label (e.g. "4.8×2.1").
  let garage_door_size: string | null = null;
  const gd = raw.garageDoorAnnotations[0];
  if (gd) {
    const gdClass = classifyGarageDoorAnnotation(gd);
    garage_door_size = gdClass ? gdClass.label : gd;
  }

  // ── Areas ────────────────────────────────────────────────────────────────────
  const s = raw.areaSummary;
  const living = s.livingAreaM2 ?? context.livingAreaM2;

  // ── Counts ───────────────────────────────────────────────────────────────────
  const roomLabelsLower = raw.roomLabels.map((r) => r.toLowerCase());
  const countContaining = (needle: string) =>
    roomLabelsLower.filter((r) => r.includes(needle)).length;

  const countMatchingAny = (...needles: string[]) =>
    roomLabelsLower.filter((r) => needles.some((n) => r.includes(n))).length;

  const bathroom_count = countMatchingAny("bath") || null;
  const ensuite_count = roomLabelsLower.filter((r) => /\bens(?:uite)?\b/.test(r)).length || null;
  const laundry_count = countMatchingAny("laundry", "utility") || null;
  const kitchen_count = countMatchingAny("kitchen", "kitch") || null;

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const floor_area = round2(living);
  const garage_area = round2(s.garageAreaM2);
  const alfresco_area = round2(s.alfrescoAreaM2);
  const perimeterM = s.perimeterM ?? context.perimeterM;
  const external_wall_lm = round2(perimeterM);

  // ── Derived QS fields (Phase 2d) ───────────────────────────────────────────────
  // Stud height = the takeoff value (2.4), not a raw OCR read (2.42) — the QS uses
  // the rounded stud. ceiling_height_m is exactly that value.
  const ceiling_height_m = round2(context.studHeightMm / 1000);
  // Opening area from the floor-plan callouts + garage door. When a Door & Window
  // Schedule is later reconciled (Phase 2b), applyWindowAggregate RE-derives the
  // external wall area from the canonical schedule window set.
  const opening_area_m2 = computeOpeningAreaM2({
    windowsByRoom: Object.keys(windows_by_room).length > 0 ? windows_by_room : null,
    garageDoorSize: garage_door_size,
  });
  const external_wall_area_m2 = computeExternalWallAreaM2(
    perimeterM,
    ceiling_height_m,
    opening_area_m2,
  );
  const total_area_m2 = computeTotalAreaM2(floor_area, alfresco_area);

  // ── Stage 1: flat per-opening list (additive, alongside windows_by_room) ───────
  // Built from the same callout source feeding opening_area_m2. On a scheduled job
  // applyWindowAggregate RE-derives this from the canonical schedule set, mirroring
  // the ext-wall re-derivation above.
  const openings = deriveOpenings({
    windowsByRoom: Object.keys(windows_by_room).length > 0 ? windows_by_room : null,
    garageDoorSize: garage_door_size,
  });
  const openingTotals = deriveOpeningTotals(openings);

  // Alfresco is a known-fuzzy read (QS-side number doesn't always equal the plan's
  // printed porch). Flag it low-confidence for human confirm when present.
  const notes =
    alfresco_area !== null
      ? "alfresco_area_m2 read from the porch/alfresco label — low confidence; confirm against QS."
      : "";

  // ── Roof area (1.15× floor area as default — no pitch data at this stage) ──
  const roof_area_m2 = floor_area !== null ? round2(floor_area * 1.15) : null;

  return {
    floor_area_m2: floor_area,
    garage_area_m2: garage_area,
    alfresco_area_m2: alfresco_area,
    external_wall_lm,
    internal_wall_lm: null,
    roof_area_m2,
    window_count: window_count !== null ? window_count : null,
    external_door_count: null,
    internal_door_count: raw.internalDoorAnnotations.length || null,
    bathroom_count,
    ensuite_count,
    laundry_count,
    kitchen_count,
    ceiling_height_m,
    foundation_type: null,
    windows_by_room: Object.keys(windows_by_room).length > 0 ? windows_by_room : null,
    door_breakdown: null,
    garage_door_size,
    notes,
    external_wall_area_m2,
    total_area_m2,
    openings,
    total_opening_sqm: openingTotals.total_opening_sqm,
    glazed_sqm: openingTotals.glazed_sqm,
  };
}
