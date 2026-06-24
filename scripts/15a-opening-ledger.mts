// 15a opening ledger - row-level proof for the geometry-primary face anchor.
//
// This is diagnostic-only. It may compare against the signed joinery bench because
// it is a scorecard; production extraction must not use this truth file as evidence.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { extractPageGeometry } from "../src/lib/doors/pdf-adapter.ts";
import { detectFrameOpeningSlots } from "../src/lib/takeoff/elevation-opening-slots.ts";
import {
  detectElevationFaceBands,
  detectElevationVectorOpenings,
} from "../src/lib/takeoff/elevation-vector-openings.ts";
import { detectPlanSideLengthWitnesses } from "../src/lib/takeoff/floor-side-lengths.ts";
import {
  detectPhysicalOpeningWidthWitnesses,
  detectPrintedWindowCodeWitnesses,
} from "../src/lib/takeoff/floor-opening-witnesses.ts";
import { buildOpeningSignatureFloorRows } from "../src/lib/takeoff/opening-floor-signatures.ts";
import {
  buildOpeningFaceMap,
  type OrderedLengthFaceAnchor,
} from "../src/lib/takeoff/opening-face-map.ts";
import { parsePlanText } from "../src/lib/takeoff/plan-text.ts";

type TruthOpening = {
  type: string;
  room: string;
  height_m: number;
  width_m: number;
  glazed: boolean;
  cladding: string | null;
};

type GroundTruth = {
  joinery_bench: {
    openings: TruthOpening[];
    derived?: {
      total_opening_sqm?: number;
      glazed_sqm?: number;
    };
  };
};

const FLOOR_WIDTH_TOLERANCE_MM = 60;
const FLOOR_HEIGHT_TOLERANCE_MM = 100;

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
  DINING: "DINING",
  ENSUITE: "ENSUITE",
  ENAUITE: "ENSUITE",
  ENTRANCE: "ENTRY",
  ENTRY: "ENTRY",
  GARAGE: "GARAGE",
  KITCHEN: "KITCHEN",
  LOUNGE: "LOUNGE",
};

function roomKey(value: string | null | undefined): string {
  const key = compactKey(value);
  return roomAliases[key] ?? key;
}

function targetWidthMm(row: TruthOpening): number {
  return Math.round(row.width_m * 1000);
}

function targetHeightMm(row: TruthOpening): number {
  return Math.round(row.height_m * 1000);
}

function areaM2(widthMm: number, heightMm: number): number {
  return Math.round((widthMm / 1000) * (heightMm / 1000) * 100) / 100;
}

function signedAreaM2(row: TruthOpening): number {
  return areaM2(targetWidthMm(row), targetHeightMm(row));
}

function dimensionText(widthMm: number, heightMm: number): string {
  return `${widthMm}x${heightMm}`;
}

function labelDimensionText(text: string): string | null {
  const match = text
    .trim()
    .replace(/\s+/g, "")
    .match(/^(\d{3,4})x(\d{3,4})$/i);
  return match ? `${Number(match[2])}x${Number(match[1])}` : null;
}

async function extractPdfPage(pdfPath: string) {
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
    return await extractPageGeometry(page as never);
  } finally {
    await doc.destroy().catch(() => {});
  }
}

type AnchorMatch = OrderedLengthFaceAnchor["rowMatches"][number] & {
  anchor: OrderedLengthFaceAnchor;
  id: string;
};

function anchorMatches(anchors: readonly OrderedLengthFaceAnchor[]): AnchorMatch[] {
  return anchors.flatMap((anchor) =>
    anchor.rowMatches.map((match, index) => ({
      ...match,
      anchor,
      id: `${anchor.planSide}:${anchor.elevationFaceBandId}:${index}`,
    })),
  );
}

function matchSignedRow(
  row: TruthOpening,
  matches: readonly AnchorMatch[],
  used: Set<string>,
): AnchorMatch | null {
  const wantedWidthMm = targetWidthMm(row);
  const wantedHeightMm = targetHeightMm(row);
  const compatible = matches
    .filter((match) => !used.has(match.id))
    .filter((match) => roomKey(match.row.room) === roomKey(row.room))
    .filter(
      (match) =>
        Math.abs(match.row.widthMm - wantedWidthMm) <= FLOOR_WIDTH_TOLERANCE_MM &&
        Math.abs(match.row.heightMm - wantedHeightMm) <= FLOOR_HEIGHT_TOLERANCE_MM,
    )
    .sort(
      (a, b) =>
        Math.abs(a.member.widthMm - wantedWidthMm) +
        Math.abs(a.member.heightMm - wantedHeightMm) -
        (Math.abs(b.member.widthMm - wantedWidthMm) + Math.abs(b.member.heightMm - wantedHeightMm)),
    );
  return compatible.length === 1 ? compatible[0] : null;
}

