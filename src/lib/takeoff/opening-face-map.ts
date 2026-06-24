import type { ElevationFaceBand, ElevationVectorOpening } from "./elevation-vector-openings";
import type { FrameAssemblyMember, FrameOpeningSlot } from "./elevation-opening-slots";
import type { PlanPhysicalOpeningWidthWitness } from "./floor-opening-witnesses";
import type { PlanGarageDoorWitness, PlanText } from "./plan-text";

export type PlanSide = NonNullable<PlanGarageDoorWitness["planSide"]>;

export type GarageDoorFaceAnchor = {
  kind: "unique_garage_door";
  planSide: PlanSide;
  elevationFace: string;
  elevationFaceBandId: string;
  witness: PlanGarageDoorWitness & { planSide: PlanSide };
  elevationOpening: ElevationVectorOpening & {
    type: "garage_door";
    widthMm: number;
    heightMm: number;
  };
  widthDeltaMm: number;
  note: string;
};

export type OppositeFaceSignatureAnchor = {
  kind: "opposite_layout_signature";
  planSide: PlanSide;
  elevationFace: string;
  elevationFaceBandId: string;
  witness: PlanPhysicalOpeningWidthWitness & { planSide: PlanSide };
  elevationOpening: ElevationVectorOpening & {
    widthMm: number;
    heightMm: number;
  };
  widthDeltaMm: number;
  layoutEvidence: string;
  signatureEvidence: string;
  note: string;
};

export type LongFaceSignatureAnchor = {
  kind: "long_face_signature";
  planSide: PlanSide;
  elevationFace: string;
  elevationFaceBandId: string;
  witnessMatches: Array<{
    witness: PlanPhysicalOpeningWidthWitness & { planSide: PlanSide };
    elevationOpening: ElevationVectorOpening & {
      widthMm: number;
      heightMm: number;
    };
    widthDeltaMm: number;
  }>;
  layoutEvidence: string;
  signatureEvidence: string;
  note: string;
};

export type OpeningSignatureFloorRow = {
  source: "printed_code" | "physical_width" | "garage_marker";
  room: string;
  widthMm: number;
  heightMm: number;
  planSide: PlanSide | null;
  x: number;
  y: number;
  note: string;
};

export type PlanSideLengthWitness = {
  planSide: PlanSide;
  lengthMm: number | null;
};

export type OrderedLengthFaceAnchor = {
  kind: "ordered_length_signature";
  planSide: PlanSide;
  elevationFace: string;
  elevationFaceBandId: string;
  orientation: "forward" | "reverse";
  planSideLengthMm: number;
  faceWidthMm: number;
  lengthDeltaMm: number;
  rowMatches: Array<{
    row: OpeningSignatureFloorRow & { planSide: PlanSide };
    slot: FrameOpeningSlot;
    member: FrameAssemblyMember;
    widthDeltaMm: number;
    heightDeltaMm: number;
  }>;
  layoutEvidence: string;
  signatureEvidence: string;
  note: string;
};

export type OpeningFaceAnchor =
  | GarageDoorFaceAnchor
  | OppositeFaceSignatureAnchor
  | LongFaceSignatureAnchor
  | OrderedLengthFaceAnchor;

export type OpeningFaceMap = {
  garageDoorAnchor: GarageDoorFaceAnchor | null;
  oppositeFaceAnchor: OppositeFaceSignatureAnchor | null;
  longFaceAnchors: LongFaceSignatureAnchor[];
  orderedLengthAnchors: OrderedLengthFaceAnchor[];
  byElevationFace: Map<string, OpeningFaceAnchor>;
  byPlanSide: Map<PlanSide, OpeningFaceAnchor>;
};

