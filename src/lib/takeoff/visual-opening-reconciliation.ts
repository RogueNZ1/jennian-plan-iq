import type { Opening } from "./takeoff-types";
import type { VisualOpeningAudit } from "./visual-opening-audit";

export type VisualOpeningReconciliationIssue = {
  severity: "error" | "warning";
  field: "windows_by_room" | "external_door_count" | "garage_door_size";
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
    visualExternalDoors: number;
    composedExternalDoors: number | null;
    visualGarageDoors: number;
    composedGarageDoorSize: string | null;
  };
};

type Args = {
  audit: VisualOpeningAudit | null | undefined;
  openings: readonly Opening[] | null | undefined;
  externalDoorCount: number | null | undefined;
  garageDoorSize: string | null | undefined;
};

const EXTERNAL_DOOR_TYPES = new Set(["external_door", "pa_door"]);

function fmtCount(n: number | null | undefined): string {
  return n == null ? "—" : String(n);
}

function parseSizeM(label: string | null | undefined): { a: number; b: number } | null {
  if (!label) return null;
  const m = label.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const rawA = Number(m[1]);
  const rawB = Number(m[2]);
  if (!Number.isFinite(rawA) || !Number.isFinite(rawB)) return null;
  const toM = (v: number) => (v > 20 ? v / 1000 : v);
  return { a: toM(rawA), b: toM(rawB) };
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
  const visualExternalDoorItems = visualOpenings.filter((o) => EXTERNAL_DOOR_TYPES.has(o.type));
  const visualExternalDoors = visualExternalDoorItems.length;
  const composedExternalDoors = args.externalDoorCount ?? null;
  const visualGarageItems = visualOpenings.filter((o) => o.type === "garage_door");

  const issues: VisualOpeningReconciliationIssue[] = [];

  if (visualQsGlazedOpenings > 0 && composedGlazedOpenings > 0) {
    const diff = Math.abs(visualQsGlazedOpenings - composedGlazedOpenings);
    if (diff > 0) {
      issues.push({
        severity: diff >= 2 ? "error" : "warning",
        field: "windows_by_room",
        message: `Visual QS found ${visualQsGlazedOpenings} QS-glazed external openings, but the composed opening set has ${composedGlazedOpenings}. Reconcile before pricing.`,
        visual: fmtCount(visualQsGlazedOpenings),
        composed: fmtCount(composedGlazedOpenings),
        openingIds: visualOpenings.filter((o) => o.type !== "garage_door").map((o) => o.id),
      });
    }
  }

  if (visualExternalDoors > 0 && (composedExternalDoors ?? 0) !== visualExternalDoors) {
    issues.push({
      severity: "error",
      field: "external_door_count",
      message: `Visual QS found ${visualExternalDoors} external hinged/PA door opening${visualExternalDoors === 1 ? "" : "s"}, but the takeoff external-door count is ${fmtCount(composedExternalDoors)}.`,
      visual: fmtCount(visualExternalDoors),
      composed: fmtCount(composedExternalDoors),
      openingIds: visualExternalDoorItems.map((o) => o.id),
    });
  }

  const visualGarage = visualGarageItems[0] ?? null;
  const visualGarageSize = visualGarage ? visualSizeM(visualGarage) : null;
  const composedGarageSize = parseSizeM(args.garageDoorSize);
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
  } else if (
    visualGarageSize &&
    composedGarageSize &&
    !sizeCloseUnordered(visualGarageSize, composedGarageSize)
  ) {
    issues.push({
      severity: "error",
      field: "garage_door_size",
      message: `Visual QS garage door size ${fmtSize(visualGarageSize)} disagrees with composed garage door size ${fmtSize(composedGarageSize)}.`,
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
      visualExternalDoors,
      composedExternalDoors,
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
