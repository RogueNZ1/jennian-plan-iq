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

export type PlanWindowCode = {
  id?: string;
  heightMm: number;
  widthMm: number;
  x: number;
  y: number;
};

export type PlanTitleAreas = Partial<{
  totalAreaM2: number;
  claddingAreaM2: number;
  porchAreaM2: number;
  coverageAreaM2: number;
  perimeterM: number;
}>;

export type PlanFrameOpening = { widthMm: number; x: number; y: number };
export type PlanStandaloneOpeningWidth = {
  widthMm: number;
  x: number;
  y: number;
  vertical: boolean;
  text: string;
};
export type PlanGarageDoorWitness = {
  widthMm: number;
  x: number;
  y: number;
  vertical: boolean;
  text: string;
  markerText: string;
  markerX: number;
  markerY: number;
  room: string | null;
  planSide: "plan_left" | "plan_right" | "plan_top" | "plan_bottom" | null;
};
export type PlanDraftingIssue = {
  kind: "malformed_dimension_label";
  text: string;
  x: number;
  y: number;
};

export type PlanText = {
  rooms: PlanRoom[];
  windowCodes: PlanWindowCode[];
  frameOpenings?: PlanFrameOpening[];
  standaloneOpeningWidths?: PlanStandaloneOpeningWidth[];
  garageDoorWitnesses?: PlanGarageDoorWitness[];
  draftingIssues?: PlanDraftingIssue[];
  titleAreas: PlanTitleAreas;
};

const DIMS_RE = /^(\d[\d, ]{2,5})\s*[xX]\s*(\d[\d, ]{2,5})$/;
const WINDOW_CODE_STRICT_RE = /^(\d[\d, ]{2,5})x(\d[\d, ]{2,5})(?:\s*mm)?$/;
const WINDOW_CODE_DIMS_RE = /^(\d[\d, ]{2,5})\s*[xX]\s*(\d[\d, ]{2,5})(?:\s*mm)?$/i;
const WINDOW_CODE_PREFIX_RE = /^(\d[\d, ]{2,5})\s*[xX]\s*(\d[\d, ]{2,5})(?=\D|$)/i;
const num = (s: string) => parseInt(s.replace(/[, ]/g, ""), 10);
const TITLE_AREA_VALUE_RE = /^([\d.]+)\s*m(?:²|2)$/i;
const TITLE_LENGTH_VALUE_RE = /^([\d.]+)\s*m$/i;
const KNOWN_ROOM_NAME_RE =
  /^(GARAGE|LOUNGE|LIVING|FAMILY|DINING|KITCHEN|ENTRY|HALL|BED(?:ROOM)? ?\d|MASTER(?: BED(?:ROOM)?)?|ENS(?:UITE)?|BATH(?:ROOM)?|WC|TOILET|LAUNDRY|WIR|ROBE|STORE|LINEN|HWC|PANTRY|TV|STUDY|OFFICE)$/i;

/** Room NAME labels are alphabetic (allowing digits like "BED 3"), all-caps on
 * Jennian plans, and never pure numbers or H×W codes. */
function isRoomName(t: string): boolean {
  const compact = t.trim().replace(/\s+/g, " ");
  if (KNOWN_ROOM_NAME_RE.test(compact)) return true;
  if (!/[A-Z]{2,}/.test(t)) return false;
  if (DIMS_RE.test(t)) return false;
  if (/^\d/.test(t)) return false;
  if (/AREA|PERIMETER|COVERAGE|SCALE|SHEET|FLOORPLAN|ELEVATION|NORTH|DESCRIPTION/i.test(t))
    return false;
  return true;
}

function isRoomFootprintLabel(
  label: TextLabel,
  rooms: readonly PlanRoom[],
  h: number,
  w: number,
): boolean {
  return rooms.some(
    (r) =>
      r.widthMm === h &&
      r.depthMm === w &&
      Math.abs(r.x - label.x) < 48 &&
      label.y - r.y > 0 &&
      label.y - r.y <= 24,
  );
}

