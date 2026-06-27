import { openingEvidence, type Segment, type TextLabel } from "../doors/door-engine";
import type { PlanRoom, PlanStandaloneOpeningWidth, PlanText, PlanWindowCode } from "./plan-text";

export type PlanSide = "plan_left" | "plan_right" | "plan_top" | "plan_bottom";

export type PlanPhysicalOpeningWidthWitness = {
  kind: "physical_opening_width";
  openingKind?: "wide_opening" | "entry_door";
  widthMm: number;
  x: number;
  y: number;
  vertical: boolean;
  text: string;
  room: string;
  planSide: PlanSide;
  evidence: {
    stub: boolean;
    leaf: boolean;
  };
  note: string;
};

export type PlanPrintedWindowCodeWitness = {
  kind: "printed_window_code";
  widthMm: number;
  heightMm: number;
  x: number;
  y: number;
  room: string;
  planSide: PlanSide;
  note: string;
};

const PT_PER_MM = 72 / 25.4;
const DEFAULT_SCALE = 100;
const MIN_OPENING_WIDTH_MM = 1800;
const MIN_ENTRY_OPENING_WIDTH_MM = 1200;
const MAX_GLAZED_OPENING_WIDTH_MM = 4200;
const MAX_ROOM_DISTANCE_PT = 110;
const MAX_WINDOW_CODE_ROOM_DISTANCE_PT = 180;
const DIMENSION_CHAIN_LINE_TOLERANCE_PT = 18;
const NON_WINDOW_ROOMS = /^(HWC|LINEN|STORE|WIR|ROBE|PANTRY|ENTRY)\b/i;
const ENTRY_ROOM_RE = /^(ENTRY|ENTRANCE|FOYER|PORCH)\b/i;

function mmToPt(mm: number, scale: number): number {
  return (mm / scale) * PT_PER_MM;
}

function inferPlanSide(witness: PlanStandaloneOpeningWidth, room: PlanRoom): PlanSide {
  return inferPointPlanSide(witness.x, witness.y, witness.vertical, room);
}

function inferPointPlanSide(x: number, y: number, vertical: boolean, room: PlanRoom): PlanSide {
  const dx = x - room.x;
  const dy = y - room.y;
  if (vertical || Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "plan_right" : "plan_left";
  }
  return dy >= 0 ? "plan_bottom" : "plan_top";
}

function nearestRoom(
  witness: PlanStandaloneOpeningWidth,
  rooms: readonly PlanRoom[],
): { room: PlanRoom; distance: number } | null {
  const [nearest] = rooms
    .map((room) => ({ room, distance: Math.hypot(room.x - witness.x, room.y - witness.y) }))
    .sort((a, b) => a.distance - b.distance);
  if (!nearest || nearest.distance > MAX_ROOM_DISTANCE_PT) return null;
  return nearest;
}

function numericDimensionLabel(label: TextLabel): PlanStandaloneOpeningWidth | null {
  const text = label.text.trim();
  if (!/^\d{4,5}$/.test(text)) return null;
  const widthMm = Number(text);
  if (widthMm < 1000 || widthMm > 30000) return null;
  return {
    widthMm,
    x: label.x,
    y: label.y,
    vertical: label.vertical,
    text: label.text,
  };
}

function likelyDimensionChainLabel(
  witness: PlanStandaloneOpeningWidth,
  candidates: readonly PlanStandaloneOpeningWidth[],
): boolean {
  const lineCoord = witness.vertical ? witness.x : witness.y;
  const peers = candidates.filter((candidate) => {
    if (candidate === witness || candidate.vertical !== witness.vertical) return false;
    const candidateLineCoord = candidate.vertical ? candidate.x : candidate.y;
    return Math.abs(candidateLineCoord - lineCoord) <= DIMENSION_CHAIN_LINE_TOLERANCE_PT;
  });
  const sameLineLabels = [witness, ...peers];
  return (
    sameLineLabels.length >= 3 &&
    sameLineLabels.some((candidate) => candidate.widthMm > MAX_GLAZED_OPENING_WIDTH_MM)
  );
}

