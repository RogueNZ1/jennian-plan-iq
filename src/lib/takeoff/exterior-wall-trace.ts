import type { Segment } from "../doors/door-engine";
import { createScaleRuler } from "./scale-ruler";

export type ExteriorWallTraceRoom = { name: string; x: number; y: number };

export type ExteriorWallRun = {
  vertical: boolean;
  offset: number;
  lo: number;
  hi: number;
  outsideOffset: number;
  roomSide: 1 | -1;
  rooms: string[];
  lengthM: number;
  thicknessMm: number;
  confidence: "medium" | "low";
};

export type ExteriorWallBreak = {
  vertical: boolean;
  offset: number;
  lo: number;
  hi: number;
  widthMm: number;
};

export type ExteriorWallTrace = {
  printedPerimeterM: number | null;
  tracedExteriorEvidenceM: number;
  shortfallM: number | null;
  runs: ExteriorWallRun[];
  breaks: ExteriorWallBreak[];
};

type Axial = { vertical: boolean; offset: number; lo: number; hi: number };
type Ribbon = Axial & { thicknessMm: number; confidence: "medium" | "low" };

function pageBounds(segments: readonly Segment[]) {
  let width = 0;
  let height = 0;
  for (const segment of segments) {
    width = Math.max(width, segment.x0, segment.x1);
    height = Math.max(height, segment.y0, segment.y1);
  }
  return { width, height };
}

function axialSegments(segments: readonly Segment[], scale: number): Axial[] {
  const ruler = createScaleRuler(scale);
  const minLen = ruler.mmToPdfPoints(450);
  const axials: Axial[] = [];
  for (const segment of segments) {
    const dx = segment.x1 - segment.x0;
    const dy = segment.y1 - segment.y0;
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;

    if (Math.abs(dy) <= Math.abs(dx) * 0.04) {
      axials.push({
        vertical: false,
        offset: (segment.y0 + segment.y1) / 2,
        lo: Math.min(segment.x0, segment.x1),
        hi: Math.max(segment.x0, segment.x1),
      });
    } else if (Math.abs(dx) <= Math.abs(dy) * 0.04) {
      axials.push({
        vertical: true,
        offset: (segment.x0 + segment.x1) / 2,
        lo: Math.min(segment.y0, segment.y1),
        hi: Math.max(segment.y0, segment.y1),
      });
    }
  }
  return axials;
}

function thickWallRibbons(segments: readonly Segment[], scale: number): Ribbon[] {
  const ruler = createScaleRuler(scale);
  const minSpacing = ruler.mmToPdfPoints(140);
  const maxSpacing = ruler.mmToPdfPoints(320);
  const minOverlap = ruler.mmToPdfPoints(800);
  const joinGap = ruler.mmToPdfPoints(300);
  const offsetTol = ruler.mmToPdfPoints(80);
  const axials = axialSegments(segments, scale);
  const pieces: Ribbon[] = [];

  for (const vertical of [false, true]) {
    const oriented = axials.filter((axial) => axial.vertical === vertical);
    oriented.sort((a, b) => a.offset - b.offset);
    const candidates: Array<{
      i: number;
      j: number;
      spacing: number;
      lo: number;
      hi: number;
      overlap: number;
    }> = [];

    for (let i = 0; i < oriented.length; i++) {
      for (let j = i + 1; j < oriented.length; j++) {
        const spacing = oriented[j].offset - oriented[i].offset;
        if (spacing > maxSpacing) break;
        if (spacing < minSpacing) continue;
        const lo = Math.max(oriented[i].lo, oriented[j].lo);
        const hi = Math.min(oriented[i].hi, oriented[j].hi);
        const overlap = hi - lo;
        if (overlap < minOverlap) continue;
        candidates.push({ i, j, spacing, lo, hi, overlap });
      }
    }

    candidates.sort((a, b) => b.overlap - a.overlap || a.spacing - b.spacing);
    const taken = new Set<number>();
    for (const candidate of candidates) {
      if (taken.has(candidate.i) || taken.has(candidate.j)) continue;
      taken.add(candidate.i);
      taken.add(candidate.j);
      pieces.push({
        vertical,
        offset: (oriented[candidate.i].offset + oriented[candidate.j].offset) / 2,
        lo: candidate.lo,
        hi: candidate.hi,
        thicknessMm: Math.round(ruler.pdfPointsToMm(candidate.spacing)),
        confidence: "medium",
      });
    }
  }

  const used = new Array(pieces.length).fill(false);
  const merged: Ribbon[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (used[i]) continue;
    const base = { ...pieces[i] };
    used[i] = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < pieces.length; j++) {
        if (used[j]) continue;
        const piece = pieces[j];
        if (piece.vertical !== base.vertical) continue;
        if (Math.abs(piece.offset - base.offset) > offsetTol) continue;
        if (piece.lo > base.hi + joinGap || piece.hi < base.lo - joinGap) continue;
        base.lo = Math.min(base.lo, piece.lo);
        base.hi = Math.max(base.hi, piece.hi);
        base.thicknessMm = Math.round((base.thicknessMm + piece.thicknessMm) / 2);
        used[j] = true;
        grew = true;
      }
    }
    merged.push(base);
  }

  const bounds = pageBounds(segments);
  return merged.filter((ribbon) => {
    const x0 = ribbon.vertical ? ribbon.offset : ribbon.lo;
    const x1 = ribbon.vertical ? ribbon.offset : ribbon.hi;
    const y0 = ribbon.vertical ? ribbon.lo : ribbon.offset;
    const y1 = ribbon.vertical ? ribbon.hi : ribbon.offset;
    return x1 >= 0 && y1 >= 0 && x0 <= bounds.width && y0 <= bounds.height;
  });
}