const DEFAULT_GARAGE_WIDTH_TOLERANCE_MM = 250;
const DEFAULT_SIGNATURE_WIDTH_TOLERANCE_MM = 250;
const SAME_ROW_CENTER_TOLERANCE_PT = 45;
const OPPOSITE_FACE_WIDTH_RATIO_MIN = 0.65;
const OPPOSITE_FACE_WIDTH_RATIO_MAX = 1.35;
const MIN_WIDE_OPENING_SIGNATURE_WIDTH_MM = 2200;
const LONG_FACE_MIN_WIDTH_RATIO_TO_SHORT_FACE = 1.5;
const LONG_FACE_CANONICAL_WIDTH_RATIO = 0.9;
const MIN_LONG_FACE_SIGNATURE_MATCHES = 2;
const ORDERED_SIGNATURE_WIDTH_TOLERANCE_MM = 250;
const ORDERED_SIGNATURE_HEIGHT_TOLERANCE_MM = 250;
const FLOOR_ELEVATION_LENGTH_TOLERANCE_MM = 650;
const MIN_ORDERED_SIGNATURE_ROWS = 2;
// This opposite-face bootstrap is only for wide sliders/doors. Window-height
// rows need a row-aware height target, not this standard slider/door bias.
const WIDE_OPENING_SIGNATURE_HEIGHT_MM = 2100;

function garageWitnesses(
  planText: Pick<PlanText, "garageDoorWitnesses"> | null | undefined,
): Array<PlanGarageDoorWitness & { planSide: PlanSide }> {
  return (planText?.garageDoorWitnesses ?? []).filter(
    (witness): witness is PlanGarageDoorWitness & { planSide: PlanSide } =>
      witness.planSide != null && /^GARAGE\b/i.test(witness.room ?? ""),
  );
}

function sectionalGarageDoors(openings: readonly ElevationVectorOpening[]): Array<
  ElevationVectorOpening & {
    type: "garage_door";
    widthMm: number;
    heightMm: number;
  }
> {
  return openings.filter(
    (
      opening,
    ): opening is ElevationVectorOpening & {
      type: "garage_door";
      widthMm: number;
      heightMm: number;
    } =>
      opening.type === "garage_door" &&
      opening.source === "sectional_garage_door" &&
      opening.widthMm != null &&
      opening.heightMm != null,
  );
}

function oppositePlanSide(planSide: PlanSide): PlanSide | null {
  if (planSide === "plan_left") return "plan_right";
  if (planSide === "plan_right") return "plan_left";
  if (planSide === "plan_top") return "plan_bottom";
  if (planSide === "plan_bottom") return "plan_top";
  return null;
}

function bandCenterY(band: ElevationFaceBand): number {
  return (band.y0 + band.y1) / 2;
}

function matchingOpeningsForWitness(args: {
  witness: PlanPhysicalOpeningWidthWitness;
  face: string;
  elevationOpenings: readonly ElevationVectorOpening[];
  widthToleranceMm: number;
}): Array<ElevationVectorOpening & { widthMm: number; heightMm: number }> {
  return args.elevationOpenings
    .filter(
      (
        opening,
      ): opening is ElevationVectorOpening & {
        widthMm: number;
        heightMm: number;
      } =>
        opening.face === args.face &&
        opening.type !== "garage_door" &&
        opening.widthMm != null &&
        opening.heightMm != null &&
        Math.abs(opening.widthMm - args.witness.widthMm) <= args.widthToleranceMm,
    )
    .sort(
      (a, b) =>
        Math.abs(a.widthMm - args.witness.widthMm) +
        Math.abs(a.heightMm - WIDE_OPENING_SIGNATURE_HEIGHT_MM) -
        (Math.abs(b.widthMm - args.witness.widthMm) +
          Math.abs(b.heightMm - WIDE_OPENING_SIGNATURE_HEIGHT_MM)),
    );
}