export function detectPhysicalOpeningWidthWitnesses(args: {
  planText: Pick<PlanText, "rooms" | "standaloneOpeningWidths">;
  segments: readonly Segment[];
  labels?: readonly TextLabel[];
  scale?: number;
}): PlanPhysicalOpeningWidthWitness[] {
  const scale = args.scale ?? DEFAULT_SCALE;
  const out: PlanPhysicalOpeningWidthWitness[] = [];
  const standaloneOpeningWidths = args.planText.standaloneOpeningWidths ?? [];
  const lineLabels = args.labels
    ? args.labels
        .map(numericDimensionLabel)
        .filter((label): label is PlanStandaloneOpeningWidth => label != null)
    : standaloneOpeningWidths;
  for (const witness of standaloneOpeningWidths) {
    const roomMatch = nearestRoom(witness, args.planText.rooms);
    if (!roomMatch) continue;

    const entryDoor = ENTRY_ROOM_RE.test(roomMatch.room.name);
    const minOpeningWidthMm = entryDoor ? MIN_ENTRY_OPENING_WIDTH_MM : MIN_OPENING_WIDTH_MM;
    if (witness.widthMm < minOpeningWidthMm || witness.widthMm > MAX_GLAZED_OPENING_WIDTH_MM) {
      continue;
    }
    if (likelyDimensionChainLabel(witness, lineLabels)) continue;

    const evidence = openingEvidence(
      [...args.segments],
      witness.x,
      witness.y,
      witness.vertical,
      mmToPt(witness.widthMm, scale),
    );
    if (!evidence.stub || !evidence.leaf) continue;

    out.push({
      kind: "physical_opening_width",
      openingKind: entryDoor ? "entry_door" : "wide_opening",
      widthMm: witness.widthMm,
      x: witness.x,
      y: witness.y,
      vertical: witness.vertical,
      text: witness.text,
      room: roomMatch.room.name,
      planSide: inferPlanSide(witness, roomMatch.room),
      evidence,
      note: entryDoor
        ? `entry-door floor-plan width ${witness.widthMm}mm with physical opening stub+leaf near ${roomMatch.room.name}; side still needs exterior face proof before pricing`
        : `standalone floor-plan width ${witness.widthMm}mm with physical opening stub+leaf near ${roomMatch.room.name}`,
    });
  }

  return out;
}

function nearestWindowRoom(
  code: PlanWindowCode,
  rooms: readonly PlanRoom[],
): { room: PlanRoom; distance: number } | null {
  const candidates = rooms.filter((room) => !NON_WINDOW_ROOMS.test(room.name));
  const [nearest] = candidates
    .map((room) => ({ room, distance: Math.hypot(room.x - code.x, room.y - code.y) }))
    .sort((a, b) => a.distance - b.distance);
  if (!nearest || nearest.distance > MAX_WINDOW_CODE_ROOM_DISTANCE_PT) return null;
  return nearest;
}

export function detectPrintedWindowCodeWitnesses(
  planText: Pick<PlanText, "rooms" | "windowCodes">,
): PlanPrintedWindowCodeWitness[] {
  const out: PlanPrintedWindowCodeWitness[] = [];
  for (const code of planText.windowCodes) {
    const roomMatch = nearestWindowRoom(code, planText.rooms);
    if (!roomMatch) continue;
    out.push({
      kind: "printed_window_code",
      widthMm: code.widthMm,
      heightMm: code.heightMm,
      x: code.x,
      y: code.y,
      room: roomMatch.room.name,
      planSide: inferPointPlanSide(code.x, code.y, false, roomMatch.room),
      note: `printed floor-plan opening code ${code.heightMm}x${code.widthMm} near ${roomMatch.room.name}`,
    });
  }
  return out;
}