function sameDimensions(row: TruthOpening, candidate: { widthMm: number; heightMm: number }) {
  return (
    Math.abs(candidate.widthMm - targetWidthMm(row)) <= FLOOR_WIDTH_TOLERANCE_MM &&
    Math.abs(candidate.heightMm - targetHeightMm(row)) <= FLOOR_HEIGHT_TOLERANCE_MM
  );
}

function nearbyDimensionLabels(
  row: TruthOpening,
  labels: readonly { text: string; x: number; y: number; vertical: boolean }[],
  floorRows: readonly { room: string; x: number; y: number }[],
) {
  const roomRows = floorRows.filter((candidate) => roomKey(candidate.room) === roomKey(row.room));
  const anchors = roomRows.length > 0 ? roomRows : floorRows;
  return labels
    .map((label) => {
      const dimension = labelDimensionText(label.text);
      if (!dimension) return null;
      const distance = Math.min(
        ...anchors.map((anchor) => Math.hypot(anchor.x - label.x, anchor.y - label.y)),
      );
      return {
        text: label.text,
        dimension,
        x: Math.round(label.x * 10) / 10,
        y: Math.round(label.y * 10) / 10,
        vertical: label.vertical,
        distance: Math.round(distance * 10) / 10,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
}

function blockedReasonDetail(args: {
  row: TruthOpening;
  sameRoomFloorRows: readonly ReturnType<typeof buildOpeningSignatureFloorRows>[number][];
  sameDimensionFloorRows: readonly ReturnType<typeof buildOpeningSignatureFloorRows>[number][];
  anchoredRows: readonly AnchorMatch[];
}): string {
  if (args.sameRoomFloorRows.length === 0) return "no floor witness routed to this signed room";
  const sameRoomDim = args.sameRoomFloorRows.filter((candidate) =>
    sameDimensions(args.row, candidate),
  );
  if (sameRoomDim.length === 0) {
    return `same-room witness exists, but dimensions are ${args.sameRoomFloorRows
      .map((candidate) => `${candidate.widthMm}x${candidate.heightMm} on ${candidate.planSide}`)
      .join(", ")}`;
  }
  const anchored = sameRoomDim.filter((candidate) =>
    args.anchoredRows.some((match) => match.row === candidate),
  );
  if (anchored.length === 0) {
    return "matching same-room floor witness exists, but its face is not mapped by ordered-length evidence";
  }
  if (args.sameDimensionFloorRows.length > 1) {
    return `matching dimensions are not unique on floor witness set: ${args.sameDimensionFloorRows
      .map((candidate) => `${candidate.room} ${candidate.widthMm}x${candidate.heightMm}`)
      .join(", ")}`;
  }
  return "blocked by non-unique or already-used anchor match";
}

async function main() {
  const floorGeom = await extractPdfPage(resolve("tests/fixtures/15a/floorplan.pdf"));
  const elevationGeom = await extractPdfPage(resolve("tests/fixtures/15a/elevations.pdf"));
  const truth = JSON.parse(
    readFileSync(resolve("tests/fixtures/15a/ground-truth.json"), "utf8"),
  ) as GroundTruth;

  const planText = parsePlanText(floorGeom.labels);
  const physicalOpeningWitnesses = detectPhysicalOpeningWidthWitnesses({
    planText,
    segments: floorGeom.segments,
    labels: floorGeom.labels,
    scale: 100,
  });
  const printedWindowCodeWitnesses = detectPrintedWindowCodeWitnesses(planText);
  const faceBands = detectElevationFaceBands(elevationGeom.segments);
  const elevationOpenings = detectElevationVectorOpenings(elevationGeom.segments);
  const openingSlots = detectFrameOpeningSlots({
    segments: elevationGeom.segments,
    faceBands,
  });
  const floorSignatureRows = buildOpeningSignatureFloorRows({
    planText,
    printedCodeWitnesses: printedWindowCodeWitnesses,
    physicalWitnesses: physicalOpeningWitnesses,
  });
  const sideLengths = detectPlanSideLengthWitnesses(floorGeom.labels);
  const faceMap = buildOpeningFaceMap({
    planText,
    elevationOpenings,
    faceBands,
    physicalOpeningWitnesses,
    openingSlots,
    floorSignatureRows,
    floorSideLengthWitnesses: sideLengths,
  });

  const matches = anchorMatches(faceMap.orderedLengthAnchors);
  const used = new Set<string>();
  let priceableRows = 0;
  let recoveredArea = 0;

  const rows = truth.joinery_bench.openings.map((row) => {
    const match = matchSignedRow(row, matches, used);
    if (match) used.add(match.id);
    const recovered = match
      ? {
          widthMm: match.row.widthMm,
          heightMm: match.member.heightMm,
          areaM2: areaM2(match.row.widthMm, match.member.heightMm),
          signedAreaM2: signedAreaM2(row),
          areaDeltaM2:
            Math.round(
              (areaM2(match.row.widthMm, match.member.heightMm) - signedAreaM2(row)) * 100,
            ) / 100,
          source: "floor opening code x ordered-length same-face elevation slot",
        }
      : null;
    if (recovered) {
      priceableRows += 1;
      recoveredArea += recovered.areaM2;
    }

    const sameRoomFloorRows = floorSignatureRows.filter(
      (candidate) => roomKey(candidate.room) === roomKey(row.room),
    );
    const sameDimensionFloorRows = floorSignatureRows.filter((candidate) =>
      sameDimensions(row, candidate),
    );
    const sameRoomAnchoredRows = matches.filter(
      (candidate) => roomKey(candidate.row.room) === roomKey(row.room),
    );
    const whyNot = recovered
      ? `priceable from ${match?.anchor.note}`
      : sameRoomFloorRows.length === 0
        ? "no same-room floor opening witness"
        : "same-room floor witness does not match signed row or is not on a mapped ordered-length face";
    const witnessAudit = {
      signedRoomKey: roomKey(row.room),
      signedDimension: dimensionText(targetWidthMm(row), targetHeightMm(row)),
      sameRoomFloorRows: sameRoomFloorRows.map((candidate) => ({
        source: candidate.source,
        room: candidate.room,
        widthMm: candidate.widthMm,
        heightMm: candidate.heightMm,
        planSide: candidate.planSide,
        x: Math.round(candidate.x * 10) / 10,
        y: Math.round(candidate.y * 10) / 10,
      })),
      sameDimensionFloorRows: sameDimensionFloorRows.map((candidate) => ({
        source: candidate.source,
        room: candidate.room,
        widthMm: candidate.widthMm,
        heightMm: candidate.heightMm,
        planSide: candidate.planSide,
        x: Math.round(candidate.x * 10) / 10,
        y: Math.round(candidate.y * 10) / 10,
      })),
      anchoredSameRoomRows: sameRoomAnchoredRows.map((candidate) => ({
        room: candidate.row.room,
        floor: dimensionText(candidate.row.widthMm, candidate.row.heightMm),
        recovered: dimensionText(candidate.member.widthMm, candidate.member.heightMm),
        planSide: candidate.anchor.planSide,
        elevationFace: candidate.anchor.elevationFace,
      })),
      nearbyDimensionLabels: nearbyDimensionLabels(row, floorGeom.labels, floorSignatureRows),
      diagnosis: recovered
        ? "priced"
        : blockedReasonDetail({
            row,
            sameRoomFloorRows,
            sameDimensionFloorRows,
            anchoredRows: matches,
          }),
    };

    return {
      room: row.room,
      type: row.type,
      manual: {
        widthMm: targetWidthMm(row),
        heightMm: targetHeightMm(row),
        areaM2: signedAreaM2(row),
      },
      floorCandidates: sameRoomFloorRows.map((candidate) => ({
        source: candidate.source,
        room: candidate.room,
        widthMm: candidate.widthMm,
        heightMm: candidate.heightMm,
        planSide: candidate.planSide,
      })),
      faceAnchor: match
        ? {
            kind: match.anchor.kind,
            planSide: match.anchor.planSide,
            elevationFace: match.anchor.elevationFace,
            orientation: match.anchor.orientation,
            lengthDeltaMm: match.anchor.lengthDeltaMm,
          }
        : null,
      recovered,
      productionPriceable: recovered != null,
      whyNot,
      witnessAudit,
    };
  });

  const summary = {
    signedRows: rows.length,
    signedTotalOpeningM2: truth.joinery_bench.derived?.total_opening_sqm ?? null,
    orderedLengthAnchors: faceMap.orderedLengthAnchors.length,
    orderedLengthAnchorSides: faceMap.orderedLengthAnchors.map((anchor) => ({
      planSide: anchor.planSide,
      elevationFace: anchor.elevationFace,
      orientation: anchor.orientation,
      rowMatches: anchor.rowMatches.length,
      lengthDeltaMm: anchor.lengthDeltaMm,
    })),
    productionPriceableRows: priceableRows,
    recoveredPriceableArea: Math.round(recoveredArea * 100) / 100,
    shortfallToSignedM2:
      truth.joinery_bench.derived?.total_opening_sqm == null
        ? null
        : Math.round((truth.joinery_bench.derived.total_opening_sqm - recoveredArea) * 100) / 100,
  };

  console.log("15A OPENING LEDGER - signed rows vs ordered-length geometry evidence\n");
  console.log(
    [
      "ROOM".padEnd(12),
      "TYPE".padEnd(15),
      "MANUAL WxH".padEnd(12),
      "FACE".padEnd(24),
      "RECOVERED".padEnd(14),
      "AREA DELTA".padEnd(11),
      "PRICE?",
      "WHY NOT",
    ].join(" "),
  );
  console.log("-".repeat(128));
  for (const row of rows) {
    console.log(
      [
        row.room.padEnd(12),
        row.type.padEnd(15),
        `${row.manual.widthMm}x${row.manual.heightMm}`.padEnd(12),
        (row.faceAnchor
          ? `${row.faceAnchor.planSide}->${row.faceAnchor.elevationFace}`
          : "-"
        ).padEnd(24),
        (row.recovered ? `${row.recovered.widthMm}x${row.recovered.heightMm}` : "-").padEnd(14),
        (row.recovered
          ? `${row.recovered.areaDeltaM2 >= 0 ? "+" : ""}${row.recovered.areaDeltaM2.toFixed(2)}m2`
          : "-"
        ).padEnd(11),
        (row.productionPriceable ? "YES" : "no").padEnd(6),
        row.whyNot,
      ].join(" "),
    );
  }
  console.log("-".repeat(128));
  console.log("\nSUMMARY");
  console.log(`  signed opening rows:                 ${summary.signedRows}`);
  console.log(`  ordered-length face anchors:         ${summary.orderedLengthAnchors}`);
  for (const anchor of summary.orderedLengthAnchorSides) {
    console.log(
      `    ${anchor.planSide} -> ${anchor.elevationFace} ${anchor.orientation}; ${anchor.rowMatches} row match(es), length delta ${anchor.lengthDeltaMm}mm`,
    );
  }
  console.log(
    `  rows production-priceable right now: ${summary.productionPriceableRows} / ${summary.signedRows}`,
  );
  console.log(
    `  recovered priceable area:            ${summary.recoveredPriceableArea.toFixed(2)} m2 of signed ${summary.signedTotalOpeningM2 ?? "?"} m2`,
  );
  console.log(`  shortfall to signed total:           ${summary.shortfallToSignedM2 ?? "?"} m2`);

  console.log("\nBLOCKED ROW WITNESS AUDIT");
  for (const row of rows.filter((candidate) => !candidate.productionPriceable)) {
    const sameRoom = row.witnessAudit.sameRoomFloorRows
      .map(
        (candidate) =>
          `${candidate.room} ${candidate.widthMm}x${candidate.heightMm} ${candidate.planSide}`,
      )
      .join("; ");
    const sameDim = row.witnessAudit.sameDimensionFloorRows
      .map(
        (candidate) =>
          `${candidate.room} ${candidate.widthMm}x${candidate.heightMm} ${candidate.planSide}`,
      )
      .join("; ");
    const anchored = row.witnessAudit.anchoredSameRoomRows
      .map(
        (candidate) =>
          `${candidate.room} ${candidate.floor}->${candidate.recovered} ${candidate.planSide}->${candidate.elevationFace}`,
      )
      .join("; ");
    const nearby = row.witnessAudit.nearbyDimensionLabels
      .slice(0, 3)
      .map((candidate) => `${candidate.text}(${candidate.dimension}) d=${candidate.distance}`)
      .join("; ");
    console.log(
      `  ${row.room} ${row.manual.widthMm}x${row.manual.heightMm}: ${row.witnessAudit.diagnosis}`,
    );
    console.log(`    same-room: ${sameRoom || "-"}`);
    console.log(`    same-dim:  ${sameDim || "-"}`);
    console.log(`    anchored:  ${anchored || "-"}`);
    console.log(`    nearby:    ${nearby || "-"}`);
  }

  const outPath = resolve("output/diagnostics/15a-opening-ledger.json");
  mkdirSync(resolve("output/diagnostics"), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