function compactAnonymousOpeningLabels(
  labels: readonly TextLabel[],
  rooms: readonly PlanRoom[],
): TextLabel[] {
  return labels.filter((candidate) => {
    const text = candidate.text.trim();
    const m = text.match(WINDOW_CODE_DIMS_RE);
    if (!m || !/x/.test(text) || /X/.test(text)) return false;
    const h = num(m[1]);
    const w = num(m[2]);
    if (h < 300 || h > 3000 || w < 300 || w > 6000) return false;
    if (isRoomFootprintLabel(candidate, rooms, h, w)) return false;
    return true;
  });
}

function hasAnonymousOpeningCluster(label: TextLabel, clusterLabels: readonly TextLabel[]): boolean {
  const siblings = clusterLabels.filter((candidate) => candidate !== label);
  const sameColumn = siblings.filter((candidate) => Math.abs(candidate.x - label.x) <= 16).length;
  const sameRow = siblings.filter((candidate) => Math.abs(candidate.y - label.y) <= 10).length;
  const nearby = siblings.filter((candidate) => Math.hypot(candidate.x - label.x, candidate.y - label.y) <= 260)
    .length;
  return sameColumn >= 1 || sameRow >= 1 || nearby >= 2;
}

function titleValueFor(text: string, key: keyof PlanTitleAreas): number | null {
  const trimmed = text.trim();
  const m =
    key === "perimeterM"
      ? trimmed.match(TITLE_LENGTH_VALUE_RE)
      : trimmed.match(TITLE_AREA_VALUE_RE);
  return m ? parseFloat(m[1]) : null;
}

export function parseRoomDims(labels: TextLabel[]): PlanRoom[] {
  const out: PlanRoom[] = [];
  for (const name of labels) {
    const t = name.text.trim();
    if (!isRoomName(t)) continue;
    // dims print directly UNDER the room name: small dy below, near-left-aligned.
    // Some Jennian exports place the room footprint a little lower/right of larger labels
    // (notably GARAGE); keep this broad enough for room-scale dims, still far tighter
    // than title blocks and joinery callouts.
    let best: { l: TextLabel; w: number; d: number; dist: number } | null = null;
    for (const l of labels) {
      const m = l.text.trim().match(DIMS_RE);
      if (!m) continue;
      const dx = l.x - name.x,
        dy = l.y - name.y;
      if (dy <= 0 || dy > 24 || Math.abs(dx) > 48) continue;
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
  type WindowCandidate = PlanWindowCode & { idDist: number | null };
  const out: WindowCandidate[] = [];
  const wLabels = labels.filter((candidate) => /^W\d{1,3}$/i.test(candidate.text.trim()));
  const anonymousClusterLabels = compactAnonymousOpeningLabels(labels, rooms);
  for (const l of labels) {
    const text = l.text.trim();
    const strictMatch = text.match(WINDOW_CODE_STRICT_RE);
    const exactMatch = strictMatch ?? text.match(WINDOW_CODE_DIMS_RE);
    const prefixMatch = exactMatch ? null : text.match(WINDOW_CODE_PREFIX_RE);
    const m = exactMatch ?? prefixMatch;
    if (!m) continue;
    const h = num(m[1]),
      w = num(m[2]);
    // joinery heights 300–3000, widths 300–6000
    if (h < 300 || h > 3000 || w < 300 || w > 6000) continue;
    const idMatch = wLabels
      .map((candidate) => ({
        id: candidate.text
          .trim()
          .toUpperCase()
          .replace(/^W(\d)$/, "W0$1"),
        dx: Math.abs(candidate.x - l.x),
        dy: l.y - candidate.y,
      }))
      .filter((candidate) => candidate.dy >= -2 && candidate.dy <= 24 && candidate.dx <= 55)
      .map((candidate) => ({ ...candidate, dist: Math.hypot(candidate.dx, candidate.dy) }))
      .sort((a, b) => a.dist - b.dist)[0];
    const id = idMatch?.id;
    // Anonymous room footprints are not joinery candidates. If a nearby W-code
    // labels the same text, keep it because that is a real opening identity.
    if (!id && isRoomFootprintLabel(l, rooms, h, w)) continue;
    // Prefix matches tolerate PDF text that has jammed trailing words, but only
    // when a nearby W-code proves the text belongs to a joinery callout.
    if (prefixMatch && !id) continue;
    const anonymousLowercaseOpeningLabel =
      exactMatch != null &&
      anonymousClusterLabels.includes(l) &&
      hasAnonymousOpeningCluster(l, anonymousClusterLabels);
    if (!id && !strictMatch && !anonymousLowercaseOpeningLabel) continue;
    out.push({
      ...(id ? { id } : {}),
      heightMm: h,
      widthMm: w,
      x: l.x,
      y: l.y,
      idDist: idMatch?.dist ?? null,
    });
  }
  const bestById = new Map<string, WindowCandidate>();
  for (const candidate of out) {
    if (!candidate.id) continue;
    const existing = bestById.get(candidate.id);
    if (!existing || (candidate.idDist ?? Infinity) < (existing.idDist ?? Infinity)) {
      bestById.set(candidate.id, candidate);
    }
  }
  return out
    .filter((candidate) => !candidate.id || bestById.get(candidate.id) === candidate)
    .map(({ idDist: _idDist, ...candidate }) => candidate);
}

export function parseTitleAreas(labels: TextLabel[]): PlanTitleAreas {
  const out: PlanTitleAreas = {};
  const keys: Array<[RegExp, keyof PlanTitleAreas]> = [
    [/^(TOTAL ?AREA|AREA ?OVER ?FRAME|OVER ?FRAME ?AREA)/i, "totalAreaM2"],
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
        const parsedValue = titleValueFor(v.text, key);
        if (parsedValue == null) continue;
        const dx = v.x - l.x,
          dy = Math.abs(v.y - l.y);
        if (dx <= 0 || dx > 320 || dy > 3.5) continue;
        if (!best || dx < best.dx) best = { v: parsedValue, dx };
      }
      if (best && out[key] == null) out[key] = best.v;
    }
  }
  return out;
}

