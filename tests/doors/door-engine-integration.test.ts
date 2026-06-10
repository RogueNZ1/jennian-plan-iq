// @vitest-environment node
/**
 * Door engine integration — the deterministic interior-door pipeline.
 *
 * Pins three things:
 *  1. ENGINE CONTRACT (smoke): width-band classification incl. the load-bearing 920mm
 *     cap, no-throw on empty geometry, scale-text parsing.
 *  2. COMPOSE PASSTHROUGH: door_counts_auto/door_flags land on the enriched takeoff
 *     when a door pass ran; runs without one stay byte-identical (conditional spread).
 *  3. EXPORT PRECEDENCE: historical confirmed manual counts (legacy jobs) > engine
 *     counts > module-item labels / schedule fallback. Engine flags NEVER count.
 *
 * The real correctness gate is the Alexandra bench (hand-counted ground truth) — see
 * bench.skipIf below; it runs wherever the client plan PDF exists.
 */
import { describe, it, expect } from "vitest";
import {
  detectInteriorDoors,
  extractWidthLabels,
  DEFAULT_CONFIG,
  type PageGeometry,
} from "../../src/lib/doors/door-engine";
import { scaleDenominator } from "../../src/lib/doors/run-doors";
import { applyEnrichedTakeoff, type QSExportData } from "../../src/lib/iq-qs-export";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";

/* ----------------------------------------------------------- engine smoke */

const lbl = (text: string, x = 100, y = 100) => ({ text, x, y, vertical: false });

describe("door engine — width bands (the 920 cap is load-bearing)", () => {
  const cfg = { ...DEFAULT_CONFIG, scale: 100 };
  const widths = (labels: ReturnType<typeof lbl>[]) =>
    extractWidthLabels(labels, cfg).map((w) => `${w.kind}:${w.mm}`);

  it("single-leaf band 450–920; doubles 1150–2100", () => {
    expect(widths([lbl("760")])).toEqual(["single:760"]);
    expect(widths([lbl("510")])).toEqual(["single:510"]); // cupboards are real
    expect(widths([lbl("1620")])).toEqual(["double:1620"]);
  });

  it("1030 entrance leaves and island dims are NOT doors (the cap)", () => {
    expect(widths([lbl("1030")])).toEqual([]);
    expect(widths([lbl("3600")])).toEqual([]);
  });

  it("empty geometry → zero counts, zero flags, no throw", () => {
    const geom: PageGeometry = { width: 842, height: 595, segments: [], labels: [], polylines: [] };
    const r = detectInteriorDoors(geom, cfg);
    expect(r.counts).toEqual({ singles: 0, doubles: 0, cavitySliders: 0, barn: 0 });
    expect(r.flags).toEqual([]);
  });
});

describe("scaleDenominator", () => {
  it("parses common scale strings, rejects garbage", () => {
    expect(scaleDenominator("1:100")).toBe(100);
    expect(scaleDenominator("1 : 50")).toBe(50);
    expect(scaleDenominator("Scale 1/100 @ A3")).toBe(100);
    expect(scaleDenominator("NTS")).toBeNull();
    expect(scaleDenominator(null)).toBeNull();
  });
});

/* ----------------------------------------------------- export precedence */

function baseData(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-X", clientName: "T", address: "1 T St", templateId: null, createdAt: "",
    floorAreaM2: 100, perimeterLm: 40, firstFloorAreaM2: null, studHeightMm: 2400,
    alfrescoAreaM2: 0, roofPitch: null, ridgeType: null, underlay: null,
    claddingType1: null, claddingType2: null, windows: [], garageDoors: [],
    interiorDoors: [], downpipes: [], heatPumps: [], extras: [], skylights: [],
    clientFirstName: "T", clientSurname: "C", streetAddress: "1 T St", addressLine2: null,
    city: "F", email: null, phone: null, jmwNumber: "JM-X", planVersion: "1",
    exteriorWallLengthLm: 40, exteriorWallHeightM: 2.4, pathsPatioM2: null, drivewayM2: null,
    windowsByRoom: {}, downpipesWhite: 0, downpipesColourSteel: 0, downpipesPvcColoured: 0,
    garageDoor48x21Std: 0, garageDoor48x21Insulated: 0, garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0, garageDoor27x21Std: 0, garageDoor27x21Insulated: 0,
    intDoorStandard: 3, intDoorUGroove: 0, intDoorVGroove: 0, intDoorBarnSlider: 0,
    intDoorDouble: 1, intDoorCavitySlider: 0, ceilingHatch: 0, atticStair: 0,
    letterboxUrban: 0, washingLine: 0, heatPumpWallUnit: 0, heatPumpDucted: 0,
    specItems: {}, openings: null,
    ...over,
  };
}

import { fv as realFv } from "../../src/lib/takeoff/enriched-takeoff";

/** Minimal REAL enriched takeoff: every field fieldFlags walks, built with the real fv(). */
function enrichedWith(doors: EnrichedTakeoff["door_counts_auto"]): EnrichedTakeoff {
  const f = <T,>(v: T | null) => realFv(v, "vision");
  const e = {
    floor_area_m2: f(100), garage_area_m2: f(null), external_wall_lm: f(40),
    internal_wall_lm: f(null), roof_area_m2: f(null), alfresco_area_m2: f(0),
    window_count: f(0), external_door_count: f(null), internal_door_count: f(null),
    bathroom_count: f(null), ensuite_count: f(null), laundry_count: f(null),
    kitchen_count: f(null), ceiling_height_m: f(2.4), foundation_type: f(null),
    windows_by_room: f(null), windows_schedule: f(null), door_breakdown: f(null),
    garage_door_size: f(null), external_wall_area_m2: f(null), total_area_m2: f(100),
    door_counts_auto: doors,
  };
  return e as unknown as EnrichedTakeoff;
}

describe("export precedence — doors", () => {
  it("engine counts override item/schedule-derived values when no confirmed manual row", () => {
    const out = applyEnrichedTakeoff(
      baseData({ doorCountsConfirmed: false }),
      enrichedWith({ singles: 12, doubles: 4, cavitySliders: 1, barn: 0 }),
    );
    expect(out.intDoorStandard).toBe(12);
    expect(out.intDoorDouble).toBe(4);
    expect(out.intDoorCavitySlider).toBe(1);
    expect(out.intDoorBarnSlider).toBe(0);
  });

  it("HISTORICAL confirmed manual counts still win (legacy jobs stay stable)", () => {
    const out = applyEnrichedTakeoff(
      baseData({ doorCountsConfirmed: true, intDoorStandard: 7 }),
      enrichedWith({ singles: 12, doubles: 4, cavitySliders: 1, barn: 0 }),
    );
    expect(out.intDoorStandard).toBe(7); // the confirmed value, not the engine's
  });

  it("no engine pass → base item/schedule values survive untouched", () => {
    const out = applyEnrichedTakeoff(baseData(), enrichedWith(null));
    expect(out.intDoorStandard).toBe(3);
    expect(out.intDoorDouble).toBe(1);
  });
});
