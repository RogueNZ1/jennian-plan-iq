import { MEASURED_WIDTH_CONFIRMATION_TOLERANCE_MM } from "./elevation-gap-match";
import type { FloorPlanGapCandidate } from "./floor-plan-gaps";
import type { PlanText, PlanWindowCode } from "./plan-text";

export type FloorPlanTextDimensionMatch = {
  source: "pdf_text_dimension";
  page: number;
  text: string;
  x: number;
  y: number;
  matchedDimension: "first" | "second";
  matchedWidthMm: number;
  heightMm: number;
  widthMatchDeltaMm: number;
  distanceToGapPt: number;
  note: string;
};

const MAX_TEXT_TO_GAP_DISTANCE_PT = 90;

function dimensionText(code: PlanWindowCode): string {
  return `${code.heightMm} x ${code.widthMm}`;
}

function bboxCenter(bbox: [number, number, number, number]): { x: number; y: number } {
  return { x: (bbox[0] + bbox[2]) / 2, y: (bbox[1] + bbox[3]) / 2 };
}

function distanceToBbox(point: { x: number; y: number }, bbox: [number, number, number, number]) {
  const minX = Math.min(bbox[0], bbox[2]);
  const maxX = Math.max(bbox[0], bbox[2]);
  const minY = Math.min(bbox[1], bbox[3]);
  const maxY = Math.max(bbox[1], bbox[3]);
  const dx = point.x < minX ? minX - point.x : point.x > maxX ? point.x - maxX : 0;
  const dy = point.y < minY ? minY - point.y : point.y > maxY ? point.y - maxY : 0;
  return Math.hypot(dx, dy);
}

function matchCodeWidth(
  gap: FloorPlanGapCandidate,
  code: PlanWindowCode,
): Pick<
  FloorPlanTextDimensionMatch,
  "matchedDimension" | "matchedWidthMm" | "heightMm" | "widthMatchDeltaMm"
> | null {
  const candidates = [
    {
      matchedDimension: "second" as const,
      matchedWidthMm: code.widthMm,
      heightMm: code.heightMm,
      widthMatchDeltaMm: Math.abs(code.widthMm - gap.widthMm),
    },
    {
      matchedDimension: "first" as const,
      matchedWidthMm: code.heightMm,
      heightMm: code.widthMm,
      widthMatchDeltaMm: Math.abs(code.heightMm - gap.widthMm),
    },
  ].filter((candidate) => candidate.widthMatchDeltaMm <= MEASURED_WIDTH_CONFIRMATION_TOLERANCE_MM);

  candidates.sort((a, b) => a.widthMatchDeltaMm - b.widthMatchDeltaMm);
  return candidates[0] ?? null;
}

function candidateMatch(args: {
  gap: FloorPlanGapCandidate;
  code: PlanWindowCode;
  page: number;
}): FloorPlanTextDimensionMatch | null {
  const { gap, code, page } = args;
  if (!gap.bbox) return null;
  if (gap.page == null || gap.page !== page) return null;
  const width = matchCodeWidth(gap, code);
  if (!width) return null;
  const distanceToGapPt = distanceToBbox({ x: code.x, y: code.y }, gap.bbox);
  if (distanceToGapPt > MAX_TEXT_TO_GAP_DISTANCE_PT) return null;
  const center = bboxCenter(gap.bbox);
  return {
    source: "pdf_text_dimension",
    page,
    text: dimensionText(code),
    x: code.x,
    y: code.y,
    ...width,
    distanceToGapPt,
    note:
      `floor-plan text dimension ${dimensionText(code)} at (${Math.round(code.x)}, ${Math.round(
        code.y,
      )}) is ${Math.round(distanceToGapPt)}pt from floor-gap bbox center ` +
      `(${Math.round(center.x)}, ${Math.round(center.y)}); matched ${width.matchedWidthMm}mm ` +
      `to measured gap ${gap.widthMm}mm with ${width.widthMatchDeltaMm}mm delta.`,
  };
}

function gapEligible(gap: FloorPlanGapCandidate): boolean {
  return (
    gap.envelopeSide === "exterior" &&
    gap.confidence !== "low" &&
    gap.routing.confidence !== "low" &&
    !gap.routing.ambiguous &&
    gap.bbox != null &&
    gap.page != null
  );
}

export function matchPlanTextDimensionsToFloorPlanGaps(args: {
  gaps: readonly FloorPlanGapCandidate[] | null | undefined;
  planText: Pick<PlanText, "windowCodes"> | null | undefined;
  page: number | null | undefined;
}): Map<string, FloorPlanTextDimensionMatch> {
  const out = new Map<string, FloorPlanTextDimensionMatch>();
  if (args.page == null) return out;

  for (const gap of args.gaps ?? []) {
    if (!gapEligible(gap)) continue;
    const nearbyCodes = (args.planText?.windowCodes ?? []).filter((code) => {
      if (!gap.bbox) return false;
      return distanceToBbox({ x: code.x, y: code.y }, gap.bbox) <= MAX_TEXT_TO_GAP_DISTANCE_PT;
    });
    const matches = nearbyCodes
      .map((code) => candidateMatch({ gap, code, page: args.page as number }))
      .filter((match): match is FloorPlanTextDimensionMatch => match != null);

    if (nearbyCodes.length !== matches.length) continue;
    if (matches.length !== 1) continue;
    out.set(gap.id, matches[0]);
  }

  return out;
}
