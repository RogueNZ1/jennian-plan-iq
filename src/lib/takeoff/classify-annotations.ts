import type { RawAnnotations } from './extract-annotations';
import type { PlanContext } from './plan-context';
import type { TakeoffData, WindowsByRoom } from './takeoff-types';
import { normaliseRoomName, classifyGarageDoorAnnotation } from './classify';
import { round2 } from './utils';

interface ParsedDimension {
  heightMm: number;
  widthMm: number;
}

function parseDimension(text: string, format: PlanContext['dimensionFormat']): ParsedDimension | null {
  const match = text.match(/^(\d+)[xX×](\d+)$/);
  if (!match) return null;
  const a = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  if (isNaN(a) || isNaN(b)) return null;
  return format === 'HEIGHT_x_WIDTH'
    ? { heightMm: a, widthMm: b }
    : { heightMm: b, widthMm: a };
}

export function classifyAnnotations(raw: RawAnnotations, context: PlanContext): TakeoffData {
  // ── Windows by room ─────────────────────────────────────────────────────────
  const windowsMap: { [room: string]: { qty: number; heightMm: number; widthMm: number } } = {};

  for (const ann of raw.openingAnnotations) {
    if (!ann.nearOpening) continue;
    const dim = parseDimension(ann.text, context.dimensionFormat);
    if (!dim) continue;
    // Room dimension annotations have both dims > 2000mm (e.g. 4300×3600).
    // Skip them — they are room boxes, not window annotations.
    if (dim.heightMm > 2000 && dim.widthMm > 2000) continue;
    const room = normaliseRoomName(ann.nearestRoomLabel ?? 'Unknown');
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

  const bathroom_count = countMatchingAny('bath') || null;
  const ensuite_count = countMatchingAny('ensuite', ' ens') || null;
  const laundry_count = countMatchingAny('laundry', 'utility') || null;
  const kitchen_count = countMatchingAny('kitchen', 'kitch') || null;

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const floor_area = round2(living);
  const garage_area = round2(s.garageAreaM2);
  const alfresco_area = round2(s.alfrescoAreaM2);
  const perimeterM = s.perimeterM ?? context.perimeterM;
  const external_wall_lm = round2(perimeterM);

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
    ceiling_height_m: round2(context.studHeightMm / 1000),
    foundation_type: null,
    windows_by_room: Object.keys(windows_by_room).length > 0 ? windows_by_room : null,
    door_breakdown: null,
    garage_door_size,
    notes: '',
  };
}
