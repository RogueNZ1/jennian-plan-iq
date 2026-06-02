// @vitest-environment node
/**
 * Stage 2b — the QS window cells (windowsByRoom → D/E/F qty/H/W) are migrated to derive from
 * the enriched takeoff's flat openings[] instead of the relational opening_schedule rows.
 *
 * Proven offline on the McAlevey enriched fixture:
 *   (1) openings[] → fixed slots reproduces the takeoff-native windows_by_room → slots
 *       EXACTLY (0 changed window cells — equivalent, not a regression);
 *   (2) the window COUNT is NOT touched (stays the existing enriched.window_count source —
 *       vector where present; 2b migrates the cell DATA, not the count);
 *   (3) the relational fallback is intact (null enriched → base windowsByRoom, untouched);
 *   (4) the sheet BUILDER reads windowsByRoom only — it never reads data.openings directly,
 *       so the source switch lives entirely in applyEnrichedTakeoff.
 *
 * Glazed-split / cladding cells: the QS template has NO standalone glazed or opening-area cell,
 * so `glazed` is consumed only as ROUTING (the solid sectional_door → garage-door slot, never a
 * window row) and per-opening `cladding` (null in Stage 1) has no code-cell target yet — neither
 * writes a new cell. The live Beddis byte-equivalent-or-better gate is Stage 3.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import {
  applyEnrichedTakeoff,
  buildQSDataInputSheet,
  openingsToWindowsByRoom,
  type QSExportData,
} from "../../src/lib/iq-qs-export";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import type { TakeoffData, WindowsByRoom, Opening } from "../../src/lib/takeoff/takeoff-types";
import type { GeometryApiResult } from "../../src/lib/takeoff/geometry-api";
import { deriveOpenings } from "../../src/lib/takeoff/derive-fields";

const FIX = resolve(process.cwd(), "tests/phase1/__fixtures__");
const visionTakeoff = (
  JSON.parse(readFileSync(resolve(FIX, "mcalevey.golden.json"), "utf8")) as { pipeline: { takeoff: TakeoffData } }
).pipeline.takeoff;
const geometry = JSON.parse(readFileSync(resolve(FIX, "mcalevey.geometry.json"), "utf8")) as GeometryApiResult;
const enriched: EnrichedTakeoff = composeTakeoff({ visionTakeoff, geometry, schedule: null, geometryPageIndex: 0 }).enriched;

function baseData(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0001", clientName: "Jane Client", address: "1 Test St, Palmerston North",
    templateId: null, createdAt: "2026-01-01T00:00:00.000Z", floorAreaM2: 100, perimeterLm: 40,
    firstFloorAreaM2: null, studHeightMm: 2400, alfrescoAreaM2: null, roofPitch: null,
    ridgeType: null, underlay: null, claddingType1: null, claddingType2: null, windows: [],
    garageDoors: [], interiorDoors: [], downpipes: [], heatPumps: [], extras: [], skylights: [],
    clientFirstName: "Jane", clientSurname: "Client", streetAddress: "1 Test St", addressLine2: null,
    city: "Palmerston North", email: null, phone: null, jmwNumber: "JM-0001", planVersion: "1",
    exteriorWallLengthLm: 40, exteriorWallHeightM: 2.4, pathsPatioM2: null, drivewayM2: null,
    windowsByRoom: {}, downpipesWhite: 0, downpipesColourSteel: 0, downpipesPvcColoured: 0,
    garageDoor48x21Std: 0, garageDoor48x21Insulated: 0, garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0, garageDoor27x21Std: 0, garageDoor27x21Insulated: 0,
    intDoorStandard: 0, intDoorUGroove: 0, intDoorVGroove: 0, intDoorBarnSlider: 0,
    intDoorDouble: 0, intDoorCavitySlider: 0, ceilingHatch: 0, atticStair: 0, letterboxUrban: 0,
    washingLine: 0, heatPumpWallUnit: 0, heatPumpDucted: 0, specItems: {}, ...over,
  };
}

const WINDOW_ROWS = [41, 43, 45, 47, 49, 52, 54, 56, 59, 62, 65, 67, 72];
const cell = (ws: XLSX.WorkSheet, a: string) => (ws[a] as XLSX.CellObject | undefined)?.v;

describe("Stage 2b — window cells migrate to openings[] (equivalent on McAlevey)", () => {
  it("openings[] → slots reproduces the takeoff-native windows_by_room → slots EXACTLY (0 changed cells)", () => {
    const baselineSlots = openingsToWindowsByRoom(
      deriveOpenings({
        windowsByRoom: enriched.windows_by_room.value as WindowsByRoom,
        garageDoorSize: enriched.garage_door_size.value,
      }),
    );
    const newSlots = openingsToWindowsByRoom(enriched.openings as Opening[]);
    const a = buildQSDataInputSheet(baseData({ windowsByRoom: baselineSlots }));
    const b = buildQSDataInputSheet(baseData({ windowsByRoom: newSlots }));
    for (const r of WINDOW_ROWS) {
      for (const c of ["C", "D", "E", "F"]) {
        expect(cell(b, `${c}${r}`)).toEqual(cell(a, `${c}${r}`));
      }
    }
    // Non-empty: the migration actually drives real cells (the proof is meaningful).
    expect(cell(b, "D41")).toBe(2); // Bed 1 (Master): qty 2
    expect(cell(b, "E41")).toBe(2.15);
    expect(cell(b, "F41")).toBe(0.6);
  });

  it("the COUNT is untouched — applyEnrichedTakeoff migrates cells, not window_count", () => {
    // The QS sheet has no total-window-count cell; the canonical count stays on the enriched
    // field (vector where present). 2b only rewrites windowsByRoom; it never derives a count.
    const out = applyEnrichedTakeoff(baseData(), enriched);
    const winQtySum = Object.values(out.windowsByRoom).reduce((s, w) => s + (w?.qty ?? 0), 0);
    // qty-sum of the routed window slots equals the window-type opening count (sanity), and the
    // canonical count remains the independent enriched field — unchanged by this overlay.
    const windowTypeOpenings = (enriched.openings ?? []).filter((o) =>
      ["window", "slider", "garage_window"].includes(o.type),
    ).length;
    expect(winQtySum).toBe(windowTypeOpenings);
    expect(enriched.window_count.value).toBe(8); // the field is the source of truth, set upstream
  });

  it("RELATIONAL fallback intact — null enriched keeps the base windowsByRoom, openings undefined", () => {
    const relational = applyEnrichedTakeoff(baseData({ windowsByRoom: { bed1: { cladding: "", qty: 9, height: 1, width: 1 } } }), null);
    expect(relational.openings).toBeUndefined();
    expect(relational.windowsByRoom).toEqual({ bed1: { cladding: "", qty: 9, height: 1, width: 1 } });
  });

  it("the sheet BUILDER reads windowsByRoom only — injecting openings on a base changes nothing", () => {
    const injected = baseData({ openings: enriched.openings ?? [] });
    expect(buildQSDataInputSheet(injected)).toEqual(buildQSDataInputSheet(baseData()));
  });
});
