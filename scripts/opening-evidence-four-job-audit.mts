import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Segment } from "../src/lib/doors/door-engine";
import { extractPageGeometry } from "../src/lib/doors/pdf-adapter";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
  type ElevationFaceBand,
  type ElevationVectorOpening,
} from "../src/lib/takeoff/elevation-vector-openings";
import {
  detectElevationFaceLabels,
  elevationBandSlot,
} from "../src/lib/takeoff/elevation-face-labels";
import {
  detectPhysicalOpeningWidthWitnesses,
  detectPrintedWindowCodeWitnesses,
} from "../src/lib/takeoff/floor-opening-witnesses";
import { parsePlanText, type PlanText } from "../src/lib/takeoff/plan-text";

type Job = {
  id: string;
  floorPlan: string;
  elevation?: string;
  elevationPage?: number;
  truth?: string;
};

type FrameRectangleCandidate = {
  widthMm: number;
  heightMm: number;
  x: number;
  y: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  areaPt2: number;
};

type FrameAssemblyCandidate = FrameRectangleCandidate & {
  faceBandId: string;
  containingRects: number;
  childRects: number;
  memberRects: number;
  assemblyScore: number;
};

type FrameAssemblyMember = FrameRectangleCandidate & {
  faceBandId: string;
  containingRects: number;
  childRects: number;
};

type FrameAssemblyGroup = FrameRectangleCandidate & {
  id: string;
  faceBandId: string;
  groupWidthMm: number;
  groupHeightMm: number;
  memberRects: number;
  nestedMemberRects: number;
  maxChildRects: number;
  minContainingRects: number;
  members: FrameAssemblyMember[];
};

type FrameOpeningSlot = FrameRectangleCandidate & {
  id: string;
  groupId: string;
  faceBandId: string;
  groupWidthMm: number;
  groupHeightMm: number;
  groupMemberRects: number;
  groupLikelyMultiOpening: boolean;
  slotMemberRects: number;
  nestedSlotMemberRects: number;
  members: FrameAssemblyMember[];
};

type FloorEvidenceRow = {
  source: "printed_code" | "physical_width" | "garage_marker";
  room: string;
  widthMm: number;
  heightMm: number;
  planSide: string | null;
  x: number;
  y: number;
  note: string;
};

type PlanSideName = "plan_top" | "plan_bottom" | "plan_left" | "plan_right";

type PlanSideLengthWitness = {
  planSide: PlanSideName;
  lengthMm: number | null;
  candidates: Array<{ valueMm: number; x: number; y: number; vertical: boolean; text: string }>;
  note: string;
};

type RowGuidedFrameQuery = {
  row: FloorEvidenceRow;
  candidates: number;
  faceBandCandidates: number;
  lowNestedCandidates: number;
  topCandidates: Array<{
    widthMm: number;
    heightMm: number;
    x: number;
    y: number;
    containingRects: number;
    inFaceBand: boolean;
    childRects?: number;
    memberRects?: number;
    nestedMemberRects?: number;
    maxChildRects?: number;
    minContainingRects?: number;
    groupWidthMm?: number;
    groupHeightMm?: number;
    groupId?: string;
    groupLikelyMultiOpening?: boolean;
    slotMemberRects?: number;
    nestedSlotMemberRects?: number;
    faceBandId?: string;
    assemblyScore?: number;
    score: number;
  }>;
};

type OrderedSignatureMatch = {
  planSide: string;
  faceBandId: string;
  orientation: "forward" | "reverse" | "ambiguous" | "none";
  floorRows: number;
  slots: number;
  planSideLengthMm: number | null;
  faceWidthMm: number | null;
  lengthDeltaMm: number | null;
  lengthCompatible: boolean;
  forwardMatches: number;
  reverseMatches: number;
  matches: number;
  score: number | null;
  matchedRows: Array<{
    room: string;
    widthMm: number;
    heightMm: number;
    slotId: string;
    faceBandId: string;
    slotX: number;
    slotY: number;
    recoveredWidthMm: number;
    recoveredHeightMm: number;
    widthDeltaMm: number;
    heightDeltaMm: number;
    groupId: string;
    groupLikelyMultiOpening: boolean;
  }>;
};

type OrderedSignatureSideStatus =
  | "unique_full_match"
  | "orientation_only_full_ambiguity"
  | "multiple_face_full_ambiguity"
  | "partial_matches_only"
  | "no_matches";

type LengthGateStatus =
  | "unique_length_compatible_full_match"
  | "unique_length_match_orientation_ambiguous"
  | "multiple_length_compatible_full_matches"
  | "no_length_compatible_full_match"
  | "missing_floor_side_length"
  | "no_full_sequence_match";

const PT_PER_MM = 72 / 25.4;
const ELEVATION_SCALE = 100;
const ROW_GUIDED_WIDTH_TOLERANCE_MM = 250;
const ROW_GUIDED_HEIGHT_TOLERANCE_MM = 250;
const STANDARD_TALL_OPENING_HEIGHT_MM = 2100;
const MAX_ASSEMBLY_GROUP_WIDTH_MM = 6200;
const FLOOR_ELEVATION_LENGTH_TOLERANCE_MM = 650;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outPath = resolve(root, "output/diagnostics/opening-evidence-four-job-audit.json");

const jobs: Job[] = [
  {
    id: "fenner",
    floorPlan: "tests/doors/plans/fenner-floorplan.pdf",
    elevation: "tests/doors/plans/fenner-elevations.pdf",
    truth: "tests/fixtures/fenner/ground-truth.json",
  },
  {
    id: "15a",
    floorPlan: "tests/fixtures/15a/floorplan.pdf",
    elevation: "tests/fixtures/15a/elevations.pdf",
    truth: "tests/fixtures/15a/ground-truth.json",
  },
  {
    id: "oneil",
    floorPlan: "tests/fixtures/oneil/floorplan.pdf",
    elevation: "tests/fixtures/oneil/elevations.pdf",
    truth: "tests/fixtures/oneil/ground-truth.json",
  },
  {
    id: "beddis",
    floorPlan: "tests/fixtures/beddis/concept-floorplan.pdf",
    elevation: "tests/fixtures/beddis/prelim.pdf",
    elevationPage: 5,
    truth: "tests/fixtures/beddis/ground-truth.json",
  },
];

function truthOpenings(
  truthPath: string | undefined,
): Array<{ widthMm: number; heightMm: number }> {
  if (!truthPath || !existsSync(resolve(root, truthPath))) return [];
  const raw = JSON.parse(readFileSync(resolve(root, truthPath), "utf8"));
  const rows = raw.manual_openings ?? raw.joinery_bench?.openings ?? [];
  return rows
    .map((row: { width_m?: number; height_m?: number; widthMm?: number; heightMm?: number }) => {
      const widthMm = row.widthMm ?? (row.width_m != null ? Math.round(row.width_m * 1000) : null);
      const heightMm =
        row.heightMm ?? (row.height_m != null ? Math.round(row.height_m * 1000) : null);
      return widthMm != null && heightMm != null ? { widthMm, heightMm } : null;
    })
    .filter(
      (
        row: { widthMm: number; heightMm: number } | null,
      ): row is {
        widthMm: number;
        heightMm: number;
      } => row != null,
    );
}

function ptToMm(pt: number): number {
  return Math.round((pt / PT_PER_MM) * ELEVATION_SCALE);
}

function axialSegments(segments: readonly Segment[]): {
  horizontals: Array<{ y: number; x0: number; x1: number; len: number }>;
  verticals: Array<{ x: number; y0: number; y1: number; len: number }>;
} {
  const horizontals: Array<{ y: number; x0: number; x1: number; len: number }> = [];
  const verticals: Array<{ x: number; y0: number; y1: number; len: number }> = [];
  for (const segment of segments) {
    const dx = segment.x1 - segment.x0;
    const dy = segment.y1 - segment.y0;
    const len = Math.hypot(dx, dy);
    if (len < 5) continue;
    if (Math.abs(dy) <= Math.abs(dx) * 0.03) {
      horizontals.push({
        y: (segment.y0 + segment.y1) / 2,
        x0: Math.min(segment.x0, segment.x1),
        x1: Math.max(segment.x0, segment.x1),
        len,
      });
    } else if (Math.abs(dx) <= Math.abs(dy) * 0.03) {
      verticals.push({
        x: (segment.x0 + segment.x1) / 2,
        y0: Math.min(segment.y0, segment.y1),
        y1: Math.max(segment.y0, segment.y1),
        len,
      });
    }
  }
  return { horizontals, verticals };
}

function horizontalSpans(
  horizontals: readonly { y: number; x0: number; x1: number },
  y: number,
  x0: number,
  x1: number,
): boolean {
  return horizontals.some(
    (horizontal) =>
      Math.abs(horizontal.y - y) <= 3 && horizontal.x0 <= x0 + 2 && horizontal.x1 >= x1 - 2,
  );
}