function buildOppositeFaceSignatureAnchor(args: {
  garageDoorAnchor: GarageDoorFaceAnchor | null;
  faceBands?: readonly ElevationFaceBand[];
  physicalOpeningWitnesses?: readonly PlanPhysicalOpeningWidthWitness[];
  elevationOpenings: readonly ElevationVectorOpening[];
  signatureWidthToleranceMm: number;
}): OppositeFaceSignatureAnchor | null {
  const garageAnchor = args.garageDoorAnchor;
  if (!garageAnchor || !args.faceBands || !args.physicalOpeningWitnesses) return null;
  const oppositeSide = oppositePlanSide(garageAnchor.planSide);
  if (!oppositeSide) return null;

  const garageBand = args.faceBands.find((band) => band.id === garageAnchor.elevationFaceBandId);
  if (!garageBand) return null;

  const sameRowBands = args.faceBands.filter((band) => {
    if (band.id === garageBand.id) return false;
    const widthRatio = band.widthMm / garageBand.widthMm;
    return (
      Math.abs(bandCenterY(band) - bandCenterY(garageBand)) <= SAME_ROW_CENTER_TOLERANCE_PT &&
      widthRatio >= OPPOSITE_FACE_WIDTH_RATIO_MIN &&
      widthRatio <= OPPOSITE_FACE_WIDTH_RATIO_MAX
    );
  });
  if (sameRowBands.length !== 1) return null;
  const [oppositeBand] = sameRowBands;

  const witnesses = args.physicalOpeningWitnesses.filter(
    (witness): witness is PlanPhysicalOpeningWidthWitness & { planSide: PlanSide } =>
      witness.planSide === oppositeSide && witness.widthMm >= MIN_WIDE_OPENING_SIGNATURE_WIDTH_MM,
  );
  const signatureMatches = witnesses
    .map((witness) => {
      const matches = matchingOpeningsForWitness({
        witness,
        face: oppositeBand.id,
        elevationOpenings: args.elevationOpenings,
        widthToleranceMm: args.signatureWidthToleranceMm,
      });
      if (matches.length === 0) return null;

      const matchingFaces = new Set(
        args.elevationOpenings
          .filter(
            (opening) =>
              opening.face !== garageAnchor.elevationFace &&
              opening.type !== "garage_door" &&
              opening.widthMm != null &&
              Math.abs(opening.widthMm - witness.widthMm) <= args.signatureWidthToleranceMm,
          )
          .map((opening) => opening.face),
      );
      if (matchingFaces.size !== 1 || !matchingFaces.has(oppositeBand.id)) return null;

      const [elevationOpening] = matches;
      return { witness, elevationOpening };
    })
    .filter((match): match is NonNullable<typeof match> => match != null);
  if (signatureMatches.length === 0) return null;

  const [match] = signatureMatches.sort(
    (a, b) =>
      Math.abs(a.elevationOpening.widthMm - a.witness.widthMm) +
      Math.abs(a.elevationOpening.heightMm - WIDE_OPENING_SIGNATURE_HEIGHT_MM) -
      (Math.abs(b.elevationOpening.widthMm - b.witness.widthMm) +
        Math.abs(b.elevationOpening.heightMm - WIDE_OPENING_SIGNATURE_HEIGHT_MM)),
  );
  const widthDeltaMm = Math.abs(match.elevationOpening.widthMm - match.witness.widthMm);
  const layoutEvidence =
    `${oppositeBand.id} is the unique same-row elevation band opposite ${garageBand.id}` +
    ` (${oppositeBand.widthMm}mm vs ${garageBand.widthMm}mm overall width)`;
  const signatureEvidence =
    `${oppositeSide} floor witness ${match.witness.widthMm}mm uniquely matches ${oppositeBand.id}` +
    ` ${match.elevationOpening.widthMm}x${match.elevationOpening.heightMm}mm`;

  return {
    kind: "opposite_layout_signature",
    planSide: oppositeSide,
    elevationFace: oppositeBand.id,
    elevationFaceBandId: oppositeBand.id,
    witness: match.witness,
    elevationOpening: match.elevationOpening,
    widthDeltaMm,
    layoutEvidence,
    signatureEvidence,
    note: `${layoutEvidence}; ${signatureEvidence}`,
  };
}

