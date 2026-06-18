import type { Segment } from "../doors/door-engine";

export type FloorPlanGapCandidate = {
  id: string;
  widthMm: number;
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
  wallThicknessMm: number;
  confidence: "medium" | "low";
  roomLabel?: string | null;
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

const PT_PER_MM = 72 / 25.4;
const ptToMm = (pt: number, scale: number) => (pt / PT_PER_MM) * scale;
const mmToPt = (mm: number, scale: number) => (mm / scale) * PT_PER_MM;

function axialSegments(segments: readonly Segment[], scale: number): Axial[] {
  const minLen = mmToPt(250, scale);
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
  const rowTol = Math.max(mmToPt(35, scale), 1.2);
  const joinTol = Math.max(mmToPt(45, scale), 1.2);
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
  const minGap = mmToPt(350, scale);
  const maxGap = mmToPt(6500, scale);
  const minJamb = mmToPt(180, scale);
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

function nearestRoom(
  rooms: readonly RoomPoint[],
  x: number,
  y: number,
  scale: number,
): string | null {
  const maxDist = mmToPt(5500, scale);
  let best: { name: string; d: number } | null = null;
  for (const room of rooms) {
    const d = Math.hypot(room.x - x, room.y - y);
    if (d > maxDist) continue;
    if (!best || d < best.d) best = { name: room.name, d };
  }
  return best?.name ?? null;
}

export function detectFloorPlanGaps(args: {
  segments: readonly Segment[];
  scale: number;
  rooms?: readonly RoomPoint[];
}): FloorPlanGapCandidate[] {
  const axials = axialSegments(args.segments, args.scale);
  const rows = clusterRows(axials, args.scale);
  const gaps = rowGaps(rows, args.scale);
  const faceMin = mmToPt(60, args.scale);
  const faceMax = mmToPt(320, args.scale);
  const endpointTol = mmToPt(260, args.scale);
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
      const widthMm = Math.round(ptToMm((a.widthPt + b.widthPt) / 2, args.scale));
      const x = a.vertical ? (a.offset + b.offset) / 2 : (lo + hi) / 2;
      const y = a.vertical ? (lo + hi) / 2 : (a.offset + b.offset) / 2;
      const roomLabel = nearestRoom(args.rooms ?? [], x, y, args.scale);
      const confidence: "medium" | "low" = roomLabel ? "medium" : "low";
      candidates.push({
        id: `floorplan-gap-${candidates.length + 1}`,
        widthMm,
        x,
        y,
        orientation: a.vertical ? "vertical" : "horizontal",
        wallThicknessMm: Math.round(ptToMm(faceGap, args.scale)),
        confidence,
        roomLabel,
        note: roomLabel
          ? `measured floor-plan wall gap near ${roomLabel}; height still needs text/elevation/schedule confirmation`
          : "measured floor-plan wall gap; room and height still need confirmation",
      });
    }
  }

  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.confidence.localeCompare(a.confidence) || b.widthMm - a.widthMm)
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
