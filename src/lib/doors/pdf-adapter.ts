/**
 * pdf.js adapter for the door engine.
 * Extracts the two raw inputs the engine needs from a PDF page:
 *   - text labels (reconstructed lines with positions, y-down page space)
 *   - straight vector segments (with full CTM tracking, y-down page space)
 *
 * Works in Node (legacy build) and the browser. pdfjs-dist pinned to 4.x —
 * constructPath operator args are [ops[], coords[], minMax] in this line.
 */
import type { PageGeometry, Pt, Segment, TextLabel } from "./door-engine";

// pdf.js types are loose; keep the adapter defensive.
type PdfPage = {
  view: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
  getTextContent(): Promise<{ items: any[] }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: any[] }>;
};

// OPS codes (stable across pdf.js 2.x–4.x)
const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  constructPath: 91,
} as const;

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

export async function extractPageGeometry(page: PdfPage): Promise<PageGeometry> {
  const [x0, y0, x1, y1] = page.view;
  const width = x1 - x0,
    height = y1 - y0;
  const toPage = (ux: number, uy: number): [number, number] => [ux - x0, height - (uy - y0)]; // y-down

  // ── text ────────────────────────────────────────────────────────────────
  const tc = await page.getTextContent();
  type Tok = {
    s: string;
    x: number;
    y: number;
    w: number;
    h: number;
    fs: number;
    vertical: boolean;
  };
  const prevTransformScale = (t: Tok) => t.fs;
  const toks: Tok[] = [];
  for (const it of tc.items) {
    if (typeof it.str !== "string" || !it.str.trim()) continue;
    const t = it.transform as number[];
    const vertical = Math.abs(t[1]) > Math.abs(t[0]); // rotated run
    const fs = Math.hypot(t[0], t[1]) || Math.hypot(t[2], t[3]) || 6;
    const [px, py] = toPage(t[4], t[5]);
    const adv = (it.width ?? 0) * 1.0; // advance in text space ~= page space here
    toks.push({
      s: it.str,
      x: px,
      y: py,
      w: vertical ? 0 : adv,
      h: vertical ? adv : 0,
      fs,
      vertical,
    });
  }
  // Reconstruct lines. Qt emits ONE GLYPH PER ITEM, so we must stitch glyphs
  // into tokens by gap ratio relative to font size:
  //   gap < 0.70em  -> same token (concat, no space)
  //   gap < 1.45em  -> thousands/word space ("1 620")
  //   otherwise     -> separate label
  const labels: TextLabel[] = [];
  type Run = { toks: Tok[]; vertical: boolean; line: number };
  const runs: Run[] = [];
  for (const t of toks) {
    const lineCoord = t.vertical ? t.x : t.y;
    let run = runs.find((r) => r.vertical === t.vertical && Math.abs(r.line - lineCoord) < 2.2);
    if (!run) {
      run = { toks: [], vertical: t.vertical, line: lineCoord };
      runs.push(run);
    }
    run.toks.push(t);
    run.line = (run.line * (run.toks.length - 1) + lineCoord) / run.toks.length;
  }
  for (const run of runs) {
    // along-axis coordinate: x for horizontal, -y for vertical (drawn bottom-up)
    const along = (t: Tok) => (run.vertical ? -t.y : t.x);
    run.toks.sort((a, b) => along(a) - along(b));
    let cur: Tok[] = [];
    let text = "";
    const flush = () => {
      if (!text.trim()) {
        cur = [];
        text = "";
        return;
      }
      const cx = cur.reduce((s, g) => s + g.x, 0) / cur.length;
      const cy = cur.reduce((s, g) => s + g.y, 0) / cur.length;
      labels.push({ text: text.replace(/\s+/g, " ").trim(), x: cx, y: cy, vertical: run.vertical });
      cur = [];
      text = "";
    };
    for (let i = 0; i < run.toks.length; i++) {
      const t = run.toks[i];
      if (cur.length === 0) {
        cur.push(t);
        text = t.s;
        continue;
      }
      const prev = run.toks[i - 1];
      const fs = Math.max(Math.hypot(prevTransformScale(prev), 0), 1);
      const gap = along(t) - along(prev) - (run.vertical ? prev.h : prev.w);
      if (gap < 0.7 * fs) {
        cur.push(t);
        text += t.s;
      } else if (gap < 1.45 * fs) {
        cur.push(t);
        text += " " + t.s;
      } else {
        flush();
        cur.push(t);
        text = t.s;
      }
    }
    flush();
  }

  // ── vectors ─────────────────────────────────────────────────────────────
  const ol = await page.getOperatorList();
  const segments: Segment[] = [];
  const polylines: Pt[][] = [];
  let ctm: Mat = IDENT;
  const stack: Mat[] = [];
  let poly: Pt[] = [];

  const toPagePt = (ux: number, uy: number): Pt => {
    const [px, py] = apply(ctm, ux, uy);
    const [qx, qy] = toPage(px, py);
    return { x: qx, y: qy };
  };
  const flushPoly = () => {
    if (poly.length >= 3) polylines.push(poly);
    poly = [];
  };
  const emitLine = (ax: number, ay: number, bx: number, by: number) => {
    const a = toPagePt(ax, ay),
      b = toPagePt(bx, by);
    segments.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    if (poly.length === 0) poly.push(a);
    poly.push(b);
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? IDENT;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Mat);
    else if (fn === OPS.constructPath) {
      const ops: number[] = args[0];
      const co: number[] = args[1];
      let k = 0,
        cx = 0,
        cy = 0;
      for (const op of ops) {
        if (op === OPS.moveTo) {
          flushPoly();
          cx = co[k++];
          cy = co[k++];
        } else if (op === OPS.lineTo) {
          const nx = co[k++],
            ny = co[k++];
          emitLine(cx, cy, nx, ny);
          cx = nx;
          cy = ny;
        } else if (op === OPS.curveTo) {
          k += 4;
          cx = co[k++];
          cy = co[k++];
        } // beziers irrelevant here (Qt emits polylines)
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
          k += 2;
          cx = co[k++];
          cy = co[k++];
        } else if (op === OPS.rectangle) {
          k += 4;
        } // walls/fills — not arc material
        else if (op === OPS.closePath) {
          flushPoly();
        }
      }
      flushPoly();
    }
  }

  return { width, height, labels, segments, polylines };
}
