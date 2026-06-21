import { envelopeInteriorTest, type Segment } from "../doors/door-engine";
import { createScaleRuler } from "./scale-ruler";

export type FloorPlanGapEnvelopeSide = "exterior" | "interior" | "ambiguous";

export type FloorPlanGapCandidate = {
  id: string;
  widthMm: number;
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
  wallFaceId: string;
  wallThicknessMm: number;
  envelopeSide: FloorPlanGapEnvelopeSide;
  confidence: "medium" | "low";
  roomLabel?: string | null;
  roomSide?: "north" | "south" | "east" | "west" | null;
  alternateRoomLabels?: string[];
  routing: {
    confidence: "medium" | "low";
    ambiguous: boolean;
    reason: string;
  };
  note: string;
};

type RoomPoint = { name: string; x: number; y: number };
type Axial = { vertical: boolean; offset: number; lo: number; hi: number };
type Row = { vertical: boolean; offset: number; spans: Array<{ lo: number; hi: number }> };
type RowGap = {
  vertical: boolean;
  offset: number;
  lo: number;
  hi: number;
  widthPt: number;
};

function axialSegments(segments: readonly Segment[], scale: number): Axial[] {
  const ruler = createScaleRuler(scale);
  const minLen = ruler.mmToPdfPoints(250);
  const out: Axial[] = [];
  for (const segment of segments) {
    const dx = segment.x1 - segment.x0;
    const dy = segment.y1 - segment.y0;
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;

    if (Math.abs(dy) <= Math.abs(dx) * 0.08) {
      out.push({
        vertical: false,
        offset: (segment.y0 + segment.y1) / 2,
        lo: Math.min(segment.x0, segment.x1),
        hi: Math.max(segment.x0, segment.x1),
      });
    } else if (Math.abs(dx) <= Math.abs(dy) * 0.08) {
      out.push({
        vertical: true,
        offset: (segment.x0 + segment.x1) / 2,
        lo: Math.min(segment.y0, segment.y1),
        hi: Math.max(segment.y0, segment.y1),
      });
    }
  }
  return out;
}

function clusterRows(axials: Axial[], scale: number): Row[] {
  const ruler = createScaleRuler(scale);
  const rowTol = Math.max(ruler.mmToPdfPoints(35), 1.2);
  const joinTol = Math.max(ruler.mmToPdfPoints(45), 1.2);
  const rows: Row[] = [];

  for (const vertical of [false, true]) {
    const oriented = axials.filter((axial) => axial.vertical === vertical);
    oriented.sort((a, b) => a.offset - b.offset);
    for (const axial of oriented) {
      let row = rows.find((candidate) => {
        return (
          candidate.vertical === vertical && Math.abs(candidate.offset - axial.offset) <= rowTol
        );
      });
      if (!row) {
        row = { vertical, offset: axial.offset, spans: [] };
        rows.push(row);
      }
      row.offset = (row.offset * row.spans.length + axial.offset) / (row.spans.length + 1);
      row.spans.push({ lo: axial.lo, hi: axial.hi });
    }
  }

  return rows.map((row) => {
    const spans = [...row.spans].sort((a, b) => a.lo - b.lo);
    const merged: Array<{ lo: number; hi: number }> = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span.lo <= last.hi + joinTol) {
        last.hi = Math.max(last.hi, span.hi);
      } else {
        merged.push({ ...span });
      }
    }
    return { ...row, spans: merged };
  });
}

function rowGaps(rows: readonly Row[], scale: number): RowGap[] {
  const ruler = createScaleRuler(scale);
  const minGap = ruler.mmToPdfPoints(350);
  const maxGap = ruler.mmToPdfPoints(6500);
  const minJamb = ruler.mmToPdfPoints(180);
  const out: RowGap[] = [];

  for (const row of rows) {
    for (let i = 0; i < row.spans.length - 1; i++) {
      const left = row.spans[i];
      const right = row.spans[i + 1];
      const widthPt = right.lo - left.hi;
      if (widthPt < minGap || widthPt > maxGap) continue;
      if (left.hi - left.lo < minJamb || right.hi - right.lo < minJamb) continue;
      out.push({
        vertical: row.vertical,
        offset: row.offset,
        lo: left.hi,
        hi: right.lo,
        widthPt,
      });
    }
  }

  return out;
}

