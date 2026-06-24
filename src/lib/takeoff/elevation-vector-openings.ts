import type { Segment } from "../doors/door-engine";
import type { ElevationData, ElevationOpeningCandidate } from "./extract-elevations";

type AxialHorizontal = { y: number; x0: number; x1: number; len: number; count: number };
type AxialVertical = { x: number; y0: number; y1: number; len: number };

export type ElevationFaceBand = {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  widthMm: number;
  heightMm: number;
};

export type ElevationVectorOpening = ElevationOpeningCandidate & {
  source: "vector_face_band" | "multi_panel_slider" | "sectional_garage_door";
  faceBandId: string;
  x: number;
  y: number;
};

const PT_PER_MM = 72 / 25.4;
const ELEVATION_SCALE = 100;
const ptToMm = (pt: number) => (pt / PT_PER_MM) * ELEVATION_SCALE;
const mmToPt = (mm: number) => (mm / ELEVATION_SCALE) * PT_PER_MM;

function axisSegments(segments: readonly Segment[]): {
  horizontals: AxialHorizontal[];
  verticals: AxialVertical[];
} {
  const hs: Omit<AxialHorizontal, "count">[] = [];
  const vs: AxialVertical[] = [];
  for (const segment of segments) {
    const dx = segment.x1 - segment.x0;
    const dy = segment.y1 - segment.y0;
    const len = Math.hypot(dx, dy);
    if (len < 5) continue;
    if (Math.abs(dy) <= Math.abs(dx) * 0.03) {
      hs.push({
        y: (segment.y0 + segment.y1) / 2,
        x0: Math.min(segment.x0, segment.x1),
        x1: Math.max(segment.x0, segment.x1),
        len,
      });
    } else if (Math.abs(dx) <= Math.abs(dy) * 0.03) {
      vs.push({
        x: (segment.x0 + segment.x1) / 2,
        y0: Math.min(segment.y0, segment.y1),
        y1: Math.max(segment.y0, segment.y1),
        len,
      });
    }
  }

  const clustered: AxialHorizontal[] = [];
  for (const h of hs.sort((a, b) => a.y - b.y || a.x0 - b.x0)) {
    const existing = clustered.find(
      (c) => Math.abs(c.y - h.y) <= 3 && Math.abs(c.x0 - h.x0) <= 35 && Math.abs(c.x1 - h.x1) <= 35,
    );
    if (!existing) {
      clustered.push({ ...h, count: 1 });
    } else {
      existing.y = (existing.y * existing.count + h.y) / (existing.count + 1);
      existing.x0 = Math.min(existing.x0, h.x0);
      existing.x1 = Math.max(existing.x1, h.x1);
      existing.len = Math.max(existing.len, h.len);
      existing.count += 1;
    }
  }

  return { horizontals: clustered, verticals: vs };
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function detectElevationFaceBands(segments: readonly Segment[]): ElevationFaceBand[] {
  const { horizontals } = axisSegments(segments);
  const long = horizontals.filter(
    (h) => h.len >= 250 && h.y > 120 && h.y < 720 && h.x0 > 20 && h.x1 < 1160,
  );
  const bands: ElevationFaceBand[] = [];

  for (const top of long) {
    for (const bottom of long) {
      const heightPt = bottom.y - top.y;
      if (heightPt < 45 || heightPt > 130) continue;
      const shared = overlap(top.x0, top.x1, bottom.x0, bottom.x1);
      if (shared < 250) continue;
      const x0 = Math.max(top.x0, bottom.x0);
      const x1 = Math.min(top.x1, bottom.x1);
      bands.push({
        id: `elevation-face-${bands.length + 1}`,
        x0,
        x1,
        y0: top.y,
        y1: bottom.y,
        widthMm: Math.round(ptToMm(x1 - x0)),
        heightMm: Math.round(ptToMm(heightPt)),
      });
    }
  }

  bands.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0 || b.widthMm - a.widthMm);
  const kept: ElevationFaceBand[] = [];
  for (const band of bands) {
    const duplicates = kept.some(
      (k) =>
        Math.abs(k.x0 - band.x0) < 15 &&
        Math.abs(k.x1 - band.x1) < 15 &&
        Math.abs(k.y0 - band.y0) < 15 &&
        Math.abs(k.y1 - band.y1) < 15,
    );
    if (!duplicates) kept.push({ ...band, id: `elevation-face-${kept.length + 1}` });
  }
  return kept;
}