function frameRectangleCandidates(segments: readonly Segment[]): FrameRectangleCandidate[] {
  const { horizontals, verticals } = axialSegments(segments);
  const raw: FrameRectangleCandidate[] = [];
  for (let i = 0; i < verticals.length; i += 1) {
    for (let j = i + 1; j < verticals.length; j += 1) {
      const a = verticals[i];
      const b = verticals[j];
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const widthMm = ptToMm(x1 - x0);
      if (widthMm < 400 || widthMm > 5200) continue;

      const y0 = Math.max(a.y0, b.y0);
      const y1 = Math.min(a.y1, b.y1);
      if (y1 <= y0) continue;
      const heightMm = ptToMm(y1 - y0);
      if (heightMm < 450 || heightMm > 2600) continue;
      if (!horizontalSpans(horizontals, y0, x0, x1)) continue;
      if (!horizontalSpans(horizontals, y1, x0, x1)) continue;

      raw.push({
        widthMm,
        heightMm,
        x: Math.round(((x0 + x1) / 2) * 10) / 10,
        y: Math.round(((y0 + y1) / 2) * 10) / 10,
        x0,
        x1,
        y0,
        y1,
        areaPt2: (x1 - x0) * (y1 - y0),
      });
    }
  }

  raw.sort((a, b) => a.y - b.y || a.x - b.x);
  const kept: FrameRectangleCandidate[] = [];
  for (const candidate of raw) {
    const duplicate = kept.some(
      (existing) =>
        Math.hypot(existing.x - candidate.x, existing.y - candidate.y) < 5 &&
        Math.abs(existing.widthMm - candidate.widthMm) < 100 &&
        Math.abs(existing.heightMm - candidate.heightMm) < 100,
    );
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}

function rectOverlapRatio(a: FrameRectangleCandidate, b: FrameRectangleCandidate): number {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  if (w <= 0 || h <= 0) return 0;
  const shared = w * h;
  return shared / Math.max(1, Math.min(a.areaPt2, b.areaPt2));
}

function containingRectCount(
  candidate: FrameRectangleCandidate,
  candidates: readonly FrameRectangleCandidate[],
): number {
  return candidates.filter(
    (other) =>
      other !== candidate &&
      other.areaPt2 > candidate.areaPt2 * 1.15 &&
      other.x0 <= candidate.x0 + 2 &&
      other.x1 >= candidate.x1 - 2 &&
      other.y0 <= candidate.y0 + 2 &&
      other.y1 >= candidate.y1 - 2,
  ).length;
}

function childRectCount(
  candidate: FrameRectangleCandidate,
  candidates: readonly FrameRectangleCandidate[],
): number {
  return candidates.filter(
    (other) =>
      other !== candidate &&
      other.areaPt2 < candidate.areaPt2 * 0.96 &&
      other.x0 >= candidate.x0 - 2 &&
      other.x1 <= candidate.x1 + 2 &&
      other.y0 >= candidate.y0 - 2 &&
      other.y1 <= candidate.y1 + 2,
  ).length;
}

function rectContains(
  parent: FrameRectangleCandidate,
  child: FrameRectangleCandidate,
  tolerance = 2,
): boolean {
  return (
    parent.x0 <= child.x0 + tolerance &&
    parent.x1 >= child.x1 - tolerance &&
    parent.y0 <= child.y0 + tolerance &&
    parent.y1 >= child.y1 - tolerance
  );
}

function inFaceBand(
  candidate: FrameRectangleCandidate,
  bands: readonly ElevationFaceBand[],
): boolean {
  const cx = candidate.x;
  const cy = candidate.y;
  return bands.some(
    (band) => cx >= band.x0 - 8 && cx <= band.x1 + 8 && cy >= band.y0 - 20 && cy <= band.y1 + 25,
  );
}

function candidateFaceBandId(
  candidate: FrameRectangleCandidate,
  bands: readonly ElevationFaceBand[],
): string | null {
  const cx = candidate.x;
  const cy = candidate.y;
  const matches = bands.filter(
    (band) => cx >= band.x0 - 8 && cx <= band.x1 + 8 && cy >= band.y0 - 20 && cy <= band.y1 + 25,
  );
  return matches.sort((a, b) => a.widthMm - b.widthMm)[0]?.id ?? null;
}

function plausibleOpeningShape(candidate: FrameRectangleCandidate): boolean {
  const width = candidate.widthMm;
  const height = candidate.heightMm;
  if (width < 450 || width > 5200 || height < 500 || height > 2600) return false;
  const aspect = width / Math.max(1, height);
  const doorLike = height >= 1750 && width >= 550 && aspect >= 0.18 && aspect <= 2.6;
  const windowLike = height < 1750 && aspect >= 0.28 && aspect <= 4.8;
  return doorLike || windowLike;
}

function hasNearDuplicateLarger(
  candidate: FrameRectangleCandidate,
  candidates: readonly FrameRectangleCandidate[],
): boolean {
  return candidates.some(
    (other) =>
      other !== candidate &&
      other.areaPt2 > candidate.areaPt2 &&
      rectOverlapRatio(candidate, other) > 0.92 &&
      Math.abs(candidate.widthMm - other.widthMm) <= 120 &&
      Math.abs(candidate.heightMm - other.heightMm) <= 120,
  );
}

function nonNestedFrameCandidates(
  candidates: readonly FrameRectangleCandidate[],
): FrameRectangleCandidate[] {
  return candidates.filter((candidate) => {
    const nested = containingRectCount(candidate, candidates);
    return nested <= 2 && !hasNearDuplicateLarger(candidate, candidates);
  });
}

function frameAssemblyCandidates(args: {
  candidates: readonly FrameRectangleCandidate[];
  faceBands: readonly ElevationFaceBand[];
}): FrameAssemblyCandidate[] {
  const plausible = args.candidates.filter(plausibleOpeningShape);
  const candidates = plausible
    .map((candidate) => {
      const faceBandId = candidateFaceBandId(candidate, args.faceBands);
      if (!faceBandId) return null;
      const containingRects = containingRectCount(candidate, args.candidates);
      const childRects = childRectCount(candidate, args.candidates);
      if (hasNearDuplicateLarger(candidate, args.candidates)) return null;
      const memberRects =
        1 +
        args.candidates.filter(
          (other) =>
            other !== candidate &&
            rectOverlapRatio(candidate, other) > 0.58 &&
            other.areaPt2 <= candidate.areaPt2 * 1.08,
        ).length;
      const assemblyScore =
        Math.min(childRects, 20) * 20 +
        Math.min(memberRects, 40) * 3 -
        containingRects * 1.5 -
        Math.abs(candidate.heightMm - 2100) * 0.03;
      return {
        ...candidate,
        faceBandId,
        containingRects,
        childRects,
        memberRects,
        assemblyScore: Math.round(assemblyScore * 10) / 10,
      };
    })
    .filter((candidate): candidate is FrameAssemblyCandidate => candidate != null)
    .sort(
      (a, b) =>
        b.assemblyScore - a.assemblyScore ||
        b.childRects - a.childRects ||
        a.containingRects - b.containingRects ||
        b.areaPt2 - a.areaPt2,
    );

  const kept: FrameAssemblyCandidate[] = [];
  for (const candidate of candidates) {
    const duplicate = kept.some(
      (existing) =>
        existing.faceBandId === candidate.faceBandId &&
        (rectOverlapRatio(existing, candidate) > 0.7 ||
          (Math.abs(existing.x - candidate.x) <= 8 &&
            Math.abs(existing.y - candidate.y) <= 8 &&
            Math.abs(existing.widthMm - candidate.widthMm) <= 180 &&
            Math.abs(existing.heightMm - candidate.heightMm) <= 180)),
    );
    if (!duplicate) kept.push(candidate);
  }

  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}

function sameAssemblyCluster(a: FrameAssemblyMember, b: FrameAssemblyMember): boolean {
  if (a.faceBandId !== b.faceBandId) return false;
  const largerArea = Math.max(a.areaPt2, b.areaPt2);
  const smallerArea = Math.max(1, Math.min(a.areaPt2, b.areaPt2));
  const areaRatio = largerArea / smallerArea;
  if (areaRatio > 8) return false;
  const maxWidth = Math.max(a.x1 - a.x0, b.x1 - b.x0);
  const maxHeight = Math.max(a.y1 - a.y0, b.y1 - b.y0);
  const locallyCentred =
    Math.abs(a.x - b.x) <= maxWidth * 0.4 && Math.abs(a.y - b.y) <= maxHeight * 0.35;
  if (!locallyCentred) return false;
  if (rectOverlapRatio(a, b) > 0.74) return true;
  return rectContains(a, b, 2) || rectContains(b, a, 2);
}

function frameAssemblyGroups(args: {
  candidates: readonly FrameRectangleCandidate[];
  faceBands: readonly ElevationFaceBand[];
}): FrameAssemblyGroup[] {
  const members = args.candidates
    .filter(plausibleOpeningShape)
    .map((candidate): FrameAssemblyMember | null => {
      const faceBandId = candidateFaceBandId(candidate, args.faceBands);
      if (!faceBandId) return null;
      return {
        ...candidate,
        faceBandId,
        containingRects: containingRectCount(candidate, args.candidates),
        childRects: childRectCount(candidate, args.candidates),
      };
    })
    .filter((candidate): candidate is FrameAssemblyMember => candidate != null);

  const byBand = members.reduce<Map<string, FrameAssemblyMember[]>>((acc, member) => {
    const existing = acc.get(member.faceBandId);
    if (existing) {
      existing.push(member);
    } else {
      acc.set(member.faceBandId, [member]);
    }
    return acc;
  }, new Map());

  const groups: FrameAssemblyGroup[] = [];
  for (const [faceBandId, bandMembers] of byBand.entries()) {
    const parents = bandMembers.map((_, index) => index);
    const find = (index: number): number => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };
    const union = (a: number, b: number) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parents[rootB] = rootA;
    };

    for (let i = 0; i < bandMembers.length; i += 1) {
      for (let j = i + 1; j < bandMembers.length; j += 1) {
        if (sameAssemblyCluster(bandMembers[i], bandMembers[j])) union(i, j);
      }
    }

    const components = new Map<number, FrameAssemblyMember[]>();
    for (let i = 0; i < bandMembers.length; i += 1) {
      const root = find(i);
      const existing = components.get(root);
      if (existing) {
        existing.push(bandMembers[i]);
      } else {
        components.set(root, [bandMembers[i]]);
      }
    }

    const maxAssemblyGroupWidthPt = (MAX_ASSEMBLY_GROUP_WIDTH_MM / ELEVATION_SCALE) * PT_PER_MM;
    for (const component of components.values()) {
      const chunks: FrameAssemblyMember[][] = [];
      let current: FrameAssemblyMember[] = [];
      for (const member of [...component].sort((a, b) => a.x0 - b.x0 || a.x - b.x)) {
        const next = [...current, member];
        const nextWidth =
          Math.max(...next.map((candidate) => candidate.x1)) -
          Math.min(...next.map((candidate) => candidate.x0));
        if (current.length > 0 && nextWidth > maxAssemblyGroupWidthPt) {
          chunks.push(current);
          current = [member];
        } else {
          current = next;
        }
      }
      if (current.length > 0) chunks.push(current);

      for (const chunk of chunks) {
        groups.push(buildFrameAssemblyGroup(groups.length + 1, faceBandId, chunk));
      }
    }
  }

  return groups.sort((a, b) => a.y - b.y || a.x - b.x);
}

