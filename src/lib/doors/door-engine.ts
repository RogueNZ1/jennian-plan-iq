/**
 * Jennian IQ — Interior Door Engine
 * ----------------------------------
 * Deterministic interior-door detection from CAD-produced floor plan PDFs.
 * No AI in the detection path. Vision crop re-read is only ever needed for
 * items this engine flags as ambiguous.
 *
 * How it works (validated on the Alexandra, Lot 96 Kanzan Grove — 17/17):
 *   1. Jennian plans annotate every door leaf width in the PDF text layer
 *      (810, 760, 710, 510, 1620 ...) at the opening. These are the anchors.
 *   2. Hinged doors have a swing arc in the vector layer. Qt-produced PDFs
 *      draw arcs as polyline segments, so we circle-fit polylines and keep
 *      fits at door-leaf radius.
 *   3. Classification:
 *        width label + matching-radius arc            -> hinged single
 *        single-leaf width label, no arc              -> cavity slider
 *        double-leaf width label (2 leaves), no arc   -> double doors
 *   4. Envelope exclusion: a door on a perimeter (exterior) wall belongs to
 *      GLAZING, never to this engine's output. Exterior side of an exterior
 *      wall has near-zero drawing density; interior doors have geometry on
 *      both sides. Doors failing the interior test are silently routed out
 *      (the glazing/window engine owns them).
 *   5. Anything in-range that cannot be confidently classified is FLAGGED,
 *      never silently filled — same fail-safe discipline as the window gate.
 *
 * QS mapping (5. Data Input House): hinged singles -> H187, doubles -> H192
 * (or wardrobe spec line, see config.wardrobeDoublesRouting), cavity -> H193.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type Pt = { x: number; y: number };

/** A straight vector segment from the page content stream (page space, y-down, pdf points). */
export type Segment = { x0: number; y0: number; x1: number; y1: number };

/** A reconstructed text token with its centre position (page space, y-down). */
export type TextLabel = {
  text: string;
  x: number;
  y: number;
  /** true when the glyph run is rotated (vertical wall annotation) */
  vertical: boolean;
};

export type PageGeometry = {
  width: number;
  height: number;
  labels: TextLabel[];
  segments: Segment[];
  /** subpath polylines, structure preserved — arcs are clean subpaths in CAD output */
  polylines: Pt[][];
};

export type DoorType = "hinged" | "double" | "cavity";

export type DoorHit = {
  type: DoorType;
  /** leaf width in mm as printed on the plan (doubles report the opening, e.g. 1620) */
  widthMm: number;
  /** page-space position (pdf points, y-down) — used for the review overlay */
  x: number;
  y: number;
  /** for hinged: fitted arc radius in mm for cross-check display */
  arcMm?: number;
  confidence: "confirmed" | "flag";
  note?: string;
};

export type DoorEngineResult = {
  hinged: DoorHit[];
  doubles: DoorHit[];
  cavity: DoorHit[];
  /** ambiguous candidates → estimator review / vision crop re-read */
  flags: DoorHit[];
  /** QS-ready counts (flags NOT included — fail safe) */
  counts: { singles: number; doubles: number; cavitySliders: number; barn: number };
};

export type DoorEngineConfig = {
  /** plan scale denominator, e.g. 100 for 1:100. From the title block / scale engine. */
  scale: number;
  /** route wardrobe/linen doubles to H192 ("doors") or the wardrobe spec line */
  wardrobeDoublesRouting: "doors" | "wardrobe_spec";
  /** single-leaf width range in mm (510 cupboard doors are real — do not narrow this) */
  leafMinMm: number;
  leafMaxMm: number;
  /** double-opening width range in mm (2 leaves) */
  doubleMinMm: number;
  doubleMaxMm: number;
};

export const DEFAULT_CONFIG: DoorEngineConfig = {
  scale: 100,
  wardrobeDoublesRouting: "doors",
  leafMinMm: 450,
  leafMaxMm: 920,  // wider leaves (1030 entry) are entrance doors -> glazing
  doubleMinMm: 1150,
  doubleMaxMm: 2100,
};

// ── Unit helpers ───────────────────────────────────────────────────────────

const PT_PER_MM = 72 / 25.4;
/** real-world mm → drawn pdf points at the given scale */
const mmToPt = (mm: number, scale: number) => (mm / scale) * PT_PER_MM;
const ptToMm = (pt: number, scale: number) => (pt / PT_PER_MM) * scale;
const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

