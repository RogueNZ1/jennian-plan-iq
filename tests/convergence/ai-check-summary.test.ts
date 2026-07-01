// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  aiCheckSummaryWorkbookRows,
  aiCheckSummaryLines,
  buildAiCheckSummary,
} from "../../src/lib/ai-check-summary";
import { buildDropInSheet, type QSExportData } from "../../src/lib/iq-qs-export";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";

const timestamp = "2026-07-01T00:00:00.000Z";

function q(over: Partial<ExtractedQuantity>): ExtractedQuantity {
  return {
    id: "q-1",
    jobId: "job-62",
    runId: "run-62",
    category: "window",
    label: "Window",
    count: 1,
    widthMm: 1300,
    heightMm: 2400,
    lengthMm: null,
    areaM2: 3.12,
    source: "pdf_text",
    evidence: [],
    status: "extracted",
    confidence: 95,
    warnings: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...over,
  };
}

function fennerReadModel() {
  return buildExtractedQuantityReadModel(
    [
      q({
        id: "perimeter",
        category: "exterior_perimeter",
        label: "Exterior perimeter",
        lengthMm: 89100,
        widthMm: null,
        heightMm: null,
        areaM2: null,
        source: "vector_geometry",
      }),
      q({
        id: "interior-doors",
        category: "interior_door",
        label: "Interior doors",
        count: 20,
        widthMm: null,
        heightMm: null,
        areaM2: null,
        source: "door_schedule",
      }),
      q({ id: "family", label: "FAMILY", widthMm: 2400, heightMm: 1300, areaM2: 3.12 }),
      q({ id: "dining", label: "DINING", widthMm: 2400, heightMm: 1300, areaM2: 3.12 }),
      q({ id: "study", label: "STUDY/BED4", widthMm: 1500, heightMm: 1300, areaM2: 1.95 }),
      q({ id: "ensuite", label: "ENSUITE", widthMm: 600, heightMm: 2150, areaM2: 1.29 }),
      q({ id: "bath", label: "BATH", widthMm: 1200, heightMm: 1100, areaM2: 1.32 }),
      q({ id: "bed2", label: "BED2", widthMm: 1500, heightMm: 1300, areaM2: 1.95 }),
      q({ id: "masterbed-a", label: "MASTERBED", widthMm: 800, heightMm: 1100, areaM2: 0.88 }),
      q({ id: "masterbed-b", label: "MASTERBED", widthMm: 800, heightMm: 1100, areaM2: 0.88 }),
      q({ id: "bed3", label: "BED3", widthMm: 2400, heightMm: 1300, areaM2: 3.12 }),
      q({
        id: "garage-review",
        category: "garage_door",
        label: "Garage Door",
        widthMm: 4800,
        heightMm: 2100,
        areaM2: 10.08,
        status: "conflict",
        warnings: ["source_conflict"],
        source: "floorplan_symbol",
      }),
    ],
    { activeRunId: "run-62" },
  );
}

function data(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0062",
    clientName: "Fenner",
    address: "Fenner site",
    templateId: null,
    createdAt: "",
    floorAreaM2: 197.2,
    perimeterLm: 89.1,
    internalWallLm: null,
    gableSpanM: null,
    firstFloorAreaM2: null,
    garageAreaM2: null,
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
    clientSurname: "Fenner",
    streetAddress: "Fenner site",
    addressLine2: null,
    city: "Palmerston North",
    email: null,
    phone: null,
    jmwNumber: "JM-0062",
    planVersion: "1",
    exteriorWallLengthLm: 89.1,
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
    doorsSource: "labels",
    intDoorVisionHint: null,
    intDoorStandard: 20,
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
    openings: [],
    openingPricingBlocked: true,
    extractedQuantityReadModel: fennerReadModel(),
    reviewFlags: [
      {
        field: "External wall area",
        flags: [
          "Opening pricing blocked: unresolved Visual QS reconciliation error. AI opening check found 17 QS-glazed external openings, but the composed opening set has 13. Reconcile before pricing.",
        ],
      },
    ],
    ...over,
  };
}

function sheetText(sheet: XLSX.WorkSheet): string {
  return Object.keys(sheet)
    .filter((key) => !key.startsWith("!"))
    .map((key) => String((sheet[key] as XLSX.CellObject).v ?? ""))
    .join(" ");
}

describe("AI Check Summary", () => {
  it("builds one Fenner takeoff verdict from the active read model and visual block state", () => {
    const summary = buildAiCheckSummary(data(), {
      authoritySource: "persisted_current_run",
      runId: "run-62",
    });
    const lines = aiCheckSummaryLines(summary).join("\n");

    expect(summary.statusLabel).toBe("REVIEW REQUIRED - openings unresolved");
    expect(lines).toContain("Exterior perimeter 89.1 lm");
    expect(lines).toContain("Interior doors 20");
    expect(lines).toContain("Clean window evidence 9 rows / 17.63 m2");
    expect(lines).toContain(
      "External wall area / cladding Not calculated - opening reconciliation required",
    );
    expect(lines).toContain("Vision found 17 likely QS-glazed external openings");
    expect(lines).toContain("active clean extracted window rows 9");
    expect(lines).toContain("Garage: 4.8 x 2.1 garage door candidate found");
    expect(lines).toContain("Do not price: unresolved openings, garage door, cladding");
    expect(lines).not.toContain("AI opening check");
    expect(lines).not.toContain("OPENING PRICING BLOCKED");
    expect(lines).not.toContain("mÂ²");
    expect(lines).not.toContain("â");
  });

  it("puts the same verdict on the workbook cover rows and IQ Import manual block", () => {
    const exportData = data();
    const summary = buildAiCheckSummary(exportData);
    const coverText = aiCheckSummaryWorkbookRows(summary).flat().join(" ");
    const iqImport = buildDropInSheet(exportData);
    const iqImportText = sheetText(iqImport);
    const allText = [coverText, iqImportText].join(" ");

    expect(coverText).toContain(summary.statusLabel);
    expect(coverText).toContain("Exterior perimeter 89.1 lm");
    expect(coverText).toContain("Interior doors 20");
    expect(coverText).toContain("Clean window evidence 9 rows / 17.63 m2");
    expect(coverText).toContain(summary.vision.line);
    expect(iqImportText).toContain("AI Takeoff Check - JM-0062");
    expect(iqImportText).toContain("Clean window evidence 9 rows / 17.63 m2");
    expect(iqImportText).toContain("Do not price: unresolved openings, garage door, cladding");
    expect((iqImport["B15"] as XLSX.CellObject | undefined)?.v ?? null).toBe("");
    expect((iqImport["B44"] as XLSX.CellObject | undefined)?.v ?? null).toBe("");
    expect(allText).not.toContain("Review flags required before pricing");
    expect(allText).not.toContain("OPENING PRICING BLOCKED");
    expect(allText).not.toContain("AI NOTES & ASSUMPTIONS");
    expect(allText).not.toContain("AI opening check");
    expect(allText).not.toContain("mÂ²");
    expect(allText).not.toContain("â");
  });
});
