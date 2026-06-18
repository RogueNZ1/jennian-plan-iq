import type { Opening, OpeningType } from "./takeoff-types";
import type { FloorPlanGapCandidate } from "./floor-plan-gaps";
import type { FloorPlanGapElevationMatch } from "./elevation-gap-match";
import { round2 } from "./utils";

export type FloorPlanGapPromotion = {
  openings: Opening[];
  promotedByGapId: Map<string, Opening>;
};

function typeFromElevation(type: FloorPlanGapElevationMatch["type"]): OpeningType | null {
  if (type === "window") return "window";
  if (type === "slider") return "slider";
  if (type === "external_door") return "pa_door";
  return null;
}

function roomKey(room: string | null | undefined): string {
  return (room ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sameMetres(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.05;
}

function alreadyPriced(
  openings: readonly Opening[],
  room: string | null,
  widthM: number,
  heightM: number,
): boolean {
  const key = roomKey(room);
  return openings.some((opening) => {
    const sameRoom = key.length > 0 && roomKey(opening.room) === key;
    return sameRoom && sameMetres(opening.width_m, widthM) && sameMetres(opening.height_m, heightM);
  });
}

export function promoteFloorPlanGapOpenings(args: {
  openings: Opening[];
  floorPlanGaps: readonly FloorPlanGapCandidate[] | null | undefined;
  elevationMatches: ReadonlyMap<string, FloorPlanGapElevationMatch>;
}): FloorPlanGapPromotion {
  const promotedByGapId = new Map<string, Opening>();
  const promoted: Opening[] = [];

  for (const gap of args.floorPlanGaps ?? []) {
    const match = args.elevationMatches.get(gap.id);
    const type = match ? typeFromElevation(match.type) : null;
    if (!match || !type) continue;
    if (gap.confidence === "low" || gap.routing.confidence === "low" || gap.routing.ambiguous) {
      continue;
    }

    const widthM = round2(gap.widthMm / 1000);
    const heightM = round2(match.heightMm / 1000);
    if (widthM == null || heightM == null) continue;
    if (widthM <= 0 || heightM <= 0) continue;
    if (alreadyPriced(args.openings, gap.roomLabel ?? null, widthM, heightM)) continue;
    const areaM2 = round2(widthM * heightM);
    if (areaM2 == null) continue;

    const opening: Opening = {
      type,
      room: gap.roomLabel ?? null,
      height_m: heightM,
      width_m: widthM,
      glazed: true,
      cladding: null,
      area_m2: areaM2,
      source: "vector",
      height_source: "vector",
      confidence: "medium",
      flags: [
        `PROMOTED from measured floor-plan gap ${gap.widthMm}mm on wall face ${gap.wallFaceId}; ${match.face} elevation ${match.label ?? "opening"} confirms ${match.widthMm}x${match.heightMm}mm (${match.widthDeltaMm}mm width delta).`,
      ],
    };
    promotedByGapId.set(gap.id, opening);
    promoted.push(opening);
  }

  return {
    openings: promoted.length > 0 ? [...args.openings, ...promoted] : args.openings,
    promotedByGapId,
  };
}