// ── Arc recovery: circle-fit polylines (Kåsa fit) ──────────────────────────

type Arc = { x: number; y: number; r: number; nPts: number; span: number };

function fitCircle(pts: Pt[]): { cx: number; cy: number; r: number; res: number } | null {
  const n = pts.length;
  if (n < 4) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (const p of pts) {
    const u = p.x - mx, v = p.y - my;
    Suu += u * u; Svv += v * v; Suv += u * v;
    Suuu += u * u * u; Svvv += v * v * v;
    Suvv += u * v * v; Svuu += v * u * u;
  }
  const det = 2 * (Suu * Svv - Suv * Suv);
  if (Math.abs(det) < 1e-9) return null;
  const uc = (Svv * (Suuu + Suvv) - Suv * (Svvv + Svuu)) / det;
  const vc = (Suu * (Svvv + Svuu) - Suv * (Suuu + Suvv)) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / n);
  const cx = uc + mx, cy = vc + my;
  const res = pts.reduce((s, p) => s + Math.abs(dist(p.x, p.y, cx, cy) - r), 0) / n;
  return { cx, cy, r, res };
}

/**
 * Recover door-swing arcs. CAD exporters (Qt et al.) emit arcs as polyline
 * subpaths — bezier hunting finds nothing, and proximity-chaining flat
 * segments corrupts fits with neighbouring geometry (hatching, leaf lines).
 * Path structure is preserved by the adapter; each subpath is fit directly.
 */
export function recoverArcs(
  polylines: Pt[][],
  cfg: DoorEngineConfig
): Arc[] {
  const rMin = mmToPt(cfg.leafMinMm, cfg.scale) * 0.88;
  const rMax = mmToPt(cfg.leafMaxMm, cfg.scale) * 1.12;
  const arcs: Arc[] = [];
  for (const chain of polylines) {
    if (chain.length < 5 || chain.length > 140) continue;
    // reject if any individual segment is long (straight runs aren't arcs)
    let longSeg = false;
    for (let i = 1; i < chain.length; i++)
      if (dist(chain[i - 1].x, chain[i - 1].y, chain[i].x, chain[i].y) > 8) { longSeg = true; break; }
    if (longSeg) continue;
    const f = fitCircle(chain);
    if (!f) continue;
    if (f.res > 0.35) continue;
    if (f.r < rMin || f.r > rMax) continue;
    const span = dist(chain[0].x, chain[0].y, chain[chain.length - 1].x, chain[chain.length - 1].y);
    if (span < 0.35 * f.r) continue;
    arcs.push({ x: f.cx, y: f.cy, r: f.r, nPts: chain.length, span });
  }
  // cluster duplicates: same arc split across subpaths has the SAME radius.
  // Neighbouring doors can have arc centres <12pt apart (hall linen vs bed 2),
  // so proximity alone must never merge — radius must match too.
  const clustered: Arc[] = [];
  for (const a of arcs) {
    const c = clustered.find((c) => dist(c.x, c.y, a.x, a.y) < 12 && Math.abs(c.r - a.r) < 2.5);
    if (c) {
      if (a.nPts > c.nPts) { c.x = a.x; c.y = a.y; c.r = a.r; c.nPts = a.nPts; c.span = a.span; }
    } else clustered.push({ ...a });
  }
  return clustered;
}

// ── Label parsing ──────────────────────────────────────────────────────────

type WidthLabel = { mm: number; x: number; y: number; vertical: boolean; kind: "single" | "double" };

/**
 * Standalone numeric width labels only. "1 300x1 500" (windows, WxH) and
 * dimension-chain composites like "4 810" never qualify — line reconstruction
 * upstream must keep "1 620" together and "4 810" together so they parse as
 * 1620 (double, in range) and 4810 (out of range, dropped).
 */
export function extractWidthLabels(labels: TextLabel[], cfg: DoorEngineConfig): WidthLabel[] {
  const out: WidthLabel[] = [];
  for (const l of labels) {
    const t = l.text.replace(/\u00a0/g, " ").trim();
    if (!/^\d[\d ]{1,5}$/.test(t)) continue; // digits and thousands-spaces only
    const mm = parseInt(t.replace(/ /g, ""), 10);
    if (mm >= cfg.leafMinMm && mm <= cfg.leafMaxMm) {
      out.push({ mm, x: l.x, y: l.y, vertical: l.vertical, kind: "single" });
    } else if (mm >= cfg.doubleMinMm && mm <= cfg.doubleMaxMm) {
      out.push({ mm, x: l.x, y: l.y, vertical: l.vertical, kind: "double" });
    }
  }
  return out;
}

