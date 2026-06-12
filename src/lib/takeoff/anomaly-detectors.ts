/**
 * Crop-on-anomaly — detectors (Phase 3, step 1 of the takeoff-accuracy build).
 *
 * Two pure detectors over an extracted takeoff's openings + room labels. They only ever
 * RAISE anomalies — candidate resolution (crop re-read, fill-vs-flag asymmetry) lives in
 * the gated re-read orchestrator, NOT here. Both are taxonomy-driven (keyword categories,
 * no job/room-name literals) per the build's generalisation guardrail.
 *
 * Detector contracts (from the approved architecture):
 *  - MISSING WINDOW: a room present in roomLabels, classified HABITABLE, with no
 *    window-type opening attributed to it. SERVICE rooms (incl. laundry/wc) and BATHING
 *    rooms may legitimately be windowless (extractor fans) — never flagged missing.
 *  - OUTLIER HEIGHT: a window-type opening in a BATHING room (ensuite/bathroom/wc/powder)
 *    whose height exceeds BATHING_MAX_WINDOW_HEIGHT_M. Laundry and kitchen are EXCLUDED
 *    by not being BATHING (a tall laundry window — e.g. Young's 1.8 — is correct). Plus a
 *    global gross guard for ANY room: height below GROSS_MIN_WINDOW_HEIGHT_M or above
 *    GROSS_MAX_WINDOW_HEIGHT_M is implausible joinery regardless of room.
 *
 * Door types (sectional/pa/entrance) are out of scope for both detectors — their heights
 * are standards by definition and are flagged at source when asserted.
 */
import type { Opening } from "./takeoff-types";

/* ------------------------------------------------------------ room taxonomy */

export type RoomCategory = "HABITABLE" | "SERVICE" | "BATHING" | "UNKNOWN";

/**
 * Keyword taxonomy — first matching category wins, BATHING checked before SERVICE so
 * "wc"/"toilet" (which appear in both windowless-allowed sets) classify as BATHING for
 * the height cap while remaining exempt from the missing-window rule (only HABITABLE
 * fires that). Matching is substring-based on the normalised label.
 */
const ROOM_CATEGORY_KEYWORDS: ReadonlyArray<{
  category: RoomCategory;
  keywords: ReadonlyArray<string>;
}> = [
  {
    category: "BATHING",
    keywords: ["ensuite", "bathroom", "bath", "wc", "powder", "toilet"],
  },
  {
    category: "SERVICE",
    keywords: [
      "laundry",
      "garage",
      "entry",
      "entrance",
      "foyer",
      "porch",
      "hall",
      "pantry",
      "scullery",
      "robe",
      "wardrobe",
      "wir",
      "linen",
      "store",
      "storage",
      "cupboard",
      "stair",
      "void",
      "alfresco",
      "patio",
      "deck",
    ],
  },
  {
    category: "HABITABLE",
    keywords: [
      "bed",
      "master",
      "lounge",
      "living",
      "family",
      "dining",
      "kitchen",
      "study",
      "office",
      "media",
      "rumpus",
      "games",
      "theatre",
      "snug",
    ],
  },
];

/** Max plausible window HEIGHT (m) in a bathing room — privacy glazing sits high and short. */
export const BATHING_MAX_WINDOW_HEIGHT_M = 1.3;
/** Global gross guards — heights outside this band are implausible joinery in ANY room. */
export const GROSS_MIN_WINDOW_HEIGHT_M = 0.3;
export const GROSS_MAX_WINDOW_HEIGHT_M = 2.6;

/** Opening types the detectors consider (glazed window family — matches the QS window slots). */
const DETECTOR_WINDOW_TYPES = new Set<Opening["type"]>(["window", "slider", "garage_window"]);

function normLabel(label: string | null | undefined): string {
  return (label ?? "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function classifyRoomCategory(label: string | null | undefined): RoomCategory {
  const norm = normLabel(label);
  if (!norm) return "UNKNOWN";
  for (const { category, keywords } of ROOM_CATEGORY_KEYWORDS) {
    if (keywords.some((k) => norm.includes(k))) return category;
  }
  return "UNKNOWN";
}

/** Loose room identity: normalised equality or containment either way ("Bed 1" ↔ "Bed 1 (Master)"). */
function sameRoom(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normLabel(a);
  const nb = normLabel(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/* --------------------------------------------------------------- detectors */

export type MissingWindowAnomaly = {
  kind: "missing_window";
  room: string;
  category: "HABITABLE";
};

export type OutlierWindowAnomaly = {
  kind: "outlier_height";
  room: string | null;
  opening: Opening;
  /** Which rule fired: the bathing cap, or the global gross band. */
  rule: "bathing_max" | "gross_band";
  limit_m: number;
};

/**
 * Rooms on the plan that should have a window but have none attributed.
 * Fires ONLY for HABITABLE rooms; SERVICE/BATHING/UNKNOWN are exempt (lean — an unknown
 * label never triggers a re-read). Pure.
 */
export function detectMissingWindows(
  roomLabels: ReadonlyArray<string>,
  openings: ReadonlyArray<Opening>,
): MissingWindowAnomaly[] {
  const windowRooms = openings
    .filter((o) => DETECTOR_WINDOW_TYPES.has(o.type))
    .map((o) => o.room)
    .filter((r): r is string => !!r);
  const out: MissingWindowAnomaly[] = [];
  for (const label of roomLabels) {
    if (classifyRoomCategory(label) !== "HABITABLE") continue;
    if (windowRooms.some((r) => sameRoom(r, label))) continue;
    out.push({ kind: "missing_window", room: label, category: "HABITABLE" });
  }
  return out;
}

/**
 * Window-type openings with implausible heights: over the bathing cap in BATHING rooms,
 * or outside the global gross band in any room. Pure.
 */
export function detectOutlierWindows(openings: ReadonlyArray<Opening>): OutlierWindowAnomaly[] {
  const out: OutlierWindowAnomaly[] = [];
  for (const o of openings) {
    if (!DETECTOR_WINDOW_TYPES.has(o.type)) continue;
    const h = o.height_m;
    if (h <= 0) continue; // unresolved height is flagged at source, not an outlier read
    if (h < GROSS_MIN_WINDOW_HEIGHT_M) {
      out.push({
        kind: "outlier_height",
        room: o.room,
        opening: o,
        rule: "gross_band",
        limit_m: GROSS_MIN_WINDOW_HEIGHT_M,
      });
      continue;
    }
    if (h > GROSS_MAX_WINDOW_HEIGHT_M) {
      out.push({
        kind: "outlier_height",
        room: o.room,
        opening: o,
        rule: "gross_band",
        limit_m: GROSS_MAX_WINDOW_HEIGHT_M,
      });
      continue;
    }
    if (classifyRoomCategory(o.room) === "BATHING" && h > BATHING_MAX_WINDOW_HEIGHT_M) {
      out.push({
        kind: "outlier_height",
        room: o.room,
        opening: o,
        rule: "bathing_max",
        limit_m: BATHING_MAX_WINDOW_HEIGHT_M,
      });
    }
  }
  return out;
}