export function parseFrameOpenings(labels: TextLabel[]): PlanFrameOpening[] {
  const out: PlanFrameOpening[] = [];
  for (const l of labels) {
    const m = l.text.trim().match(/^Frame to Frame\s+(\d[\d, ]{2,5})$/i);
    if (!m) continue;
    const widthMm = num(m[1]);
    if (widthMm < 600 || widthMm > 2400) continue;
    out.push({ widthMm, x: l.x, y: l.y });
  }
  return out;
}

export function parseStandaloneOpeningWidths(labels: TextLabel[]): PlanStandaloneOpeningWidth[] {
  const out: PlanStandaloneOpeningWidth[] = [];
  for (const l of labels) {
    const text = l.text.trim();
    const widthText = /^\d[\d, ]{2,5}$/.test(text) ? text : null;
    if (!widthText) continue;
    const widthMm = num(widthText);
    // Width-only exterior opening witnesses are typically sliders/large frames.
    // Internal door leaves and dimension ticks stay below this band and must not
    // become opening evidence without a separate physical-symbol/elevation match.
    if (widthMm < 1200 || widthMm > 6000) continue;
    out.push({ widthMm, x: l.x, y: l.y, vertical: l.vertical, text });
  }
  return out;
}

function garageDoorMarkerText(text: string): boolean {
  return /\b(garage\s*door|sectional\s+door|roller\s+door)\b/i.test(text.trim());
}

function inferWitnessPlanSide(
  witness: PlanStandaloneOpeningWidth,
  room: PlanRoom | null,
): PlanGarageDoorWitness["planSide"] {
  if (!room) return null;
  const dx = witness.x - room.x;
  const dy = witness.y - room.y;
  if (witness.vertical || Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "plan_right" : "plan_left";
  }
  return dy >= 0 ? "plan_bottom" : "plan_top";
}