// ── Interior test: ray crossings ───────────────────────────────────────────
//
// Exterior doors belong to glazing. From the label, cast rays both ways
// perpendicular to its wall. Each ray counts crossings of LONG, roughly
// perpendicular segments (wall faces — every real wall is a double line, so
// even a single envelope wall yields 2). The exterior side of an envelope
// door reaches the page edge with <= 1 crossing (door leaves, dimension
// ticks and dashed site boundaries are short and don't count). Both sides
// >= 2 crossings -> interior. Furniture only ever adds crossings on interior
// sides, so it cannot create a false exterior.

export type InteriorTest = (x: number, y: number, vertical: boolean) => "interior" | "exterior" | "ambiguous";

export function envelopeInteriorTest(segments: Segment[], page: { width: number; height: number }): InteriorTest {
  const LONG = 25;
  const horizAll: Segment[] = [];
  const vertAll: Segment[] = [];
  for (const s of segments) {
    const dx = Math.abs(s.x1 - s.x0), dy = Math.abs(s.y1 - s.y0);
    const len = Math.hypot(dx, dy);
    if (len < LONG) continue;
    if (dy < dx * 0.5) horizAll.push(s);
    else if (dx < dy * 0.5) vertAll.push(s);
  }
  // a segment only counts as a wall face if it has a parallel partner 1.5–6.5pt
  // away with real along-axis overlap — dimension lines and leaders are solitary
  const paired = (list: Segment[], isVert: boolean): Segment[] =>
    list.filter(s => {
      const off = isVert ? (s.x0 + s.x1) / 2 : (s.y0 + s.y1) / 2;
      const lo = isVert ? Math.min(s.y0, s.y1) : Math.min(s.x0, s.x1);
      const hi = isVert ? Math.max(s.y0, s.y1) : Math.max(s.x0, s.x1);
      return list.some(o => {
        if (o === s) return false;
        const ooff = isVert ? (o.x0 + o.x1) / 2 : (o.y0 + o.y1) / 2;
        const d = Math.abs(ooff - off);
        if (d < 1.5 || d > 6.5) return false;
        const olo = isVert ? Math.min(o.y0, o.y1) : Math.min(o.x0, o.x1);
        const ohi = isVert ? Math.max(o.y0, o.y1) : Math.max(o.x0, o.x1);
        return Math.min(hi, ohi) - Math.max(lo, olo) > 12;
      });
    });
  const horiz = paired(horizAll, false);
  const vert = paired(vertAll, true);
  const crossingsH = (x: number, y: number, dir: 1 | -1) => {
    // horizontal ray: crosses long VERTICAL segments
    let n = 0;
    for (const s of vert) {
      const sy0 = Math.min(s.y0, s.y1), sy1 = Math.max(s.y0, s.y1);
      if (y < sy0 - 1 || y > sy1 + 1) continue;
      const sx = (s.x0 + s.x1) / 2;
      if (dir === 1 ? sx > x + 2 : sx < x - 2) n++;
    }
    return n;
  };
  const crossingsV = (x: number, y: number, dir: 1 | -1) => {
    let n = 0;
    for (const s of horiz) {
      const sx0 = Math.min(s.x0, s.x1), sx1 = Math.max(s.x0, s.x1);
      if (x < sx0 - 1 || x > sx1 + 1) continue;
      const sy = (s.y0 + s.y1) / 2;
      if (dir === 1 ? sy > y + 2 : sy < y - 2) n++;
    }
    return n;
  };
  return (x, y, vertical) => {
    // vertical label => vertical wall => ray east/west; horizontal => north/south
    const a = vertical ? crossingsH(x, y, -1) : crossingsV(x, y, -1);
    const b = vertical ? crossingsH(x, y, 1) : crossingsV(x, y, 1);
    if (Math.min(a, b) <= 1) return "exterior";
    return "interior";
  };
}

