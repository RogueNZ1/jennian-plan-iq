/**
 * Internal wall confidence scoring — mirrors pipeline/result.py:score_internal_wall_confidence.
 *
 * Kept in sync with the Python implementation so the frontend can reason about
 * confidence without a round-trip to the geometry API (e.g. in unit tests).
 *
 * Service rooms (WC, WIR, Hall, Wardrobe, Ensuite etc.) are NOT expected to have
 * printed dimension boxes on residential floor plans — their absence must never
 * trigger a warning.  Only "main" habitable rooms count toward the confidence score.
 */

/** Room entry as returned in GeometryMeasurements.rooms */
export type RoomEntry = { label: string; width_m: number; depth_m: number };

export type InternalWallConfidence = "high" | "medium" | "low";

/** Rooms that should always be dimensioned on a complete plan. */
export const MAIN_ROOM_KEYWORDS = [
  "bed",
  "master",
  "bedroom",
  "lounge",
  "living",
  "kitchen",
  "dining",
  "family",
  "garage",
  "study",
  "office",
  "theatre",
  "media",
  "rumpus",
];

/** Service rooms — frequently undimensioned, not an error if missing. */
export const SERVICE_ROOM_KEYWORDS = [
  "wc",
  "toilet",
  "wir",
  "wardrobe",
  "robe",
  "hall",
  "corridor",
  "store",
  "storage",
  "cupboard",
  "linen",
  "laundry",
  "entry",
  "foyer",
  "porch",
  "lobby",
  "ensuite",
  "ens",
  "bath",
];

/**
 * Score internal wall confidence from main rooms found.
 *
 * Unlabelled rooms (label === "") count as main rooms — OCR often misses
 * the label text while correctly reading the dimension box.  A large
 * unlabelled annotation (both dims > 2000mm) is almost certainly habitable.
 *
 * @returns { confidence, mainRoomCount }
 */
export function scoreInternalWallConfidence(
  rooms: RoomEntry[],
  totalAreaM2: number | null,
): { confidence: InternalWallConfidence; mainRoomCount: number } {
  const mainRoomCount = rooms.filter((r) => {
    const label = (r.label ?? "").trim().toLowerCase();
    // Unlabelled → counts as main room
    if (!label) return true;
    // Matches a main room keyword
    return MAIN_ROOM_KEYWORDS.some((kw) => label.includes(kw));
  }).length;

  // Expected main rooms scaled by house size (mirrors Python thresholds)
  const area = totalAreaM2 ?? 0;
  const expected = area < 120 ? 3 : area < 180 ? 4 : 5;

  let confidence: InternalWallConfidence;
  if (mainRoomCount >= expected) {
    confidence = "high";
  } else if (mainRoomCount >= 1) {
    // At least one main room found — partial but not a failure.
    // "low" is reserved for zero main rooms (all service rooms or OCR
    // found nothing).
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return { confidence, mainRoomCount };
}

/**
 * Whether a low internal wall confidence should show a warning to the NHC.
 *
 * medium → NO warning (normal — service rooms often undimensioned)
 * low    → YES warning — very few room dimensions found
 */
export function shouldWarnInternalWall(
  confidence: InternalWallConfidence | null | undefined,
): boolean {
  return confidence === "low";
}