function buildFrameAssemblyGroup(
  index: number,
  faceBandId: string,
  component: FrameAssemblyMember[],
): FrameAssemblyGroup {
  const groupX0 = Math.min(...component.map((member) => member.x0));
  const groupX1 = Math.max(...component.map((member) => member.x1));
  const groupY0 = Math.min(...component.map((member) => member.y0));
  const groupY1 = Math.max(...component.map((member) => member.y1));
  const representative = [...component].sort(
    (a, b) =>
      b.childRects - a.childRects || a.containingRects - b.containingRects || b.areaPt2 - a.areaPt2,
  )[0];
  return {
    ...representative,
    id: `assembly-group-${index}`,
    faceBandId,
    groupWidthMm: Math.round(ptToMm(groupX1 - groupX0)),
    groupHeightMm: Math.round(ptToMm(groupY1 - groupY0)),
    memberRects: component.length,
    nestedMemberRects: component.filter(
      (member) => member.childRects > 0 || member.containingRects > 0,
    ).length,
    maxChildRects: Math.max(...component.map((member) => member.childRects)),
    minContainingRects: Math.min(...component.map((member) => member.containingRects)),
    members: component,
  };
}

function sameOpeningSlot(a: FrameAssemblyMember, b: FrameAssemblyMember): boolean {
  const maxWidth = Math.max(a.x1 - a.x0, b.x1 - b.x0);
  const maxHeight = Math.max(a.y1 - a.y0, b.y1 - b.y0);
  const locallyCentred =
    Math.abs(a.x - b.x) <= Math.max(8, maxWidth * 0.28) &&
    Math.abs(a.y - b.y) <= Math.max(6, maxHeight * 0.22);
  if (!locallyCentred) return false;
  if (rectOverlapRatio(a, b) >= 0.68) return true;
  return rectContains(a, b, 1.5) || rectContains(b, a, 1.5);
}

function clusteredNumbers(values: readonly number[], tolerance: number): number[] {
  const clusters: Array<{ value: number; count: number }> = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const existing = clusters.find((cluster) => Math.abs(cluster.value - value) <= tolerance);
    if (existing) {
      existing.value = (existing.value * existing.count + value) / (existing.count + 1);
      existing.count += 1;
    } else {
      clusters.push({ value, count: 1 });
    }
  }
  return clusters.map((cluster) => cluster.value);
}

function likelyMultiOpeningGroup(group: FrameAssemblyGroup): boolean {
  const distinctCenters = clusteredNumbers(
    group.members.map((member) => member.x),
    18,
  ).length;
  return group.groupWidthMm > 5200 || distinctCenters >= 4;
}

function frameOpeningSlots(groups: readonly FrameAssemblyGroup[]): FrameOpeningSlot[] {
  const slots: FrameOpeningSlot[] = [];
  for (const group of groups) {
    const parents = group.members.map((_, index) => index);
    const find = (index: number): number => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };
    const union = (a: number, b: number) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parents[rootB] = rootA;
    };

    for (let i = 0; i < group.members.length; i += 1) {
      for (let j = i + 1; j < group.members.length; j += 1) {
        if (sameOpeningSlot(group.members[i], group.members[j])) union(i, j);
      }
    }

    const components = new Map<number, FrameAssemblyMember[]>();
    for (let i = 0; i < group.members.length; i += 1) {
      const root = find(i);
      const existing = components.get(root);
      if (existing) {
        existing.push(group.members[i]);
      } else {
        components.set(root, [group.members[i]]);
      }
    }

    for (const component of components.values()) {
      const representative = [...component].sort(
        (a, b) =>
          b.childRects - a.childRects ||
          a.containingRects - b.containingRects ||
          b.areaPt2 - a.areaPt2,
      )[0];
      slots.push({
        ...representative,
        id: `opening-slot-${slots.length + 1}`,
        groupId: group.id,
        faceBandId: group.faceBandId,
        groupWidthMm: group.groupWidthMm,
        groupHeightMm: group.groupHeightMm,
        groupMemberRects: group.memberRects,
        groupLikelyMultiOpening: likelyMultiOpeningGroup(group),
        slotMemberRects: component.length,
        nestedSlotMemberRects: component.filter(
          (member) => member.childRects > 0 || member.containingRects > 0,
        ).length,
        members: component,
      });
    }
  }
  return slots.sort((a, b) => a.y - b.y || a.x - b.x);
}

function frameSeparabilitySummary(args: {
  truthRows: readonly { widthMm: number; heightMm: number }[];
  candidates: readonly FrameRectangleCandidate[];
  faceBands: readonly ElevationFaceBand[];
}) {
  const plausible = args.candidates.filter(plausibleOpeningShape);
  const faceBandMembers = plausible.filter((candidate) => inFaceBand(candidate, args.faceBands));
  const nonNested = nonNestedFrameCandidates(faceBandMembers);
  const nestingBuckets = [0, 1, 2, 3, 5, 10, 25].map((maxContainingRects) => {
    const bucket = faceBandMembers.filter(
      (candidate) => containingRectCount(candidate, args.candidates) <= maxContainingRects,
    );
    return {
      maxContainingRects,
      candidates: bucket.length,
      dimensionMatchesAgainstTruth: frameDimensionMatchCount(args.truthRows, bucket),
    };
  });
  return {
    rawCandidates: args.candidates.length,
    plausibleShapeCandidates: plausible.length,
    faceBandCandidates: faceBandMembers.length,
    nonNestedCandidates: nonNested.length,
    rawDimensionMatchesAgainstTruth: frameDimensionMatchCount(args.truthRows, args.candidates),
    nonNestedDimensionMatchesAgainstTruth: frameDimensionMatchCount(args.truthRows, nonNested),
    nestingBuckets,
    note: "truth matches are scoreboard-only; non-nesting is a diagnostic, not a production selector because real openings can be nested assemblies",
  };
}

function floorEvidenceRows(args: {
  planText: PlanText;
  printedCodeWitnesses: ReturnType<typeof detectPrintedWindowCodeWitnesses>;
  physicalWitnesses: ReturnType<typeof detectPhysicalOpeningWidthWitnesses>;
}): FloorEvidenceRow[] {
  const out: FloorEvidenceRow[] = [];
  for (const witness of args.printedCodeWitnesses) {
    out.push({
      source: "printed_code",
      room: witness.room,
      widthMm: witness.widthMm,
      heightMm: witness.heightMm,
      planSide: witness.planSide,
      x: witness.x,
      y: witness.y,
      note: witness.note,
    });
  }
  for (const witness of args.physicalWitnesses) {
    if (witness.widthMm < 2200) continue;
    out.push({
      source: "physical_width",
      room: witness.room,
      widthMm: witness.widthMm,
      heightMm: STANDARD_TALL_OPENING_HEIGHT_MM,
      planSide: witness.planSide,
      x: witness.x,
      y: witness.y,
      note: `${witness.note}; diagnostic assumes tall opening height ${STANDARD_TALL_OPENING_HEIGHT_MM}mm`,
    });
  }
  for (const witness of args.planText.garageDoorWitnesses ?? []) {
    if (witness.planSide == null) continue;
    out.push({
      source: "garage_marker",
      room: witness.room ?? "GARAGE",
      widthMm: witness.widthMm,
      heightMm: STANDARD_TALL_OPENING_HEIGHT_MM,
      planSide: witness.planSide,
      x: witness.x,
      y: witness.y,
      note: `${witness.markerText}; diagnostic assumes garage opening height ${STANDARD_TALL_OPENING_HEIGHT_MM}mm`,
    });
  }
  return out;
}