// ── Wall-gap validation for no-arc candidates ──────────────────────────────
//
// A cavity slider or double sits in a WALL OPENING: collinear wall segments
// whose facing ends straddle the label, separated by roughly the labelled
// width. Interior dimension annotations (island benches, room dims) have no
// such gap and are dropped. Hinged doors don't need this — the radius-matched
// swing arc is the corroboration.

export function hasWallGap(
  segments: Segment[],
  x: number, y: number, vertical: boolean,
  widthPt: number
): boolean {
  const PERP_MAX = 9, MIN_LEN = 9;
  type Span = { lo: number; hi: number; off: number };
  const spans: Span[] = [];
  for (const s of segments) {
    const sdx = s.x1 - s.x0, sdy = s.y1 - s.y0;
    const len = Math.hypot(sdx, sdy);
    if (len < MIN_LEN) continue;
    const segVertical = Math.abs(sdy) > Math.abs(sdx) * 2.5;
    const segHorizontal = Math.abs(sdx) > Math.abs(sdy) * 2.5;
    if (vertical && !segVertical) continue;
    if (!vertical && !segHorizontal) continue;
    const off = vertical ? (s.x0 + s.x1) / 2 - x : (s.y0 + s.y1) / 2 - y;
    if (Math.abs(off) > PERP_MAX) continue;
    const a = vertical ? s.y0 : s.x0, b = vertical ? s.y1 : s.x1;
    spans.push({ lo: Math.min(a, b), hi: Math.max(a, b), off });
  }
  const pos = vertical ? y : x;
  const tol = Math.max(0.30 * widthPt, 4);
  // a face row at offset `o` has the gap if a span ends before the label and
  // another begins after it, separated by ~widthPt
  const rowHasGap = (o: number): boolean => {
    const row = spans.filter(sp => Math.abs(sp.off - o) < 1.1);
    for (const s1 of row) {
      if (s1.hi > pos) continue;
      for (const s2 of row) {
        if (s2.lo < pos) continue;
        if (Math.abs(s2.lo - s1.hi - widthPt) < tol) return true;
      }
    }
    return false;
  };
  const offsets = [...new Set(spans.map(sp => Math.round(sp.off * 2) / 2))];
  for (const o of offsets) if (rowHasGap(o)) return true;
  return false;
}


// ── Opening evidence for no-arc candidates ─────────────────────────────────
//
// Cavity sliders and doubles can sit at WALL ENDS (lounge sliders) or be
// drawn with closed leaves (cupboard fronts), so a symmetric two-sided gap
// is too strict. Evidence required instead:
//   stub — a collinear wall span ends/starts within [0.30w, 1.20w] of the
//          label on at least one side (the jamb the opening hangs off)
//   leaf — parallel segment(s) of leaf-like length in the opening zone
//          (slider leaf, pocket lines, or drawn-closed double leaves)
export function openingEvidence(
  segments: Segment[],
  x: number, y: number, vertical: boolean,
  widthPt: number
): { stub: boolean; leaf: boolean } {
  const PERP_MAX = 9;
  const pos = vertical ? y : x;
  let stub = false;
  for (const s of segments) {
    const sdx = s.x1 - s.x0, sdy = s.y1 - s.y0;
    const len = Math.hypot(sdx, sdy);
    if (len < 6) continue;
    const segVertical = Math.abs(sdy) > Math.abs(sdx) * 2.5;
    const segHorizontal = Math.abs(sdx) > Math.abs(sdy) * 2.5;
    if (vertical && !segVertical) continue;
    if (!vertical && !segHorizontal) continue;
    const off = vertical ? (s.x0 + s.x1) / 2 - x : (s.y0 + s.y1) / 2 - y;
    if (Math.abs(off) > PERP_MAX) continue;
    const a = vertical ? s.y0 : s.x0, b = vertical ? s.y1 : s.x1;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (const end of [lo, hi]) {
      const d = Math.abs(end - pos);
      if (d >= 0.30 * widthPt && d <= 1.20 * widthPt) { stub = true; break; }
    }
    if (stub) break;
  }
  // leaf zone: along ±0.65w, perp ±6.5pt around the label
  let leaf = false;
  const ALONG = 0.65 * widthPt, PERP = 6.5;
  for (const s of segments) {
    const sdx = s.x1 - s.x0, sdy = s.y1 - s.y0;
    const len = Math.hypot(sdx, sdy);
    if (len < 4 || len > 1.2 * widthPt) continue;
    const parallel = vertical ? Math.abs(sdy) > Math.abs(sdx) * 1.8 : Math.abs(sdx) > Math.abs(sdy) * 1.8;
    if (!parallel) continue;
    const mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2;
    const along = vertical ? Math.abs(my - y) : Math.abs(mx - x);
    const perp = vertical ? Math.abs(mx - x) : Math.abs(my - y);
    if (along < ALONG && perp < PERP) { leaf = true; break; }
  }
  return { stub, leaf };
}