function horizontalSpans(
  horizontals: readonly AxialHorizontal[],
  y: number,
  x0: number,
  x1: number,
): boolean {
  return horizontals.some((h) => Math.abs(h.y - y) <= 1.3 && h.x0 <= x0 + 1.5 && h.x1 >= x1 - 1.5);
}

function interiorVerticalCount(
  verticals: readonly AxialVertical[],
  r: { x0: number; x1: number; y0: number; y1: number },
): number {
  return verticals.filter(
    (v) => v.x > r.x0 + 2 && v.x < r.x1 - 2 && v.y0 <= r.y0 + 3 && v.y1 >= r.y1 - 3,
  ).length;
}

function interiorVerticalClusters(
  verticals: readonly AxialVertical[],
  r: { x0: number; x1: number; y0: number; y1: number },
): number[] {
  return clusteredValues(
    verticals
      .filter((v) => v.x > r.x0 + 2 && v.x < r.x1 - 2 && v.y0 <= r.y0 + 4 && v.y1 >= r.y1 - 4)
      .map((v) => v.x),
    4.5,
  );
}

function openingType(widthMm: number, heightMm: number): ElevationOpeningCandidate["type"] {
  if (heightMm >= 1800 && widthMm >= 1200) return "slider";
  return "window";
}

function clusteredValues(values: readonly number[], tolerance: number): number[] {
  const clustered: Array<{ value: number; count: number }> = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const existing = clustered.find((candidate) => Math.abs(candidate.value - value) <= tolerance);
    if (!existing) {
      clustered.push({ value, count: 1 });
    } else {
      existing.value = (existing.value * existing.count + value) / (existing.count + 1);
      existing.count += 1;
    }
  }
  return clustered.map((cluster) => cluster.value);
}

function fullWidthRailYs(
  horizontals: readonly AxialHorizontal[],
  r: { x0: number; x1: number; y0: number; y1: number },
): number[] {
  const width = r.x1 - r.x0;
  const rails = horizontals
    .filter(
      (h) =>
        h.y >= r.y0 - 1.6 &&
        h.y <= r.y1 + 1.6 &&
        h.len >= width * 0.85 &&
        h.x0 <= r.x0 + 3 &&
        h.x1 >= r.x1 - 3,
    )
    .map((h) => h.y);
  return clusteredValues(rails, 1.2);
}

function sectionalRailPattern(
  horizontals: readonly AxialHorizontal[],
  r: { x0: number; x1: number; y0: number; y1: number },
): number[] | null {
  const rails = fullWidthRailYs(horizontals, r);
  if (rails.length < 4 || rails.length > 7) return null;
  if (!rails.some((y) => Math.abs(y - r.y0) <= 2.2)) return null;
  if (!rails.some((y) => Math.abs(y - r.y1) <= 2.2)) return null;

  const gaps = rails
    .slice(1)
    .map((y, index) => y - rails[index])
    .filter((gap) => gap >= 4);
  if (gaps.length < 3) return null;
  const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const evenlyPanelled = gaps.every((gap) => gap >= avg * 0.55 && gap <= avg * 1.45);
  return evenlyPanelled ? rails : null;
}

function nearestFaceBand(
  bands: readonly ElevationFaceBand[],
  r: { x0: number; x1: number; y0: number; y1: number },
): ElevationFaceBand | null {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  return (
    [...bands].sort((a, b) => {
      const overlapA = overlapRatio(r, a);
      const overlapB = overlapRatio(r, b);
      if (overlapA !== overlapB) return overlapB - overlapA;
      const acx = (a.x0 + a.x1) / 2;
      const acy = (a.y0 + a.y1) / 2;
      const bcx = (b.x0 + b.x1) / 2;
      const bcy = (b.y0 + b.y1) / 2;
      return Math.hypot(cx - acx, cy - acy) - Math.hypot(cx - bcx, cy - bcy);
    })[0] ?? null
  );
}

