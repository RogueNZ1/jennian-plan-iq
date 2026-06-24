// Fenner (JM-0052) opening ledger - per-row audit against signed QS truth.
//
// This is diagnostic-only. It is allowed to compare against manual rows because
// it is a scorecard; production extraction must not use the signed workbook as
// evidence for selection or pricing.
//
// Run: npx tsx scripts/fenner-opening-ledger.mts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractPageGeometry } from "../src/lib/doors/pdf-adapter.ts";
import {
  selectExteriorWidthCandidates,
  type ExteriorWidthCandidate,
  type GapCandidate,
} from "../src/lib/takeoff/exterior-opening-select.ts";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
  type ElevationFaceBand,
  type ElevationVectorOpening,
} from "../src/lib/takeoff/elevation-vector-openings.ts";
import {
  parsePlanText,
  type PlanGarageDoorWitness,
  type PlanText,
} from "../src/lib/takeoff/plan-text.ts";
import {
  detectPrintedWindowCodeWitnesses,
  detectPhysicalOpeningWidthWitnesses,
  type PlanPrintedWindowCodeWitness,
  type PlanPhysicalOpeningWidthWitness,
} from "../src/lib/takeoff/floor-opening-witnesses.ts";
import {
  buildOpeningFaceMap,
  type GarageDoorFaceAnchor,
  type OpeningFaceAnchor,
  type OpeningFaceMap,
  type PlanSide,
} from "../src/lib/takeoff/opening-face-map.ts";

type ManualOpening = {
  room: string;
  cladding: number;
  qty: number;
  height_m: number;
  width_m: number;
};

type GroundTruth = {
  manual_openings: ManualOpening[];
  derived?: {
    total_opening_sqm?: number;
  };
};

type FloorEvidence =
  | {
      status: "confirmed";
      candidate: ExteriorWidthCandidate;
      widthDeltaMm: number;
      note: string;
    }
  | {
      status: "garage_door_witness_confirmed";
      witness: PlanGarageDoorWitness;
      widthDeltaMm: number;
      note: string;
    }
  | {
      status: "physical_opening_width_confirmed";
      witness: PlanPhysicalOpeningWidthWitness;
      widthDeltaMm: number;
      note: string;
    }
  | {
      status: "printed_window_code_confirmed";
      witnesses: PlanPrintedWindowCodeWitness[];
      planSide: string | null;
      widthDeltaMm: number;
      heightDeltaMm: number;
      note: string;
    }
  | {
      status: "same_room_width_mismatch";
      candidate: ExteriorWidthCandidate;
      widthDeltaMm: number;
      note: string;
    }
  | {
      status: "same_room_physical_width_mismatch";
      witness: PlanPhysicalOpeningWidthWitness;
      widthDeltaMm: number;
      note: string;
    }
  | {
      status: "same_room_printed_code_mismatch";
      witness: PlanPrintedWindowCodeWitness;
      widthDeltaMm: number;
      heightDeltaMm: number;
      note: string;
    }
  | {
      status: "missing";
      note: string;
    };

type ElevationEvidence = {
  status: "exclusive_dimension" | "partial_exclusive_dimension" | "soft_dimension_only" | "missing";
  strictMatches: ElevationVectorOpening[];
  softMatches: ElevationVectorOpening[];
  note: string;
};

type IndexedElevationOpening = {
  candidate: ElevationVectorOpening;
  index: number;
};

type RecoveredPriceableMeasurement = {
  widthMm: number;
  heightMm: number;
  areaM2: number;
  signedAreaM2: number;
  areaDeltaM2: number;
  source: string;
};

type LongFaceSignatureWitness = {
  source: "printed_code" | "physical_width";
  room: string;
  planSide: PlanSide;
  widthMm: number;
  heightMm: number | null;
  x: number;
  y: number;
};

type LongFaceSignatureDiagnostic = {
  planSide: PlanSide;
  elevationFace: string;
  matched: number;
  total: number;
  missing: string[];
  matches: Array<{
    room: string;
    source: LongFaceSignatureWitness["source"];
    floor: string;
    elevation: string;
    widthDeltaMm: number;
    heightDeltaMm: number | null;
  }>;
  note: string;
};

const FLOOR_WIDTH_TOLERANCE_MM = 250;
const PRINTED_CODE_WIDTH_TOLERANCE_MM = 60;
const PRINTED_CODE_HEIGHT_TOLERANCE_MM = 100;
const SOFT_ELEVATION_DIMENSION_TOLERANCE_MM = 250;
const STRICT_ELEVATION_DIMENSION_TOLERANCE_MM = 180;
const LONG_FACE_SIGNATURE_WIDTH_TOLERANCE_MM = 250;
const LONG_FACE_SIGNATURE_HEIGHT_TOLERANCE_MM = 250;
const LONG_FACE_DIAGNOSTIC_PHYSICAL_HEIGHT_MM = 2100;

const truth = JSON.parse(
  readFileSync(resolve("tests/fixtures/fenner/ground-truth.json"), "utf8"),
) as GroundTruth;
const gaps = JSON.parse(
  readFileSync(resolve("tests/fixtures/fenner/floorplan-gaps.json"), "utf8"),
) as GapCandidate[];

const { supportedWidthCandidates, reviewWidthCandidates, rejected } =
  selectExteriorWidthCandidates(gaps);
const exteriorCandidates = [...supportedWidthCandidates, ...reviewWidthCandidates];

