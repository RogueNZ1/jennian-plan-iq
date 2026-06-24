import type { TextLabel } from "../doors/door-engine";
import type { PlanSide } from "./opening-face-map";

export type PlanSideLengthCandidate = {
  valueMm: number;
  x: number;
  y: number;
  vertical: boolean;
  text: string;
};

export type DetectedPlanSideLengthWitness = {
  planSide: PlanSide;
  lengthMm: number | null;
  candidates: PlanSideLengthCandidate[];
  note: string;
};

function dimensionLabelValue(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{4,5}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 3000 && value <= 30000 ? value : null;
}

function pageSize(labels: readonly Pick<TextLabel, "x" | "y">[]): {
  width: number;
  height: number;
} {
  const xs = labels.map((label) => label.x);
  const ys = labels.map((label) => label.y);
  return {
    width: Math.max(...xs, 1),
    height: Math.max(...ys, 1),
  };
}

export function detectPlanSideLengthWitnesses(
  labels: readonly Pick<TextLabel, "text" | "x" | "y" | "vertical">[],
): DetectedPlanSideLengthWitness[] {
  const size = pageSize(labels);
  const buckets: Record<PlanSide, PlanSideLengthCandidate[]> = {
    plan_top: [],
    plan_bottom: [],
    plan_left: [],
    plan_right: [],
  };

  for (const label of labels) {
    const valueMm = dimensionLabelValue(label.text);
    if (valueMm == null) continue;

    let planSide: PlanSide | null = null;
    if (label.vertical) {
      if (label.x < size.width * 0.45) {
        planSide = "plan_left";
      } else if (label.x > size.width * 0.55) {
        planSide = "plan_right";
      }
    } else if (label.y < size.height * 0.45) {
      planSide = "plan_top";
    } else if (label.y > size.height * 0.55) {
      planSide = "plan_bottom";
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
        ? "largest clean dimension label on this floor-plan side; use with ordered elevation sequence before pricing"
        : "no clean side dimension label found",
    };
  });
}
