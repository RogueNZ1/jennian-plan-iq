// @vitest-environment node
/**
 * Stage 2a checkpoint — the flat openings[] is threaded into QSExportData (enriched path)
 * but NOT yet written to any cell, so the QS export is byte-identical with openings[]
 * present vs absent, on BOTH source paths:
 *   - relational fallback (null enriched → openings undefined), and
 *   - enriched overlay (openings populated from the composed takeoff).
 *
 * Proven against the WorkSheet objects the export is assembled from (the real XLSX.write
 * binary does not round-trip under node/vitest — same approach as qs-export-flags).
 * Offline, no DB. When this stays green, wiring openings[] perturbed neither path; the
 * actual consumption (glazed-split + cladding cells) is Stage 2b.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyEnrichedTakeoff,
  buildQSDataInputSheet,
  type QSExportData,
} from "../../src/lib/iq-qs-export";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";
import type { GeometryApiResult } from "../../src/lib/takeoff/geometry-api";

const FIX = resolve(process.cwd(), "tests/phase1/__fixtures__");
const visionTakeoff = (
  JSON.parse(readFileSync(resolve(FIX, "mcalevey.golden.json"), "utf8")) as {
    pipeline: { takeoff: TakeoffData };
  }
).pipeline.takeoff;
const geometry = JSON.parse(
  readFileSync(resolve(FIX, "mcalevey.geometry.json"), "utf8"),
) as GeometryApiResult;
const enriched: EnrichedTakeoff = composeTakeoff({
  visionTakeoff,
  geometry,
  schedule: null,
  geometryPageIndex: 0,
}).enriched;

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

const stripOpenings = (d: QSExportData): QSExportData => {
  const { openings, ...rest } = d;
  void openings;
  return rest;
};

describe("Stage 2a — openings[] is threaded but inert in the .xlsx (byte-identical both paths)", () => {
  it("ENRICHED path: the composed takeoff actually carries a non-empty openings[]", () => {
    const out = applyEnrichedTakeoff(baseData(), enriched);
    expect(out.takeoffSource).toBe("enriched");
    expect(Array.isArray(out.openings)).toBe(true);
    expect(out.openings!.length).toBeGreaterThan(0); // proof is meaningful: there IS data to ignore
  });

  it("ENRICHED path: the QS paste sheet is identical with openings[] present vs stripped", () => {
    const withOpenings = applyEnrichedTakeoff(baseData(), enriched);
    const withoutOpenings = stripOpenings(withOpenings);
    expect(buildQSDataInputSheet(withOpenings)).toEqual(buildQSDataInputSheet(withoutOpenings));
  });

  it("RELATIONAL path: null enriched leaves openings undefined; sheet equals the no-openings base", () => {
    const relational = applyEnrichedTakeoff(baseData(), null);
    expect(relational.openings).toBeUndefined();
    expect(buildQSDataInputSheet(relational)).toEqual(buildQSDataInputSheet(baseData()));
  });

  it("CROSS-CHECK: even if openings[] is force-injected on a relational base, the sheet is unchanged", () => {
    const injected = baseData({ openings: enriched.openings ?? [] });
    expect(buildQSDataInputSheet(injected)).toEqual(buildQSDataInputSheet(baseData()));
  });
});
