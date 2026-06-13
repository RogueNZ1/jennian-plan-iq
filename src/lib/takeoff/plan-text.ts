/**
 * Plan-text parsers (13 Jun 2026) — the floor plan prints its own ground truth as
 * vector text, and the door adapter already extracts every label. Three parsers,
 * all pure functions over TextLabel[], all deterministic:
 *
 *   parseRoomDims    — "GARAGE" + "4 000 X 5 950" → room footprints from text.
 *                      Fixes the JM-0032 class of failure where geometry returned
 *                      almost no rooms (starving the missing-window detector) and
 *                      vision grabbed the title block's CLADDING AREA (46.7) as
 *                      the garage area (real: 4.0×5.95 = 23.8 m²).
 *   parseWindowCodes — "1 300x1 500" tokens → the printed joinery sizes (NZ
 *                      convention H×W, matching the QS input blocks). The
 *                      deterministic cross-check that catches vision dim errors
 *                      like Ensuite 1.8 m where the plan prints 1 100x600.
 *   parseTitleAreas  — the AREA table ("TOTAL AREA: 139.4m²", "PERIMETER: 56.2m").
 *                      Lets compose flag any vision value that exactly equals a
 *                      title-block stat — the fingerprint of a title-block grab.
 *
 * Honesty rails: these parsers only READ what the draftsperson printed. They
 * invent nothing; absence of a label means absence from the output.
 */
import type { TextLabel } from "../doors/door-engine";
import type { WindowsByRoom } from "./takeoff-types";

export type PlanRoom = {
  name: string;
  widthMm: number;
  depthMm: number;
  areaM2: number;
  x: number;
  y: number;
};

export type PlanWindowCode = { heightMm: number; widthMm: number; x: number; y: number };

export type PlanTitleAreas = Partial<{
  totalAreaM2: number;
  claddingAreaM2: number;
  porchAreaM2: number;
  coverageAreaM2: number;
  perimeterM: number;
}>;

export type PlanText = {
  rooms: PlanRoom[];
  windowCodes: PlanWindowCode[];
  titleAreas: PlanTitleAreas;
};

const DIMS_RE = /^(\d[\d ]{2,5})\s*[xX]\s*(\d[\d ]{2,5})$/;
const num = (s: string) => parseInt(s.replace(/ /g, ""), 10);

/** Room NAME labels are alphabetic (allowing digits like "BED 3"), all-caps on
 * Jennian plans, and never pure numbers or H×W codes. */
function isRoomName(t: string): boolean {
  if (!/[A-Z]{2,}/.test(t)) return false;
  if (DIMS_RE.test(t)) return false;
  if (/^\d/.test(t)) return false;
  if (/AREA|PERIMETER|COVERAGE|SCALE|SHEET|FLOORPLAN|ELEVATION|NORTH|DESCRIPTION/i.test(t))
    return false;
  return true;
}

export function parseRoomDims(labels: TextLabel[]): PlanRoom[] {
  const out: PlanRoom[] = [];
  for (const name of labels) {
    const t = name.text.trim();
    if (!isRoomName(t)) continue;
    // dims print directly UNDER the room name: small dy below, near-left-aligned.
    let best: { l: TextLabel; w: number; d: number; dist: number } | null = null;
    for (const l of labels) {
      const m = l.text.trim().match(DIMS_RE);
      if (!m) continue;
      const dx = l.x - name.x,
        dy = l.y - name.y;
      if (dy <= 0 || dy > 12 || Math.abs(dx) > 30) continue;
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.dist) best = { l, w: num(m[1]), d: num(m[2]), dist };
    }
    if (!best) continue;
    // Room dims are metres-scale millimetres; anything under 400mm a side is a
    // fitting, not a room — and joinery codes never sit under a room name.
    if (best.w < 400 || best.d < 400) continue;
    out.push({
      name: t,
      widthMm: best.w,
      depthMm: best.d,
      areaM2: Math.round((best.w / 1000) * (best.d / 1000) * 100) / 100,
      x: name.x,
      y: name.y,
    });
  }
  return out;
}