function rowCandidateScore(row: FloorEvidenceRow, candidate: FrameRectangleCandidate): number {
  return Math.abs(candidate.widthMm - row.widthMm) + Math.abs(candidate.heightMm - row.heightMm);
}

function rowGuidedFrameQueries(args: {
  rows: readonly FloorEvidenceRow[];
  frameCandidates: readonly FrameRectangleCandidate[];
  faceBands: readonly ElevationFaceBand[];
}): RowGuidedFrameQuery[] {
  const plausible = args.frameCandidates.filter(plausibleOpeningShape);
  return args.rows.map((row) => {
    const candidates = plausible
      .filter(
        (candidate) =>
          Math.abs(candidate.widthMm - row.widthMm) <= ROW_GUIDED_WIDTH_TOLERANCE_MM &&
          Math.abs(candidate.heightMm - row.heightMm) <= ROW_GUIDED_HEIGHT_TOLERANCE_MM,
      )
      .sort((a, b) => rowCandidateScore(row, a) - rowCandidateScore(row, b));
    const faceBandCandidates = candidates.filter((candidate) =>
      inFaceBand(candidate, args.faceBands),
    );
    const lowNestedCandidates = candidates.filter(
      (candidate) => containingRectCount(candidate, args.frameCandidates) <= 10,
    );
    return {
      row,
      candidates: candidates.length,
      faceBandCandidates: faceBandCandidates.length,
      lowNestedCandidates: lowNestedCandidates.length,
      topCandidates: candidates.slice(0, 5).map((candidate) => ({
        widthMm: candidate.widthMm,
        heightMm: candidate.heightMm,
        x: candidate.x,
        y: candidate.y,
        containingRects: containingRectCount(candidate, args.frameCandidates),
        inFaceBand: inFaceBand(candidate, args.faceBands),
        score: rowCandidateScore(row, candidate),
      })),
    };
  });
}

function rowGuidedAssemblyQueries(args: {
  rows: readonly FloorEvidenceRow[];
  assemblies: readonly FrameAssemblyCandidate[];
}): RowGuidedFrameQuery[] {
  return args.rows.map((row) => {
    const candidates = args.assemblies
      .filter(
        (candidate) =>
          Math.abs(candidate.widthMm - row.widthMm) <= ROW_GUIDED_WIDTH_TOLERANCE_MM &&
          Math.abs(candidate.heightMm - row.heightMm) <= ROW_GUIDED_HEIGHT_TOLERANCE_MM,
      )
      .sort((a, b) => rowCandidateScore(row, a) - rowCandidateScore(row, b));
    return {
      row,
      candidates: candidates.length,
      faceBandCandidates: candidates.length,
      lowNestedCandidates: candidates.filter((candidate) => candidate.containingRects <= 10).length,
      topCandidates: candidates.slice(0, 5).map((candidate) => ({
        widthMm: candidate.widthMm,
        heightMm: candidate.heightMm,
        x: candidate.x,
        y: candidate.y,
        containingRects: candidate.containingRects,
        childRects: candidate.childRects,
        memberRects: candidate.memberRects,
        faceBandId: candidate.faceBandId,
        inFaceBand: true,
        assemblyScore: candidate.assemblyScore,
        score: rowCandidateScore(row, candidate),
      })),
    };
  });
}

function bestGroupMemberForRow(
  row: FloorEvidenceRow,
  group: FrameAssemblyGroup,
): FrameAssemblyMember | null {
  return (
    group.members
      .filter(
        (member) =>
          Math.abs(member.widthMm - row.widthMm) <= ROW_GUIDED_WIDTH_TOLERANCE_MM &&
          Math.abs(member.heightMm - row.heightMm) <= ROW_GUIDED_HEIGHT_TOLERANCE_MM,
      )
      .sort((a, b) => rowCandidateScore(row, a) - rowCandidateScore(row, b))[0] ?? null
  );
}

function rowGuidedAssemblyGroupQueries(args: {
  rows: readonly FloorEvidenceRow[];
  groups: readonly FrameAssemblyGroup[];
}): RowGuidedFrameQuery[] {
  return args.rows.map((row) => {
    const candidates = args.groups
      .map((group) => {
        const bestMember = bestGroupMemberForRow(row, group);
        return bestMember ? { group, bestMember } : null;
      })
      .filter(
        (candidate): candidate is { group: FrameAssemblyGroup; bestMember: FrameAssemblyMember } =>
          candidate != null,
      )
      .sort(
        (a, b) =>
          rowCandidateScore(row, a.bestMember) - rowCandidateScore(row, b.bestMember) ||
          b.group.memberRects - a.group.memberRects,
      );
    return {
      row,
      candidates: candidates.length,
      faceBandCandidates: candidates.length,
      lowNestedCandidates: candidates.filter(
        (candidate) => candidate.group.minContainingRects <= 10,
      ).length,
      topCandidates: candidates.slice(0, 5).map(({ group, bestMember }) => ({
        widthMm: bestMember.widthMm,
        heightMm: bestMember.heightMm,
        x: bestMember.x,
        y: bestMember.y,
        containingRects: bestMember.containingRects,
        childRects: bestMember.childRects,
        memberRects: group.memberRects,
        nestedMemberRects: group.nestedMemberRects,
        maxChildRects: group.maxChildRects,
        minContainingRects: group.minContainingRects,
        groupWidthMm: group.groupWidthMm,
        groupHeightMm: group.groupHeightMm,
        faceBandId: group.faceBandId,
        inFaceBand: true,
        score: rowCandidateScore(row, bestMember),
      })),
    };
  });
}

function bestSlotMemberForRow(
  row: FloorEvidenceRow,
  slot: FrameOpeningSlot,
): FrameAssemblyMember | null {
  return (
    slot.members
      .filter(
        (member) =>
          Math.abs(member.widthMm - row.widthMm) <= ROW_GUIDED_WIDTH_TOLERANCE_MM &&
          Math.abs(member.heightMm - row.heightMm) <= ROW_GUIDED_HEIGHT_TOLERANCE_MM,
      )
      .sort((a, b) => rowCandidateScore(row, a) - rowCandidateScore(row, b))[0] ?? null
  );
}

function rowGuidedOpeningSlotQueries(args: {
  rows: readonly FloorEvidenceRow[];
  slots: readonly FrameOpeningSlot[];
}): RowGuidedFrameQuery[] {
  return args.rows.map((row) => {
    const candidates = args.slots
      .map((slot) => {
        const bestMember = bestSlotMemberForRow(row, slot);
        return bestMember ? { slot, bestMember } : null;
      })
      .filter(
        (candidate): candidate is { slot: FrameOpeningSlot; bestMember: FrameAssemblyMember } =>
          candidate != null,
      )
      .sort(
        (a, b) =>
          rowCandidateScore(row, a.bestMember) - rowCandidateScore(row, b.bestMember) ||
          a.slot.x - b.slot.x,
      );
    return {
      row,
      candidates: candidates.length,
      faceBandCandidates: candidates.length,
      lowNestedCandidates: candidates.filter(
        (candidate) => candidate.bestMember.containingRects <= 10,
      ).length,
      topCandidates: candidates.slice(0, 5).map(({ slot, bestMember }) => ({
        widthMm: bestMember.widthMm,
        heightMm: bestMember.heightMm,
        x: bestMember.x,
        y: bestMember.y,
        containingRects: bestMember.containingRects,
        childRects: bestMember.childRects,
        memberRects: slot.groupMemberRects,
        groupId: slot.groupId,
        groupWidthMm: slot.groupWidthMm,
        groupHeightMm: slot.groupHeightMm,
        groupLikelyMultiOpening: slot.groupLikelyMultiOpening,
        slotMemberRects: slot.slotMemberRects,
        nestedSlotMemberRects: slot.nestedSlotMemberRects,
        faceBandId: slot.faceBandId,
        inFaceBand: true,
        score: rowCandidateScore(row, bestMember),
      })),
    };
  });
}

function planSideOrderValue(row: FloorEvidenceRow): number {
  if (row.planSide === "plan_top" || row.planSide === "plan_bottom") return row.x;
  if (row.planSide === "plan_left" || row.planSide === "plan_right") return row.y;
  return row.x + row.y;
}

function slotMatchForRow(row: FloorEvidenceRow, slot: FrameOpeningSlot) {
  const member = bestSlotMemberForRow(row, slot);
  if (!member) return null;
  return {
    slot,
    member,
    score: rowCandidateScore(row, member),
  };
}

function betterOrderedState<T extends { matches: number; score: number }>(a: T, b: T): T {
  if (a.matches !== b.matches) return a.matches > b.matches ? a : b;
  return a.score <= b.score ? a : b;
}

