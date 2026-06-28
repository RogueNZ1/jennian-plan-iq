// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildDropInSheet,
  buildQSDataInputSheet,
  type QSExportData,
} from "../../src/lib/iq-qs-export";
import { buildExtractedQuantitiesSheet } from "../../src/lib/takeoff/extracted-quantity-export";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";

const timestamp = "2026-06-28T00:00:00.000Z";

function q(over: Partial<ExtractedQuantity>): ExtractedQuantity {
  return {
    id: "q-1",
    jobId: "job-60",
    runId: "run-1",
    category: "window",
    label: "Window",
    count: 1,
    widthMm: 1400,
    heightMm: 1200,
    lengthMm: null,
    areaM2: 1.68,
    source: "vector_geometry",
    evidence: [{ page: 2, bbox: [10, 20, 30, 40], text: "W01 1400x1200" }],
    status: "extracted",
    confidence: 95,
    warnings: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...over,
  };
}

function quantities(): ExtractedQuantity[] {
  return [
    q({
      id: "external-perimeter",
      category: "exterior_perimeter",
      label: "Exterior perimeter",
      count: 1,
      widthMm: null,
      heightMm: null,
      lengthMm: 58130,
      areaM2: null,
      evidence: [{ page: 2, text: "perimeter from vector geometry" }],
    }),
    q({
      id: "interior-door-standard",
      category: "interior_door",
      label: "Interior doors - standard",
      count: 11,
      widthMm: null,
      heightMm: null,
      areaM2: null,
      evidence: [{ page: 2, text: "door engine count" }],
    }),
    q({
      id: "window-needs-review",
      status: "needs_review",
      widthMm: 1400,
      heightMm: null,
      areaM2: null,
      warnings: ["height_not_extracted", "area_not_calculated"],
      evidence: [{ page: 2, bbox: [1, 2, 3, 4], text: "visible window width only" }],
    }),
    q({
      id: "pa-assumed-height",
      category: "exterior_door",
      label: "PA door - Laundry",
      status: "needs_review",
      widthMm: 1030,
      heightMm: null,
      areaM2: null,
      warnings: ["assumed_height_rejected", "area_not_calculated"],
      evidence: [{ page: 2, text: "width known; standard height rejected" }],
    }),
    q({
      id: "garage-conflict",
      category: "garage_door",
      status: "conflict",
      widthMm: 4800,
      heightMm: 2100,
      areaM2: 10.08,
      warnings: ["source_conflict"],
    }),
  ];
}

function cell(ws: XLSX.WorkSheet, address: string): string | number | null {
  const value = (ws[address] as XLSX.CellObject | undefined)?.v;
  return value == null ? null : (value as string | number);
}

function sheetText(ws: XLSX.WorkSheet): string {
  return Object.keys(ws)
    .filter((key) => !key.startsWith("!"))
    .map((key) => String((ws[key] as XLSX.CellObject).v ?? ""))
    .join(" ");
}

function rowContaining(ws: XLSX.WorkSheet, needle: string): Array<string | number | null> {
  const end = String(ws["!ref"] ?? "A1:A1").split(":")[1] ?? "A1";
  const maxRow = Number(end.replace(/[A-Z]/g, "")) || 1;
  const maxColLetters = end.replace(/[0-9]/g, "") || "A";
  const maxCol =
    maxColLetters.split("").reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
  for (let r = 0; r < maxRow; r++) {
    const row: Array<string | number | null> = [];
    for (let c = 0; c <= maxCol; c++) {
      row.push(cell(ws, cellAddress(r, c)));
    }
    if (row.some((value) => value === needle)) return row;
  }
  throw new Error(`No row contained ${needle}`);
}

