/**
 * Doors fail-safe (11 Jun 2026) — a door count with NO deterministic source is an
 * unbacked zero. The sheet must blank B17 + B27–30 and raise a MANUAL ENTRIES flag
 * (with vision's count as a hint), never assert a confident 0.
 *
 * Live motivation: JM-0021 — engine null, no labels, no schedule, no confirmed →
 * the sheet said 0 internal doors while vision saw ~9.
 */
import { describe, expect, it } from "vitest";
import { buildDropInSheet, type QSExportData } from "../../src/lib/iq-qs-export";

function cellVal(ws: Record<string, unknown>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v;
}

function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-TEST",
    clientName: "Doors",
    address: "1 Failsafe Way",
    floorAreaM2: 100,
    garageAreaM2: null,
    alfrescoAreaM2: null,
    exteriorWallLengthLm: 40,
    interiorWallLengthLm: null,
    roofAreaM2: null,
    windowCount: 0,
    externalDoorCount: 0,
    glazedSqm: null,
    ceilingHeightM: null,
    studHeightMm: null,
    exteriorWallHeightM: null,
    foundationType: null,
    garageDoorSize: null,
    windowsByRoom: {},
    garageDoor48x21Std: 0,
    garageDoor48x21Insulated: 0,
    garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0,
    garageDoor27x21Insulated: 0,
    intDoorStandard: 0,
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
    reviewFlags: [],
    takeoffSource: "enriched",
    ...over,
  } as QSExportData;
}

function sheetText(ws: Record<string, unknown>): string {
  return Object.entries(ws)
    .filter(([k]) => /^[A-Z]+\d+$/.test(k))
    .map(([, c]) => String((c as { v?: unknown })?.v ?? ""))
    .join("\n");
}

describe("doors fail-safe — sourceless counts never assert", () => {
  it("doorsSource null → B17 and B27–30 blank, MANUAL flag raised with vision hint", () => {
    const ws = buildDropInSheet(
      base({ doorsSource: null, intDoorVisionHint: 9 }),
    ) as unknown as Record<string, unknown>;

    expect(cellVal(ws, "B17")).toBe("");
    expect(cellVal(ws, "B27")).toBe("");
    expect(cellVal(ws, "B28")).toBe("");
    expect(cellVal(ws, "B29")).toBe("");
    expect(cellVal(ws, "B30")).toBe("");

    const text = sheetText(ws);
    expect(text).toContain("Internal doors NOT deterministically counted");
    expect(text).toContain("vision suggests ~9");
  });

  it("doorsSource undefined (legacy callers) behaves as null — blank + flag", () => {
    const ws = buildDropInSheet(
      base({ intDoorStandard: 0 }),
    ) as unknown as Record<string, unknown>;
    expect(cellVal(ws, "B27")).toBe("");
    expect(sheetText(ws)).toContain("Internal doors NOT deterministically counted");
  });

  it("engine-sourced counts assert numbers and raise NO flag", () => {
    const ws = buildDropInSheet(
      base({ doorsSource: "engine", intDoorStandard: 12, intDoorDouble: 4, intDoorCavitySlider: 1 }),
    ) as unknown as Record<string, unknown>;
    expect(cellVal(ws, "B27")).toBe(12);
    expect(cellVal(ws, "B29")).toBe(4);
    expect(cellVal(ws, "B28")).toBe(1);
    expect(cellVal(ws, "B17")).toBe(17);
    expect(sheetText(ws)).not.toContain("NOT deterministically counted");
  });

  it("a sourced zero is a real zero — schedule says no doors, sheet says 0", () => {
    const ws = buildDropInSheet(
      base({ doorsSource: "schedule", intDoorStandard: 0 }),
    ) as unknown as Record<string, unknown>;
    expect(cellVal(ws, "B27")).toBe(0);
    expect(sheetText(ws)).not.toContain("NOT deterministically counted");
  });
});