function detectSectionalGarageDoorOpenings(
  horizontals: readonly AxialHorizontal[],
  verticals: readonly AxialVertical[],
  bands: readonly ElevationFaceBand[],
): ElevationVectorOpening[] {
  const out: ElevationVectorOpening[] = [];
  for (let i = 0; i < verticals.length; i += 1) {
    for (let j = i + 1; j < verticals.length; j += 1) {
      const a = verticals[i];
      const b = verticals[j];
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const widthMm = Math.round(ptToMm(x1 - x0));
      if (widthMm < 4200 || widthMm > 5200) continue;

      const y0 = Math.max(a.y0, b.y0);
      const y1 = Math.min(a.y1, b.y1);
      if (y1 <= y0) continue;
      if (y0 <= 120 || y1 >= 720) continue;
      const heightMm = Math.round(ptToMm(y1 - y0));
      if (heightMm < 1800 || heightMm > 2400) continue;
      if (a.len < mmToPt(1600) || b.len < mmToPt(1600)) continue;

      const r = { x0, x1, y0, y1 };
      const rails = sectionalRailPattern(horizontals, r);
      if (!rails) continue;

      const faceBand = nearestFaceBand(bands, r);
      const faceBandId = faceBand?.id ?? "elevation-face-unmapped";
      out.push({
        source: "sectional_garage_door",
        faceBandId,
        face: faceBandId,
        type: "garage_door",
        label: null,
        widthMm,
        heightMm,
        quantity: 1,
        cladding: null,
        confidence: "medium",
        notes: [
          `sectional garage door candidate from ${rails.length} full-width horizontal panel rails; review before pricing because elevation face labels are not explicit`,
        ],
        x: Math.round(((x0 + x1) / 2) * 10) / 10,
        y: Math.round(((y0 + y1) / 2) * 10) / 10,
      });
    }
  }
  return out;
}

function modularSliderWidthScore(widthMm: number): number {
  const commonWidths = [2400, 3000, 3600, 4200];
  return Math.min(...commonWidths.map((width) => Math.abs(widthMm - width)));
}

function sliderShapeScore(candidate: {
  widthMm: number;
  heightMm: number;
  railCount: number;
  verticalClusterCount: number;
}): number {
  const heightScore = Math.abs(candidate.heightMm - 2100);
  const widthScore = modularSliderWidthScore(candidate.widthMm) * 0.35;
  const railScore = Math.abs(candidate.railCount - 2) * 60;
  const clusterScore =
    candidate.verticalClusterCount >= 2 && candidate.verticalClusterCount <= 5 ? 0 : 120;
  const fullAssemblyBonus =
    candidate.widthMm >= 2800 && candidate.railCount === 2 && candidate.verticalClusterCount >= 3
      ? -80
      : 0;
  return heightScore + widthScore + railScore + clusterScore + fullAssemblyBonus;
}

function hasGlazedPanelBaySpacing(verticalClusters: readonly number[], widthPt: number): boolean {
  if (verticalClusters.length <= 1) return true;
  const sorted = [...verticalClusters].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((value, index) => value - sorted[index]);
  const wideGapThreshold = Math.max(14, widthPt * 0.16);
  return gaps.some((gap) => gap >= wideGapThreshold);
}

