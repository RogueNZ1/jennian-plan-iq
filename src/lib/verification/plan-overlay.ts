/**
 * Plan-overlay helpers (13 Jun) — pure functions only.
 *
 * COORDINATE CONTRACT
 * Door-engine hits are in the pdf-adapter's page space: pdf points, y-DOWN, origin at the
 * top-left of the UNROTATED page view (`toPage(ux,uy) = [ux - x0, height - (uy - y0)]`).
 * To draw a hit on a rendered page:
 *   1. invert back to PDF USER space (y-up):  adapterToUser()
 *   2. hand the user-space point to the renderer's viewport
 *      (pdf.js `viewport.convertToViewportPoint(ux, uy)`), which applies scale AND /Rotate.
 * Step 2 lives in the component (needs a live viewport); step 1 lives here and is tested
 * as the exact inverse of the adapter's transform.
 */

import type { EnrichedTakeoff } from "@/lib/takeoff/enriched-takeoff";

export type DoorHitPersisted = NonNullable<EnrichedTakeoff["door_hits"]>[number];
export type DoorPagePersisted = NonNullable<EnrichedTakeoff["door_page"]>;

/** Adapter page space (y-down, view-origin-relative) → PDF user space (y-up). */
export function adapterToUser(x: number, y: number, view: number[]): { ux: number; uy: number } {
  const [x0, y0, , y1] = view;
  // toPage: px = ux - x0 ; py = (y1 - y0) - (uy - y0) = y1 - uy
  // inverse: ux = px + x0 ; uy = y1 - py
  return { ux: x + x0, uy: y1 - y };
}

export type DoorMarker = {
  /** Printed marker label: D1, D2, … in a stable reading order (top→bottom, left→right). */
  label: string;
  type: "hinged" | "double" | "cavity";
  widthMm: number;
  /** adapter page space — convert via adapterToUser + viewport at render time */
  x: number;
  y: number;
  confidence: "confirmed" | "flag";
  note?: string;
};

/**
 * Number the persisted hits into stable, human-followable markers. Reading order
 * (top→bottom then left→right, with a small row tolerance) so the printed legend
 * walks the plan the way an estimator's eye does.
 */
export function buildDoorMarkers(
  hits: DoorHitPersisted[] | null | undefined,
  rowTolerancePt = 18,
): DoorMarker[] {
  if (!hits || hits.length === 0) return [];
  const sorted = [...hits].sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > rowTolerancePt) return dy;
    return a.x - b.x;
  });
  return sorted.map((h, i) => ({
    label: `D${i + 1}`,
    type: h.type,
    widthMm: h.widthMm,
    x: h.x,
    y: h.y,
    confidence: h.confidence,
    ...(h.note ? { note: h.note } : {}),
  }));
}

/**
 * Window-code matcher for live plan-text labels (W1, W2, … W12a). These are the plan's
 * OWN printed codes — circling them makes the schedule table cross-checkable on paper
 * without any new persistence and without the overlay asserting anything itself.
 */
export function isWindowCode(s: string): boolean {
  return /^W\d{1,3}[a-z]?$/i.test(s.trim());
}

export type OverlaySummary = {
  confirmed: number;
  flagged: number;
  byType: { hinged: number; double: number; cavity: number };
};

export function summariseMarkers(markers: DoorMarker[]): OverlaySummary {
  const s: OverlaySummary = {
    confirmed: 0,
    flagged: 0,
    byType: { hinged: 0, double: 0, cavity: 0 },
  };
  for (const m of markers) {
    if (m.confidence === "confirmed") s.confirmed++;
    else s.flagged++;
    s.byType[m.type]++;
  }
  return s;
}

/* ------------------------------------------------------------------ text stitching */

export type RawTextItem = {
  str: string;
  /** pdf.js text transform — [a,b,c,d,e,f]; e/f = user-space position */
  transform: number[];
  width?: number;
};

export type StitchedLabel = { text: string; ux: number; uy: number };

/**
 * Stitch glyph-split text items into labels. Qt-exported plans emit ONE GLYPH PER ITEM
 * (the door adapter handles the same quirk), so matching codes like "W12" against raw
 * items silently fails. Groups items by baseline (uy within tolerance), sorts by ux,
 * and merges runs whose gap is small relative to font size. Pure + renderer-agnostic:
 * positions stay in user space; the caller converts via the live viewport.
 */
export function stitchTextItems(items: RawTextItem[], gapRatio = 0.45): StitchedLabel[] {
  type Tok = { s: string; ux: number; uy: number; w: number; fs: number };
  const toks: Tok[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim() || !it.transform) continue;
    const t = it.transform;
    const fs = Math.hypot(t[0], t[1]) || Math.hypot(t[2], t[3]) || 6;
    toks.push({ s: it.str, ux: t[4], uy: t[5], w: it.width ?? 0, fs });
  }
  // group by baseline
  const rows: Tok[][] = [];
  for (const tok of toks.sort((a, b) => b.uy - a.uy || a.ux - b.ux)) {
    const row = rows.find((r) => Math.abs(r[0].uy - tok.uy) <= Math.max(2, r[0].fs * 0.35));
    if (row) row.push(tok);
    else rows.push([tok]);
  }
  const out: StitchedLabel[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.ux - b.ux);
    let cur: Tok | null = null;
    let text = "";
    let end = 0;
    const flush = () => {
      if (cur) out.push({ text, ux: cur.ux, uy: cur.uy });
      cur = null;
      text = "";
    };
    for (const tok of row) {
      if (cur && tok.ux - end <= Math.max(cur.fs, tok.fs) * gapRatio) {
        text += tok.s;
        end = tok.ux + tok.w;
      } else {
        flush();
        cur = tok;
        text = tok.s;
        end = tok.ux + tok.w;
      }
    }
    flush();
  }
  return out;
}