function orderedSlotMatch(
  rows: readonly FloorEvidenceRow[],
  slots: readonly FrameOpeningSlot[],
): {
  matches: number;
  score: number;
  pairs: Array<{ row: FloorEvidenceRow; slot: FrameOpeningSlot; member: FrameAssemblyMember }>;
} {
  type State = {
    matches: number;
    score: number;
    pairs: Array<{ row: FloorEvidenceRow; slot: FrameOpeningSlot; member: FrameAssemblyMember }>;
  };
  const empty: State = { matches: 0, score: 0, pairs: [] };
  const dp: State[][] = Array.from({ length: rows.length + 1 }, () =>
    Array.from({ length: slots.length + 1 }, () => empty),
  );

  for (let i = 0; i <= rows.length; i += 1) {
    for (let j = 0; j <= slots.length; j += 1) {
      let best = dp[i][j];
      if (i > 0) best = betterOrderedState(best, dp[i - 1][j]);
      if (j > 0) best = betterOrderedState(best, dp[i][j - 1]);
      if (i > 0 && j > 0) {
        const match = slotMatchForRow(rows[i - 1], slots[j - 1]);
        if (match) {
          best = betterOrderedState(best, {
            matches: dp[i - 1][j - 1].matches + 1,
            score: dp[i - 1][j - 1].score + match.score,
            pairs: [
              ...dp[i - 1][j - 1].pairs,
              { row: rows[i - 1], slot: match.slot, member: match.member },
            ],
          });
        }
      }
      dp[i][j] = best;
    }
  }

  return dp[rows.length][slots.length];
}

function rowDimensionKey(row: Pick<FloorEvidenceRow, "widthMm" | "heightMm">): string {
  return `${row.widthMm}x${row.heightMm}`;
}

function orientationAmbiguityIsDimensionHarmless(rows: readonly FloorEvidenceRow[]): boolean {
  return new Set(rows.map(rowDimensionKey)).size === 1;
}

function orderedSideStatus(args: {
  orderedRows: readonly FloorEvidenceRow[];
  fullMatches: readonly OrderedSignatureMatch[];
}): {
  status: OrderedSignatureSideStatus;
  dimensionHarmlessOrientationAmbiguity: boolean;
  blockingReason: string;
} {
  if (args.fullMatches.length === 0) {
    return {
      status: "partial_matches_only",
      dimensionHarmlessOrientationAmbiguity: false,
      blockingReason: "no elevation face matches the full ordered floor-side sequence",
    };
  }
  if (args.fullMatches.length > 1) {
    return {
      status: "multiple_face_full_ambiguity",
      dimensionHarmlessOrientationAmbiguity: false,
      blockingReason: "multiple elevation faces match the full ordered floor-side sequence",
    };
  }

  const [fullMatch] = args.fullMatches;
  if (fullMatch.orientation === "ambiguous") {
    const harmless = orientationAmbiguityIsDimensionHarmless(args.orderedRows);
    return {
      status: "orientation_only_full_ambiguity",
      dimensionHarmlessOrientationAmbiguity: harmless,
      blockingReason: harmless
        ? "orientation is ambiguous, but all floor-side opening dimensions are identical; diagnostic only"
        : "one elevation face matches, but forward/reverse orientation both fit differing floor-side openings",
    };
  }

  return {
    status: "unique_full_match",
    dimensionHarmlessOrientationAmbiguity: false,
    blockingReason:
      "diagnostic full ordered match; production still needs an independent face/orientation anchor",
  };
}

function orderedSideLengthGateStatus(args: {
  planSideLengthMm: number | null;
  fullMatches: readonly OrderedSignatureMatch[];
}): LengthGateStatus {
  if (args.planSideLengthMm == null) return "missing_floor_side_length";
  if (args.fullMatches.length === 0) return "no_full_sequence_match";

  const lengthCompatible = args.fullMatches.filter((match) => match.lengthCompatible);
  if (lengthCompatible.length === 0) return "no_length_compatible_full_match";
  if (lengthCompatible.length > 1) return "multiple_length_compatible_full_matches";
  return lengthCompatible[0].orientation === "ambiguous"
    ? "unique_length_match_orientation_ambiguous"
    : "unique_length_compatible_full_match";
}

function orderedFaceSignatureDiagnostics(args: {
  rows: readonly FloorEvidenceRow[];
  slots: readonly FrameOpeningSlot[];
  faceBands: readonly ElevationFaceBand[];
  lengthWitnesses: readonly PlanSideLengthWitness[];
}): {
  note: string;
  planSides: Array<{
    planSide: string;
    floorRows: number;
    planSideLengthMm: number | null;
    status: OrderedSignatureSideStatus;
    lengthGateStatus: LengthGateStatus;
    dimensionHarmlessOrientationAmbiguity: boolean;
    lengthGateDimensionHarmlessOrientationAmbiguity: boolean;
    blockingReason: string;
    fullMatches: OrderedSignatureMatch[];
    lengthCompatibleFullMatches: OrderedSignatureMatch[];
    bestMatches: OrderedSignatureMatch[];
  }>;
} {
  const faceBandById = new Map(args.faceBands.map((band) => [band.id, band]));
  const lengthBySide = new Map(args.lengthWitnesses.map((witness) => [witness.planSide, witness]));
  const slotsByFace = args.slots.reduce<Map<string, FrameOpeningSlot[]>>((acc, slot) => {
    const existing = acc.get(slot.faceBandId);
    if (existing) {
      existing.push(slot);
    } else {
      acc.set(slot.faceBandId, [slot]);
    }
    return acc;
  }, new Map());
  const rowsBySide = args.rows.reduce<Map<string, FloorEvidenceRow[]>>((acc, row) => {
    if (!row.planSide) return acc;
    const existing = acc.get(row.planSide);
    if (existing) {
      existing.push(row);
    } else {
      acc.set(row.planSide, [row]);
    }
    return acc;
  }, new Map());

  return {
    note: "diagnostic only: ordered face signatures use opening-slot member centres, not group representatives; ambiguous orientation needs an external anchor before pricing",
    planSides: [...rowsBySide.entries()].map(([planSide, sideRows]) => {
      const orderedRows = [...sideRows].sort(
        (a, b) => planSideOrderValue(a) - planSideOrderValue(b),
      );
      const planSideLengthMm = lengthBySide.get(planSide as PlanSideName)?.lengthMm ?? null;
      const bestMatches = [...slotsByFace.entries()]
        .map(([faceBandId, faceSlots]): OrderedSignatureMatch => {
          const orderedSlots = [...faceSlots].sort((a, b) => a.x - b.x);
          const forward = orderedSlotMatch(orderedRows, orderedSlots);
          const reverse = orderedSlotMatch([...orderedRows].reverse(), orderedSlots);
          const sameStrength =
            forward.matches === reverse.matches && Math.abs(forward.score - reverse.score) <= 150;
          const best =
            reverse.matches > forward.matches ||
            (reverse.matches === forward.matches && reverse.score < forward.score)
              ? reverse
              : forward;
          const orientation =
            best.matches === 0
              ? "none"
              : sameStrength
                ? "ambiguous"
                : best === reverse
                  ? "reverse"
                  : "forward";
          const faceWidthMm = faceBandById.get(faceBandId)?.widthMm ?? null;
          const lengthDeltaMm =
            planSideLengthMm != null && faceWidthMm != null
              ? Math.abs(planSideLengthMm - faceWidthMm)
              : null;
          return {
            planSide,
            faceBandId,
            orientation,
            floorRows: orderedRows.length,
            slots: orderedSlots.length,
            planSideLengthMm,
            faceWidthMm,
            lengthDeltaMm,
            lengthCompatible:
              lengthDeltaMm != null && lengthDeltaMm <= FLOOR_ELEVATION_LENGTH_TOLERANCE_MM,
            forwardMatches: forward.matches,
            reverseMatches: reverse.matches,
            matches: best.matches,
            score: best.matches === 0 ? null : Math.round(best.score),
            matchedRows: best.pairs.map(({ row, slot, member }) => ({
              room: row.room,
              widthMm: row.widthMm,
              heightMm: row.heightMm,
              slotId: slot.id,
              faceBandId: slot.faceBandId,
              slotX: Math.round(slot.x * 10) / 10,
              slotY: Math.round(slot.y * 10) / 10,
              recoveredWidthMm: member.widthMm,
              recoveredHeightMm: member.heightMm,
              widthDeltaMm: Math.abs(member.widthMm - row.widthMm),
              heightDeltaMm: Math.abs(member.heightMm - row.heightMm),
              groupId: slot.groupId,
              groupLikelyMultiOpening: slot.groupLikelyMultiOpening,
            })),
          };
        })
        .filter((match) => match.matches > 0)
        .sort(
          (a, b) =>
            b.matches - a.matches ||
            (a.lengthDeltaMm ?? Number.POSITIVE_INFINITY) -
              (b.lengthDeltaMm ?? Number.POSITIVE_INFINITY) ||
            (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY) ||
            b.slots - a.slots,
        )
        .slice(0, 6);
      const fullMatches = bestMatches.filter((match) => match.matches === orderedRows.length);
      const lengthGateStatus = orderedSideLengthGateStatus({ planSideLengthMm, fullMatches });
      const lengthCompatibleFullMatches = fullMatches.filter((match) => match.lengthCompatible);
      const lengthGateDimensionHarmlessOrientationAmbiguity =
        lengthGateStatus === "unique_length_match_orientation_ambiguous" &&
        orientationAmbiguityIsDimensionHarmless(orderedRows);
      const status =
        bestMatches.length === 0
          ? {
              status: "no_matches" as const,
              dimensionHarmlessOrientationAmbiguity: false,
              blockingReason: "no slot sequence has any compatible floor-side rows",
            }
          : orderedSideStatus({ orderedRows, fullMatches });

      return {
        planSide,
        floorRows: orderedRows.length,
        planSideLengthMm,
        status: status.status,
        lengthGateStatus,
        dimensionHarmlessOrientationAmbiguity: status.dimensionHarmlessOrientationAmbiguity,
        lengthGateDimensionHarmlessOrientationAmbiguity,
        blockingReason: status.blockingReason,
        fullMatches,
        lengthCompatibleFullMatches,
        bestMatches,
      };
    }),
  };
}

