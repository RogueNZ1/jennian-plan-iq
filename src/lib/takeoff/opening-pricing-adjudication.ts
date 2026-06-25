import type { Opening } from "./takeoff-types";
import type { VisualOpeningReconciliation } from "./visual-opening-reconciliation";

export type QuarantinedOpening = {
  opening: Opening;
  reasons: string[];
};

export type HeldBlockedOpening = {
  opening: Opening;
  reason: string;
  flag: string;
};

export type OpeningPricingBlock = {
  reason: string;
  flag: string;
};

export type OpeningPricingAdjudication = {
  pricedOpenings: Opening[];
  heldBlockedOpenings: HeldBlockedOpening[];
  quarantinedOpenings: QuarantinedOpening[];
  flags: string[];
  pricingBlocked: boolean;
};

const NON_GARAGE_MAX_WIDTH_M = 6;
const GARAGE_WINDOW_MAX_WIDTH_M = 3.6;
const NON_GARAGE_MAX_HEIGHT_M = 3.2;
const NON_GARAGE_MAX_AREA_M2 = 16;
const MAX_ASPECT_RATIO = 8;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function reasonLabel(reason: string): string {
  return reason.replaceAll("_", " ");
}

export function openingQuarantineReasons(opening: Opening): string[] {
  const reasons: string[] = [];
  const width = opening.width_m;
  const height = opening.height_m;
  const area = opening.area_m2;

  if (!isFinitePositive(width)) reasons.push("missing_width");
  if (!isFinitePositive(height)) reasons.push("missing_height");
  if (!Number.isFinite(area) || area < 0) reasons.push("invalid_area");

  if (opening.type === "sectional_door") return reasons;

  const widthLimit =
    opening.type === "garage_window" ? GARAGE_WINDOW_MAX_WIDTH_M : NON_GARAGE_MAX_WIDTH_M;
  if (isFinitePositive(width) && width > widthLimit) reasons.push("impossible_width");
  if (isFinitePositive(height) && height > NON_GARAGE_MAX_HEIGHT_M) {
    reasons.push("impossible_height");
  }
  if (Number.isFinite(area) && area > NON_GARAGE_MAX_AREA_M2) reasons.push("impossible_area");

  if (isFinitePositive(width) && isFinitePositive(height)) {
    const ratio = Math.max(width / height, height / width);
    if (ratio > MAX_ASPECT_RATIO) reasons.push("impossible_ratio");
  }

  return reasons;
}

export function adjudicateOpeningPricing(openings: readonly Opening[]): OpeningPricingAdjudication {
  const pricedOpenings: Opening[] = [];
  const quarantinedOpenings: QuarantinedOpening[] = [];
  const flags: string[] = [];

  for (const opening of openings) {
    const reasons = openingQuarantineReasons(opening);
    if (reasons.length === 0) {
      pricedOpenings.push(opening);
      continue;
    }

    const room = opening.room ?? "unrouted opening";
    const reasonText = reasons.map(reasonLabel).join(", ");
    const flag = `${room}: ${opening.type} ${round2(opening.width_m)}m x ${round2(
      opening.height_m,
    )}m quarantined from pricing (${reasonText}).`;
    quarantinedOpenings.push({
      opening: {
        ...opening,
        flags: [...(opening.flags ?? []), flag],
      },
      reasons,
    });
    flags.push(flag);
  }

  return { pricedOpenings, heldBlockedOpenings: [], quarantinedOpenings, flags, pricingBlocked: false };
}

export function pricingBlockFromVisualReconciliation(
  report: VisualOpeningReconciliation | null | undefined,
): OpeningPricingBlock | null {
  const errors = (report?.issues ?? []).filter((issue) => issue.severity === "error");
  if (errors.length === 0) return null;

  const joined = errors.map((issue) => issue.message).join(" ");
  return {
    reason: "visual_reconciliation_error",
    flag: `Opening pricing blocked: unresolved Visual QS reconciliation error. ${joined}`,
  };
}

export function applyOpeningPricingBlock(
  adjudication: OpeningPricingAdjudication,
  block: OpeningPricingBlock | null | undefined,
): OpeningPricingAdjudication {
  if (!block) return adjudication;

  return {
    pricedOpenings: [],
    heldBlockedOpenings: [
      ...adjudication.heldBlockedOpenings,
      ...adjudication.pricedOpenings.map((opening) => ({
        opening: {
          ...opening,
          flags: [...(opening.flags ?? []), block.flag],
        },
        reason: block.reason,
        flag: block.flag,
      })),
    ],
    quarantinedOpenings: adjudication.quarantinedOpenings,
    flags: [...adjudication.flags, block.flag],
    pricingBlocked: true,
  };
}
