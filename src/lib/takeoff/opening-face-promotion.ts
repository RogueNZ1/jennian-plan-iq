import type { Opening, OpeningType } from "./takeoff-types";
import type { OpeningFaceMap, OpeningSignatureFloorRow } from "./opening-face-map";
import type { FrameAssemblyMember } from "./elevation-opening-slots";
import { round2 } from "./utils";

export type OrderedFaceSignaturePromotion = {
  id: string;
  opening: Opening;
  replacedExisting: boolean;
  note: string;
};

export type OrderedFaceSignaturePromotionResult = {
  openings: Opening[];
  promotions: OrderedFaceSignaturePromotion[];
};

function roomKey(room: string | null | undefined): string {
  const normalised = (room ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalised.includes("MASTER")) return "BED1";
  const bed = normalised.match(/BED(?:ROOM)?(\d)/);
  if (bed) return `BED${bed[1]}`;
  return normalised;
}

function openingTypeFor(row: OpeningSignatureFloorRow, member: FrameAssemblyMember): OpeningType {
  if (member.heightMm >= 1750 && row.widthMm >= 2200) return "slider";
  if (member.heightMm >= 1750) return "pa_door";
  return row.room.toUpperCase().includes("GARAGE") ? "garage_window" : "window";
}

function sameFloorRow(opening: Opening, row: OpeningSignatureFloorRow): boolean {
  const sameRoom = roomKey(opening.room).length > 0 && roomKey(opening.room) === roomKey(row.room);
  const sameWidth = Math.abs(opening.width_m * 1000 - row.widthMm) <= 80;
  return sameRoom && sameWidth;
}

function promotionOpening(args: {
  row: OpeningSignatureFloorRow;
  member: FrameAssemblyMember;
  note: string;
}): Opening | null {
  if (args.row.source === "garage_marker") return null;
  const widthM = round2(args.row.widthMm / 1000);
  const heightM = round2(args.member.heightMm / 1000);
  if (widthM == null || heightM == null || widthM <= 0 || heightM <= 0) return null;
  const areaM2 = round2(widthM * heightM);
  if (areaM2 == null) return null;
  return {
    type: openingTypeFor(args.row, args.member),
    room: args.row.room,
    height_m: heightM,
    width_m: widthM,
    glazed: true,
    cladding: null,
    area_m2: areaM2,
    source: "vector",
    height_source: "vector",
    confidence: "medium",
    flags: [args.note],
  };
}

export function promoteOrderedFaceSignatureOpenings(args: {
  openings: readonly Opening[];
  faceMap: OpeningFaceMap | null | undefined;
}): OrderedFaceSignaturePromotionResult {
  const openings = [...args.openings];
  const promotions: OrderedFaceSignaturePromotion[] = [];

  for (const anchor of args.faceMap?.orderedLengthAnchors ?? []) {
    for (const [index, match] of anchor.rowMatches.entries()) {
      const note =
        `PROMOTED from ordered face signature on ${anchor.planSide}; ${anchor.elevationFace}` +
        ` length agrees within ${anchor.lengthDeltaMm}mm and slot ${match.slot.id}` +
        ` supports ${match.member.widthMm}x${match.member.heightMm}mm.`;
      const opening = promotionOpening({ row: match.row, member: match.member, note });
      if (!opening) continue;

      const existingIndex = openings.findIndex((candidate) => sameFloorRow(candidate, match.row));
      const id = `ordered-face-${anchor.planSide}-${index + 1}`;
      if (existingIndex >= 0) {
        openings[existingIndex] = opening;
        promotions.push({ id, opening, replacedExisting: true, note });
      } else {
        openings.push(opening);
        promotions.push({ id, opening, replacedExisting: false, note });
      }
    }
  }

  return { openings, promotions };
}
