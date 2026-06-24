import type { Segment } from "../doors/door-engine";
import { createScaleRuler } from "./scale-ruler";

export type ExteriorWallTraceRoom = {
  name: string;
  x: number;
  y: number;
  widthMm?: number | null;
  depthMm?: number | null;
};

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
  kind?: "opening" | "wall_face";
};

export type ExteriorWallTrace = {
  printedPerimeterM: number | null;
  tracedExteriorEvidenceM: number;
  bridgedExteriorEvidenceM: number;
  shortfallM: number | null;
  bridgedShortfallM: number | null;
  perimeterCandidateM: number;
  perimeterCandidateSource: "all_raw" | "all_bridged" | "medium_raw" | "medium_bridged";
  perimeterMeasurementTrusted: boolean;
  perimeterCandidateTrusted: boolean;
  runs: ExteriorWallRun[];
  breaks: ExteriorWallBreak[];
  perimeterRuns: ExteriorWallRun[];
  perimeterBridges: ExteriorWallBreak[];
  perimeterLine: ExteriorWallBreak[];
  perimeterLineM: number;
  visualLoopClosed: boolean;
};

type Axial = { vertical: boolean; offset: number; lo: number; hi: number };
type Ribbon = Axial & { thicknessMm: number; confidence: "medium" | "low" };
type Point = { x: number; y: number };
type PerimeterLine = ExteriorWallBreak & { runIndex?: number };
type PerimeterComponent = {
  lines: PerimeterLine[];
  runIndexes: Set<number>;
  score: number;
  lengthM: number;
  oddEndpointCount: number;
  closed: boolean;
};

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
  ribbon: Axial,
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

function sideRoomsStrict(
  ribbon: Axial,
  rooms: readonly ExteriorWallTraceRoom[],
  scale: number,
  side: 1 | -1,
) {
  const ruler = createScaleRuler(scale);
  const sideReach = ruler.mmToPdfPoints(3500);
  const spanPad = ruler.mmToPdfPoints(650);
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
  segments: readonly Segment[],
) {
  const ruler = createScaleRuler(scale);
  const runs: ExteriorWallRun[] = [];
  const bounds = pageBounds(segments);
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
  runs.push(...singleExteriorFaceRuns(segments, runs, rooms, scale));
  return filterPerimeterRuns(runs, bounds, rooms, scale).sort((a, b) => b.lengthM - a.lengthM);
}

function overlapsKnownRun(axial: Axial, runs: readonly ExteriorWallRun[], scale: number) {
  const ruler = createScaleRuler(scale);
  const offsetTol = ruler.mmToPdfPoints(360);
  const minOverlap = ruler.mmToPdfPoints(450);
  return runs.some((run) => {
    if (run.vertical !== axial.vertical) return false;
    if (Math.abs(run.outsideOffset - axial.offset) > offsetTol) return false;
    return Math.min(run.hi, axial.hi) - Math.max(run.lo, axial.lo) >= minOverlap;
  });
}

function axialEndpoints(axial: Axial) {
  return axial.vertical
    ? [
        { x: axial.offset, y: axial.lo },
        { x: axial.offset, y: axial.hi },
      ]
    : [
        { x: axial.lo, y: axial.offset },
        { x: axial.hi, y: axial.offset },
      ];
}

function runEndpoints(run: ExteriorWallRun) {
  return axialEndpoints({ vertical: run.vertical, offset: run.offset, lo: run.lo, hi: run.hi });
}

function connectsKnownRun(axial: Axial, runs: readonly ExteriorWallRun[], scale: number) {
  const ruler = createScaleRuler(scale);
  const tol = ruler.mmToPdfPoints(850);
  const endpoints = axialEndpoints(axial);
  const knownEndpoints = runs.filter((run) => run.lengthM >= 1.5).flatMap(runEndpoints);
  return endpoints.some((point) =>
    knownEndpoints.some((known) => Math.hypot(point.x - known.x, point.y - known.y) <= tol),
  );
}