function openingWithWidth(
  opening: ElevationVectorOpening,
): opening is ElevationVectorOpening & { widthMm: number; heightMm: number } {
  return opening.widthMm != null && opening.heightMm != null;
}

function uniqueLongFaceMatchForWitness(args: {
  witness: PlanPhysicalOpeningWidthWitness & { planSide: PlanSide };
  longBands: readonly ElevationFaceBand[];
  elevationOpenings: readonly ElevationVectorOpening[];
  widthToleranceMm: number;
}): {
  face: string;
  elevationOpening: ElevationVectorOpening & { widthMm: number; heightMm: number };
  widthDeltaMm: number;
} | null {
  const matchesByFace = args.longBands
    .map((band) => {
      const matches = args.elevationOpenings
        .filter(
          (opening): opening is ElevationVectorOpening & { widthMm: number; heightMm: number } =>
            opening.face === band.id &&
            opening.type !== "garage_door" &&
            openingWithWidth(opening) &&
            Math.abs(opening.widthMm - args.witness.widthMm) <= args.widthToleranceMm,
        )
        .sort(
          (a, b) =>
            Math.abs(a.widthMm - args.witness.widthMm) -
              Math.abs(b.widthMm - args.witness.widthMm) ||
            Math.abs(a.heightMm - WIDE_OPENING_SIGNATURE_HEIGHT_MM) -
              Math.abs(b.heightMm - WIDE_OPENING_SIGNATURE_HEIGHT_MM),
        );
      return matches.length > 0
        ? {
            face: band.id,
            elevationOpening: matches[0],
            widthDeltaMm: Math.abs(matches[0].widthMm - args.witness.widthMm),
          }
        : null;
    })
    .filter((match): match is NonNullable<typeof match> => match != null);

  if (matchesByFace.length !== 1) return null;
  return matchesByFace[0];
}

