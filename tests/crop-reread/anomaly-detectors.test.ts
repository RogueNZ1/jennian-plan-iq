// @vitest-environment node
/**
 * Crop-on-anomaly — detectors + the goldens GATE (Phase 3).
 *
 * GATE (per the approved architecture): both detectors must fire ZERO times over the
 * golden fixtures before the crop re-read machinery is built — that proves the "+0
 * no-regression" claim. What is runnable offline from the committed repo:
 *
 *  - OUTLIER detector: FULLY runnable — every golden's ground-truth openings (type /
 *    room / height) are committed. Asserted zero-fire below over ALL committed goldens.
 *  - MISSING-WINDOW detector: NOT fully runnable offline — it needs each golden's full
 *    geometry room-label list, which lives with the gitignored client plan data. A
 *    skipIf-gated harness below runs it automatically once a room-labels sidecar
 *    (rooms.json: string[]) is dropped into each fixture dir from a live run.
 *
 * Until the missing-window half runs over real room lists, the gate is HALF-proven and
 * the re-read build stays stopped, per the gate discipline.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyRoomCategory,
  detectMissingWindows,
  detectOutlierWindows,
  BATHING_MAX_WINDOW_HEIGHT_M,
} from "../../src/lib/takeoff/anomaly-detectors";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";

const win = (room: string | null, h: number, w: number, type: Opening["type"] = "window"): Opening => ({
  type, room, height_m: h, width_m: w, glazed: type !== "sectional_door", cladding: null,
  area_m2: Math.round(h * w * 100) / 100, source: "vision", confidence: "medium",
});

/* ------------------------------------------------------------- taxonomy */

describe("classifyRoomCategory — keyword taxonomy", () => {
  it("habitable", () => {
    for (const l of ["Bed 3", "BED 1 (MASTER)", "Lounge", "Family/Living", "Dining", "Kitchen", "Study"]) {
      expect(classifyRoomCategory(l)).toBe("HABITABLE");
    }
  });
  it("bathing (incl. wc/powder — checked before SERVICE)", () => {
    for (const l of ["Ensuite", "Bathroom", "WC", "Powder", "Toilet"]) {
      expect(classifyRoomCategory(l)).toBe("BATHING");
    }
  });
  it("service (incl. laundry/garage/entry)", () => {
    for (const l of ["Laundry", "Garage", "Entry", "Hall", "Walk-in Robe", "Linen"]) {
      expect(classifyRoomCategory(l)).toBe("SERVICE");
    }
  });
  it("unknown labels stay UNKNOWN (lean — never trigger a re-read)", () => {
    expect(classifyRoomCategory("Zen Zone")).toBe("UNKNOWN");
    expect(classifyRoomCategory(null)).toBe("UNKNOWN");
  });
});

/* ------------------------------------------------------- missing-window */

describe("detectMissingWindows", () => {
  const rooms = ["Bed 1", "Bed 2", "Bed 3", "Lounge", "Laundry", "WC", "Garage", "Ensuite"];

  it("fires for a HABITABLE room with no attributed window (the JM-0020 Bed 3 case)", () => {
    const openings = [win("Bed 1", 1.3, 1.8), win("Bed 2", 1.3, 1.5), win("Lounge", 1.4, 1.3)];
    const fired = detectMissingWindows(rooms, openings);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ kind: "missing_window", room: "Bed 3" });
  });

  it("never fires for SERVICE (laundry/wc/garage) or BATHING rooms — windowless is legal", () => {
    const openings = [win("Bed 1", 1.3, 1.8), win("Bed 2", 1.3, 1.5), win("Bed 3", 1.3, 1.5), win("Lounge", 1.4, 1.3)];
    expect(detectMissingWindows(rooms, openings)).toHaveLength(0);
  });

  it("loose room identity: 'Bed 1' label matches an opening roomed 'Bed 1 (Master)'", () => {
    const openings = [win("Bed 1 (Master)", 1.3, 1.8), win("Bed 2", 1.3, 1.5), win("Bed 3", 1.3, 1.5), win("Lounge", 1.4, 1.3)];
    expect(detectMissingWindows(rooms, openings)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------- outlier */

describe("detectOutlierWindows", () => {
  it("fires the bathing cap for an ensuite window over the max height", () => {
    const fired = detectOutlierWindows([win("Ensuite", 2.1, 0.9)]);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ rule: "bathing_max", limit_m: BATHING_MAX_WINDOW_HEIGHT_M });
  });

  it("does NOT fire for a tall LAUNDRY window (Young's 1.8 is correct) or kitchen", () => {
    expect(detectOutlierWindows([win("Laundry", 1.8, 0.6), win("Kitchen", 1.8, 0.6)])).toHaveLength(0);
  });

  it("gross band fires in ANY room: below 0.3 or above 2.6", () => {
    const fired = detectOutlierWindows([win("Lounge", 0.25, 1.2), win("Bed 2", 2.8, 1.2)]);
    expect(fired).toHaveLength(2);
    expect(fired.every((f) => f.rule === "gross_band")).toBe(true);
  });

  it("ignores doors and unresolved (0) heights — flagged at source, not outliers", () => {
    const sectional = win("Garage", 2.1, 4.8, "sectional_door");
    const unresolved = win("Garage", 0, 2.0, "garage_window");
    expect(detectOutlierWindows([sectional, unresolved])).toHaveLength(0);
  });
});

/* ------------------------------------------------------------ THE GATE */

const FIXTURES = ["15a", "beddis", "harrison", "oneil", "young"] as const;
const fixturesRoot = resolve(__dirname, "../fixtures");

function goldenOpenings(name: string): Opening[] {
  const gt = JSON.parse(readFileSync(resolve(fixturesRoot, name, "ground-truth.json"), "utf8"));
  return (gt.joinery_bench?.openings ?? []) as Opening[];
}

describe("GATE — outlier detector over ALL committed goldens fires ZERO", () => {
  for (const name of FIXTURES) {
    it(`${name}: zero outlier fires`, () => {
      const fired = detectOutlierWindows(goldenOpenings(name));
      expect(fired).toEqual([]);
    });
  }
});

describe("GATE — missing-window detector over goldens (needs rooms.json sidecar from a live run)", () => {
  for (const name of FIXTURES) {
    const sidecar = resolve(fixturesRoot, name, "rooms.json");
    const has = existsSync(sidecar);
    it.skipIf(!has)(`${name}: zero missing-window fires`, () => {
      const rooms = JSON.parse(readFileSync(sidecar, "utf8")) as string[];
      const fired = detectMissingWindows(rooms, goldenOpenings(name));
      expect(fired).toEqual([]);
    });
  }
});