function orderedFaceSignatureSummary(
  diagnostic: ReturnType<typeof orderedFaceSignatureDiagnostics>,
) {
  const sides = diagnostic.planSides;
  return {
    planSides: sides.length,
    uniqueFullMatchSides: sides.filter((side) => side.status === "unique_full_match").length,
    orientationOnlyFullAmbiguitySides: sides.filter(
      (side) => side.status === "orientation_only_full_ambiguity",
    ).length,
    dimensionHarmlessOrientationAmbiguitySides: sides.filter(
      (side) => side.dimensionHarmlessOrientationAmbiguity,
    ).length,
    multipleFaceFullAmbiguitySides: sides.filter(
      (side) => side.status === "multiple_face_full_ambiguity",
    ).length,
    partialOnlySides: sides.filter((side) => side.status === "partial_matches_only").length,
    noMatchSides: sides.filter((side) => side.status === "no_matches").length,
    lengthGate: {
      uniqueLengthCompatibleFullMatchSides: sides.filter(
        (side) => side.lengthGateStatus === "unique_length_compatible_full_match",
      ).length,
      uniqueLengthMatchOrientationAmbiguousSides: sides.filter(
        (side) => side.lengthGateStatus === "unique_length_match_orientation_ambiguous",
      ).length,
      multipleLengthCompatibleFullMatchSides: sides.filter(
        (side) => side.lengthGateStatus === "multiple_length_compatible_full_matches",
      ).length,
      noLengthCompatibleFullMatchSides: sides.filter(
        (side) => side.lengthGateStatus === "no_length_compatible_full_match",
      ).length,
      missingFloorSideLengthSides: sides.filter(
        (side) => side.lengthGateStatus === "missing_floor_side_length",
      ).length,
      noFullSequenceMatchSides: sides.filter(
        (side) => side.lengthGateStatus === "no_full_sequence_match",
      ).length,
      dimensionHarmlessOrientationAmbiguitySides: sides.filter(
        (side) => side.lengthGateDimensionHarmlessOrientationAmbiguity,
      ).length,
    },
    note: "full ordered side matches are still diagnostic; length gate is drawing-vs-drawing evidence, not production pricing authority",
  };
}

function truthCompatibleFloorRows(
  truthRows: readonly { widthMm: number; heightMm: number }[],
  rows: readonly FloorEvidenceRow[],
  include: (row: FloorEvidenceRow) => boolean,
): number {
  const unused = [...truthRows];
  let count = 0;
  for (const row of rows.filter(include)) {
    const index = unused.findIndex(
      (truth) =>
        Math.abs(truth.widthMm - row.widthMm) <= ROW_GUIDED_WIDTH_TOLERANCE_MM &&
        Math.abs(truth.heightMm - row.heightMm) <= ROW_GUIDED_HEIGHT_TOLERANCE_MM,
    );
    if (index < 0) continue;
    count += 1;
    unused.splice(index, 1);
  }
  return count;
}

function rowGuidedSummary(args: {
  truthRows: readonly { widthMm: number; heightMm: number }[];
  rows: readonly FloorEvidenceRow[];
  queries: readonly RowGuidedFrameQuery[];
}) {
  const withAnyCandidates = new Set(
    args.queries.filter((query) => query.candidates > 0).map((query) => query.row),
  );
  const withFaceBandCandidates = new Set(
    args.queries.filter((query) => query.faceBandCandidates > 0).map((query) => query.row),
  );
  const withLowNestedCandidates = new Set(
    args.queries.filter((query) => query.lowNestedCandidates > 0).map((query) => query.row),
  );
  const candidateCounts = args.queries.map((query) => query.candidates).sort((a, b) => a - b);
  const medianCandidates =
    candidateCounts.length === 0 ? 0 : candidateCounts[Math.floor(candidateCounts.length / 2)];
  return {
    floorEvidenceRows: args.rows.length,
    rowsWithAnyCandidates: withAnyCandidates.size,
    rowsWithFaceBandCandidates: withFaceBandCandidates.size,
    rowsWithLowNestedCandidates: withLowNestedCandidates.size,
    rowsWithUniqueCandidate: args.queries.filter((query) => query.candidates === 1).length,
    rowsWithAtMostFiveCandidates: args.queries.filter(
      (query) => query.candidates > 0 && query.candidates <= 5,
    ).length,
    rowsWithAtMostTwentyCandidates: args.queries.filter(
      (query) => query.candidates > 0 && query.candidates <= 20,
    ).length,
    medianCandidates,
    truthCompatibleFloorRows: truthCompatibleFloorRows(args.truthRows, args.rows, () => true),
    truthCompatibleRowsWithAnyCandidates: truthCompatibleFloorRows(
      args.truthRows,
      args.rows,
      (row) => withAnyCandidates.has(row),
    ),
    truthCompatibleRowsWithFaceBandCandidates: truthCompatibleFloorRows(
      args.truthRows,
      args.rows,
      (row) => withFaceBandCandidates.has(row),
    ),
    truthCompatibleRowsWithLowNestedCandidates: truthCompatibleFloorRows(
      args.truthRows,
      args.rows,
      (row) => withLowNestedCandidates.has(row),
    ),
    note: "row-guided candidates are queried from floor evidence only; truth-compatible counts are scoreboard-only",
  };
}

function dimensionMatchCount(
  truthRows: readonly { widthMm: number; heightMm: number }[],
  elevationOpenings: readonly ElevationVectorOpening[],
): number {
  const unused = elevationOpenings.filter(
    (candidate) => candidate.widthMm != null && candidate.heightMm != null,
  );
  let count = 0;
  for (const row of truthRows) {
    const index = unused.findIndex(
      (candidate) =>
        candidate.widthMm != null &&
        candidate.heightMm != null &&
        Math.abs(candidate.widthMm - row.widthMm) <= 250 &&
        Math.abs(candidate.heightMm - row.heightMm) <= 250,
    );
    if (index < 0) continue;
    count += 1;
    unused.splice(index, 1);
  }
  return count;
}

function frameDimensionMatchCount(
  truthRows: readonly { widthMm: number; heightMm: number }[],
  candidates: readonly FrameRectangleCandidate[],
): number {
  const unused = [...candidates];
  let count = 0;
  for (const row of truthRows) {
    const index = unused.findIndex(
      (candidate) =>
        Math.abs(candidate.widthMm - row.widthMm) <= 250 &&
        Math.abs(candidate.heightMm - row.heightMm) <= 250,
    );
    if (index < 0) continue;
    count += 1;
    unused.splice(index, 1);
  }
  return count;
}

function frameAssemblyGroupDimensionMatchCount(
  truthRows: readonly { widthMm: number; heightMm: number }[],
  groups: readonly FrameAssemblyGroup[],
): number {
  const unused = [...groups];
  let count = 0;
  for (const row of truthRows) {
    const index = unused.findIndex((group) =>
      group.members.some(
        (member) =>
          Math.abs(member.widthMm - row.widthMm) <= 250 &&
          Math.abs(member.heightMm - row.heightMm) <= 250,
      ),
    );
    if (index < 0) continue;
    count += 1;
    unused.splice(index, 1);
  }
  return count;
}

function frameOpeningSlotDimensionMatchCount(
  truthRows: readonly { widthMm: number; heightMm: number }[],
  slots: readonly FrameOpeningSlot[],
): number {
  const unused = [...slots];
  let count = 0;
  for (const row of truthRows) {
    const index = unused.findIndex((slot) =>
      slot.members.some(
        (member) =>
          Math.abs(member.widthMm - row.widthMm) <= 250 &&
          Math.abs(member.heightMm - row.heightMm) <= 250,
      ),
    );
    if (index < 0) continue;
    count += 1;
    unused.splice(index, 1);
  }
  return count;
}

async function extractPdfPage(pdfPath: string, pageNumber = 1) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(resolve(root, pdfPath))),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(pageNumber);
    return await extractPageGeometry(page as never);
  } finally {
    await doc.destroy().catch(() => {});
  }
}

function dimensionLabelValue(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{4,5}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 3000 && value <= 30000 ? value : null;
}

function geometryPageSize(args: { labels: readonly { x: number; y: number }[] }): {
  width: number;
  height: number;
} {
  const xs = args.labels.map((label) => label.x);
  const ys = args.labels.map((label) => label.y);
  return {
    width: Math.max(...xs, 1),
    height: Math.max(...ys, 1),
  };
}

