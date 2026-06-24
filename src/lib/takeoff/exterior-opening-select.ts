// Envelope-first opening selection.
//
// The floor-plan gap detector emits a candidate for EVERY break in EVERY wall —
// interior doorways included — which is why the overlay shows markers all over the
// plan. A window/external door is, by definition, a gap *on the building envelope*.
// This gate keeps only those, and drops sub-window wall-jog slivers, so what reaches
// the takeoff is the real opening set, not the interior noise.
//
// IMPORTANT: this produces WIDTH evidence only. A gap on the envelope tells you a wall
// is interrupted and how wide — it does NOT give a height. Nothing here is priceable;
// a height must still come from the elevation/schedule. The output names say so.

export type GapCandidate = {
  id: string;
  widthMm: number;
  orientation?: "horizontal" | "vertical";
  /** "exterior" when the gap sits on the building envelope, else interior. */
  envelopeSide?: string | null;
  confidence?: "high" | "medium" | "low";
  roomLabel?: string | null;
  /** The side of the wall the ROOM is on. The exterior face is the OPPOSITE side. */
  roomSide?: "north" | "south" | "east" | "west" | null;
  routing?: { ambiguous?: boolean } | null;
};

export type CompassFace = "north" | "south" | "east" | "west";

/**
 * A measured WIDTH on the building envelope. NOT a priceable opening: it has no height.
 * Downstream must attach a height (elevation/schedule) before this can be priced.
 */
export type ExteriorWidthCandidate = {
  id: string;
  widthMm: number;
  /** Exterior wall this sits on = the side OPPOSITE the room (mirrors elevation-gap-match). */
  exteriorFace: CompassFace | null;
  room: string | null;
  confidence: "high" | "medium" | "low";
};

export type RejectedGap = { id: string; widthMm: number; reason: string };

export type ExteriorWidthSelection = {
  /** Exterior, real width, confident & unambiguous. A SUPPORTED WIDTH — still needs a height before pricing. */
  supportedWidthCandidates: ExteriorWidthCandidate[];
  /** Exterior, real width, but low-confidence or ambiguous — confirm before use; also still needs a height. */
  reviewWidthCandidates: ExteriorWidthCandidate[];
  /** Interior gaps and sub-window slivers — genuine noise, kept out of the takeoff entirely. */
  rejected: RejectedGap[];
};

/** Smallest gap we will treat as a real opening; below this is a wall jog / drafting slop. */
export const MIN_OPENING_WIDTH_MM = 600;
/** Largest plausible single opening; above this is two openings or a measurement fault. */
export const MAX_OPENING_WIDTH_MM = 6000;

/** The exterior face is the side opposite the room (same convention as elevation-gap-match). */
export function oppositeFace(side: GapCandidate["roomSide"]): CompassFace | null {
  if (side === "north") return "south";
  if (side === "south") return "north";
  if (side === "east") return "west";
  if (side === "west") return "east";
  return null;
}

export function selectExteriorWidthCandidates(
  gaps: readonly GapCandidate[],
): ExteriorWidthSelection {
  const supportedWidthCandidates: ExteriorWidthCandidate[] = [];
  const reviewWidthCandidates: ExteriorWidthCandidate[] = [];
  const rejected: RejectedGap[] = [];

  for (const gap of gaps) {
    const w = gap.widthMm;
    // Noise: not on the envelope, or too small/large to be a real opening.
    if (gap.envelopeSide !== "exterior") {
      rejected.push({ id: gap.id, widthMm: w, reason: "interior — not on the building envelope" });
      continue;
    }
    if (!(w >= MIN_OPENING_WIDTH_MM)) {
      rejected.push({
        id: gap.id,
        widthMm: w,
        reason: `sliver ${w}mm < ${MIN_OPENING_WIDTH_MM}mm — wall jog, not an opening`,
      });
      continue;
    }
    if (w > MAX_OPENING_WIDTH_MM) {
      rejected.push({
        id: gap.id,
        widthMm: w,
        reason: `${w}mm exceeds a single opening — split or remeasure`,
      });
      continue;
    }
    // A real exterior WIDTH. Confident + unambiguous ones are supported; the rest go to
    // review. Neither is priceable yet — both still need a height.
    const candidate: ExteriorWidthCandidate = {
      id: gap.id,
      widthMm: w,
      exteriorFace: oppositeFace(gap.roomSide ?? null),
      room: gap.roomLabel ?? null,
      confidence: gap.confidence ?? "low",
    };
    if (gap.confidence === "low" || gap.routing?.ambiguous) reviewWidthCandidates.push(candidate);
    else supportedWidthCandidates.push(candidate);
  }

  return { supportedWidthCandidates, reviewWidthCandidates, rejected };
}
