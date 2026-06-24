import type { Segment } from "../doors/door-engine";
import type { ElevationFaceBand } from "./elevation-vector-openings";

export type FrameRectangleCandidate = {
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

export type FrameAssemblyMember = FrameRectangleCandidate & {
  faceBandId: string;
  containingRects: number;
  childRects: number;
};

export type FrameAssemblyGroup = FrameRectangleCandidate & {
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

export type FrameOpeningSlot = FrameRectangleCandidate & {
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

const PT_PER_MM = 72 / 25.4;
const ELEVATION_SCALE = 100;
const MAX_ASSEMBLY_GROUP_WIDTH_MM = 6200;

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
  horizontals: readonly { y: number; x0: number; x1: number }[],
  y: number,
  x0: number,
  x1: number,
): boolean {
  return horizontals.some(
    (horizontal) =>
      Math.abs(horizontal.y - y) <= 3 && horizontal.x0 <= x0 + 2 && horizontal.x1 >= x1 - 2,
  );
}

export function frameRectangleCandidates(segments: readonly Segment[]): FrameRectangleCandidate[] {
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
  return (w * h) / Math.max(1, Math.min(a.areaPt2, b.areaPt2));
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

function candidateFaceBandId(
  candidate: FrameRectangleCandidate,
  bands: readonly ElevationFaceBand[],
): string | null {
  const matches = bands.filter(
    (band) =>
      candidate.x >= band.x0 - 8 &&
      candidate.x <= band.x1 + 8 &&
      candidate.y >= band.y0 - 20 &&
      candidate.y <= band.y1 + 25,
  );
  return matches.sort((a, b) => a.widthMm - b.widthMm)[0]?.id ?? null;
}

function plausibleOpeningShape(candidate: FrameRectangleCandidate): boolean {
  const { widthMm: width, heightMm: height } = candidate;
  if (width < 450 || width > 5200 || height < 500 || height > 2600) return false;
  const aspect = width / Math.max(1, height);
  const doorLike = height >= 1750 && width >= 550 && aspect >= 0.18 && aspect <= 2.6;
  const windowLike = height < 1750 && aspect >= 0.28 && aspect <= 4.8;
  return doorLike || windowLike;
}

function sameAssemblyCluster(a: FrameAssemblyMember, b: FrameAssemblyMember): boolean {
  if (a.faceBandId !== b.faceBandId) return false;
  const areaRatio = Math.max(a.areaPt2, b.areaPt2) / Math.max(1, Math.min(a.areaPt2, b.areaPt2));
  if (areaRatio > 8) return false;
  const maxWidth = Math.max(a.x1 - a.x0, b.x1 - b.x0);
  const maxHeight = Math.max(a.y1 - a.y0, b.y1 - b.y0);
  const locallyCentred =
    Math.abs(a.x - b.x) <= maxWidth * 0.4 && Math.abs(a.y - b.y) <= maxHeight * 0.35;
  if (!locallyCentred) return false;
  if (rectOverlapRatio(a, b) > 0.74) return true;
  return rectContains(a, b, 2) || rectContains(b, a, 2);
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
    groupWidthMm: ptToMm(groupX1 - groupX0),
    groupHeightMm: ptToMm(groupY1 - groupY0),
    memberRects: component.length,
    nestedMemberRects: component.filter(
      (member) => member.childRects > 0 || member.containingRects > 0,
    ).length,
    maxChildRects: Math.max(...component.map((member) => member.childRects)),
    minContainingRects: Math.min(...component.map((member) => member.containingRects)),
    members: component,
  };
}

export function frameAssemblyGroups(args: {
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
    if (existing) existing.push(member);
    else acc.set(member.faceBandId, [member]);
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
      if (existing) existing.push(bandMembers[i]);
      else components.set(root, [bandMembers[i]]);
    }

    const maxWidthPt = (MAX_ASSEMBLY_GROUP_WIDTH_MM / ELEVATION_SCALE) * PT_PER_MM;
    for (const component of components.values()) {
      const chunks: FrameAssemblyMember[][] = [];
      let current: FrameAssemblyMember[] = [];
      for (const member of [...component].sort((a, b) => a.x0 - b.x0 || a.x - b.x)) {
        const next = [...current, member];
        const nextWidth =
          Math.max(...next.map((candidate) => candidate.x1)) -
          Math.min(...next.map((candidate) => candidate.x0));
        if (current.length > 0 && nextWidth > maxWidthPt) {
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
  return (
    group.groupWidthMm > 5200 ||
    clusteredNumbers(
      group.members.map((member) => member.x),
      18,
    ).length >= 4
  );
}

export function frameOpeningSlots(groups: readonly FrameAssemblyGroup[]): FrameOpeningSlot[] {
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
      if (existing) existing.push(group.members[i]);
      else components.set(root, [group.members[i]]);
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

export function detectFrameOpeningSlots(args: {
  segments: readonly Segment[];
  faceBands: readonly ElevationFaceBand[];
}): FrameOpeningSlot[] {
  return frameOpeningSlots(
    frameAssemblyGroups({
      candidates: frameRectangleCandidates(args.segments),
      faceBands: args.faceBands,
    }),
  );
}