/** Joinery codes print as lowercase-x pairs ("1 300x1 500"), H×W per the QS
 * convention. Room dims use uppercase " X " with spaces — excluded here by
 * requiring no space around the x, the dominant Jennian drafting habit; codes
 * that ALSO parse as room dims are excluded by proximity to a room name above. */
export function parseWindowCodes(labels: TextLabel[], rooms: PlanRoom[]): PlanWindowCode[] {
  const out: PlanWindowCode[] = [];
  for (const l of labels) {
    const m = l.text.trim().match(/^(\d[\d ]{2,5})x(\d[\d ]{2,5})$/);
    if (!m) continue;
    const h = num(m[1]),
      w = num(m[2]);
    // joinery heights 300–3000, widths 300–6000
    if (h < 300 || h > 3000 || w < 300 || w > 6000) continue;
    // not a room-dim label (those were claimed by a room name directly above)
    if (rooms.some((r) => Math.abs(r.x - l.x) < 30 && l.y - r.y > 0 && l.y - r.y <= 12)) continue;
    out.push({ heightMm: h, widthMm: w, x: l.x, y: l.y });
  }
  return out;
}

export function parseTitleAreas(labels: TextLabel[]): PlanTitleAreas {
  const out: PlanTitleAreas = {};
  const keys: Array<[RegExp, keyof PlanTitleAreas]> = [
    [/^TOTAL ?AREA/i, "totalAreaM2"],
    [/^CLADDING ?AREA/i, "claddingAreaM2"],
    [/^PORCH ?AREA/i, "porchAreaM2"],
    [/^COVERAGE ?AREA/i, "coverageAreaM2"],
    [/^PERIMETER/i, "perimeterM"],
  ];
  for (const l of labels) {
    for (const [re, key] of keys) {
      if (!re.test(l.text.trim())) continue;
      // value label sits to the RIGHT on the same line: "139.4m²" / "56.2m"
      let best: { v: number; dx: number } | null = null;
      for (const v of labels) {
        const m = v.text.trim().match(/^([\d.]+)\s*m²?$/i);
        if (!m) continue;
        const dx = v.x - l.x,
          dy = Math.abs(v.y - l.y);
        if (dx <= 0 || dx > 240 || dy > 3.5) continue;
        if (!best || dx < best.dx) best = { v: parseFloat(m[1]), dx };
      }
      if (best && out[key] == null) out[key] = best.v;
    }
  }
  return out;
}

export function parsePlanText(labels: TextLabel[]): PlanText {
  const rooms = parseRoomDims(labels);
  return {
    rooms,
    windowCodes: parseWindowCodes(labels, rooms),
    titleAreas: parseTitleAreas(labels),
  };
}

// ── Window auto-routing + correction (13 Jun 2026, "flags aren't fixes") ────────
//
// Every printed window code sits beside its window; every room label sits in its
// room. Nearest-room assignment is GEOMETRY, not guesswork — and it manufactures
// the per-room window map the job's missing schedule would have carried. Vision
// is then corrected against it: rooms added (the missing Bed 3), dims fixed (the
// Ensuite 1.8 hallucination), phantom quantities collapsed (Master qty 2 → the
// one printed code). Every change is recorded verbatim for the flag rail —
// corrections are LOUD, never silent.

export type RoutedWindow = { roomName: string; heightMm: number; widthMm: number };

/** Cupboards never carry window codes; excluding them stops a hall-side code
 * snapping to a 700-deep linen label that happens to sit near a wall. */
const NON_WINDOW_ROOMS = /^(HWC|LINEN|STORE|WIR|ROBE|PANTRY|ENTRY)\b/i;