function singleExteriorFaceRuns(
  segments: readonly Segment[],
  knownRuns: readonly ExteriorWallRun[],
  rooms: readonly ExteriorWallTraceRoom[],
  scale: number,
) {
  const ruler = createScaleRuler(scale);
  const minLen = ruler.mmToPdfPoints(900);
  const maxLen = ruler.mmToPdfPoints(9000);
  const runs: ExteriorWallRun[] = [];

  for (const axial of axialSegments(segments, scale)) {
    if (axial.hi - axial.lo < minLen) continue;
    if (axial.hi - axial.lo > maxLen) continue;
    if (overlapsKnownRun(axial, knownRuns, scale)) continue;
    if (!connectsKnownRun(axial, knownRuns, scale)) continue;
    const plus = sideRoomsStrict(axial, rooms, scale, 1);
    const minus = sideRoomsStrict(axial, rooms, scale, -1);
    if (plus.length > 0 === minus.length > 0) continue;
    const roomSide: 1 | -1 = plus.length > 0 ? 1 : -1;
    runs.push({
      ...axial,
      outsideOffset: axial.offset,
      roomSide,
      rooms: (roomSide === 1 ? plus : minus).map((room) => room.name),
      lengthM: Math.round((ruler.pdfPointsToMm(axial.hi - axial.lo) / 1000) * 100) / 100,
      thicknessMm: 0,
      confidence: "low",
    });
  }

  return runs;
}

function sameSpan(a: ExteriorWallRun, b: ExteriorWallRun, tol: number) {
  return (
    a.vertical === b.vertical &&
    Math.abs(a.lo - b.lo) <= tol &&
    Math.abs(a.hi - b.hi) <= tol
  );
}

function rejectDenseParallelFamilies(runs: readonly ExteriorWallRun[], scale: number) {
  const ruler = createScaleRuler(scale);
  const spanTol = ruler.mmToPdfPoints(350);
  const rejected = new Set<ExteriorWallRun>();
  const groups: ExteriorWallRun[][] = [];

  for (const run of runs) {
    let group = groups.find((candidate) => sameSpan(candidate[0], run, spanTol));
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(run);
  }

  for (const family of groups) {
    if (family.length < 4) continue;

    const offsets = family.map((candidate) => candidate.outsideOffset).sort((a, b) => a - b);
    const gaps = offsets.slice(1).map((offset, index) => offset - offsets[index]);
    const medianGap = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const regularGaps = gaps.filter((gap) => Math.abs(gap - medianGap) <= ruler.mmToPdfPoints(120));
    const spanM = ruler.pdfPointsToMm(Math.max(...offsets) - Math.min(...offsets)) / 1000;

    if ((regularGaps.length >= family.length - 2 || family.length >= 4) && spanM >= 0.8) {
      for (const candidate of family) rejected.add(candidate);
    }
  }

  return runs.filter((run) => !rejected.has(run));
}

function rejectNestedParallelShadows(runs: readonly ExteriorWallRun[], scale: number) {
  const ruler = createScaleRuler(scale);
  const offsetTol = ruler.mmToPdfPoints(650);
  const spanPad = ruler.mmToPdfPoints(120);
  return runs.filter((run) => {
    const shadowed = runs.some((candidate) => {
      if (candidate === run || candidate.vertical !== run.vertical) return false;
      if (candidate.lengthM < run.lengthM + 2) return false;
      if (Math.abs(candidate.outsideOffset - run.outsideOffset) > offsetTol) return false;
      return candidate.lo <= run.lo + spanPad && candidate.hi >= run.hi - spanPad;
    });
    return !shadowed;
  });
}

function rejectPageBorderArtifacts(
  runs: readonly ExteriorWallRun[],
  _bounds: { width: number; height: number },
  scale: number,
) {
  const ruler = createScaleRuler(scale);
  const margin = ruler.mmToPdfPoints(450);
  return runs.filter((run) => {
    return run.outsideOffset > margin;
  });
}