function candidateBounds(candidate: ElevationVectorOpening): {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
} {
  return {
    x0: candidate.x - ((candidate.widthMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
    x1: candidate.x + ((candidate.widthMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
    y0: candidate.y - ((candidate.heightMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
    y1: candidate.y + ((candidate.heightMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
  };
}

function detectMultiPanelSliderOpenings(
  horizontals: readonly AxialHorizontal[],
  verticals: readonly AxialVertical[],
  bands: readonly ElevationFaceBand[],
): ElevationVectorOpening[] {
  const raw: Array<ElevationVectorOpening & { shapeScore: number }> = [];
  const searchRegions = [
    ...bands,
    { id: "elevation-face-unmapped", x0: 20, x1: 1160, y0: 120, y1: 720 },
  ];
  for (const band of searchRegions) {
    const bandVerticals = verticals.filter(
      (v) =>
        v.x >= band.x0 &&
        v.x <= band.x1 &&
        v.y0 >= band.y0 - 25 &&
        v.y1 <= band.y1 + 45 &&
        v.len >= mmToPt(1600),
    );
    for (let i = 0; i < bandVerticals.length; i += 1) {
      for (let j = i + 1; j < bandVerticals.length; j += 1) {
        const a = bandVerticals[i];
        const b = bandVerticals[j];
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const widthMm = Math.round(ptToMm(x1 - x0));
        if (widthMm < 2200 || widthMm > 4200) continue;

        const y0 = Math.max(a.y0, b.y0);
        const y1 = Math.min(a.y1, b.y1);
        if (y1 <= y0) continue;
        const heightMm = Math.round(ptToMm(y1 - y0));
        if (heightMm < 1750 || heightMm > 2350) continue;
        if (!horizontalSpans(horizontals, y0, x0, x1)) continue;
        if (!horizontalSpans(horizontals, y1, x0, x1)) continue;

        const r = { x0, x1, y0, y1 };
        const rails = fullWidthRailYs(horizontals, r);
        if (rails.length < 2 || rails.length > 5) continue;
        if (sectionalRailPattern(horizontals, r)) continue;

        const mullionClusters = interiorVerticalClusters(verticals, r);
        if (mullionClusters.length < 1 || mullionClusters.length > 7) continue;
        if (!hasGlazedPanelBaySpacing(mullionClusters, x1 - x0)) continue;

        const faceBand = nearestFaceBand(bands, r);
        const faceBandId = faceBand?.id ?? band.id;
        const shapeScore = sliderShapeScore({
          widthMm,
          heightMm,
          railCount: rails.length,
          verticalClusterCount: mullionClusters.length,
        });
        raw.push({
          source: "multi_panel_slider",
          faceBandId,
          face: faceBandId,
          type: "slider",
          label: null,
          widthMm,
          heightMm,
          quantity: 1,
          cladding: null,
          confidence: "medium",
          notes: [
            `multi-panel glazed opening candidate from ${mullionClusters.length} vertical frame/mullion clusters and ${rails.length} full-width rails; review before pricing because elevation face labels are not explicit`,
          ],
          x: Math.round(((x0 + x1) / 2) * 10) / 10,
          y: Math.round(((y0 + y1) / 2) * 10) / 10,
          shapeScore,
        });
      }
    }
  }

  raw.sort(
    (a, b) =>
      a.shapeScore - b.shapeScore ||
      (b.widthMm ?? 0) * (b.heightMm ?? 0) - (a.widthMm ?? 0) * (a.heightMm ?? 0),
  );
  const kept: Array<ElevationVectorOpening & { shapeScore: number }> = [];
  for (const candidate of raw) {
    const duplicate = kept.some(
      (existing) => overlapRatio(candidateBounds(candidate), candidateBounds(existing)) > 0.7,
    );
    if (!duplicate) kept.push(candidate);
  }
  return kept.map(({ shapeScore: _shapeScore, ...candidate }) => candidate);
}

function overlapRatio(
  a: { x0: number; x1: number; y0: number; y1: number },
  b: { x0: number; x1: number; y0: number; y1: number },
): number {
  const w = overlap(a.x0, a.x1, b.x0, b.x1);
  const h = overlap(a.y0, a.y1, b.y0, b.y1);
  if (w <= 0 || h <= 0) return 0;
  const shared = w * h;
  const aArea = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
  const bArea = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
  return shared / Math.min(aArea, bArea);
}

export function detectElevationVectorOpenings(
  segments: readonly Segment[],
): ElevationVectorOpening[] {
  const { horizontals, verticals } = axisSegments(segments);
  const bands = detectElevationFaceBands(segments);
  const candidates: ElevationVectorOpening[] = [];
  candidates.push(...detectSectionalGarageDoorOpenings(horizontals, verticals, bands));
  candidates.push(...detectMultiPanelSliderOpenings(horizontals, verticals, bands));

  for (const band of bands) {
    const bandVerticals = verticals.filter(
      (v) =>
        v.x >= band.x0 &&
        v.x <= band.x1 &&
        v.y0 >= band.y0 - 2 &&
        v.y1 <= band.y1 + 2 &&
        v.len >= 12,
    );
    for (let i = 0; i < bandVerticals.length; i += 1) {
      for (let j = i + 1; j < bandVerticals.length; j += 1) {
        const a = bandVerticals[i];
        const b = bandVerticals[j];
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const widthMm = Math.round(ptToMm(x1 - x0));
        if (widthMm < 450 || widthMm > 5200) continue;

        const y0 = Math.max(a.y0, b.y0, band.y0);
        const y1 = Math.min(a.y1, b.y1, band.y1);
        const heightMm = Math.round(ptToMm(y1 - y0));
        if (heightMm < 550 || heightMm > 2600) continue;
        if (!horizontalSpans(horizontals, y0, x0, x1)) continue;
        if (!horizontalSpans(horizontals, y1, x0, x1)) continue;
        const density = interiorVerticalCount(verticals, { x0, x1, y0, y1 });
        if (density > 8) continue;

        if (
          widthMm >= 4200 &&
          heightMm >= 1800 &&
          fullWidthRailYs(horizontals, { x0, x1, y0, y1 }).length > 8
        )
          continue;

        if (density > 2) continue;
        candidates.push({
          source: "vector_face_band",
          faceBandId: band.id,
          face: band.id,
          type: openingType(widthMm, heightMm),
          label: null,
          widthMm,
          heightMm,
          quantity: 1,
          cladding: null,
          confidence: "medium",
          notes: [
            `vector opening candidate inside ${band.id}; review before pricing because elevation face labels are not explicit`,
          ],
          x: Math.round(((x0 + x1) / 2) * 10) / 10,
          y: Math.round(((y0 + y1) / 2) * 10) / 10,
        });
      }
    }
  }

  const priority = (candidate: ElevationVectorOpening) =>
    candidate.source === "sectional_garage_door"
      ? 0
      : candidate.source === "multi_panel_slider"
        ? 1
        : 2;
  candidates.sort(
    (a, b) =>
      priority(a) - priority(b) ||
      (b.widthMm ?? 0) * (b.heightMm ?? 0) - (a.widthMm ?? 0) * (a.heightMm ?? 0),
  );
  const kept: ElevationVectorOpening[] = [];
  for (const candidate of candidates) {
    const duplicate = kept.some(
      (k) =>
        overlapRatio(candidateBounds(candidate), candidateBounds(k)) > 0.65 ||
        (Math.abs(k.x - candidate.x) < 5 &&
          Math.abs(k.y - candidate.y) < 5 &&
          Math.abs((k.widthMm ?? 0) - (candidate.widthMm ?? 0)) < 200 &&
          Math.abs((k.heightMm ?? 0) - (candidate.heightMm ?? 0)) < 200),
    );
    if (!duplicate) kept.push(candidate);
  }
  kept.sort((a, b) => a.y - b.y || a.x - b.x);
  return kept;
}

function sameOpening(a: ElevationOpeningCandidate, b: ElevationOpeningCandidate): boolean {
  if (a.widthMm == null || a.heightMm == null || b.widthMm == null || b.heightMm == null) {
    return false;
  }
  return Math.abs(a.widthMm - b.widthMm) <= 120 && Math.abs(a.heightMm - b.heightMm) <= 120;
}

export function mergeElevationVectorOpenings(
  elevation: ElevationData | null,
  vectorOpenings: readonly ElevationVectorOpening[],
): ElevationData | null {
  if (vectorOpenings.length === 0) return elevation;
  const base: ElevationData = elevation ?? {
    claddingTypes: [],
    claddingTypeCode: null,
    roofType: null,
    roofPitchDegrees: null,
    wallHeightMm: null,
    studHeightMm: null,
    facesPresent: [],
    windowCountPerFace: {},
    externalDoorCount: 0,
    gableEndCount: 0,
    garageDoorsPresent: false,
    elevationOpenings: [],
  };
  const merged = [...(base.elevationOpenings ?? [])];
  for (const candidate of vectorOpenings) {
    if (merged.some((existing) => sameOpening(existing, candidate))) continue;
    merged.push(candidate);
  }
  return {
    ...base,
    facesPresent:
      base.facesPresent.length > 0
        ? base.facesPresent
        : Array.from(new Set(vectorOpenings.map((opening) => opening.face))),
    garageDoorsPresent:
      base.garageDoorsPresent || vectorOpenings.some((opening) => opening.type === "garage_door"),
    elevationOpenings: merged,
  };
}
