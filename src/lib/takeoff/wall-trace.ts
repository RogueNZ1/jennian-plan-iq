/**
 * Ribbon-trace v1 (13 Jun 2026) — interior wall length from the vector layer.
 *
 * Physics, probed and confirmed on West Street + Alexandra: every interior
 * partition is drawn as a PARALLEL SEGMENT PAIR at 90 mm scaled spacing (2.5–2.6 pt
 * at 1:100, measured on the robe walls tonight). Exterior brick-veneer walls are
 * ~190–270 mm thick — they fail the spacing filter entirely, so interior walls are
 * measured DIRECTLY, no perimeter subtraction, no envelope classification.
 *
 * Method: for each axis-aligned segment, find partners at interior-wall spacing
 * with along-axis overlap; each overlapping stretch is a RIBBON. Ribbons are
 * merged per centerline (same axis, same offset band) so double-struck linework
 * and split segments never double-count. Total centerline length × scale = lm.
 *
 * Honesty rails: v1 reports with source "vector" and an explicit verify flag.
 * The QS export suppression on internal walls REMAINS until the number has been
 * validated against hand measurements on live jobs — a new measurement does not
 * get pricing authority on day one.
 */
import type { Segment } from "../doors/door-engine";

export type WallTrace = {
  internalWallLm: number;
  ribbonCount: number;
  /** merged centerline ribbons in page space — for overlays and benches */
  ribbons: Array<{ vertical: boolean; offset: number; lo: number; hi: number; lengthPt: number }>;
};

const ptToMm = (pt: number, scale: number) => (pt * 25.4 * scale) / 72;
const mmToPt = (mm: number, scale: number) => (mm / scale) * (72 / 25.4);

type Band = { vertical: boolean; offset: number; lo: number; hi: number };

