import type {
  PlanPhysicalOpeningWidthWitness,
  PlanPrintedWindowCodeWitness,
} from "./floor-opening-witnesses";
import type { OpeningSignatureFloorRow } from "./opening-face-map";
import type { PlanText } from "./plan-text";

const STANDARD_TALL_OPENING_HEIGHT_MM = 2100;
const MIN_PHYSICAL_SIGNATURE_WIDTH_MM = 2200;

export function buildOpeningSignatureFloorRows(args: {
  planText: Pick<PlanText, "garageDoorWitnesses">;
  printedCodeWitnesses: readonly PlanPrintedWindowCodeWitness[];
  physicalWitnesses: readonly PlanPhysicalOpeningWidthWitness[];
}): OpeningSignatureFloorRow[] {
  const out: OpeningSignatureFloorRow[] = [];

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
    if (witness.widthMm < MIN_PHYSICAL_SIGNATURE_WIDTH_MM) continue;
    out.push({
      source: "physical_width",
      room: witness.room,
      widthMm: witness.widthMm,
      heightMm: STANDARD_TALL_OPENING_HEIGHT_MM,
      planSide: witness.planSide,
      x: witness.x,
      y: witness.y,
      note: `${witness.note}; assumes tall opening height ${STANDARD_TALL_OPENING_HEIGHT_MM}mm for face-signature matching only`,
    });
  }

  for (const witness of args.planText.garageDoorWitnesses ?? []) {
    if (!witness.planSide) continue;
    out.push({
      source: "garage_marker",
      room: witness.room ?? "GARAGE",
      widthMm: witness.widthMm,
      heightMm: STANDARD_TALL_OPENING_HEIGHT_MM,
      planSide: witness.planSide,
      x: witness.x,
      y: witness.y,
      note: `${witness.markerText}; assumes garage opening height ${STANDARD_TALL_OPENING_HEIGHT_MM}mm for face-signature matching only`,
    });
  }

  return out;
}