export function routeWindowCodes(pt: PlanText): RoutedWindow[] {
  const rooms = pt.rooms.filter((r) => !NON_WINDOW_ROOMS.test(r.name));
  if (rooms.length === 0) return [];
  return pt.windowCodes.map((c) => {
    let best = rooms[0],
      bestD = Infinity;
    for (const r of rooms) {
      const d = Math.hypot(r.x - c.x, r.y - c.y);
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    return { roomName: best.name, heightMm: c.heightMm, widthMm: c.widthMm };
  });
}

const canonRoom = (raw: string): string => {
  const n = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (n.includes("MASTER")) return "BED1";
  const bed = n.match(/BED(?:ROOM)?(\d)/);
  if (bed) return `BED${bed[1]}`;
  if (/^(WC|TOILET)/.test(n)) return "WC";
  if (/^BATH/.test(n)) return "BATH";
  if (/^FAMILY|LIVING/.test(n)) return "FAMILY";
  return n;
};

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();

export type WindowCorrection = { room: string; change: string };

/** Pure: returns the corrected map + a verbatim change log. Vision entries with no
 * printed code are left untouched (the mismatch flag covers them); agreement is
 * silent; disagreement and absence are corrected loudly. */
export function correctWindowsByRoom(
  visionMap: WindowsByRoom | null | undefined,
  pt: PlanText,
): { windowsByRoom: WindowsByRoom | null; changes: WindowCorrection[] } {
  const routed = routeWindowCodes(pt);
  if (routed.length === 0) return { windowsByRoom: visionMap ?? null, changes: [] };

  // group routed codes per room; same dims stack as qty, differing dims keep first
  // (single-slot map shape) and note the extra for the manual block downstream.
  const groups = new Map<
    string,
    { name: string; heightMm: number; widthMm: number; qty: number; extra: RoutedWindow[] }
  >();
  for (const r of routed) {
    const key = canonRoom(r.roomName);
    const g = groups.get(key);
    if (!g)
      groups.set(key, {
        name: r.roomName,
        heightMm: r.heightMm,
        widthMm: r.widthMm,
        qty: 1,
        extra: [],
      });
    else if (g.heightMm === r.heightMm && g.widthMm === r.widthMm) g.qty += 1;
    else g.extra.push(r);
  }

  const out: WindowsByRoom = { ...(visionMap ?? {}) };
  const changes: WindowCorrection[] = [];
  const visionKeyByCanon = new Map<string, string>();
  for (const k of Object.keys(out)) visionKeyByCanon.set(canonRoom(k), k);

  for (const [canon, g] of groups) {
    const h = g.heightMm / 1000,
      w = g.widthMm / 1000;
    const vKey = visionKeyByCanon.get(canon);
    if (!vKey) {
      const key = titleCase(g.name);
      out[key] = { qty: g.qty, height_m: h, width_m: w };
      changes.push({
        room: key,
        change: `⚑ FIXED — ${key} window ADDED from the plan's printed code ${g.heightMm}x${g.widthMm} (qty ${g.qty}); vision had no window for this room.`,
      });
      continue;
    }
    const v = out[vKey];
    const dimsAgree =
      v?.height_m != null &&
      v?.width_m != null &&
      Math.abs(v.height_m - h) < 0.05 &&
      Math.abs(v.width_m - w) < 0.05;
    const qtyAgrees = (v?.qty ?? 0) === g.qty;
    if (dimsAgree && qtyAgrees) continue;
    out[vKey] = { ...v, qty: g.qty, height_m: h, width_m: w };
    changes.push({
      room: vKey,
      change:
        `⚑ FIXED — ${vKey} window corrected from the plan's printed code: now qty ${g.qty} @ ${h}×${w}` +
        ` (vision read qty ${v?.qty ?? 0} @ ${v?.height_m ?? "?"}×${v?.width_m ?? "?"}).`,
    });
    for (const ex of g.extra)
      changes.push({
        room: vKey,
        change: `⚑ ${vKey} has an ADDITIONAL printed code ${ex.heightMm}x${ex.widthMm} beyond the slot — enter manually.`,
      });
  }
  return { windowsByRoom: out, changes };
}
