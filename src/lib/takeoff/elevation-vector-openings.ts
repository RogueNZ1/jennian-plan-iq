import type { Segment } from "../doors/door-engine";
import type { ElevationOpeningCandidate } from "./extract-elevations";

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
  source: "vector_face_band";
  faceBandId: string;
  x: number;
  y: number;
};

const PT_PER_MM = 72 / 25.4;
const ELEVATION_SCALE = 100;
const ptToMm = (pt: number) => (pt / PT_PER_MM) * ELEVATION_SCALE;

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

function openingType(widthMm: number, heightMm: number): ElevationOpeningCandidate["type"] {
  if (widthMm >= 4200 && heightMm >= 1800) return "garage_door";
  if (heightMm >= 1800 && widthMm >= 1200) return "slider";
  return "window";
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

  candidates.sort(
    (a, b) => (b.widthMm ?? 0) * (b.heightMm ?? 0) - (a.widthMm ?? 0) * (a.heightMm ?? 0),
  );
  const kept: ElevationVectorOpening[] = [];
  for (const candidate of candidates) {
    const duplicate = kept.some(
      (k) =>
        overlapRatio(
          {
            x0: candidate.x - ((candidate.widthMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
            x1: candidate.x + ((candidate.widthMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
            y0: candidate.y - ((candidate.heightMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
            y1: candidate.y + ((candidate.heightMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
          },
          {
            x0: k.x - ((k.widthMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
            x1: k.x + ((k.widthMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
            y0: k.y - ((k.heightMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
            y1: k.y + ((k.heightMm ?? 0) / ELEVATION_SCALE) * (PT_PER_MM / 2),
          },
        ) > 0.65 ||
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