function buildLongFaceSignatureAnchors(args: {
  knownAnchors: readonly OpeningFaceAnchor[];
  faceBands?: readonly ElevationFaceBand[];
  physicalOpeningWitnesses?: readonly PlanPhysicalOpeningWidthWitness[];
  elevationOpenings: readonly ElevationVectorOpening[];
  signatureWidthToleranceMm: number;
}): LongFaceSignatureAnchor[] {
  if (!args.faceBands || !args.physicalOpeningWitnesses) return [];
  const knownPlanSides = new Set(args.knownAnchors.map((anchor) => anchor.planSide));
  const leftAnchor = args.knownAnchors.find((anchor) => anchor.planSide === "plan_left");
  const rightAnchor = args.knownAnchors.find((anchor) => anchor.planSide === "plan_right");
  if (!leftAnchor || !rightAnchor) return [];

  const knownFaceIds = new Set(args.knownAnchors.map((anchor) => anchor.elevationFaceBandId));
  const leftBand = args.faceBands.find((band) => band.id === leftAnchor.elevationFaceBandId);
  const rightBand = args.faceBands.find((band) => band.id === rightAnchor.elevationFaceBandId);
  if (!leftBand || !rightBand) return [];

  const facesWithOpenings = new Set(args.elevationOpenings.map((opening) => opening.face));
  const shortFaceWidthMm = Math.max(leftBand.widthMm, rightBand.widthMm);
  const longCandidates = args.faceBands.filter(
    (band) =>
      facesWithOpenings.has(band.id) &&
      !knownFaceIds.has(band.id) &&
      band.widthMm >= shortFaceWidthMm * LONG_FACE_MIN_WIDTH_RATIO_TO_SHORT_FACE,
  );
  if (longCandidates.length < 2) return [];
  const widestLongFace = Math.max(...longCandidates.map((band) => band.widthMm));
  const longBands = longCandidates.filter(
    (band) => band.widthMm >= widestLongFace * LONG_FACE_CANONICAL_WIDTH_RATIO,
  );
  if (longBands.length !== 2) return [];

  const out: LongFaceSignatureAnchor[] = [];
  for (const planSide of ["plan_top", "plan_bottom"] as const) {
    if (knownPlanSides.has(planSide)) continue;
    const witnesses = args.physicalOpeningWitnesses.filter(
      (witness): witness is PlanPhysicalOpeningWidthWitness & { planSide: PlanSide } =>
        witness.planSide === planSide && witness.widthMm >= MIN_WIDE_OPENING_SIGNATURE_WIDTH_MM,
    );
    const matches = witnesses
      .map((witness) => {
        const match = uniqueLongFaceMatchForWitness({
          witness,
          longBands,
          elevationOpenings: args.elevationOpenings,
          widthToleranceMm: args.signatureWidthToleranceMm,
        });
        return match ? { witness, ...match } : null;
      })
      .filter((match): match is NonNullable<typeof match> => match != null);
    if (matches.length < MIN_LONG_FACE_SIGNATURE_MATCHES) continue;

    const faces = new Set(matches.map((match) => match.face));
    if (faces.size !== 1) continue;
    const [face] = [...faces];
    const band = longBands.find((candidate) => candidate.id === face);
    if (!band) continue;

    const layoutEvidence =
      `${face} is one of the two unmapped long elevation bands after left/right anchors` +
      ` (${band.widthMm}mm overall width vs ${shortFaceWidthMm}mm short-face width)`;
    const signatureEvidence = `${planSide} floor witnesses ${matches
      .map((match) => `${match.witness.widthMm}->${match.elevationOpening.widthMm}`)
      .join(", ")} uniquely match ${face}`;

    out.push({
      kind: "long_face_signature",
      planSide,
      elevationFace: face,
      elevationFaceBandId: face,
      witnessMatches: matches.map((match) => ({
        witness: match.witness,
        elevationOpening: match.elevationOpening,
        widthDeltaMm: match.widthDeltaMm,
      })),
      layoutEvidence,
      signatureEvidence,
      note: `${layoutEvidence}; ${signatureEvidence}`,
    });
  }

  const usedFaces = new Set<string>();
  const uniqueAnchors: LongFaceSignatureAnchor[] = [];
  for (const anchor of out) {
    if (usedFaces.has(anchor.elevationFace)) continue;
    usedFaces.add(anchor.elevationFace);
    uniqueAnchors.push(anchor);
  }
  return uniqueAnchors;
}

function planSideOrderValue(row: OpeningSignatureFloorRow): number {
  if (row.planSide === "plan_top" || row.planSide === "plan_bottom") return row.x;
  if (row.planSide === "plan_left" || row.planSide === "plan_right") return row.y;
  return row.x + row.y;
}

function slotMemberForRow(
  row: OpeningSignatureFloorRow,
  slot: FrameOpeningSlot,
): FrameAssemblyMember | null {
  return (
    slot.members
      .filter(
        (member) =>
          Math.abs(member.widthMm - row.widthMm) <= ORDERED_SIGNATURE_WIDTH_TOLERANCE_MM &&
          Math.abs(member.heightMm - row.heightMm) <= ORDERED_SIGNATURE_HEIGHT_TOLERANCE_MM,
      )
      .sort(
        (a, b) =>
          Math.abs(a.widthMm - row.widthMm) +
          Math.abs(a.heightMm - row.heightMm) -
          (Math.abs(b.widthMm - row.widthMm) + Math.abs(b.heightMm - row.heightMm)),
      )[0] ?? null
  );
}

type OrderedMatchState = {
  matches: number;
  score: number;
  pairs: Array<{
    row: OpeningSignatureFloorRow & { planSide: PlanSide };
    slot: FrameOpeningSlot;
    member: FrameAssemblyMember;
  }>;
};