function planSideLengthWitnesses(args: {
  labels: readonly { text: string; x: number; y: number; vertical: boolean }[];
  pageSize: { width: number; height: number };
}): PlanSideLengthWitness[] {
  const buckets: Record<PlanSideName, PlanSideLengthWitness["candidates"]> = {
    plan_top: [],
    plan_bottom: [],
    plan_left: [],
    plan_right: [],
  };

  for (const label of args.labels) {
    const valueMm = dimensionLabelValue(label.text);
    if (valueMm == null) continue;

    let planSide: PlanSideName | null = null;
    if (label.vertical) {
      if (label.x < args.pageSize.width * 0.45) {
        planSide = "plan_left";
      } else if (label.x > args.pageSize.width * 0.55) {
        planSide = "plan_right";
      }
    } else {
      if (label.y < args.pageSize.height * 0.45) {
        planSide = "plan_top";
      } else if (label.y > args.pageSize.height * 0.55) {
        planSide = "plan_bottom";
      }
    }
    if (!planSide) continue;

    buckets[planSide].push({
      valueMm,
      x: Math.round(label.x * 10) / 10,
      y: Math.round(label.y * 10) / 10,
      vertical: label.vertical,
      text: label.text,
    });
  }

  return (["plan_top", "plan_bottom", "plan_left", "plan_right"] as const).map((planSide) => {
    const candidates = buckets[planSide].sort(
      (a, b) =>
        b.valueMm - a.valueMm ||
        (planSide === "plan_top" || planSide === "plan_bottom" ? a.x - b.x : a.y - b.y),
    );
    const [largest] = candidates;
    return {
      planSide,
      lengthMm: largest?.valueMm ?? null,
      candidates: candidates.slice(0, 8),
      note: largest
        ? "diagnostic-only largest clean dimension label on this floor-plan side; envelope confirmation still required before production use"
        : "no clean side dimension label found",
    };
  });
}

type NorthTextSummary = {
  exactNorthTextLabels: number;
  titleBlockNorthTextLabels: number;
  usableFloorNorthReferenceLabels: number;
  note: string;
};

function northTextSummary(
  labels: readonly { text: string; x: number; y: number }[],
): NorthTextSummary {
  const exact = labels.filter((label) => label.text.trim().toUpperCase() === "NORTH");
  const titleBlock = exact.filter((label) => {
    const nearTitleBlockAddress = labels.some(
      (candidate) =>
        /BROADWAY|JENNIAN HOMES|MANAWATU|@jennian|www\.jennian/i.test(candidate.text) &&
        Math.abs(candidate.x - label.x) <= 12 &&
        Math.abs(candidate.y - label.y) <= 28,
    );
    return nearTitleBlockAddress || label.y >= 730;
  });
  const usable = exact.length - titleBlock.length;
  return {
    exactNorthTextLabels: exact.length,
    titleBlockNorthTextLabels: titleBlock.length,
    usableFloorNorthReferenceLabels: usable,
    note:
      usable > 0
        ? "text-only north reference candidate; still requires arrow/compass geometry before use"
        : "no usable floor north text reference; exact NORTH hits are title-block/address text or absent",
  };
}

function planSummary(
  planText: PlanText,
  physicalWitnesses: ReturnType<typeof detectPhysicalOpeningWidthWitnesses>,
  labels: readonly { text: string; x: number; y: number; vertical: boolean }[],
) {
  const northText = northTextSummary(labels);
  const floorSideLengthWitnesses = planSideLengthWitnesses({
    labels,
    pageSize: geometryPageSize({ labels }),
  });
  return {
    rooms: planText.rooms.length,
    windowCodes: planText.windowCodes.length,
    standaloneOpeningWidths: planText.standaloneOpeningWidths?.length ?? 0,
    garageDoorWitnesses: planText.garageDoorWitnesses?.length ?? 0,
    physicalOpeningWidthWitnesses: physicalWitnesses.length,
    printedWindowCodeWitnesses: detectPrintedWindowCodeWitnesses(planText).length,
    floorSideLengthWitnesses,
    ...northText,
    titlePerimeterM: planText.titleAreas.perimeterM ?? null,
  };
}

async function auditJob(job: Job) {
  const floorGeom = await extractPdfPage(job.floorPlan);
  const planText = parsePlanText(floorGeom.labels);
  const physicalWitnesses = detectPhysicalOpeningWidthWitnesses({
    planText,
    segments: floorGeom.segments,
    labels: floorGeom.labels,
    scale: 100,
  });
  const printedCodeWitnesses = detectPrintedWindowCodeWitnesses(planText);
  const floorRows = floorEvidenceRows({
    planText,
    printedCodeWitnesses,
    physicalWitnesses,
  });
  const truthRows = truthOpenings(job.truth);

  const base = {
    id: job.id,
    floorPlan: job.floorPlan,
    elevation: job.elevation ?? null,
    elevationPage: job.elevationPage ?? null,
    truthOpeningRows: truthRows.length,
    plan: {
      ...planSummary(planText, physicalWitnesses, floorGeom.labels),
      printedWindowCodeWitnesses: printedCodeWitnesses.length,
      rowGuidedFloorEvidenceRows: floorRows.length,
    },
  };

  if (!job.elevation) return { ...base, elevationAudit: null };

  const elevationGeom = await extractPdfPage(job.elevation, job.elevationPage ?? 1);
  const faceBands = detectElevationFaceBands(elevationGeom.segments);
  const elevationOpenings = detectElevationVectorOpenings(elevationGeom.segments);
  const frameCandidates = frameRectangleCandidates(elevationGeom.segments);
  const frameAssemblies = frameAssemblyCandidates({
    candidates: frameCandidates,
    faceBands,
  });
  const frameAssemblyGroupCandidates = frameAssemblyGroups({
    candidates: frameCandidates,
    faceBands,
  });
  const openingSlots = frameOpeningSlots(frameAssemblyGroupCandidates);
  const frameSeparability = frameSeparabilitySummary({
    truthRows,
    candidates: frameCandidates,
    faceBands,
  });
  const rowGuidedQueries = rowGuidedFrameQueries({
    rows: floorRows,
    frameCandidates,
    faceBands,
  });
  const assemblyGuidedQueries = rowGuidedAssemblyQueries({
    rows: floorRows,
    assemblies: frameAssemblies,
  });
  const assemblyGroupGuidedQueries = rowGuidedAssemblyGroupQueries({
    rows: floorRows,
    groups: frameAssemblyGroupCandidates,
  });
  const slotGuidedQueries = rowGuidedOpeningSlotQueries({
    rows: floorRows,
    slots: openingSlots,
  });
  const rowGuided = rowGuidedSummary({
    truthRows,
    rows: floorRows,
    queries: rowGuidedQueries,
  });
  const assemblyGuided = rowGuidedSummary({
    truthRows,
    rows: floorRows,
    queries: assemblyGuidedQueries,
  });
  const assemblyGroupGuided = rowGuidedSummary({
    truthRows,
    rows: floorRows,
    queries: assemblyGroupGuidedQueries,
  });
  const slotGuided = rowGuidedSummary({
    truthRows,
    rows: floorRows,
    queries: slotGuidedQueries,
  });
  const orderedFaceSignatures = orderedFaceSignatureDiagnostics({
    rows: floorRows,
    slots: openingSlots,
    faceBands,
    lengthWitnesses: base.plan.floorSideLengthWitnesses,
  });
  const orderedFaceSignatureStatus = orderedFaceSignatureSummary(orderedFaceSignatures);
  const directionLabels = detectElevationFaceLabels(elevationGeom.labels, faceBands);
  const compassLabels = directionLabels.filter((label) => label.kind === "compass");
  const letterLabels = directionLabels.filter((label) => label.kind === "letter");
  const slotCounts = faceBands.reduce<Record<string, number>>((acc, band) => {
    const slot = elevationBandSlot(band, faceBands);
    acc[slot] = (acc[slot] ?? 0) + 1;
    return acc;
  }, {});
  const sourceCounts = elevationOpenings.reduce<Record<string, number>>((acc, opening) => {
    acc[opening.source] = (acc[opening.source] ?? 0) + 1;
    return acc;
  }, {});
  return {
    ...base,
    elevationAudit: {
      page: job.elevationPage ?? 1,
      labels: elevationGeom.labels.length,
      faceBands: faceBands.length,
      canonicalFaceBands: faceBands.filter((band) => band.widthMm >= 8000).length,
      bandSlots: slotCounts,
      openings: elevationOpenings.length,
      openingSourceCounts: sourceCounts,
      garageDoorCandidates: elevationOpenings.filter((opening) => opening.type === "garage_door")
        .length,
      sliderCandidates: elevationOpenings.filter((opening) => opening.type === "slider").length,
      dimensionMatchesAgainstTruth: dimensionMatchCount(truthRows, elevationOpenings),
      frameRectangleCandidates: frameCandidates.length,
      frameRectangleDimensionMatchesAgainstTruth: frameSeparability.rawDimensionMatchesAgainstTruth,
      frameSeparability,
      frameAssemblyCandidates: frameAssemblies.length,
      nestedFrameAssemblyCandidates: frameAssemblies.filter((candidate) => candidate.childRects > 0)
        .length,
      frameAssemblyDimensionMatchesAgainstTruth: frameDimensionMatchCount(
        truthRows,
        frameAssemblies,
      ),
      frameAssemblyGroups: frameAssemblyGroupCandidates.length,
      nestedFrameAssemblyGroups: frameAssemblyGroupCandidates.filter(
        (group) => group.nestedMemberRects > 0,
      ).length,
      largestFrameAssemblyGroups: [...frameAssemblyGroupCandidates]
        .sort((a, b) => b.memberRects - a.memberRects)
        .slice(0, 8)
        .map((group) => ({
          id: group.id,
          faceBandId: group.faceBandId,
          memberRects: group.memberRects,
          nestedMemberRects: group.nestedMemberRects,
          groupWidthMm: group.groupWidthMm,
          groupHeightMm: group.groupHeightMm,
          representativeWidthMm: group.widthMm,
          representativeHeightMm: group.heightMm,
          x: group.x,
          y: group.y,
        })),
      frameAssemblyGroupDimensionMatchesAgainstTruth: frameAssemblyGroupDimensionMatchCount(
        truthRows,
        frameAssemblyGroupCandidates,
      ),
      openingSlots: openingSlots.length,
      multiOpeningClusterSlots: openingSlots.filter((slot) => slot.groupLikelyMultiOpening).length,
      openingSlotDimensionMatchesAgainstTruth: frameOpeningSlotDimensionMatchCount(
        truthRows,
        openingSlots,
      ),
      rowGuided,
      rowGuidedQueries,
      assemblyGuided,
      assemblyGuidedQueries,
      assemblyGroupGuided,
      assemblyGroupGuidedQueries,
      slotGuided,
      slotGuidedQueries,
      orderedFaceSignatures,
      orderedFaceSignatureStatus,
      compassElevationLabels: compassLabels,
      letterElevationLabels: letterLabels,
      conventionSignal:
        compassLabels.length >= 4
          ? "explicit_compass_labels"
          : letterLabels.length >= 4
            ? "lettered_elevation_labels"
            : "unlabelled_or_text_poor",
    },
  };
}