function rejectOverlongSingletonRuns(
  runs: readonly ExteriorWallRun[],
  rooms: readonly ExteriorWallTraceRoom[],
) {
  return runs.filter((run) => {
    if (run.rooms.length !== 1 || run.lengthM < 10) return true;
    const room = rooms.find((candidate) => candidate.name === run.rooms[0]);
    if (!room?.widthMm || !room.depthMm) return true;
    const maxRoomM = Math.max(room.widthMm, room.depthMm) / 1000;
    return run.lengthM <= maxRoomM * 1.8;
  });
}

function filterPerimeterRuns(
  runs: readonly ExteriorWallRun[],
  bounds: { width: number; height: number },
  rooms: readonly ExteriorWallTraceRoom[],
  scale: number,
) {
  return mergeCollinearRuns(
    rejectOverlongSingletonRuns(
      rejectNestedParallelShadows(
        rejectDenseParallelFamilies(rejectPageBorderArtifacts(runs, bounds, scale), scale),
        scale,
      ),
      rooms,
    ),
    scale,
  );
}

function mergeCollinearRuns(runs: readonly ExteriorWallRun[], scale: number) {
  const ruler = createScaleRuler(scale);
  const offsetTol = ruler.mmToPdfPoints(180);
  const gapTol = ruler.mmToPdfPoints(250);
  const sorted = [...runs].sort(
    (a, b) =>
      Number(a.vertical) - Number(b.vertical) ||
      a.outsideOffset - b.outsideOffset ||
      a.lo - b.lo ||
      b.lengthM - a.lengthM,
  );
  const merged: ExteriorWallRun[] = [];

  for (const run of sorted) {
    const existing = merged.find(
      (candidate) =>
        candidate.vertical === run.vertical &&
        Math.abs(candidate.outsideOffset - run.outsideOffset) <= offsetTol &&
        run.lo <= candidate.hi + gapTol &&
        run.hi >= candidate.lo - gapTol,
    );
    if (!existing) {
      merged.push({ ...run });
      continue;
    }
    existing.offset = (existing.offset + run.offset) / 2;
    existing.outsideOffset = (existing.outsideOffset + run.outsideOffset) / 2;
    existing.lo = Math.min(existing.lo, run.lo);
    existing.hi = Math.max(existing.hi, run.hi);
    existing.lengthM =
      Math.round((ruler.pdfPointsToMm(existing.hi - existing.lo) / 1000) * 100) / 100;
    existing.thicknessMm = Math.max(existing.thicknessMm, run.thicknessMm);
    existing.confidence =
      existing.confidence === "medium" || run.confidence === "medium" ? "medium" : "low";
    existing.rooms = Array.from(new Set([...existing.rooms, ...run.rooms]));
  }

  return merged;
}

function collinearBreaks(runs: readonly ExteriorWallRun[], scale: number): ExteriorWallBreak[] {
  const ruler = createScaleRuler(scale);
  const offsetTol = ruler.mmToPdfPoints(180);
  const minGap = ruler.mmToPdfPoints(350);
  const maxGap = ruler.mmToPdfPoints(3500);
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
        kind: "opening",
      });
    }
  }
  return breaks;
}

function runAsLine(run: ExteriorWallRun, runIndex: number): PerimeterLine {
  return {
    vertical: run.vertical,
    offset: run.outsideOffset,
    lo: run.lo,
    hi: run.hi,
    widthMm: Math.round(run.lengthM * 1000),
    kind: "wall_face",
    runIndex,
  };
}

function lineEndpoints(line: ExteriorWallBreak): [Point, Point] {
  return line.vertical
    ? [
        { x: line.offset, y: line.lo },
        { x: line.offset, y: line.hi },
      ]
    : [
        { x: line.lo, y: line.offset },
        { x: line.hi, y: line.offset },
      ];
}