function betterOrderedState(a: OrderedMatchState, b: OrderedMatchState): OrderedMatchState {
  if (a.matches !== b.matches) return a.matches > b.matches ? a : b;
  return a.score <= b.score ? a : b;
}

function orderedSlotMatch(
  rows: ReadonlyArray<OpeningSignatureFloorRow & { planSide: PlanSide }>,
  slots: readonly FrameOpeningSlot[],
): OrderedMatchState {
  const empty: OrderedMatchState = { matches: 0, score: 0, pairs: [] };
  const dp: OrderedMatchState[][] = Array.from({ length: rows.length + 1 }, () =>
    Array.from({ length: slots.length + 1 }, () => empty),
  );

  for (let i = 0; i <= rows.length; i += 1) {
    for (let j = 0; j <= slots.length; j += 1) {
      let best = dp[i][j];
      if (i > 0) best = betterOrderedState(best, dp[i - 1][j]);
      if (j > 0) best = betterOrderedState(best, dp[i][j - 1]);
      if (i > 0 && j > 0) {
        const row = rows[i - 1];
        const slot = slots[j - 1];
        const member = slotMemberForRow(row, slot);
        if (member) {
          best = betterOrderedState(best, {
            matches: dp[i - 1][j - 1].matches + 1,
            score:
              dp[i - 1][j - 1].score +
              Math.abs(member.widthMm - row.widthMm) +
              Math.abs(member.heightMm - row.heightMm),
            pairs: [...dp[i - 1][j - 1].pairs, { row, slot, member }],
          });
        }
      }
      dp[i][j] = best;
    }
  }

  return dp[rows.length][slots.length];
}

