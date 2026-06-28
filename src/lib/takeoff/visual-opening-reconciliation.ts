import type { Opening } from "./takeoff-types";
import type { VisualOpeningAudit } from "./visual-opening-audit";
import { parseGarageDoorSizeM } from "./garage-door-size";

export type VisualOpeningReconciliationIssue = {
  severity: "error" | "warning";
  field: "windows_by_room" | "garage_door_size";
  message: string;
  visual: string;
  composed: string;
  openingIds: string[];
};

export type VisualOpeningReconciliation = {
  method: "visual_qs_reconciliation";
  status: "pass" | "review";
  issues: VisualOpeningReconciliationIssue[];
  summary: {
    visualQsGlazedOpenings: number;
    composedGlazedOpenings: number;
    visualGarageDoors: number;
    composedGarageDoorSize: string | null;
  };
};

type Args = {
  audit: VisualOpeningAudit | null | undefined;
  openings: readonly Opening[] | null | undefined;
  garageDoorSize: string | null | undefined;
};

function fmtCount(n: number | null | undefined): string {
  return n == null ? "—" : String(n);
}

function parseSizeM(label: string | null | undefined): { a: number; b: number } | null {
  return parseGarageDoorSizeM(label);
}

function visualSizeM(
  opening: VisualOpeningAudit["openings"][number],
): { a: number; b: number } | null {
  if (opening.height_m != null && opening.width_m != null) {
    return { a: opening.height_m, b: opening.width_m };
  }
  return parseSizeM(opening.label);
}

function sizeCloseUnordered(
  left: { a: number; b: number },
  right: { a: number; b: number },
  toleranceM = 0.15,
): boolean {
  const direct =
    Math.abs(left.a - right.a) <= toleranceM && Math.abs(left.b - right.b) <= toleranceM;
  const swapped =
    Math.abs(left.a - right.b) <= toleranceM && Math.abs(left.b - right.a) <= toleranceM;
  return direct || swapped;
}

function plausibleGarageDoorSize(size: { a: number; b: number } | null): boolean {
  if (!size) return false;
  const height = Math.min(size.a, size.b);
  const width = Math.max(size.a, size.b);
  return height >= 2.0 && height <= 2.4 && width >= 2.4 && width <= 5.4;
}

function fmtSize(size: { a: number; b: number } | null): string {
  if (!size) return "—";
  return `${Math.round(size.a * 1000)}×${Math.round(size.b * 1000)}`;
}

export function reconcileVisualOpenings(args: Args): VisualOpeningReconciliation | null {
  const audit = args.audit;
  if (!audit) return null;

  const visualOpenings = audit.openings;
  const visualQsGlazedOpenings = audit.summary.qsGlazedOpenings;
  const composedGlazedOpenings = (args.openings ?? []).filter((o) => o.glazed).length;
  const visualGarageItems = visualOpenings.filter((o) => o.type === "garage_door");

  const issues: VisualOpeningReconciliationIssue[] = [];

  const diff = Math.abs(visualQsGlazedOpenings - composedGlazedOpenings);
  if (diff > 0) {
    const oneSideMissing = visualQsGlazedOpenings === 0 || composedGlazedOpenings === 0;
    issues.push({
      severity: oneSideMissing || diff >= 2 ? "error" : "warning",
      field: "windows_by_room",
      message: `AI opening check found ${visualQsGlazedOpenings} QS-glazed external openings, but the composed opening set has ${composedGlazedOpenings}. Reconcile before pricing.`,
      visual: fmtCount(visualQsGlazedOpenings),
      composed: fmtCount(composedGlazedOpenings),
      openingIds: visualOpenings.filter((o) => o.type !== "garage_door").map((o) => o.id),
    });
  }

  const visualGarage = visualGarageItems[0] ?? null;
  const visualGarageSize = visualGarage ? visualSizeM(visualGarage) : null;
  const composedGarageSize = parseSizeM(args.garageDoorSize);
  const visualGaragePlausible = plausibleGarageDoorSize(visualGarageSize);
  if (visualGarage && !composedGarageSize) {
    issues.push({
      severity: "error",
      field: "garage_door_size",
      message:
        "Visual QS found a garage door, but the composed takeoff has no usable garage door size.",
      visual: fmtSize(visualGarageSize),
      composed: args.garageDoorSize ?? "—",
      openingIds: [visualGarage.id],
    });
  } else if (visualGarageSize && composedGarageSize && !visualGaragePlausible) {
    issues.push({
      severity: "warning",
      field: "garage_door_size",
      message: `Visual QS garage door read ${fmtSize(visualGarageSize)} is outside the garage-door plausibility band; keeping composed garage door size ${fmtSize(composedGarageSize)}.`,
      visual: fmtSize(visualGarageSize),
      composed: fmtSize(composedGarageSize),
      openingIds: [visualGarage.id],
    });
  } else if (
    visualGarageSize &&
    composedGarageSize &&
    !sizeCloseUnordered(visualGarageSize, composedGarageSize)
  ) {
    issues.push({
      severity: "warning",
      field: "garage_door_size",
      message: `Visual QS garage door size ${fmtSize(visualGarageSize)} disagrees with composed garage door size ${fmtSize(composedGarageSize)}; keeping the composed numeric garage door size.`,
      visual: fmtSize(visualGarageSize),
      composed: fmtSize(composedGarageSize),
      openingIds: [visualGarage.id],
    });
  }

  if (visualGarageItems.length > 1) {
    issues.push({
      severity: "warning",
      field: "garage_door_size",
      message: `Visual QS found ${visualGarageItems.length} garage doors; current garage-door export supports one classified size row.`,
      visual: fmtCount(visualGarageItems.length),
      composed: args.garageDoorSize ?? "—",
      openingIds: visualGarageItems.map((o) => o.id),
    });
  }

  return {
    method: "visual_qs_reconciliation",
    status: issues.length > 0 ? "review" : "pass",
    issues,
    summary: {
      visualQsGlazedOpenings,
      composedGlazedOpenings,
      visualGarageDoors: visualGarageItems.length,
      composedGarageDoorSize: args.garageDoorSize ?? null,
    },
  };
}

export function visualReconciliationFlags(
  report: VisualOpeningReconciliation | null | undefined,
  field: VisualOpeningReconciliationIssue["field"],
): string[] {
  return (report?.issues ?? [])
    .filter((i) => i.field === field)
    .map((i) => `Visual QS: ${i.message}`);
}