function compactKey(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const roomAliases: Record<string, string> = {
  BATHROOM: "BATH",
  BATH: "BATH",
  BED1: "MASTERBED",
  MASTER: "MASTERBED",
  MASTERBED: "MASTERBED",
  BED2: "BED2",
  BED3: "BED3",
  BED4: "STUDYBED4",
  STUDYBED4: "STUDYBED4",
  DINING: "DINING",
  ENSUITE: "ENSUITE",
  ENTRANCE: "ENTRY",
  ENTRY: "ENTRY",
  FAMILY: "FAMILY",
  GARAGE: "GARAGE",
  GARAGEDOOR: "GARAGE",
  GARAGEDOOR1: "GARAGE",
  GARAGEWINDOW: "GARAGE",
  GARAGEWINDOWS: "GARAGE",
  KITCHEN: "KITCHEN",
  LOUNGE: "LOUNGE",
  TOILET: "TOILET",
  WC: "TOILET",
};

function roomKey(value: string | null | undefined): string {
  const key = compactKey(value);
  return roomAliases[key] ?? key;
}

function targetWidthMm(row: ManualOpening): number {
  return Math.round(row.width_m * 1000);
}

function targetHeightMm(row: ManualOpening): number {
  return Math.round(row.height_m * 1000);
}

function openingAreaM2(row: ManualOpening): number {
  return row.qty * row.width_m * row.height_m;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortedByWidthDelta<T extends { widthMm?: number | null }>(
  candidates: readonly T[],
  widthMm: number,
): T[] {
  return [...candidates].sort(
    (a, b) => Math.abs((a.widthMm ?? 0) - widthMm) - Math.abs((b.widthMm ?? 0) - widthMm),
  );
}

function isGarageDoorRow(row: ManualOpening): boolean {
  return (
    roomKey(row.room) === "GARAGE" && targetWidthMm(row) >= 4200 && targetHeightMm(row) >= 1800
  );
}

function compatibleElevationCandidate(
  row: ManualOpening,
  candidate: ElevationVectorOpening,
): boolean {
  if (isGarageDoorRow(row)) return candidate.type === "garage_door";
  return candidate.type !== "garage_door";
}

function garageDoorFloorWitnessFor(row: ManualOpening, planText: PlanText): FloorEvidence | null {
  if (!isGarageDoorRow(row)) return null;
  const wantedWidthMm = targetWidthMm(row);
  const [witness] = sortedByWidthDelta(
    (planText.garageDoorWitnesses ?? []).filter(
      (candidate) => roomKey(candidate.room) === "GARAGE" && candidate.planSide != null,
    ),
    wantedWidthMm,
  ).filter((candidate) => Math.abs(candidate.widthMm - wantedWidthMm) <= FLOOR_WIDTH_TOLERANCE_MM);
  if (!witness) return null;
  return {
    status: "garage_door_witness_confirmed",
    witness,
    widthDeltaMm: Math.abs(witness.widthMm - wantedWidthMm),
    note: `physical garage-door marker plus standalone floor-plan width ${witness.widthMm}mm on ${witness.planSide}`,
  };
}

function physicalOpeningFloorWitnessFor(
  row: ManualOpening,
  witnesses: readonly PlanPhysicalOpeningWidthWitness[],
): FloorEvidence | null {
  if (isGarageDoorRow(row)) return null;
  const wantedWidthMm = targetWidthMm(row);
  const [witness] = sortedByWidthDelta(
    witnesses.filter((candidate) => roomKey(candidate.room) === roomKey(row.room)),
    wantedWidthMm,
  ).filter((candidate) => Math.abs(candidate.widthMm - wantedWidthMm) <= FLOOR_WIDTH_TOLERANCE_MM);
  if (!witness) return null;
  return {
    status: "physical_opening_width_confirmed",
    witness,
    widthDeltaMm: Math.abs(witness.widthMm - wantedWidthMm),
    note: witness.note,
  };
}

function printedWindowCodeFloorWitnessFor(
  row: ManualOpening,
  witnesses: readonly PlanPrintedWindowCodeWitness[],
): FloorEvidence | null {
  if (isGarageDoorRow(row)) return null;
  const wantedWidthMm = targetWidthMm(row);
  const wantedHeightMm = targetHeightMm(row);
  const matches = witnesses
    .filter(
      (candidate) =>
        roomKey(candidate.room) === roomKey(row.room) &&
        Math.abs(candidate.widthMm - wantedWidthMm) <= PRINTED_CODE_WIDTH_TOLERANCE_MM &&
        Math.abs(candidate.heightMm - wantedHeightMm) <= PRINTED_CODE_HEIGHT_TOLERANCE_MM,
    )
    .sort(
      (a, b) =>
        Math.abs(a.widthMm - wantedWidthMm) +
        Math.abs(a.heightMm - wantedHeightMm) -
        (Math.abs(b.widthMm - wantedWidthMm) + Math.abs(b.heightMm - wantedHeightMm)),
    );
  if (matches.length < Math.max(1, row.qty)) return null;
  const selected = matches.slice(0, Math.max(1, row.qty));
  const sides = new Set(selected.map((candidate) => candidate.planSide));
  const planSide = sides.size === 1 ? selected[0].planSide : null;
  const widthDeltaMm = Math.max(
    ...selected.map((candidate) => Math.abs(candidate.widthMm - wantedWidthMm)),
  );
  const heightDeltaMm = Math.max(
    ...selected.map((candidate) => Math.abs(candidate.heightMm - wantedHeightMm)),
  );
  return {
    status: "printed_window_code_confirmed",
    witnesses: selected,
    planSide,
    widthDeltaMm,
    heightDeltaMm,
    note:
      `${selected.length} printed floor-plan opening code(s) match ${row.room}` +
      ` ${wantedHeightMm}x${wantedWidthMm}`,
  };
}

function floorEvidenceFor(
  row: ManualOpening,
  planText: PlanText,
  physicalOpeningWitnesses: readonly PlanPhysicalOpeningWidthWitness[],
  printedWindowCodeWitnesses: readonly PlanPrintedWindowCodeWitness[],
): FloorEvidence {
  const wantedWidthMm = targetWidthMm(row);
  const garageDoorWitness = garageDoorFloorWitnessFor(row, planText);
  if (garageDoorWitness) return garageDoorWitness;
  const physicalOpeningWitness = physicalOpeningFloorWitnessFor(row, physicalOpeningWitnesses);
  if (physicalOpeningWitness) return physicalOpeningWitness;
  const printedWindowCodeWitness = printedWindowCodeFloorWitnessFor(
    row,
    printedWindowCodeWitnesses,
  );
  if (printedWindowCodeWitness) return printedWindowCodeWitness;

  const [nearestSameRoomPhysical] = sortedByWidthDelta(
    physicalOpeningWitnesses.filter((candidate) => roomKey(candidate.room) === roomKey(row.room)),
    wantedWidthMm,
  );
  if (nearestSameRoomPhysical) {
    return {
      status: "same_room_physical_width_mismatch",
      witness: nearestSameRoomPhysical,
      widthDeltaMm: Math.abs(nearestSameRoomPhysical.widthMm - wantedWidthMm),
      note: "room has physical opening evidence, but the width does not match the signed row",
    };
  }

  const [nearestSameRoomPrintedCode] = printedWindowCodeWitnesses
    .filter((candidate) => roomKey(candidate.room) === roomKey(row.room))
    .sort(
      (a, b) =>
        Math.abs(a.widthMm - wantedWidthMm) +
        Math.abs(a.heightMm - targetHeightMm(row)) -
        (Math.abs(b.widthMm - wantedWidthMm) + Math.abs(b.heightMm - targetHeightMm(row))),
    );
  if (nearestSameRoomPrintedCode) {
    return {
      status: "same_room_printed_code_mismatch",
      witness: nearestSameRoomPrintedCode,
      widthDeltaMm: Math.abs(nearestSameRoomPrintedCode.widthMm - wantedWidthMm),
      heightDeltaMm: Math.abs(nearestSameRoomPrintedCode.heightMm - targetHeightMm(row)),
      note: "room has printed HxW code evidence, but it does not match the signed row",
    };
  }

  const sameRoom = exteriorCandidates.filter(
    (candidate) => roomKey(candidate.room) === roomKey(row.room),
  );
  const widthMatches = sortedByWidthDelta(sameRoom, wantedWidthMm).filter(
    (candidate) => Math.abs(candidate.widthMm - wantedWidthMm) <= FLOOR_WIDTH_TOLERANCE_MM,
  );
  const [confirmed] = widthMatches;
  if (confirmed) {
    return {
      status: "confirmed",
      candidate: confirmed,
      widthDeltaMm: Math.abs(confirmed.widthMm - wantedWidthMm),
      note: "same-room exterior floor-plan width matches signed row",
    };
  }

  const [nearestSameRoom] = sortedByWidthDelta(sameRoom, wantedWidthMm);
  if (nearestSameRoom) {
    return {
      status: "same_room_width_mismatch",
      candidate: nearestSameRoom,
      widthDeltaMm: Math.abs(nearestSameRoom.widthMm - wantedWidthMm),
      note: "room has an exterior gap, but the width does not match the signed row",
    };
  }

  return {
    status: "missing",
    note: "no same-room exterior floor-plan width found",
  };
}

function dimensionScore(row: ManualOpening, candidate: ElevationVectorOpening): number {
  const wantedWidthMm = targetWidthMm(row);
  const wantedHeightMm = targetHeightMm(row);
  return (
    Math.abs((candidate.widthMm ?? 0) - wantedWidthMm) +
    Math.abs((candidate.heightMm ?? 0) - wantedHeightMm)
  );
}

function dimensionMatches(
  row: ManualOpening,
  candidate: ElevationVectorOpening,
  toleranceMm: number,
): boolean {
  return (
    candidate.widthMm != null &&
    candidate.heightMm != null &&
    Math.abs(candidate.widthMm - targetWidthMm(row)) <= toleranceMm &&
    Math.abs(candidate.heightMm - targetHeightMm(row)) <= toleranceMm
  );
}

function sortedDimensionMatches(
  row: ManualOpening,
  candidates: readonly ElevationVectorOpening[],
  toleranceMm: number,
): ElevationVectorOpening[] {
  return candidates
    .filter(
      (candidate) =>
        compatibleElevationCandidate(row, candidate) &&
        dimensionMatches(row, candidate, toleranceMm),
    )
    .sort((a, b) => dimensionScore(row, a) - dimensionScore(row, b));
}

function buildElevationEvidence(
  rows: readonly ManualOpening[],
  elevationOpenings: readonly ElevationVectorOpening[],
): ElevationEvidence[] {
  const indexedOpenings = elevationOpenings.map((candidate, index) => ({ candidate, index }));
  const possibleAssignments: Array<{
    rowIndex: number;
    slotIndex: number;
    opening: IndexedElevationOpening;
    score: number;
  }> = [];

  rows.forEach((row, rowIndex) => {
    for (let slotIndex = 0; slotIndex < Math.max(1, row.qty); slotIndex += 1) {
      for (const opening of indexedOpenings) {
        if (
          compatibleElevationCandidate(row, opening.candidate) &&
          dimensionMatches(row, opening.candidate, STRICT_ELEVATION_DIMENSION_TOLERANCE_MM)
        ) {
          possibleAssignments.push({
            rowIndex,
            slotIndex,
            opening,
            score: dimensionScore(row, opening.candidate),
          });
        }
      }
    }
  });

  possibleAssignments.sort(
    (a, b) => a.score - b.score || a.rowIndex - b.rowIndex || a.opening.index - b.opening.index,
  );

  const claimedSlots = new Set<string>();
  const claimedOpenings = new Set<number>();
  const assignments = new Map<number, ElevationVectorOpening[]>();
  for (const assignment of possibleAssignments) {
    const slotKey = `${assignment.rowIndex}:${assignment.slotIndex}`;
    if (claimedSlots.has(slotKey) || claimedOpenings.has(assignment.opening.index)) continue;
    claimedSlots.add(slotKey);
    claimedOpenings.add(assignment.opening.index);
    assignments.set(assignment.rowIndex, [
      ...(assignments.get(assignment.rowIndex) ?? []),
      assignment.opening.candidate,
    ]);
  }

  return rows.map((row, rowIndex) => {
    const strictMatches = assignments.get(rowIndex) ?? [];
    const softMatches = sortedDimensionMatches(
      row,
      elevationOpenings,
      SOFT_ELEVATION_DIMENSION_TOLERANCE_MM,
    );
    if (strictMatches.length >= Math.max(1, row.qty)) {
      return {
        status: "exclusive_dimension",
        strictMatches,
        softMatches,
        note: "exclusive tighter dimension match exists, but elevation face is still only a band id",
      };
    }
    if (strictMatches.length > 0) {
      return {
        status: "partial_exclusive_dimension",
        strictMatches,
        softMatches,
        note: `only ${strictMatches.length}/${row.qty} exclusive tighter elevation candidates found`,
      };
    }
    if (softMatches.length > 0) {
      return {
        status: "soft_dimension_only",
        strictMatches,
        softMatches,
        note: "soft dimension hint only - loose, duplicate, or non-exclusive",
      };
    }
    return {
      status: "missing",
      strictMatches,
      softMatches,
      note: "no vector elevation candidate matches signed width and height",
    };
  });
}

function floorText(evidence: FloorEvidence): string {
  if (evidence.status === "missing") return "N";
  if (evidence.status === "garage_door_witness_confirmed") {
    return `garage ${evidence.witness.widthMm}mm`;
  }
  if (evidence.status === "physical_opening_width_confirmed") {
    return `physical ${evidence.witness.widthMm}mm`;
  }
  if (evidence.status === "printed_window_code_confirmed") {
    return `code ${evidence.witnesses[0]?.widthMm ?? "?"}mm`;
  }
  if (evidence.status === "same_room_physical_width_mismatch") {
    return `room ${evidence.witness.widthMm}mm`;
  }
  if (evidence.status === "same_room_printed_code_mismatch") {
    return `room ${evidence.witness.widthMm}mm`;
  }
  const prefix = evidence.status === "confirmed" ? "Y" : "room";
  return `${prefix} ${evidence.candidate.widthMm}mm`;
}

function floorFaceText(evidence: FloorEvidence): string {
  if (evidence.status === "missing") return "-";
  if (evidence.status === "garage_door_witness_confirmed") return evidence.witness.planSide ?? "?";
  if (evidence.status === "physical_opening_width_confirmed") return evidence.witness.planSide;
  if (evidence.status === "printed_window_code_confirmed") return evidence.planSide ?? "mixed";
  if (evidence.status === "same_room_physical_width_mismatch") return evidence.witness.planSide;
  if (evidence.status === "same_room_printed_code_mismatch") return evidence.witness.planSide;
  return evidence.candidate.exteriorFace ?? "?";
}

function elevationText(evidence: ElevationEvidence): string {
  const [first] = evidence.strictMatches.length > 0 ? evidence.strictMatches : evidence.softMatches;
  if (!first) return "N";
  const prefix =
    evidence.status === "exclusive_dimension"
      ? "dim"
      : evidence.status === "partial_exclusive_dimension"
        ? "partial"
        : "soft";
  return `${prefix} ${first.widthMm}x${first.heightMm}`;
}

function hasCompassFace(candidate: ElevationVectorOpening): boolean {
  return ["north", "south", "east", "west"].includes(String(candidate.face).toLowerCase());
}

function anchoredFloorSideFor(
  candidate: ElevationVectorOpening,
  faceMap: OpeningFaceMap,
): string | null {
  return faceMap.byElevationFace.get(candidate.face)?.planSide ?? null;
}

function strictElevationFaces(elevation: ElevationEvidence): string[] {
  return [...new Set(elevation.strictMatches.map((candidate) => candidate.face))].sort();
}

function strictElevationMappedSides(
  elevation: ElevationEvidence,
  faceMap: OpeningFaceMap,
): string[] {
  return [
    ...new Set(
      elevation.strictMatches
        .map((candidate) => anchoredFloorSideFor(candidate, faceMap))
        .filter((side): side is string => side != null),
    ),
  ].sort();
}

function floorPlanSideFor(floor: FloorEvidence): string | null {
  if (floor.status === "garage_door_witness_confirmed") return floor.witness.planSide;
  if (floor.status === "physical_opening_width_confirmed") return floor.witness.planSide;
  if (floor.status === "printed_window_code_confirmed") return floor.planSide;
  return null;
}

function floorWidthMmFor(floor: FloorEvidence): number | null {
  if (floor.status === "garage_door_witness_confirmed") return floor.witness.widthMm;
  if (floor.status === "physical_opening_width_confirmed") return floor.witness.widthMm;
  if (floor.status === "printed_window_code_confirmed") return floor.witnesses[0]?.widthMm ?? null;
  if (floor.status === "confirmed") return floor.candidate.widthMm;
  return null;
}

function hasPhysicalGarageDoorObjectEvidence(
  row: ManualOpening,
  floor: FloorEvidence,
  elevation: ElevationEvidence,
): boolean {
  return (
    isGarageDoorRow(row) &&
    floor.status === "garage_door_witness_confirmed" &&
    floor.witness.planSide != null &&
    elevation.status === "exclusive_dimension" &&
    elevation.strictMatches.length >= Math.max(1, row.qty) &&
    elevation.strictMatches.every(
      (candidate) =>
        candidate.type === "garage_door" &&
        candidate.source === "sectional_garage_door" &&
        Math.abs((candidate.widthMm ?? 0) - floor.witness.widthMm) <= FLOOR_WIDTH_TOLERANCE_MM,
    )
  );
}

function garageDoorFaceAnchorFor(
  row: ManualOpening,
  floor: FloorEvidence,
  elevation: ElevationEvidence,
  faceMap: OpeningFaceMap,
): GarageDoorFaceAnchor | null {
  const anchor = faceMap.garageDoorAnchor;
  if (
    !anchor ||
    !isGarageDoorRow(row) ||
    floor.status !== "garage_door_witness_confirmed" ||
    elevation.status !== "exclusive_dimension"
  ) {
    return null;
  }
  const [strictMatch] = elevation.strictMatches;
  if (!strictMatch) return null;
  if (floor.witness !== anchor.witness) return null;
  if (strictMatch !== anchor.elevationOpening) return null;
  return anchor;
}

function productionFaceAnchorFor(
  row: ManualOpening,
  floor: FloorEvidence,
  elevation: ElevationEvidence,
  faceMap: OpeningFaceMap,
): OpeningFaceAnchor | null {
  const garageAnchor = garageDoorFaceAnchorFor(row, floor, elevation, faceMap);
  if (garageAnchor) return garageAnchor;
  if (isGarageDoorRow(row)) return null;
  if (
    floor.status !== "physical_opening_width_confirmed" &&
    floor.status !== "printed_window_code_confirmed"
  ) {
    return null;
  }
  if (elevation.status !== "exclusive_dimension") return null;
  if (elevation.strictMatches.length < Math.max(1, row.qty)) return null;

  const floorSide = floorPlanSideFor(floor);
  if (!floorSide) return null;
  const sameFace = elevation.strictMatches.every(
    (candidate) => anchoredFloorSideFor(candidate, faceMap) === floorSide,
  );
  if (!sameFace) return null;

  return faceMap.byPlanSide.get(floorSide as PlanSide) ?? null;
}

function recoveredPriceableMeasurementFor(
  row: ManualOpening,
  floor: FloorEvidence,
  elevation: ElevationEvidence,
  faceAnchor: OpeningFaceAnchor | null,
): RecoveredPriceableMeasurement | null {
  if (!faceAnchor) return null;
  const widthMm = floorWidthMmFor(floor);
  const [elevationMatch] = elevation.strictMatches;
  const heightMm =
    faceAnchor.kind === "unique_garage_door"
      ? faceAnchor.elevationOpening.heightMm
      : elevationMatch?.heightMm;
  if (widthMm == null || heightMm == null) return null;
  const areaM2 = round2(row.qty * (widthMm / 1000) * (heightMm / 1000));
  const signedAreaM2 = round2(openingAreaM2(row));
  return {
    widthMm,
    heightMm,
    areaM2,
    signedAreaM2,
    areaDeltaM2: round2(areaM2 - signedAreaM2),
    source: "floor width witness x same-face elevation height",
  };
}

function longFaceBandsForDiagnostic(
  faceBands: readonly ElevationFaceBand[],
  faceMap: OpeningFaceMap,
): ElevationFaceBand[] {
  const known = new Set([...faceMap.byElevationFace.keys()]);
  const knownWidths = [...faceMap.byElevationFace.values()]
    .map((anchor) => faceBands.find((band) => band.id === anchor.elevationFaceBandId)?.widthMm)
    .filter((width): width is number => width != null);
  const shortFaceWidthMm = Math.max(...knownWidths, 1);
  const candidates = faceBands.filter(
    (band) => !known.has(band.id) && band.widthMm >= shortFaceWidthMm * 1.5,
  );
  const widest = Math.max(...candidates.map((band) => band.widthMm), 0);
  return candidates.filter((band) => band.widthMm >= widest * 0.9);
}

function longFaceFloorWitnesses(
  printedWindowCodeWitnesses: readonly PlanPrintedWindowCodeWitness[],
  physicalOpeningWitnesses: readonly PlanPhysicalOpeningWidthWitness[],
): LongFaceSignatureWitness[] {
  return [
    ...printedWindowCodeWitnesses.map(
      (witness): LongFaceSignatureWitness => ({
        source: "printed_code",
        room: witness.room,
        planSide: witness.planSide,
        widthMm: witness.widthMm,
        heightMm: witness.heightMm,
        x: witness.x,
        y: witness.y,
      }),
    ),
    ...physicalOpeningWitnesses
      .filter((witness) => witness.widthMm >= 2200)
      .map(
        (witness): LongFaceSignatureWitness => ({
          source: "physical_width",
          room: witness.room,
          planSide: witness.planSide,
          widthMm: witness.widthMm,
          heightMm: LONG_FACE_DIAGNOSTIC_PHYSICAL_HEIGHT_MM,
          x: witness.x,
          y: witness.y,
        }),
      ),
  ];
}

function matchLongFaceWitness(
  witness: LongFaceSignatureWitness,
  face: string,
  elevationOpenings: readonly ElevationVectorOpening[],
): {
  opening: ElevationVectorOpening & { widthMm: number; heightMm: number };
  widthDeltaMm: number;
  heightDeltaMm: number | null;
} | null {
  const matches = elevationOpenings
    .filter(
      (opening): opening is ElevationVectorOpening & { widthMm: number; heightMm: number } => {
        if (
          opening.face !== face ||
          opening.type === "garage_door" ||
          opening.widthMm == null ||
          opening.heightMm == null
        ) {
          return false;
        }
        if (Math.abs(opening.widthMm - witness.widthMm) > LONG_FACE_SIGNATURE_WIDTH_TOLERANCE_MM) {
          return false;
        }
        if (
          witness.heightMm != null &&
          Math.abs(opening.heightMm - witness.heightMm) > LONG_FACE_SIGNATURE_HEIGHT_TOLERANCE_MM
        ) {
          return false;
        }
        return true;
      },
    )
    .sort((a, b) => {
      const aHeightDelta = witness.heightMm == null ? 0 : Math.abs(a.heightMm - witness.heightMm);
      const bHeightDelta = witness.heightMm == null ? 0 : Math.abs(b.heightMm - witness.heightMm);
      return (
        Math.abs(a.widthMm - witness.widthMm) +
        aHeightDelta -
        (Math.abs(b.widthMm - witness.widthMm) + bHeightDelta)
      );
    });
  const [opening] = matches;
  if (!opening) return null;
  return {
    opening,
    widthDeltaMm: Math.abs(opening.widthMm - witness.widthMm),
    heightDeltaMm: witness.heightMm == null ? null : Math.abs(opening.heightMm - witness.heightMm),
  };
}

function buildLongFaceSignatureDiagnostics(args: {
  faceBands: readonly ElevationFaceBand[];
  faceMap: OpeningFaceMap;
  elevationOpenings: readonly ElevationVectorOpening[];
  printedWindowCodeWitnesses: readonly PlanPrintedWindowCodeWitness[];
  physicalOpeningWitnesses: readonly PlanPhysicalOpeningWidthWitness[];
}): LongFaceSignatureDiagnostic[] {
  const longBands = longFaceBandsForDiagnostic(args.faceBands, args.faceMap);
  const witnesses = longFaceFloorWitnesses(
    args.printedWindowCodeWitnesses,
    args.physicalOpeningWitnesses,
  );
  const out: LongFaceSignatureDiagnostic[] = [];
  for (const planSide of ["plan_top", "plan_bottom"] as const) {
    const sideWitnesses = witnesses
      .filter((witness) => witness.planSide === planSide)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (sideWitnesses.length === 0) continue;
    for (const band of longBands) {
      const matches: LongFaceSignatureDiagnostic["matches"] = [];
      const missing: string[] = [];
      for (const witness of sideWitnesses) {
        const match = matchLongFaceWitness(witness, band.id, args.elevationOpenings);
        if (!match) {
          missing.push(
            `${witness.room} ${witness.widthMm}x${witness.heightMm ?? "?"} ${witness.source}`,
          );
          continue;
        }
        matches.push({
          room: witness.room,
          source: witness.source,
          floor: `${witness.widthMm}x${witness.heightMm ?? "?"}`,
          elevation: `${match.opening.widthMm}x${match.opening.heightMm}`,
          widthDeltaMm: match.widthDeltaMm,
          heightDeltaMm: match.heightDeltaMm,
        });
      }
      out.push({
        planSide,
        elevationFace: band.id,
        matched: matches.length,
        total: sideWitnesses.length,
        missing,
        matches,
        note:
          "diagnostic only - this does not map a production face because ordered full-signature " +
          "and exterior-side proof are not yet enforced",
      });
    }
  }
  return out.sort(
    (a, b) =>
      b.matched - a.matched ||
      a.total - b.total ||
      a.planSide.localeCompare(b.planSide) ||
      a.elevationFace.localeCompare(b.elevationFace),
  );
}

function whyNot(
  floor: FloorEvidence,
  elevation: ElevationEvidence,
  hasPhysicalObjectEvidence: boolean,
  faceAnchor: OpeningFaceAnchor | null,
  productionPriceable: boolean,
  faceMap: OpeningFaceMap,
): string {
  if (productionPriceable) {
    return faceAnchor ? `priceable from ${faceAnchor.note}` : "priceable";
  }
  if (hasPhysicalObjectEvidence) {
    return "floor garage-door marker and sectional elevation object agree, but elevation face is still an unmapped band";
  }
  if (floor.status === "missing") return floor.note;
  if (
    floor.status === "same_room_width_mismatch" ||
    floor.status === "same_room_physical_width_mismatch" ||
    floor.status === "same_room_printed_code_mismatch"
  ) {
    return `${floor.note} (delta ${floor.widthDeltaMm}mm)`;
  }
  if (elevation.status === "missing") return elevation.note;
  if (elevation.status !== "exclusive_dimension") return elevation.note;
  const floorSide = floorPlanSideFor(floor);
  if (!floorSide) {
    return `${floor.note}, but it does not identify one floor-plan side`;
  }
  const faces = strictElevationFaces(elevation).join(", ");
  const mappedSides = strictElevationMappedSides(elevation, faceMap);
  if (mappedSides.length === 0) {
    return `strict elevation face ${faces} is not mapped to floor side ${floorSide}`;
  }
  const wrongSides = mappedSides.filter((side) => side !== floorSide);
  if (wrongSides.length > 0) {
    return `strict elevation face ${faces} maps to ${wrongSides.join(", ")} not floor side ${floorSide}`;
  }
  return `strict elevation face ${faces} is mapped, but not by a production anchor for this row`;
}

async function extractElevationVectorEvidenceFromPdf(pdfPath: string): Promise<{
  elevationOpenings: ElevationVectorOpening[];
  faceBands: ElevationFaceBand[];
}> {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(1);
    const geom = await extractPageGeometry(page as never);
    return {
      elevationOpenings: detectElevationVectorOpenings(geom.segments),
      faceBands: detectElevationFaceBands(geom.segments),
    };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

async function extractFloorPlanEvidenceFromPdf(pdfPath: string): Promise<{
  planText: PlanText;
  physicalOpeningWitnesses: PlanPhysicalOpeningWidthWitness[];
  printedWindowCodeWitnesses: PlanPrintedWindowCodeWitness[];
}> {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(1);
    const geom = await extractPageGeometry(page as never);
    const planText = parsePlanText(geom.labels);
    return {
      planText,
      physicalOpeningWitnesses: detectPhysicalOpeningWidthWitnesses({
        planText,
        segments: geom.segments,
        labels: geom.labels,
        scale: 100,
      }),
      printedWindowCodeWitnesses: detectPrintedWindowCodeWitnesses(planText),
    };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

async function main() {
  const floorPlanPath = resolve("tests/doors/plans/fenner-floorplan.pdf");
  const elevationPath = resolve("tests/doors/plans/fenner-elevations.pdf");
  const { planText, physicalOpeningWitnesses, printedWindowCodeWitnesses } =
    await extractFloorPlanEvidenceFromPdf(floorPlanPath);
  const { elevationOpenings, faceBands } =
    await extractElevationVectorEvidenceFromPdf(elevationPath);
  const faceMap = buildOpeningFaceMap({
    planText,
    elevationOpenings,
    faceBands,
    physicalOpeningWitnesses,
  });
  const longFaceSignatureDiagnostics = buildLongFaceSignatureDiagnostics({
    faceBands,
    faceMap,
    elevationOpenings,
    printedWindowCodeWitnesses,
    physicalOpeningWitnesses,
  });
  const rows = truth.manual_openings;
  const elevationEvidence = buildElevationEvidence(rows, elevationOpenings);

  let floorConfirmedRows = 0;
  let garageDoorFloorWitnessRows = 0;
  let physicalOpeningFloorWitnessRows = 0;
  let printedWindowCodeFloorWitnessRows = 0;
  let sameRoomWidthMismatchRows = 0;
  let softElevationDimensionRows = 0;
  let exclusiveElevationDimensionRows = 0;
  let partialExclusiveElevationDimensionRows = 0;
  let faceAwareElevationDimensionRows = 0;
  let bothWidthAndExclusiveElevationRows = 0;
  let bothWidthAndFaceAwareElevationRows = 0;
  let physicalObjectEvidenceRows = 0;
  let uniqueGarageFaceAnchorRows = 0;
  let oppositeFaceSignatureAnchorRows = 0;
  let longFaceSignatureAnchorRows = 0;
  let productionPriceableRows = 0;
  let productionPriceableArea = 0;

  const auditedRows = rows.map((row, rowIndex) => {
    const floor = floorEvidenceFor(
      row,
      planText,
      physicalOpeningWitnesses,
      printedWindowCodeWitnesses,
    );
    const elevation = elevationEvidence[rowIndex];
    const hasFloorWidth =
      floor.status === "confirmed" ||
      floor.status === "garage_door_witness_confirmed" ||
      floor.status === "physical_opening_width_confirmed" ||
      floor.status === "printed_window_code_confirmed";
    const hasSoftElevationDimension = elevation.softMatches.length >= Math.max(1, row.qty);
    const hasExclusiveElevationDimension = elevation.status === "exclusive_dimension";
    const hasFaceAwareElevationDimension =
      hasExclusiveElevationDimension &&
      elevation.strictMatches.every(
        (candidate) =>
          hasCompassFace(candidate) || anchoredFloorSideFor(candidate, faceMap) != null,
      );
    const hasPhysicalObjectEvidence = hasPhysicalGarageDoorObjectEvidence(row, floor, elevation);
    const faceAnchor = productionFaceAnchorFor(row, floor, elevation, faceMap);
    const productionPriceable = faceAnchor != null;
    const recoveredPriceableMeasurement = recoveredPriceableMeasurementFor(
      row,
      floor,
      elevation,
      faceAnchor,
    );

    if (hasFloorWidth) floorConfirmedRows += 1;
    if (floor.status === "garage_door_witness_confirmed") garageDoorFloorWitnessRows += 1;
    if (floor.status === "physical_opening_width_confirmed") physicalOpeningFloorWitnessRows += 1;
    if (floor.status === "printed_window_code_confirmed") printedWindowCodeFloorWitnessRows += 1;
    if (
      floor.status === "same_room_width_mismatch" ||
      floor.status === "same_room_physical_width_mismatch" ||
      floor.status === "same_room_printed_code_mismatch"
    ) {
      sameRoomWidthMismatchRows += 1;
    }
    if (hasSoftElevationDimension) softElevationDimensionRows += 1;
    if (hasExclusiveElevationDimension) exclusiveElevationDimensionRows += 1;
    if (hasFaceAwareElevationDimension) faceAwareElevationDimensionRows += 1;
    if (elevation.status === "partial_exclusive_dimension") {
      partialExclusiveElevationDimensionRows += 1;
    }
    if (hasFloorWidth && hasExclusiveElevationDimension) bothWidthAndExclusiveElevationRows += 1;
    if (hasFloorWidth && hasFaceAwareElevationDimension) bothWidthAndFaceAwareElevationRows += 1;
    if (hasPhysicalObjectEvidence) physicalObjectEvidenceRows += 1;
    if (faceAnchor?.kind === "unique_garage_door") uniqueGarageFaceAnchorRows += 1;
    if (faceAnchor?.kind === "opposite_layout_signature") oppositeFaceSignatureAnchorRows += 1;
    if (faceAnchor?.kind === "long_face_signature") longFaceSignatureAnchorRows += 1;
    if (productionPriceable) {
      productionPriceableRows += 1;
      productionPriceableArea += recoveredPriceableMeasurement?.areaM2 ?? 0;
    }

    return {
      room: row.room,
      qty: row.qty,
      manual: {
        widthMm: targetWidthMm(row),
        heightMm: targetHeightMm(row),
        areaM2: Math.round(openingAreaM2(row) * 100) / 100,
      },
      floor,
      elevation,
      faceAnchor,
      recoveredPriceableMeasurement,
      productionPriceable,
      whyNot: whyNot(
        floor,
        elevation,
        hasPhysicalObjectEvidence,
        faceAnchor,
        productionPriceable,
        faceMap,
      ),
    };
  });

  const signedTotal =
    truth.derived?.total_opening_sqm ?? rows.reduce((sum, row) => sum + openingAreaM2(row), 0);
  const summary = {
    signedRows: rows.length,
    signedTotalOpeningM2: signedTotal,
    exteriorWidthCandidates: exteriorCandidates.length,
    rejectedGapCandidates: rejected.length,
    elevationVectorCandidates: elevationOpenings.length,
    floorConfirmedRows,
    garageDoorFloorWitnessRows,
    physicalOpeningFloorWitnessRows,
    printedWindowCodeFloorWitnessRows,
    sameRoomWidthMismatchRows,
    softElevationDimensionRows,
    exclusiveElevationDimensionRows,
    partialExclusiveElevationDimensionRows,
    faceAwareElevationDimensionRows,
    bothWidthAndExclusiveElevationRows,
    bothWidthAndFaceAwareElevationRows,
    physicalObjectEvidenceRows,
    uniqueGarageFaceAnchorRows,
    oppositeFaceSignatureAnchorRows,
    longFaceSignatureAnchorRows,
    productionPriceableRows,
    productionPriceableArea: Math.round(productionPriceableArea * 100) / 100,
    shortfallToSignedM2: Math.round((signedTotal - productionPriceableArea) * 100) / 100,
    longFaceSignatureDiagnostics: longFaceSignatureDiagnostics.slice(0, 6),
  };

  console.log("FENNER OPENING LEDGER - signed rows vs current deterministic evidence\n");
  console.log(
    [
      "ROOM".padEnd(16),
      "QTY".padEnd(4),
      "MANUAL WxH".padEnd(12),
      "FLOOR".padEnd(12),
      "FLOOR SIDE".padEnd(10),
      "ELEVATION".padEnd(20),
      "RECOVERED".padEnd(14),
      "AREA DELTA".padEnd(11),
      "PRICE?".padEnd(7),
      "WHY NOT",
    ].join(" "),
  );
  console.log("-".repeat(122));

  for (const audited of auditedRows) {
    console.log(
      [
        audited.room.padEnd(16),
        String(audited.qty).padEnd(4),
        `${audited.manual.widthMm}x${audited.manual.heightMm}`.padEnd(12),
        floorText(audited.floor).padEnd(12),
        floorFaceText(audited.floor).padEnd(10),
        elevationText(audited.elevation).padEnd(20),
        (audited.recoveredPriceableMeasurement
          ? `${audited.recoveredPriceableMeasurement.widthMm}x${audited.recoveredPriceableMeasurement.heightMm}`
          : "-"
        ).padEnd(14),
        (audited.recoveredPriceableMeasurement
          ? `${audited.recoveredPriceableMeasurement.areaDeltaM2 >= 0 ? "+" : ""}${audited.recoveredPriceableMeasurement.areaDeltaM2.toFixed(2)}m2`
          : "-"
        ).padEnd(11),
        (audited.productionPriceable ? "YES" : "no").padEnd(7),
        audited.whyNot,
      ].join(" "),
    );
  }

  console.log("-".repeat(122));
  console.log("\nSUMMARY");
  console.log(`  signed opening rows:                  ${summary.signedRows}`);
  console.log(`  exterior floor-plan width candidates: ${summary.exteriorWidthCandidates}`);
  console.log(`  rejected floor-plan gap candidates:   ${summary.rejectedGapCandidates}`);
  console.log(`  vector elevation candidates:          ${summary.elevationVectorCandidates}`);
  console.log(
    `  rows with confirmed floor width:      ${summary.floorConfirmedRows} / ${summary.signedRows}`,
  );
  console.log(
    `    garage marker floor rows:           ${summary.garageDoorFloorWitnessRows} / ${summary.signedRows}`,
  );
  console.log(
    `    physical opening floor rows:        ${summary.physicalOpeningFloorWitnessRows} / ${summary.signedRows}`,
  );
  console.log(
    `    printed HxW code floor rows:        ${summary.printedWindowCodeFloorWitnessRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with same-room wrong-width gap:  ${summary.sameRoomWidthMismatchRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with soft elevation hint:        ${summary.softElevationDimensionRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with exclusive dimension hint:   ${summary.exclusiveElevationDimensionRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with partial exclusive dims:     ${summary.partialExclusiveElevationDimensionRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with mapped elevation dims:      ${summary.faceAwareElevationDimensionRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with floor + dimension hint:     ${summary.bothWidthAndExclusiveElevationRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with floor + mapped dims:        ${summary.bothWidthAndFaceAwareElevationRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with physical object evidence:   ${summary.physicalObjectEvidenceRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with unique garage face anchor:  ${summary.uniqueGarageFaceAnchorRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with opposite face signature:    ${summary.oppositeFaceSignatureAnchorRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows with long face signature:        ${summary.longFaceSignatureAnchorRows} / ${summary.signedRows}`,
  );
  console.log(
    `  rows production-priceable right now:  ${summary.productionPriceableRows} / ${summary.signedRows}`,
  );
  console.log(
    `  recovered priceable area:             ${summary.productionPriceableArea.toFixed(2)} m2 of signed ${summary.signedTotalOpeningM2} m2`,
  );
  console.log(
    `  shortfall to signed total:            ${summary.shortfallToSignedM2.toFixed(2)} m2`,
  );

  console.log("\nLONG FACE SIGNATURE DIAGNOSTIC - not used for pricing");
  for (const diagnostic of longFaceSignatureDiagnostics.slice(0, 6)) {
    const matchText =
      diagnostic.matches.length > 0
        ? diagnostic.matches
            .map((match) => `${match.room} ${match.floor}->${match.elevation}`)
            .join("; ")
        : "no matches";
    console.log(
      `  ${diagnostic.planSide} vs ${diagnostic.elevationFace}: ` +
        `${diagnostic.matched}/${diagnostic.total} matched; ${matchText}`,
    );
  }

  const outPath = resolve("output/diagnostics/fenner-opening-ledger.json");
  mkdirSync(resolve("output/diagnostics"), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({ summary, longFaceSignatureDiagnostics, rows: auditedRows }, null, 2),
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