function buildOrderedLengthFaceAnchors(args: {
  knownAnchors: readonly OpeningFaceAnchor[];
  faceBands?: readonly ElevationFaceBand[];
  openingSlots?: readonly FrameOpeningSlot[];
  floorSignatureRows?: readonly OpeningSignatureFloorRow[];
  floorSideLengthWitnesses?: readonly PlanSideLengthWitness[];
}): OrderedLengthFaceAnchor[] {
  if (!args.faceBands || !args.openingSlots || !args.floorSignatureRows) return [];
  const knownPlanSides = new Set(args.knownAnchors.map((anchor) => anchor.planSide));
  const knownFaces = new Set(args.knownAnchors.map((anchor) => anchor.elevationFaceBandId));
  const lengthBySide = new Map(
    (args.floorSideLengthWitnesses ?? [])
      .filter((witness) => witness.lengthMm != null)
      .map((witness) => [witness.planSide, witness.lengthMm as number]),
  );
  const faceBandById = new Map(args.faceBands.map((band) => [band.id, band]));
  const slotsByFace = args.openingSlots.reduce<Map<string, FrameOpeningSlot[]>>((acc, slot) => {
    if (knownFaces.has(slot.faceBandId)) return acc;
    const existing = acc.get(slot.faceBandId);
    if (existing) existing.push(slot);
    else acc.set(slot.faceBandId, [slot]);
    return acc;
  }, new Map());
  const rowsBySide = args.floorSignatureRows.reduce<
    Map<PlanSide, Array<OpeningSignatureFloorRow & { planSide: PlanSide }>>
  >((acc, row) => {
    if (!row.planSide || knownPlanSides.has(row.planSide)) return acc;
    const existing = acc.get(row.planSide);
    if (existing) existing.push(row as OpeningSignatureFloorRow & { planSide: PlanSide });
    else acc.set(row.planSide, [row as OpeningSignatureFloorRow & { planSide: PlanSide }]);
    return acc;
  }, new Map());

  const anchors: OrderedLengthFaceAnchor[] = [];
  for (const [planSide, sideRows] of rowsBySide.entries()) {
    const planSideLengthMm = lengthBySide.get(planSide);
    if (planSideLengthMm == null || sideRows.length < MIN_ORDERED_SIGNATURE_ROWS) continue;
    const orderedRows = [...sideRows].sort((a, b) => planSideOrderValue(a) - planSideOrderValue(b));
    const candidates = [...slotsByFace.entries()]
      .map(([faceBandId, faceSlots]) => {
        const band = faceBandById.get(faceBandId);
        if (!band) return null;
        const lengthDeltaMm = Math.abs(planSideLengthMm - band.widthMm);
        if (lengthDeltaMm > FLOOR_ELEVATION_LENGTH_TOLERANCE_MM) return null;

        const orderedSlots = [...faceSlots].sort((a, b) => a.x - b.x);
        const forward = orderedSlotMatch(orderedRows, orderedSlots);
        const reverse = orderedSlotMatch([...orderedRows].reverse(), orderedSlots);
        if (forward.matches !== orderedRows.length && reverse.matches !== orderedRows.length) {
          return null;
        }
        const sameStrength =
          forward.matches === reverse.matches && Math.abs(forward.score - reverse.score) <= 150;
        if (sameStrength) return null;
        const best =
          reverse.matches > forward.matches ||
          (reverse.matches === forward.matches && reverse.score < forward.score)
            ? { orientation: "reverse" as const, state: reverse }
            : { orientation: "forward" as const, state: forward };
        if (best.state.matches !== orderedRows.length) return null;
        return {
          faceBandId,
          band,
          lengthDeltaMm,
          orientation: best.orientation,
          state: best.state,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
      .sort((a, b) => a.lengthDeltaMm - b.lengthDeltaMm || a.state.score - b.state.score);

    if (candidates.length !== 1) continue;
    const [candidate] = candidates;
    const layoutEvidence =
      `${candidate.faceBandId} is the only unmapped elevation band whose width matches ${planSide}` +
      ` (${candidate.band.widthMm}mm elevation vs ${planSideLengthMm}mm floor side)`;
    const signatureEvidence = `${planSide} ordered floor sequence ${candidate.state.pairs
      .map(
        ({ row, member }) =>
          `${row.room} ${row.widthMm}x${row.heightMm}->${member.widthMm}x${member.heightMm}`,
      )
      .join(", ")} matches ${candidate.faceBandId} ${candidate.orientation}`;
    anchors.push({
      kind: "ordered_length_signature",
      planSide,
      elevationFace: candidate.faceBandId,
      elevationFaceBandId: candidate.faceBandId,
      orientation: candidate.orientation,
      planSideLengthMm,
      faceWidthMm: candidate.band.widthMm,
      lengthDeltaMm: candidate.lengthDeltaMm,
      rowMatches: candidate.state.pairs.map(({ row, slot, member }) => ({
        row,
        slot,
        member,
        widthDeltaMm: Math.abs(member.widthMm - row.widthMm),
        heightDeltaMm: Math.abs(member.heightMm - row.heightMm),
      })),
      layoutEvidence,
      signatureEvidence,
      note: `${layoutEvidence}; ${signatureEvidence}`,
    });
  }

  const usedFaces = new Set<string>();
  const uniqueAnchors: OrderedLengthFaceAnchor[] = [];
  for (const anchor of anchors) {
    if (usedFaces.has(anchor.elevationFaceBandId)) continue;
    usedFaces.add(anchor.elevationFaceBandId);
    uniqueAnchors.push(anchor);
  }
  return uniqueAnchors;
}

export function buildOpeningFaceMap(args: {
  planText: Pick<PlanText, "garageDoorWitnesses"> | null | undefined;
  elevationOpenings: readonly ElevationVectorOpening[];
  faceBands?: readonly ElevationFaceBand[];
  physicalOpeningWitnesses?: readonly PlanPhysicalOpeningWidthWitness[];
  openingSlots?: readonly FrameOpeningSlot[];
  floorSignatureRows?: readonly OpeningSignatureFloorRow[];
  floorSideLengthWitnesses?: readonly PlanSideLengthWitness[];
  garageWidthToleranceMm?: number;
  signatureWidthToleranceMm?: number;
}): OpeningFaceMap {
  const widthToleranceMm = args.garageWidthToleranceMm ?? DEFAULT_GARAGE_WIDTH_TOLERANCE_MM;
  const signatureWidthToleranceMm =
    args.signatureWidthToleranceMm ?? DEFAULT_SIGNATURE_WIDTH_TOLERANCE_MM;
  const witnesses = garageWitnesses(args.planText);
  const elevationGarageDoors = sectionalGarageDoors(args.elevationOpenings);

  let garageDoorAnchor: GarageDoorFaceAnchor | null = null;
  if (witnesses.length === 1 && elevationGarageDoors.length === 1) {
    const witness = witnesses[0];
    const elevationOpening = elevationGarageDoors[0];
    const widthDeltaMm = Math.abs(elevationOpening.widthMm - witness.widthMm);
    if (widthDeltaMm <= widthToleranceMm) {
      garageDoorAnchor = {
        kind: "unique_garage_door",
        planSide: witness.planSide,
        elevationFace: elevationOpening.face,
        elevationFaceBandId: elevationOpening.faceBandId,
        witness,
        elevationOpening,
        widthDeltaMm,
        note:
          `unique garage-door object anchors ${elevationOpening.face} to ${witness.planSide}` +
          ` (${witness.widthMm}mm floor witness vs ${elevationOpening.widthMm}x${elevationOpening.heightMm}mm elevation)`,
      };
    }
  }

  const oppositeFaceAnchor = buildOppositeFaceSignatureAnchor({
    garageDoorAnchor,
    faceBands: args.faceBands,
    physicalOpeningWitnesses: args.physicalOpeningWitnesses,
    elevationOpenings: args.elevationOpenings,
    signatureWidthToleranceMm,
  });

  const byElevationFace = new Map<string, OpeningFaceAnchor>();
  const byPlanSide = new Map<PlanSide, OpeningFaceAnchor>();
  if (garageDoorAnchor) {
    byElevationFace.set(garageDoorAnchor.elevationFace, garageDoorAnchor);
    byPlanSide.set(garageDoorAnchor.planSide, garageDoorAnchor);
  }
  if (oppositeFaceAnchor) {
    byElevationFace.set(oppositeFaceAnchor.elevationFace, oppositeFaceAnchor);
    byPlanSide.set(oppositeFaceAnchor.planSide, oppositeFaceAnchor);
  }
  const longFaceAnchors = buildLongFaceSignatureAnchors({
    knownAnchors: [...byPlanSide.values()],
    faceBands: args.faceBands,
    physicalOpeningWitnesses: args.physicalOpeningWitnesses,
    elevationOpenings: args.elevationOpenings,
    signatureWidthToleranceMm,
  });
  for (const anchor of longFaceAnchors) {
    byElevationFace.set(anchor.elevationFace, anchor);
    byPlanSide.set(anchor.planSide, anchor);
  }
  const orderedLengthAnchors = buildOrderedLengthFaceAnchors({
    knownAnchors: [...byPlanSide.values()],
    faceBands: args.faceBands,
    openingSlots: args.openingSlots,
    floorSignatureRows: args.floorSignatureRows,
    floorSideLengthWitnesses: args.floorSideLengthWitnesses,
  });
  for (const anchor of orderedLengthAnchors) {
    byElevationFace.set(anchor.elevationFace, anchor);
    byPlanSide.set(anchor.planSide, anchor);
  }

  return {
    garageDoorAnchor,
    oppositeFaceAnchor,
    longFaceAnchors,
    orderedLengthAnchors,
    byElevationFace,
    byPlanSide,
  };
}