function routeRoom(args: {
  rooms: readonly RoomPoint[];
  x: number;
  y: number;
  lo: number;
  hi: number;
  vertical: boolean;
  scale: number;
}): Pick<FloorPlanGapCandidate, "roomLabel" | "roomSide" | "alternateRoomLabels" | "routing"> {
  const ruler = createScaleRuler(args.scale);
  const alongPad = ruler.mmToPdfPoints(2600);
  const maxPerp = ruler.mmToPdfPoints(6500);
  const options: Array<{
    name: string;
    side: "north" | "south" | "east" | "west";
    perp: number;
    d: number;
  }> = [];

  for (const room of args.rooms) {
    const along = args.vertical ? room.y : room.x;
    const off = args.vertical ? room.x - args.x : room.y - args.y;
    if (along < args.lo - alongPad || along > args.hi + alongPad) continue;
    const perp = Math.abs(off);
    if (perp > maxPerp) continue;
    options.push({
      name: room.name,
      side: args.vertical ? (off < 0 ? "west" : "east") : off < 0 ? "north" : "south",
      perp,
      d: Math.hypot(off, along - (args.lo + args.hi) / 2),
    });
  }

  if (options.length === 0) {
    return {
      roomLabel: null,
      roomSide: null,
      alternateRoomLabels: [],
      routing: {
        confidence: "low",
        ambiguous: true,
        reason: "no room label found near the measured wall gap",
      },
    };
  }

  options.sort((a, b) => a.d - b.d || a.perp - b.perp);
  const bySide = new Map<string, typeof options>();
  for (const option of options) {
    bySide.set(option.side, [...(bySide.get(option.side) ?? []), option]);
  }
  const sideWinners = [...bySide.values()].map((sideOptions) => sideOptions[0]);
  sideWinners.sort((a, b) => a.d - b.d || a.perp - b.perp);
  const winner = sideWinners[0];
  const alternatives = sideWinners
    .slice(1)
    .filter(
      (option) =>
        option.d <= winner.d * 1.45 || Math.abs(option.perp - winner.perp) < maxPerp * 0.25,
    );
  const ambiguous = alternatives.length > 0;

  return {
    roomLabel: winner.name,
    roomSide: winner.side,
    alternateRoomLabels: alternatives.map((option) => option.name),
    routing: {
      confidence: ambiguous ? "low" : "medium",
      ambiguous,
      reason: ambiguous
        ? `gap is near ${winner.name} and ${alternatives.map((option) => option.name).join(", ")}; keep room routing under review`
        : `gap routed to ${winner.name} on the ${winner.side} side of the wall`,
    },
  };
}

function wallFaceId(vertical: boolean, x: number, y: number): string {
  const axis = vertical ? "V" : "H";
  const offset = Math.round((vertical ? x : y) / 6);
  return `${axis}-${offset}`;
}

function sortConfidence(confidence: "medium" | "low"): number {
  return confidence === "medium" ? 1 : 0;
}

function pageBounds(segments: readonly Segment[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const segment of segments) {
    width = Math.max(width, segment.x0, segment.x1);
    height = Math.max(height, segment.y0, segment.y1);
  }
  return { width, height };
}

function gapConfidence(
  envelopeSide: FloorPlanGapEnvelopeSide,
  routingConfidence: "medium" | "low",
): "medium" | "low" {
  if (envelopeSide !== "exterior") return "low";
  return routingConfidence;
}

function coveredOutdoorLabel(label: string | null | undefined): boolean {
  return /\b(alfresco|deck|patio|porch|outdoor|concrete|paving|driveway|covered\s+area)\b/i.test(
    label ?? "",
  );
}

function routeWithEnvelopeReview<T extends Pick<FloorPlanGapCandidate, "routing">>(
  route: T,
  envelopeSide: FloorPlanGapEnvelopeSide,
): T {
  if (envelopeSide === "exterior") return route;
  return {
    ...route,
    routing: {
      ...route.routing,
      confidence: "low",
      ambiguous: true,
      reason: `${route.routing.reason}; measured gap is on an ${envelopeSide} wall line, so it is review-only until exterior wall identity is proven`,
    },
  };
}

