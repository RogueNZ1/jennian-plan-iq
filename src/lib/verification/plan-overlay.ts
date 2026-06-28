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
import type { ExtractedQuantityAuthoritySource } from "@/lib/takeoff/extracted-quantity-authority";
import type {
  ExtractedQuantityExportRow,
  ExtractedQuantityReadModel,
} from "@/lib/takeoff/extracted-quantity-read-model";
import type { VisualOpeningAuditItem } from "@/lib/takeoff/visual-opening-audit";

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

export type LedgerOverlayRow = {
  extractedQuantityId: string;
  jobId: string;
  runId: string | null;
  category: string;
  label?: string;
  status: string;
  confidence: number;
  warnings: string[];
  count: number | null;
  widthMm: number | null;
  heightMm: number | null;
  lengthMm: number | null;
  areaM2: number | null;
  source: string;
  evidencePage: number | null;
  bbox: [number, number, number, number] | null;
  evidenceText: string | null;
  markerState: "drawable" | "no_marker";
};

export type LedgerPlanOverlayModel = {
  authoritySource: ExtractedQuantityAuthoritySource;
  jobId: string | null;
  runId: string | null;
  totalLedgerRows: number;
  markedRows: LedgerOverlayRow[];
  unmarkedRows: LedgerOverlayRow[];
  legacyEvidence: {
    doorHitCount: number;
    visualOpeningCount: number;
    warning: string;
  };
  warnings: string[];
};

export type LedgerPlanOverlayOptions = {
  authoritySource?: ExtractedQuantityAuthoritySource | "none";
  jobId?: string | null;
  runId?: string | null;
  legacyDoorHitCount?: number;
  legacyVisualOpeningCount?: number;
  warnings?: string[];
};

function usableBbox(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function firstEvidence(row: ExtractedQuantityExportRow) {
  return row.evidence.find((item) => usableBbox(item.bbox) || item.page != null || item.text);
}

function toLedgerOverlayRow(row: ExtractedQuantityExportRow): LedgerOverlayRow {
  const evidence = firstEvidence(row);
  const bbox = usableBbox(evidence?.bbox) ? evidence.bbox : null;
  return {
    extractedQuantityId: row.id,
    jobId: row.jobId,
    runId: row.runId ?? null,
    category: row.category,
    ...(row.label ? { label: row.label } : {}),
    status: row.status,
    confidence: row.confidence,
    warnings: row.warnings.map(String),
    count: row.count,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    lengthMm: row.lengthMm,
    areaM2: row.areaM2,
    source: row.source,
    evidencePage: evidence?.page ?? null,
    bbox,
    evidenceText: evidence?.text ?? null,
    markerState: bbox ? "drawable" : "no_marker",
  };
}

export function buildLedgerPlanOverlayModel(
  readModel: ExtractedQuantityReadModel | null | undefined,
  options: LedgerPlanOverlayOptions = {},
): LedgerPlanOverlayModel {
  const rows = (readModel?.rows ?? []).map(toLedgerOverlayRow);
  const markedRows = rows.filter((row) => row.markerState === "drawable");
  const unmarkedRows = rows.filter((row) => row.markerState === "no_marker");
  const source = options.authoritySource === "none" ? "unavailable" : options.authoritySource;
  const legacyDoorHitCount = options.legacyDoorHitCount ?? 0;
  const legacyVisualOpeningCount = options.legacyVisualOpeningCount ?? 0;
  return {
    authoritySource: source ?? (readModel ? "takeoff_json_fallback" : "unavailable"),
    jobId: options.jobId ?? readModel?.rows[0]?.jobId ?? null,
    runId: options.runId ?? readModel?.activeRunId ?? readModel?.runIds[0] ?? null,
    totalLedgerRows: rows.length,
    markedRows,
    unmarkedRows,
    legacyEvidence: {
      doorHitCount: legacyDoorHitCount,
      visualOpeningCount: legacyVisualOpeningCount,
      warning:
        legacyDoorHitCount > 0 || legacyVisualOpeningCount > 0
          ? "Legacy visual evidence only - not active extracted quantity authority."
          : "No legacy visual evidence present.",
    },
    warnings: options.warnings ?? [],
  };
}

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

export type VisualOpeningMarker = VisualOpeningAuditItem & {
  /** Printed overlay marker label: O1, O2, ... */
  markerLabel: string;
};

export type OpeningTextAnchor = { text: string; vx: number; vy: number };

function compactLabelText(s: string): string {
  return s.toUpperCase().replace(/×/g, "X").replace(/\s+/g, "");
}

function openingAnchorTokens(
  opening: Pick<VisualOpeningAuditItem, "label" | "evidence">,
): string[] {
  const text = `${opening.label ?? ""} ${opening.evidence ?? ""}`;
  const tokens = new Set<string>();
  for (const match of text.matchAll(/\bW\d{1,3}[a-z]?\b/gi)) {
    tokens.add(compactLabelText(match[0]));
  }
  for (const match of text.matchAll(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi)) {
    tokens.add(compactLabelText(match[0]));
  }
  return [...tokens];
}

/**
 * Prefer the plan's own printed label position over broad Visual-QS x/y estimates.
 * The returned point is still a seed: the renderer snaps it to nearby plan ink before
 * drawing the circle, so labels near a window do not become the final marker.
 */
export function findOpeningTextAnchor(
  opening: Pick<VisualOpeningAuditItem, "label" | "evidence">,
  anchors: OpeningTextAnchor[],
  rawX: number,
  rawY: number,
): OpeningTextAnchor | null {
  const tokens = openingAnchorTokens(opening);
  if (tokens.length === 0 || anchors.length === 0) return null;

  const compactAnchors = anchors.map((a) => ({ ...a, compact: compactLabelText(a.text) }));
  let best: (OpeningTextAnchor & { score: number }) | null = null;
  for (const token of tokens) {
    const tokenIsCode = /^W\d{1,3}[A-Z]?$/.test(token);
    for (const anchor of compactAnchors) {
      if (!anchor.compact.includes(token)) continue;
      const dist = Math.hypot(anchor.vx - rawX, anchor.vy - rawY);
      const priority = tokenIsCode ? 0 : 1000;
      const score = priority + dist;
      if (!best || score < best.score)
        best = { text: anchor.text, vx: anchor.vx, vy: anchor.vy, score };
    }
  }
  return best ? { text: best.text, vx: best.vx, vy: best.vy } : null;
}

/**
 * Visual QS openings already arrive in normalized rendered-image coordinates. Preserve
 * the model's walk-around order and give each item a stable overlay label.
 */
export function buildVisualOpeningMarkers(
  openings: VisualOpeningAuditItem[] | null | undefined,
): VisualOpeningMarker[] {
  if (!openings || openings.length === 0) return [];
  return openings.map((o, index) => ({
    ...o,
    markerLabel: o.id || `O${index + 1}`,
  }));
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
