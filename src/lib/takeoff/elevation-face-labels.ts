import type { TextLabel } from "../doors/door-engine";
import type { ElevationFaceBand } from "./elevation-vector-openings";

export type ElevationFaceLabel = {
  text: string;
  kind: "compass" | "letter";
  direction: string | null;
  letter: string | null;
  x: number;
  y: number;
  slot: string;
  nearestBand: {
    id: string;
    slot: string;
    distance: number;
  } | null;
};

function compactKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function elevationDirection(text: string): string | null {
  const normalized = compactKey(text);
  const directionWords = [
    "NORTHWESTERN",
    "NORTHEASTERN",
    "SOUTHWESTERN",
    "SOUTHEASTERN",
    "NORTHERN",
    "SOUTHERN",
    "EASTERN",
    "WESTERN",
    "NORTH",
    "SOUTH",
    "EAST",
    "WEST",
  ];
  return directionWords.find((word) => normalized.includes(`${word}ELEVATION`)) ?? null;
}

function elevationLetter(text: string): string | null {
  return (
    text
      .trim()
      .match(/^Elevation\s+([A-Z])$/i)?.[1]
      ?.toUpperCase() ?? null
  );
}

function layoutSlot(
  point: { x: number; y: number },
  points: readonly { x: number; y: number }[],
): string {
  if (points.length === 0) return "unknown";
  const xs = points.map((candidate) => candidate.x);
  const ys = points.map((candidate) => candidate.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xMid = (minX + maxX) / 2;
  const yTop = minY + (maxY - minY) * 0.34;
  const yBottom = minY + (maxY - minY) * 0.67;
  const row = point.y <= yTop ? "top" : point.y >= yBottom ? "bottom" : "middle";
  if (row !== "middle") return row;
  return point.x <= xMid ? "middle_left" : "middle_right";
}

function bandPoint(band: ElevationFaceBand): { x: number; y: number } {
  return {
    x: (band.x0 + band.x1) / 2,
    y: (band.y0 + band.y1) / 2,
  };
}

export function elevationBandSlot(
  band: ElevationFaceBand,
  bands: readonly ElevationFaceBand[],
): string {
  return layoutSlot(bandPoint(band), bands.map(bandPoint));
}

function nearestBand(
  label: Pick<TextLabel, "x" | "y">,
  bands: readonly ElevationFaceBand[],
): ElevationFaceLabel["nearestBand"] {
  const [nearest] = bands
    .map((band) => {
      const point = bandPoint(band);
      return {
        id: band.id,
        slot: elevationBandSlot(band, bands),
        distance: Math.hypot(label.x - point.x, label.y - point.y),
      };
    })
    .sort((a, b) => a.distance - b.distance);
  return nearest ?? null;
}

export function detectElevationFaceLabels(
  labels: readonly TextLabel[],
  bands: readonly ElevationFaceBand[] = [],
): ElevationFaceLabel[] {
  return labels
    .map((label) => {
      const direction = elevationDirection(label.text);
      const letter = elevationLetter(label.text);
      if (!direction && !letter) return null;
      return {
        text: label.text.trim(),
        kind: direction ? "compass" : "letter",
        direction,
        letter,
        x: Math.round(label.x * 10) / 10,
        y: Math.round(label.y * 10) / 10,
        slot: layoutSlot(label, labels),
        nearestBand: nearestBand(label, bands),
      } satisfies ElevationFaceLabel;
    })
    .filter((label): label is ElevationFaceLabel => label != null);
}