function sideRooms(
  ribbon: Ribbon,
  rooms: readonly ExteriorWallTraceRoom[],
  scale: number,
  side: 1 | -1,
) {
  const ruler = createScaleRuler(scale);
  const sideReach = ruler.mmToPdfPoints(6500);
  const spanPad = ruler.mmToPdfPoints(1500);
  return rooms.filter((room) => {
    const along = ribbon.vertical ? room.y : room.x;
    const off = ribbon.vertical ? room.x : room.y;
    if (along < ribbon.lo - spanPad || along > ribbon.hi + spanPad) return false;
    const distance = (off - ribbon.offset) * side;
    return distance > 0 && distance <= sideReach;
  });
}

function exteriorRuns(
  ribbons: readonly Ribbon[],
  rooms: readonly ExteriorWallTraceRoom[],
  scale: number,
) {
  const ruler = createScaleRuler(scale);
  const runs: ExteriorWallRun[] = [];
  for (const ribbon of ribbons) {
    const plus = sideRooms(ribbon, rooms, scale, 1);
    const minus = sideRooms(ribbon, rooms, scale, -1);
    if (plus.length > 0 === minus.length > 0) continue;
    const roomSide: 1 | -1 = plus.length > 0 ? 1 : -1;
    const outsideSide = -roomSide;
    const outsideOffset =
      ribbon.offset + outsideSide * ruler.mmToPdfPoints(Math.max(ribbon.thicknessMm, 140) / 2);
    runs.push({
      ...ribbon,
      roomSide,
      outsideOffset,
      rooms: (roomSide === 1 ? plus : minus).map((room) => room.name),
      lengthM: Math.round((ruler.pdfPointsToMm(ribbon.hi - ribbon.lo) / 1000) * 100) / 100,
    });
  }
  return runs.sort((a, b) => b.lengthM - a.lengthM);
}

function collinearBreaks(runs: readonly ExteriorWallRun[], scale: number): ExteriorWallBreak[] {
  const ruler = createScaleRuler(scale);
  const offsetTol = ruler.mmToPdfPoints(180);
  const minGap = ruler.mmToPdfPoints(350);
  const maxGap = ruler.mmToPdfPoints(6500);
  const breaks: ExteriorWallBreak[] = [];
  const groups: ExteriorWallRun[][] = [];
  for (const run of runs) {
    let group = groups.find(
      (candidate) =>
        candidate[0].vertical === run.vertical &&
        Math.abs(candidate[0].outsideOffset - run.outsideOffset) <= offsetTol,
    );
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(run);
  }

  for (const group of groups) {
    group.sort((a, b) => a.lo - b.lo);
    for (let i = 0; i < group.length - 1; i++) {
      const a = group[i];
      const b = group[i + 1];
      const gap = b.lo - a.hi;
      if (gap < minGap || gap > maxGap) continue;
      breaks.push({
        vertical: a.vertical,
        offset: (a.outsideOffset + b.outsideOffset) / 2,
        lo: a.hi,
        hi: b.lo,
        widthMm: Math.round(ruler.pdfPointsToMm(gap)),
      });
    }
  }
  return breaks;
}

export function traceExteriorWallEvidence(args: {
  segments: readonly Segment[];
  rooms: readonly ExteriorWallTraceRoom[];
  scale: number;
  printedPerimeterM?: number | null;
}): ExteriorWallTrace {
  const runs = exteriorRuns(thickWallRibbons(args.segments, args.scale), args.rooms, args.scale);
  const tracedExteriorEvidenceM =
    Math.round(runs.reduce((sum, run) => sum + run.lengthM, 0) * 100) / 100;
  const printedPerimeterM = args.printedPerimeterM ?? null;
  return {
    printedPerimeterM,
    tracedExteriorEvidenceM,
    shortfallM:
      printedPerimeterM == null
        ? null
        : Math.round((printedPerimeterM - tracedExteriorEvidenceM) * 100) / 100,
    runs,
    breaks: collinearBreaks(runs, args.scale),
  };
}