export function parseGarageDoorWitnesses(
  labels: TextLabel[],
  standaloneWidths: readonly PlanStandaloneOpeningWidth[],
  rooms: readonly PlanRoom[],
): PlanGarageDoorWitness[] {
  const garageRooms = rooms.filter((room) => /^GARAGE\b/i.test(room.name.trim()));
  const out: PlanGarageDoorWitness[] = [];
  for (const marker of labels.filter((label) => garageDoorMarkerText(label.text))) {
    const witness = standaloneWidths
      .filter((candidate) => candidate.widthMm >= 1800 && candidate.widthMm <= 6000)
      .map((candidate) => ({
        candidate,
        distance: Math.hypot(candidate.x - marker.x, candidate.y - marker.y),
      }))
      .filter((candidate) => candidate.distance <= 90)
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    if (!witness) continue;

    const room =
      garageRooms
        .map((candidate) => ({
          candidate,
          distance: Math.hypot(candidate.x - witness.x, candidate.y - witness.y),
        }))
        .filter((candidate) => candidate.distance <= 220)
        .sort((a, b) => a.distance - b.distance)[0]?.candidate ?? null;

    const duplicate = out.some(
      (existing) =>
        existing.widthMm === witness.widthMm &&
        Math.hypot(existing.x - witness.x, existing.y - witness.y) <= 3,
    );
    if (duplicate) continue;

    out.push({
      widthMm: witness.widthMm,
      x: witness.x,
      y: witness.y,
      vertical: witness.vertical,
      text: witness.text,
      markerText: marker.text.trim(),
      markerX: marker.x,
      markerY: marker.y,
      room: room?.name ?? null,
      planSide: inferWitnessPlanSide(witness, room),
    });
  }
  return out;
}

export function parseDraftingIssues(labels: TextLabel[]): PlanDraftingIssue[] {
  const out: PlanDraftingIssue[] = [];
  for (const l of labels) {
    const text = l.text.trim();
    const compact = text.replace(/\s+/g, "");
    if (!/[xX]/.test(compact)) continue;
    const numbers = compact.match(/\d[\d,]{2,}/g) ?? [];
    const hasJammedRightSide = /\d[\d,]{2,5}[xX]\d{6,}/.test(compact);
    if (!hasJammedRightSide && numbers.length <= 2) continue;
    out.push({ kind: "malformed_dimension_label", text, x: l.x, y: l.y });
  }
  return out;
}

export function parsePlanText(labels: TextLabel[]): PlanText {
  // Density guard (13 Jun 2026, prelim-set hang): a full working drawing can
  // carry tens of thousands of text labels (every dimension is one). The room
  // pairing below is candidates × labels; past the cap we skip — vision +
  // flags carry the takeoff, the run COMPLETES.
  if (labels.length > 25000) {
    console.warn(
      `[plan-text] ${labels.length} labels exceeds the density cap — plan-text pass skipped.`,
    );
    return { rooms: [], windowCodes: [], frameOpenings: [], draftingIssues: [], titleAreas: {} };
  }
  const rooms = parseRoomDims(labels);
  const standaloneOpeningWidths = parseStandaloneOpeningWidths(labels);
  return {
    rooms,
    windowCodes: parseWindowCodes(labels, rooms),
    frameOpenings: parseFrameOpenings(labels),
    standaloneOpeningWidths,
    garageDoorWitnesses: parseGarageDoorWitnesses(labels, standaloneOpeningWidths, rooms),
    draftingIssues: parseDraftingIssues(labels),
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
 * printed code are left untouched for named rooms (the mismatch flag covers them);
 * unanchored Unknown-room vision windows are dropped loudly; agreement is silent;
 * disagreement and absence are corrected loudly. */
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

  for (const [room, w] of Object.entries(out)) {
    const canon = canonRoom(room);
    const h = w?.height_m != null ? Math.round(w.height_m * 1000) : null;
    const wd = w?.width_m != null ? Math.round(w.width_m * 1000) : null;
    const matchesPrintedCode =
      h != null && wd != null && pt.windowCodes.some((c) => c.heightMm === h && c.widthMm === wd);
    if (
      (canon === "UNKNOWN" || canon === "UNIDENTIFIED" || canon === "OTHER") &&
      h != null &&
      wd != null &&
      !matchesPrintedCode
    ) {
      delete out[room];
      changes.push({
        room,
        change: `⚑ DROPPED — ${room} window ${h}x${wd} had no room anchor and matches NO printed joinery code on the plan; excluded from glazing/openings.`,
      });
    }
  }

  return { windowsByRoom: out, changes };
}