function lineComponents(lines: readonly PerimeterLine[], snap: number): number[][] {
  if (lines.length === 0) return [];
  const toPointKey = (point: Point) => `${Math.round(point.x / snap)},${Math.round(point.y / snap)}`;
  const endpoints = new Map<string, number[]>();
  for (let index = 0; index < lines.length; index++) {
    const [start, end] = lineEndpoints(lines[index]);
    for (const point of [start, end]) {
      const key = toPointKey(point);
      const bucket = endpoints.get(key) ?? [];
      bucket.push(index);
      endpoints.set(key, bucket);
    }
  }

  const adjacency = lines.map(() => new Set<number>());
  for (const bucket of endpoints.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        adjacency[bucket[i]].add(bucket[j]);
        adjacency[bucket[j]].add(bucket[i]);
      }
    }
  }

  const visited = new Set<number>();
  const components: number[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);
    const component: number[] = [];
    const stack = [i];
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const next of adjacency[current]) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function evaluatePerimeterComponent(args: {
  lines: readonly PerimeterLine[];
  runs: readonly ExteriorWallRun[];
  scale: number;
}): PerimeterComponent {
  const ruler = createScaleRuler(args.scale);
  const snapSteps = [
    40,
    80,
    140,
    220,
    320,
    500,
  ];
  let bestClosed: PerimeterComponent | null = null;
  let bestAny: PerimeterComponent | null = null;

  for (let step = 0; step < snapSteps.length; step++) {
    const snap = snapSteps[step];
    const components = lineComponents(args.lines, snap);
    if (components.length === 0) continue;

  for (const componentIndexes of components) {
    const selected = componentIndexes.map((index) => args.lines[index]);
      const wallFaceLines = selected.filter((line) => line.kind !== "opening");
      if (wallFaceLines.length < 2) continue;

      const lengthM =
        Math.round(selected.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100;
      const closed = visualLoopClosed(selected, args.scale);
      const runIndexes = new Set<number>(
        selected
          .filter((line) => line.runIndex != null)
          .map((line) => line.runIndex!)
          .filter((runIndex) => runIndex >= 0 && runIndex < args.runs.length),
      );

      const roomNames = new Set<string>();
      for (const runIndex of runIndexes) {
        for (const room of args.runs[runIndex].rooms) roomNames.add(room);
      }

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const line of selected) {
          const [a, b] = lineEndpoints(line);
          minX = Math.min(minX, a.x, b.x);
          maxX = Math.max(maxX, a.x, b.x);
          minY = Math.min(minY, a.y, b.y);
          maxY = Math.max(maxY, a.y, b.y);
        }

      const nodeDegree = new Map<string, number>();
        for (const line of selected) {
          const [a, b] = lineEndpoints(line);
          const keyA = `${Math.round(a.x)},${Math.round(a.y)}`;
          const keyB = `${Math.round(b.x)},${Math.round(b.y)}`;
        nodeDegree.set(keyA, (nodeDegree.get(keyA) ?? 0) + 1);
        nodeDegree.set(keyB, (nodeDegree.get(keyB) ?? 0) + 1);
      }
      const oddEndpointCount = [...nodeDegree.values()].filter((count) => count % 2 !== 0).length;

      const areaMm2 =
        ruler.pdfPointsToMm(maxX - minX) *
        ruler.pdfPointsToMm(maxY - minY) *
        0.000001;
      const score =
        lengthM +
        (closed ? 4 : 0) +
        roomNames.size * 0.35 +
        wallFaceLines.length * 0.06 +
        (lengthM > 10 ? 1 : 0) -
        oddEndpointCount * 0.4 -
        step * 0.08;
      const componentStats: PerimeterComponent = {
        lines: selected,
        runIndexes,
        score,
        lengthM,
        oddEndpointCount,
        closed,
      };

      if (componentStats.closed) {
        if (!bestClosed || componentStats.score > bestClosed.score) {
          bestClosed = componentStats;
        }
      } else if (!bestAny || componentStats.score > bestAny.score) {
        bestAny = componentStats;
      }
    }
  }
  if (bestClosed) return bestClosed;

  if (bestAny) return bestAny;

  const allWallLines = args.lines.filter((line) => line.kind !== "opening");
  const allRunIndexes = new Set<number>();
  for (const line of allWallLines) {
    if (line.runIndex == null) continue;
    if (line.runIndex >= 0 && line.runIndex < args.runs.length) {
      allRunIndexes.add(line.runIndex);
    }
  }
  return {
    lines: [...allWallLines],
    runIndexes: allRunIndexes,
    score: 0,
    lengthM: Math.round(allWallLines.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100,
    oddEndpointCount: 0,
    closed: visualLoopClosed([...allWallLines], args.scale),
  };
}

function pickPerimeterComponent(args: {
  lines: readonly PerimeterLine[];
  runs: readonly ExteriorWallRun[];
  scale: number;
}): { lines: PerimeterLine[]; runIndexes: Set<number> } {
  const best = evaluatePerimeterComponent(args);
  return { lines: best.lines, runIndexes: best.runIndexes };
}

function visualLoopClosed(lines: readonly ExteriorWallBreak[], scale: number) {
  if (lines.length < 4) return false;
  const ruler = createScaleRuler(scale);
  const snap = ruler.mmToPdfPoints(650);
  const edges = lines.map((line) =>
    lineEndpoints(line).map((point) => ({
      x: Math.round(point.x / snap),
      y: Math.round(point.y / snap),
    })),
  );
  const counts = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  for (const [a, b] of edges) {
    const ka = `${a.x}:${a.y}`;
    const kb = `${b.x}:${b.y}`;
    if (ka === kb) continue;
    counts.set(ka, (counts.get(ka) ?? 0) + 1);
    counts.set(kb, (counts.get(kb) ?? 0) + 1);
    link(ka, kb);
  }
  const oddOrDangling = [...counts.values()].filter((count) => count % 2 !== 0).length;
  if (oddOrDangling !== 0 || adjacency.size === 0) return false;
  const [start] = adjacency.keys();
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const node = stack.pop()!;
    for (const next of adjacency.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen.size === adjacency.size;
}

export function traceExteriorWallEvidence(args: {
  segments: readonly Segment[];
  rooms: readonly ExteriorWallTraceRoom[];
  scale: number;
  printedPerimeterM?: number | null;
}): ExteriorWallTrace {
  const runs = exteriorRuns(
    thickWallRibbons(args.segments, args.scale),
    args.rooms,
    args.scale,
    args.segments,
  );
  const tracedExteriorEvidenceM =
    Math.round(runs.reduce((sum, run) => sum + run.lengthM, 0) * 100) / 100;
  const breaks = collinearBreaks(runs, args.scale);
  const mediumRuns = runs.filter((run) => run.confidence === "medium");
  const mediumBreaks = collinearBreaks(mediumRuns, args.scale);
  const mediumRawM = Math.round(mediumRuns.reduce((sum, run) => sum + run.lengthM, 0) * 100) / 100;
  const bridgeLengthM = (gaps: readonly ExteriorWallBreak[]) =>
    gaps.reduce(
      (sum, gap) => sum + createScaleRuler(args.scale).pdfPointsToMm(gap.hi - gap.lo) / 1000,
      0,
    );
  const bridgedExteriorEvidenceM =
    Math.round((tracedExteriorEvidenceM + bridgeLengthM(breaks)) * 100) / 100;
  const mediumBridgedM = Math.round((mediumRawM + bridgeLengthM(mediumBreaks)) * 100) / 100;
  const printedPerimeterM = args.printedPerimeterM ?? null;
  const candidates = [
    {
      source: "all_raw" as const,
      sourceScore: 1.0,
      value: tracedExteriorEvidenceM,
      runs,
      breaks: [],
    },
    {
      source: "all_bridged" as const,
      sourceScore: 1.2,
      value: bridgedExteriorEvidenceM,
      runs,
      breaks,
    },
    {
      source: "medium_raw" as const,
      sourceScore: 0.7,
      value: mediumRawM,
      runs: mediumRuns,
      breaks: [],
    },
    {
      source: "medium_bridged" as const,
      sourceScore: 1.1,
      value: mediumBridgedM,
      runs: mediumRuns,
      breaks: mediumBreaks,
    },
  ];
  const selectedPerimeter = candidates
    .filter((candidate) => candidate.value > 0)
    .map((candidate) => {
      const perimeterLines = [...candidate.runs.map((run, runIndex) => runAsLine(run, runIndex)), ...candidate.breaks];
      const perimeterComponent = evaluatePerimeterComponent({
        lines: perimeterLines,
        runs: candidate.runs,
        scale: args.scale,
      });
      return {
        ...candidate,
        perimeterLine: perimeterComponent.lines,
        perimeterRunIndexes: perimeterComponent.runIndexes,
        perimeterLineM: Math.round(
          perimeterComponent.lines.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100,
        ) / 100,
        score:
          perimeterComponent.score + candidate.sourceScore * 4 + (candidate.value > 0 ? 0.02 * candidate.value : 0),
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!selectedPerimeter) {
    const fallbackLines = [
      ...runs.map((run, runIndex) => runAsLine(run, runIndex)),
      ...breaks,
    ];
    const fallback = evaluatePerimeterComponent({ lines: fallbackLines, runs, scale: args.scale });
    return {
      printedPerimeterM,
      tracedExteriorEvidenceM,
      bridgedExteriorEvidenceM,
      shortfallM:
        printedPerimeterM == null
          ? null
          : Math.round((printedPerimeterM - tracedExteriorEvidenceM) * 100) / 100,
      bridgedShortfallM: null,
      perimeterCandidateM: Math.round(fallback.lines.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100,
      perimeterCandidateSource: "all_raw",
      perimeterMeasurementTrusted: printedPerimeterM == null ? true : Math.abs(printedPerimeterM - (Math.round(fallback.lines.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100)) <= 3,
      perimeterCandidateTrusted:
        printedPerimeterM == null
          ? false
          : Math.abs(
              printedPerimeterM -
                Math.round(fallback.lines.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100,
            ) <= 3 && visualLoopClosed(fallback.lines, args.scale),
      runs,
      breaks,
      perimeterRuns: runs,
      perimeterBridges: fallback.lines.filter((line) => line.kind === "opening"),
      perimeterLine: fallback.lines,
      perimeterLineM: Math.round(fallback.lines.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100,
      visualLoopClosed: visualLoopClosed(fallback.lines, args.scale),
    };
  }

  const selected = selectedPerimeter;
  const bridgedShortfallM =
    printedPerimeterM == null
      ? null
      : Math.round((printedPerimeterM - selected.value) * 100) / 100;
  const perimeterLine = selected.perimeterLine;
  const perimeterRunIndexes = selected.perimeterRunIndexes;
  const perimeterRuns = selected.source.startsWith("medium") ? mediumRuns : runs;
  const perimeterRunsInSelection = perimeterRuns.filter((_, index) => perimeterRunIndexes.has(index));
  const perimeterBridgesInSelection = perimeterLine.filter((line) => line.kind === "opening");
  const perimeterCandidateM =
    Math.round(perimeterLine.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100;
  const closed = visualLoopClosed(perimeterLine, args.scale);
  const perimeterLineM =
    Math.round(perimeterLine.reduce((sum, line) => sum + line.widthMm / 1000, 0) * 100) / 100;
  const measurementTrusted =
    printedPerimeterM == null ? true : Math.abs(printedPerimeterM - perimeterCandidateM) <= 3;
  const drawnLengthTrusted =
    printedPerimeterM == null || Math.abs(perimeterLineM - printedPerimeterM) <= 3;
  return {
    printedPerimeterM,
    tracedExteriorEvidenceM,
    bridgedExteriorEvidenceM,
    shortfallM:
      printedPerimeterM == null
        ? null
        : Math.round((printedPerimeterM - tracedExteriorEvidenceM) * 100) / 100,
    bridgedShortfallM,
    perimeterCandidateM,
    perimeterCandidateSource: selected.source,
    perimeterMeasurementTrusted: measurementTrusted,
    perimeterCandidateTrusted: measurementTrusted && closed && drawnLengthTrusted,
    runs,
    breaks,
    perimeterRuns: perimeterRunsInSelection,
    perimeterBridges: perimeterBridgesInSelection,
    perimeterLine,
    perimeterLineM,
    visualLoopClosed: closed,
  };
}