const results = [];
for (const job of jobs) {
  results.push(await auditJob(job));
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify({ jobs: results }, null, 2)}\n`);

console.log(`wrote ${outPath}`);
for (const result of results) {
  const elevation = result.elevationAudit;
  console.log(
    [
      result.id,
      `codes=${result.plan.windowCodes}`,
      `printedWitness=${result.plan.printedWindowCodeWitnesses}`,
      `physicalWitness=${result.plan.physicalOpeningWidthWitnesses}`,
      `garageWitness=${result.plan.garageDoorWitnesses}`,
      `sideLengths=${result.plan.floorSideLengthWitnesses
        .map((witness) => `${witness.planSide}:${witness.lengthMm ?? "none"}`)
        .join(",")}`,
      `northText=${result.plan.usableFloorNorthReferenceLabels}/${result.plan.exactNorthTextLabels}`,
      `titleNorth=${result.plan.titleBlockNorthTextLabels}`,
      elevation
        ? `elev=${elevation.conventionSignal} bands=${elevation.faceBands} openings=${elevation.openings} dimMatches=${elevation.dimensionMatchesAgainstTruth}/${result.truthOpeningRows} framePool=${elevation.frameRectangleDimensionMatchesAgainstTruth}/${result.truthOpeningRows}(${elevation.frameRectangleCandidates}) assemblies=${elevation.frameAssemblyDimensionMatchesAgainstTruth}/${result.truthOpeningRows}(${elevation.frameAssemblyCandidates}) assemblyGroups=${elevation.frameAssemblyGroupDimensionMatchesAgainstTruth}/${result.truthOpeningRows}(${elevation.frameAssemblyGroups}) slots=${elevation.openingSlotDimensionMatchesAgainstTruth}/${result.truthOpeningRows}(${elevation.openingSlots}) multiSlots=${elevation.multiOpeningClusterSlots} nestedGroups=${elevation.nestedFrameAssemblyGroups} nonNested=${elevation.frameSeparability.nonNestedCandidates} nonNestedDim=${elevation.frameSeparability.nonNestedDimensionMatchesAgainstTruth}/${result.truthOpeningRows} rowGuided=${elevation.rowGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} rows=${elevation.rowGuided.rowsWithAnyCandidates}/${elevation.rowGuided.floorEvidenceRows} med=${elevation.rowGuided.medianCandidates} assemblyGuided=${elevation.assemblyGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} rows=${elevation.assemblyGuided.rowsWithAnyCandidates}/${elevation.assemblyGuided.floorEvidenceRows} med=${elevation.assemblyGuided.medianCandidates} groupGuided=${elevation.assemblyGroupGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} rows=${elevation.assemblyGroupGuided.rowsWithAnyCandidates}/${elevation.assemblyGroupGuided.floorEvidenceRows} med=${elevation.assemblyGroupGuided.medianCandidates} slotGuided=${elevation.slotGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} rows=${elevation.slotGuided.rowsWithAnyCandidates}/${elevation.slotGuided.floorEvidenceRows} med=${elevation.slotGuided.medianCandidates}`
        : "elev=missing",
    ].join("\t"),
  );
  if (elevation) {
    console.log(
      `  nesting buckets: ${elevation.frameSeparability.nestingBuckets
        .map(
          (bucket) =>
            `<=${bucket.maxContainingRects}:${bucket.dimensionMatchesAgainstTruth}/${result.truthOpeningRows}(${bucket.candidates})`,
        )
        .join(" ")}`,
    );
    console.log(
      `  row-guided: truthEvidence=${elevation.rowGuided.truthCompatibleFloorRows}/${result.truthOpeningRows} ` +
        `any=${elevation.rowGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} ` +
        `faceBand=${elevation.rowGuided.truthCompatibleRowsWithFaceBandCandidates}/${result.truthOpeningRows} ` +
        `lowNested=${elevation.rowGuided.truthCompatibleRowsWithLowNestedCandidates}/${result.truthOpeningRows} ` +
        `unique=${elevation.rowGuided.rowsWithUniqueCandidate} <=5=${elevation.rowGuided.rowsWithAtMostFiveCandidates} <=20=${elevation.rowGuided.rowsWithAtMostTwentyCandidates}`,
    );
    console.log(
      `  assembly-guided: truthEvidence=${elevation.assemblyGuided.truthCompatibleFloorRows}/${result.truthOpeningRows} ` +
        `any=${elevation.assemblyGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} ` +
        `faceBand=${elevation.assemblyGuided.truthCompatibleRowsWithFaceBandCandidates}/${result.truthOpeningRows} ` +
        `lowNested=${elevation.assemblyGuided.truthCompatibleRowsWithLowNestedCandidates}/${result.truthOpeningRows} ` +
        `unique=${elevation.assemblyGuided.rowsWithUniqueCandidate} <=5=${elevation.assemblyGuided.rowsWithAtMostFiveCandidates} <=20=${elevation.assemblyGuided.rowsWithAtMostTwentyCandidates}`,
    );
    console.log(
      `  assembly-group-guided: truthEvidence=${elevation.assemblyGroupGuided.truthCompatibleFloorRows}/${result.truthOpeningRows} ` +
        `any=${elevation.assemblyGroupGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} ` +
        `faceBand=${elevation.assemblyGroupGuided.truthCompatibleRowsWithFaceBandCandidates}/${result.truthOpeningRows} ` +
        `lowNested=${elevation.assemblyGroupGuided.truthCompatibleRowsWithLowNestedCandidates}/${result.truthOpeningRows} ` +
        `unique=${elevation.assemblyGroupGuided.rowsWithUniqueCandidate} <=5=${elevation.assemblyGroupGuided.rowsWithAtMostFiveCandidates} <=20=${elevation.assemblyGroupGuided.rowsWithAtMostTwentyCandidates}`,
    );
    console.log(
      `  slot-guided: truthEvidence=${elevation.slotGuided.truthCompatibleFloorRows}/${result.truthOpeningRows} ` +
        `any=${elevation.slotGuided.truthCompatibleRowsWithAnyCandidates}/${result.truthOpeningRows} ` +
        `faceBand=${elevation.slotGuided.truthCompatibleRowsWithFaceBandCandidates}/${result.truthOpeningRows} ` +
        `lowNested=${elevation.slotGuided.truthCompatibleRowsWithLowNestedCandidates}/${result.truthOpeningRows} ` +
        `unique=${elevation.slotGuided.rowsWithUniqueCandidate} <=5=${elevation.slotGuided.rowsWithAtMostFiveCandidates} <=20=${elevation.slotGuided.rowsWithAtMostTwentyCandidates}`,
    );
    console.log(
      `  ordered-face: uniqueFull=${elevation.orderedFaceSignatureStatus.uniqueFullMatchSides} ` +
        `orientationOnly=${elevation.orderedFaceSignatureStatus.orientationOnlyFullAmbiguitySides} ` +
        `harmlessOrientation=${elevation.orderedFaceSignatureStatus.dimensionHarmlessOrientationAmbiguitySides} ` +
        `multipleFace=${elevation.orderedFaceSignatureStatus.multipleFaceFullAmbiguitySides} ` +
        `partialOnly=${elevation.orderedFaceSignatureStatus.partialOnlySides} ` +
        `none=${elevation.orderedFaceSignatureStatus.noMatchSides} ` +
        `lengthUnique=${elevation.orderedFaceSignatureStatus.lengthGate.uniqueLengthCompatibleFullMatchSides} ` +
        `lengthOrientAmbig=${elevation.orderedFaceSignatureStatus.lengthGate.uniqueLengthMatchOrientationAmbiguousSides} ` +
        `lengthHarmlessOrient=${elevation.orderedFaceSignatureStatus.lengthGate.dimensionHarmlessOrientationAmbiguitySides} ` +
        `lengthMulti=${elevation.orderedFaceSignatureStatus.lengthGate.multipleLengthCompatibleFullMatchSides} ` +
        `lengthNoCompat=${elevation.orderedFaceSignatureStatus.lengthGate.noLengthCompatibleFullMatchSides} ` +
        `lengthMissing=${elevation.orderedFaceSignatureStatus.lengthGate.missingFloorSideLengthSides}`,
    );
  }
}