function routeWithCoveredOutdoorReview<
  T extends Pick<FloorPlanGapCandidate, "roomLabel" | "alternateRoomLabels" | "routing">,
>(route: T): T {
  const alternatives = route.alternateRoomLabels ?? [];
  const hasOnlyOutdoorArea =
    coveredOutdoorLabel(route.roomLabel) &&
    alternatives.every((label) => coveredOutdoorLabel(label));
  if (!hasOnlyOutdoorArea) return route;
  return {
    ...route,
    routing: {
      ...route.routing,
      confidence: "low",
      ambiguous: true,
      reason: `${route.routing.reason}; ${route.roomLabel} is covered/outdoor area evidence, not an internal room proving a building wall`,
    },
  };
}

export function detectFloorPlanGaps(args: {
  segments: readonly Segment[];
  scale: number;
  rooms?: readonly RoomPoint[];
}): FloorPlanGapCandidate[] {
  const ruler = createScaleRuler(args.scale);
  const axials = axialSegments(args.segments, args.scale);
  const rows = clusterRows(axials, args.scale);
  const gaps = rowGaps(rows, args.scale);
  const faceMin = ruler.mmToPdfPoints(60);
  const faceMax = ruler.mmToPdfPoints(320);
  const endpointTol = ruler.mmToPdfPoints(260);
  const envelopeSideOf = envelopeInteriorTest([...args.segments], pageBounds(args.segments));
  const candidates: FloorPlanGapCandidate[] = [];

  for (let i = 0; i < gaps.length; i++) {
    const a = gaps[i];
    for (let j = i + 1; j < gaps.length; j++) {
      const b = gaps[j];
      if (a.vertical !== b.vertical) continue;
      const faceGap = Math.abs(a.offset - b.offset);
      if (faceGap < faceMin || faceGap > faceMax) continue;
      if (Math.abs(a.lo - b.lo) > endpointTol || Math.abs(a.hi - b.hi) > endpointTol) continue;

      const lo = (a.lo + b.lo) / 2;
      const hi = (a.hi + b.hi) / 2;
      const widthMm = ruler.measureGapWidthMm((a.widthPt + b.widthPt) / 2);
      const x = a.vertical ? (a.offset + b.offset) / 2 : (lo + hi) / 2;
      const y = a.vertical ? (lo + hi) / 2 : (a.offset + b.offset) / 2;
      const baseRoute = routeRoom({
        rooms: args.rooms ?? [],
        x,
        y,
        lo,
        hi,
        vertical: a.vertical,
        scale: args.scale,
      });
      const envelopeSide = envelopeSideOf(x, y, a.vertical);
      const route = routeWithEnvelopeReview(routeWithCoveredOutdoorReview(baseRoute), envelopeSide);
      candidates.push({
        id: `floorplan-gap-${candidates.length + 1}`,
        widthMm,
        x,
        y,
        orientation: a.vertical ? "vertical" : "horizontal",
        wallFaceId: wallFaceId(a.vertical, x, y),
        wallThicknessMm: Math.round(ruler.pdfPointsToMm(faceGap)),
        envelopeSide,
        confidence: gapConfidence(envelopeSide, route.routing.confidence),
        ...route,
        note: route.roomLabel
          ? `measured floor-plan ${envelopeSide} wall gap near ${route.roomLabel}; ${route.routing.reason}; height still needs text/elevation/schedule confirmation`
          : "measured floor-plan wall gap; room and height still need confirmation",
      });
    }
  }

  const seen = new Set<string>();
  return candidates
    .sort(
      (a, b) =>
        sortConfidence(b.routing.confidence) - sortConfidence(a.routing.confidence) ||
        b.widthMm - a.widthMm,
    )
    .filter((candidate) => {
      const key = [
        candidate.orientation,
        Math.round(candidate.x / 6),
        Math.round(candidate.y / 6),
        Math.round(candidate.widthMm / 100),
      ].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 160)
    .map((candidate, index) => ({ ...candidate, id: `floorplan-gap-${index + 1}` }));
}