function cellAddress(row: number, col: number): string {
  let n = col + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row + 1}`;
}

function baseData(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0060",
    clientName: "Test Client",
    address: "1 Test St",
    templateId: null,
    createdAt: timestamp,
    floorAreaM2: 160,
    perimeterLm: 58.13,
    internalWallLm: null,
    gableSpanM: null,
    firstFloorAreaM2: null,
    studHeightMm: 2400,
    alfrescoAreaM2: null,
    roofPitch: null,
    ridgeType: null,
    underlay: null,
    claddingType1: null,
    claddingType2: null,
    windows: [],
    garageDoors: [],
    interiorDoors: [],
    downpipes: [],
    heatPumps: [],
    extras: [],
    skylights: [],
    clientFirstName: "Test",
    clientSurname: "Client",
    streetAddress: "1 Test St",
    addressLine2: null,
    city: null,
    email: null,
    phone: null,
    jmwNumber: "JM-0060",
    planVersion: "1",
    exteriorWallLengthLm: 58.13,
    exteriorWallHeightM: 2.4,
    pathsPatioM2: null,
    drivewayM2: null,
    windowsByRoom: {},
    downpipesWhite: 0,
    downpipesColourSteel: 0,
    downpipesPvcColoured: 0,
    garageDoor48x21Std: 0,
    garageDoor48x21Insulated: 0,
    garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0,
    garageDoor27x21Insulated: 0,
    intDoorStandard: 11,
    intDoorUGroove: 0,
    intDoorVGroove: 0,
    intDoorBarnSlider: 0,
    intDoorDouble: 0,
    intDoorCavitySlider: 0,
    ceilingHatch: 0,
    atticStair: 0,
    letterboxUrban: 0,
    washingLine: 0,
    heatPumpWallUnit: 0,
    heatPumpDucted: 0,
    specItems: {},
    moduleItems: [],
    ...over,
  };
}

describe("Extracted Quantities worksheet", () => {
  it("adds Extracted Quantities worksheet/export section", () => {
    const ws = buildExtractedQuantitiesSheet(buildExtractedQuantityReadModel(quantities()));

    expect(ws).not.toBeNull();
    expect(cell(ws!, "A1")).toBe("Extracted Quantities");
    expect(sheetText(ws!)).toContain("Clean extracted");
    expect(sheetText(ws!)).toContain("Needs review");
    expect(sheetText(ws!)).toContain("Missing evidence");
    expect(sheetText(ws!)).toContain("Conflict");
    expect(sheetText(ws!)).toContain("Ignored");
    expect(sheetText(ws!)).toContain("Clean totals");
  });

  it("includes clean extracted rows and clean totals", () => {
    const ws = buildExtractedQuantitiesSheet(buildExtractedQuantityReadModel(quantities()))!;

    expect(rowContaining(ws, "external-perimeter")).toEqual(
      expect.arrayContaining(["exterior_perimeter", "Exterior perimeter", 1, 58130, "extracted"]),
    );
    expect(rowContaining(ws, "interior-door-standard")).toEqual(
      expect.arrayContaining(["interior_door", "Interior doors - standard", 11, "extracted"]),
    );
    expect(rowContaining(ws, "ALL")).toEqual(expect.arrayContaining(["ALL", 12, 58130, 0]));
  });

  it("includes needs_review rows but excludes them from clean totals", () => {
    const ws = buildExtractedQuantitiesSheet(buildExtractedQuantityReadModel(quantities()))!;

    expect(rowContaining(ws, "window-needs-review")).toEqual(
      expect.arrayContaining(["needs_review", "height_not_extracted; area_not_calculated"]),
    );
    expect(sheetText(ws)).not.toContain("window 1 0 1.68");
  });

  it("unknown dimensions export as null/empty cells", () => {
    const ws = buildExtractedQuantitiesSheet(buildExtractedQuantityReadModel(quantities()))!;
    const row = rowContaining(ws, "window-needs-review");

    expect(row[5]).toBe(1400);
    expect(row[6]).toBeNull();
    expect(row[8]).toBeNull();
  });

  it("assumed-height rows export with null height and null area plus warning", () => {
    const ws = buildExtractedQuantitiesSheet(buildExtractedQuantityReadModel(quantities()))!;
    const row = rowContaining(ws, "pa-assumed-height");

    expect(row[5]).toBe(1030);
    expect(row[6]).toBeNull();
    expect(row[8]).toBeNull();
    expect(row).toEqual(
      expect.arrayContaining(["needs_review", "assumed_height_rejected; area_not_calculated"]),
    );
  });

  it("warnings and evidence export with rows", () => {
    const ws = buildExtractedQuantitiesSheet(buildExtractedQuantityReadModel(quantities()))!;
    const row = rowContaining(ws, "window-needs-review");

    expect(row).toEqual(expect.arrayContaining(["height_not_extracted; area_not_calculated"]));
    expect(row).toEqual(expect.arrayContaining(["2", "1,2,3,4", "visible window width only"]));
  });

  it("activeRunId filters exported rows", () => {
    const readModel = buildExtractedQuantityReadModel(
      [
        q({ id: "old-perimeter", runId: "old-run", category: "exterior_perimeter" }),
        q({ id: "active-perimeter", runId: "active-run", category: "exterior_perimeter" }),
      ],
      { activeRunId: "active-run" },
    );
    const ws = buildExtractedQuantitiesSheet(readModel)!;
    const text = sheetText(ws);

    expect(text).toContain("active-perimeter");
    expect(text).not.toContain("old-perimeter");
  });

  it("multiple runIds without activeRunId throws before export can mix rows", () => {
    expect(() =>
      buildExtractedQuantityReadModel([
        q({ id: "old-perimeter", runId: "old-run", category: "exterior_perimeter" }),
        q({ id: "new-perimeter", runId: "new-run", category: "exterior_perimeter" }),
      ]),
    ).toThrow(/multiple runIds without activeRunId/);
  });

  it("leaves existing QS/pricing sheet builders unchanged", () => {
    const readModel = buildExtractedQuantityReadModel(quantities());
    const withSheet = baseData({
      extractedQuantityReadModel: readModel,
      extractedQuantities: quantities(),
    });
    const withoutSheet = baseData();

    expect(buildQSDataInputSheet(withSheet)).toEqual(buildQSDataInputSheet(withoutSheet));
    expect(buildDropInSheet(withSheet)).toEqual(buildDropInSheet(withoutSheet));
  });
});