export function traceInteriorWalls(
  segments: Segment[],
  scale: number,
  roomPoints: Array<{ x: number; y: number }>,
): WallTrace {
  const pairLo = mmToPt(70, scale);
  const pairHi = mmToPt(115, scale);
  const minLen = mmToPt(350, scale); // ignore door-leaf / tick scraps

  type Ax = { vertical: boolean; offset: number; lo: number; hi: number };
  const axials: Ax[] = [];
  for (const s of segments) {
    const dx = s.x1 - s.x0,
      dy = s.y1 - s.y0;
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;
    if (Math.abs(dy) <= Math.abs(dx) * 0.08) {
      axials.push({
        vertical: false,
        offset: (s.y0 + s.y1) / 2,
        lo: Math.min(s.x0, s.x1),
        hi: Math.max(s.x0, s.x1),
      });
    } else if (Math.abs(dx) <= Math.abs(dy) * 0.08) {
      axials.push({
        vertical: true,
        offset: (s.x0 + s.x1) / 2,
        lo: Math.min(s.y0, s.y1),
        hi: Math.max(s.y0, s.y1),
      });
    }
  }

  // Density caps — belt AND braces with the sweep. A trace that cannot finish
  // fast must not run at all: the takeoff's wall number degrades to the honest
  // pre-v1 state (suppressed / measure manually), the run COMPLETES.
  const AXIAL_CAP = 30000;
  if (axials.length > AXIAL_CAP) {
    console.warn(
      `[wall-trace] ${axials.length} axial segments exceeds the v1 density cap (${AXIAL_CAP}) — trace skipped, internal walls fall back to suppressed.`,
    );
    return { internalWallLm: 0, ribbonCount: 0, ribbons: [] };
  }

  // EXCLUSIVE nearest-partner pairing: each face marries exactly once, to the
  // partner with the best overlap at the closest spacing. Combinatorial pairing
  // (every face × every face) measured 833 lm on West Street; exclusivity is the
  // difference between a wall and a moiré pattern.
  //
  // PERF (13 Jun 2026, the prelim-set hang): candidate generation is a SWEEP —
  // axials sorted by offset per orientation, each compared only inside its
  // pairHi window. O(n²) on a full working drawing (bracing + hatching +
  // dimension forests = tens of thousands of axials) locked the browser solid
  // and left two runs stuck at 'running' with NULL payloads. Never again: sweep
  // + a hard density cap that SKIPS the trace (fail-safe null) instead of
  // hanging the takeoff.
  type Cand = { i: number; j: number; gap: number; lo: number; hi: number; overlap: number };
  const cands: Cand[] = [];
  const order = axials.map((_, i) => i).sort((p, q) => axials[p].offset - axials[q].offset);
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    const a = axials[i];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj];
      const b = axials[j];
      const gap = b.offset - a.offset; // sorted → non-negative
      if (gap > pairHi) break; // sweep window closed
      if (a.vertical !== b.vertical || gap < pairLo) continue;
      const lo = Math.max(a.lo, b.lo),
        hi = Math.min(a.hi, b.hi);
      if (hi - lo < minLen) continue;
      cands.push({ i, j, gap, lo, hi, overlap: hi - lo });
    }
  }
  const CAND_CAP = 120000;
  const PIECE_CAP = 4000;
  if (cands.length > CAND_CAP) {
    console.warn(`[wall-trace] ${cands.length} pair candidates exceeds cap — trace skipped.`);
    return { internalWallLm: 0, ribbonCount: 0, ribbons: [] };
  }
  cands.sort((p, q) => q.overlap - p.overlap || p.gap - q.gap);
  const taken = new Set<number>();
  const pieces: Band[] = [];
  for (const c of cands) {
    if (taken.has(c.i) || taken.has(c.j)) continue;
    taken.add(c.i);
    taken.add(c.j);
    const a = axials[c.i];
    pieces.push({
      vertical: a.vertical,
      offset: (a.offset + axials[c.j].offset) / 2,
      lo: c.lo,
      hi: c.hi,
    });
  }

  if (pieces.length > PIECE_CAP) {
    console.warn(
      `[wall-trace] ${pieces.length} ribbon pieces exceeds cap — trace skipped (the merge and component passes are quadratic).`,
    );
    return { internalWallLm: 0, ribbonCount: 0, ribbons: [] };
  }

  // merge pieces on the same centerline (offset within half a wall) — overlapping
  // or near-touching stretches join; duplicates from double-struck linework vanish.
  const joinGap = mmToPt(160, scale);
  const offTol = mmToPt(55, scale);
  const merged: Band[] = [];
  const used = new Array(pieces.length).fill(false);
  for (let i = 0; i < pieces.length; i++) {
    if (used[i]) continue;
    const base = { ...pieces[i] };
    used[i] = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < pieces.length; j++) {
        if (used[j]) continue;
        const p = pieces[j];
        if (p.vertical !== base.vertical || Math.abs(p.offset - base.offset) > offTol) continue;
        if (p.lo > base.hi + joinGap || p.hi < base.lo - joinGap) continue;
        base.lo = Math.min(base.lo, p.lo);
        base.hi = Math.max(base.hi, p.hi);
        used[j] = true;
        grew = true;
      }
    }
    merged.push(base);
  }

  // LARGEST CONNECTED COMPONENT: the house's wall grid is ONE network — every
  // real wall reaches every other through corners and Ts. Furniture rectangles,
  // kitchen islands, dim chains and hatch rows form their own small floating
  // components and die here. (A simple touches-a-perpendicular test is fooled by
  // any rectangle — a box touches its own edges.)
  const touch = mmToPt(220, scale);
  const touches = (r: Band, o: Band): boolean => {
    if (r.vertical === o.vertical) {
      return Math.abs(r.offset - o.offset) <= touch && r.lo <= o.hi + touch && r.hi >= o.lo - touch;
    }
    // perpendicular: o crosses near r's span, r crosses near o's span
    return (
      o.offset >= r.lo - touch &&
      o.offset <= r.hi + touch &&
      r.offset >= o.lo - touch &&
      r.offset <= o.hi + touch
    );
  };
  const comp = new Array(merged.length).fill(-1);
  let nComp = 0;
  for (let i = 0; i < merged.length; i++) {
    if (comp[i] !== -1) continue;
    const stack = [i];
    comp[i] = nComp;
    while (stack.length) {
      const k = stack.pop()!;
      for (let j = 0; j < merged.length; j++) {
        if (comp[j] === -1 && touches(merged[k], merged[j])) {
          comp[j] = nComp;
          stack.push(j);
        }
      }
    }
    nComp++;
  }
  // Pick the component WHERE THE ROOMS ARE — raw length chooses wrong (the North
  // compass rose's concentric arcs out-length the house grid on West Street).
  // Score = room labels inside the component's expanded bbox; length breaks ties.
  const pad = mmToPt(400, scale);
  const compBox = Array.from({ length: nComp }, () => ({
    x0: Infinity,
    y0: Infinity,
    x1: -Infinity,
    y1: -Infinity,
    len: 0,
  }));
  for (let i = 0; i < merged.length; i++) {
    const b = merged[i],
      c = compBox[comp[i]];
    const x0 = b.vertical ? b.offset : b.lo,
      x1 = b.vertical ? b.offset : b.hi,
      y0 = b.vertical ? b.lo : b.offset,
      y1 = b.vertical ? b.hi : b.offset;
    c.x0 = Math.min(c.x0, x0);
    c.x1 = Math.max(c.x1, x1);
    c.y0 = Math.min(c.y0, y0);
    c.y1 = Math.max(c.y1, y1);
    c.len += b.hi - b.lo;
  }
  let mainComp = 0,
    bestScore = -1,
    bestLen = -1;
  for (let c = 0; c < nComp; c++) {
    const box = compBox[c];
    const score = roomPoints.filter(
      (p) =>
        p.x >= box.x0 - pad && p.x <= box.x1 + pad && p.y >= box.y0 - pad && p.y <= box.y1 + pad,
    ).length;
    if (score > bestScore || (score === bestScore && box.len > bestLen)) {
      bestScore = score;
      bestLen = box.len;
      mainComp = c;
    }
  }
  const grid = merged.filter((_, i) => comp[i] === mainComp);

  // EXTERIOR DETECTION via ROOM LABELS: an interior partition separates two
  // rooms — there are room labels on BOTH sides of it. A perimeter wall has the
  // world on its outward side: no label. L-shapes can't fool this (the lounge
  // block being "beyond" the main top wall fooled the geometric beyond-test —
  // 360 lm), and the plan prints its labels for free.
  const sideReach = mmToPt(6000, scale);
  const spanPad = mmToPt(1500, scale);
  const hasRoomOnSide = (r: Band, side: 1 | -1): boolean =>
    roomPoints.some((p) => {
      const along = r.vertical ? p.y : p.x;
      const off = r.vertical ? p.x : p.y;
      if (along < r.lo - spanPad || along > r.hi + spanPad) return false;
      const d = (off - r.offset) * side;
      return d > 0 && d <= sideReach;
    });
  const interior =
    roomPoints.length >= 3 ? grid.filter((r) => hasRoomOnSide(r, 1) && hasRoomOnSide(r, -1)) : grid; // too few labels to judge — return the grid, the verify flag carries it

  // STACK COLLAPSE: a physical wall is ONE centerline. Shelving lines inside
  // cupboards pair with the cupboard walls and stack phantom parallels at
  // 100–300 mm offsets — any ribbon overlapping ≥60% with a LONGER parallel
  // within 300 mm is the same wall (or its furniture) and folds into it.
  const stack = mmToPt(300, scale);
  const byLen = [...interior].sort((a, b) => b.hi - b.lo - (a.hi - a.lo));
  const kept: Band[] = [];
  for (const r of byLen) {
    const dup = kept.some((k) => {
      if (k.vertical !== r.vertical || Math.abs(k.offset - r.offset) > stack) return false;
      const ov = Math.min(k.hi, r.hi) - Math.max(k.lo, r.lo);
      return ov >= 0.6 * (r.hi - r.lo);
    });
    if (!dup) kept.push(r);
  }

  const ribbons = kept.map((b) => ({ ...b, lengthPt: b.hi - b.lo }));
  const totalMm = ribbons.reduce((acc, r) => acc + ptToMm(r.lengthPt, scale), 0);
  return {
    internalWallLm: Math.round((totalMm / 1000) * 10) / 10,
    ribbonCount: ribbons.length,
    ribbons,
  };
}