// ── The engine ─────────────────────────────────────────────────────────────

export function detectInteriorDoors(
  geom: PageGeometry,
  cfg: DoorEngineConfig = DEFAULT_CONFIG,
  interiorTest?: InteriorTest
): DoorEngineResult {
  const widthLabels = extractWidthLabels(geom.labels, cfg);
  const arcs = recoverArcs(geom.polylines, cfg);
  const isInterior = interiorTest ?? envelopeInteriorTest(geom.segments, geom);

  const PAIR_DIST = 30; // pt — label sits beside its swing on Jennian plans
  const usedArcs = new Set<Arc>();

  const hinged: DoorHit[] = [];
  const doubles: DoorHit[] = [];
  const cavity: DoorHit[] = [];
  const flags: DoorHit[] = [];

  for (const wl of widthLabels) {
    const side = isInterior(wl.x, wl.y, wl.vertical);
    if (side === "exterior") continue; // glazing's problem, not ours — silently route out

    if (wl.kind === "single") {
      // nearest unused arc whose radius matches this leaf width
      const nominalR = mmToPt(wl.mm, cfg.scale);
      let best: Arc | null = null, bestD = Infinity;
      for (const a of arcs) {
        if (usedArcs.has(a)) continue;
        const d = dist(a.x, a.y, wl.x, wl.y);
        if (d < bestD && d < PAIR_DIST && Math.abs(a.r - nominalR) < 4.5) { best = a; bestD = d; }
      }
      if (best && (bestD < 18 || hasWallGap(geom.segments, wl.x, wl.y, wl.vertical, mmToPt(wl.mm, cfg.scale)))) {
        usedArcs.add(best);
        const hit: DoorHit = {
          type: "hinged", widthMm: wl.mm, x: best.x, y: best.y,
          arcMm: Math.round(ptToMm(best.r, cfg.scale)),
          confidence: side === "interior" ? "confirmed" : "flag",
          note: side === "ambiguous" ? "interior/exterior ambiguous — verify" : undefined,
        };
        (hit.confidence === "confirmed" ? hinged : flags).push(hit);
      } else if (!best) {
        // single width, no arc → cavity slider candidate, but only with real
        // opening evidence — interior annotations have neither stub nor leaf.
        const ev = openingEvidence(geom.segments, wl.x, wl.y, wl.vertical, mmToPt(wl.mm, cfg.scale));
        if (!ev.stub || !ev.leaf) continue;
        const hit: DoorHit = {
          type: "cavity", widthMm: wl.mm, x: wl.x, y: wl.y,
          confidence: side === "interior" ? "confirmed" : "flag",
          note: side === "ambiguous" ? "no swing arc; verify slider vs opening" : "no swing arc — slider",
        };
        (hit.confidence === "confirmed" ? cavity : flags).push(hit);
      }
    } else {
      // double-leaf opening, swing arcs not expected on Jennian plans.
      // Stub evidence required; leaves may be drawn closed so leaf is optional.
      const ev = openingEvidence(geom.segments, wl.x, wl.y, wl.vertical, mmToPt(wl.mm, cfg.scale));
      if (!ev.stub) continue;
      const hit: DoorHit = {
        type: "double", widthMm: wl.mm, x: wl.x, y: wl.y,
        confidence: side === "interior" ? "confirmed" : "flag",
        note: side === "ambiguous" ? "interior/exterior ambiguous — verify" : undefined,
      };
      (hit.confidence === "confirmed" ? doubles : flags).push(hit);
    }
  }

  return {
    hinged, doubles, cavity, flags,
    counts: {
      singles: hinged.length,
      doubles: cfg.wardrobeDoublesRouting === "doors" ? doubles.length : 0,
      cavitySliders: cavity.length,
      barn: 0, // barn doors flag-only until a bench plan containing one exists
    },
  };
}
