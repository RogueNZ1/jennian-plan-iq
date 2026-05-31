// @vitest-environment node
/**
 * Convergence Slice 1 — composeTakeoff byte-identical baseline (offline, deterministic).
 *
 * Slice 1 is a PURE REFACTOR: the `/upload` plan→takeoff seam was extracted verbatim into
 * `composeTakeoff`. This test is the safety proof that the extraction changed no behaviour,
 * and it is built to be deterministic on a normal `npm test` (no live AI, no geometry
 * server) — the comparison runs entirely DOWNSTREAM of the non-deterministic vision model,
 * on FROZEN inputs:
 *
 *   - cached VISION takeoff  → tests/phase1/__fixtures__/mcalevey.golden.json (pipeline.takeoff),
 *     the deterministic, recorded output of the vision pass (the model is non-deterministic
 *     even at temp 0, so we never call it here — we replay its cached result);
 *   - cached GEOMETRY result → tests/phase1/__fixtures__/mcalevey.geometry.json, a frozen
 *     full GeometryApiResult from the deterministic PyMuPDF engine (captured once; no live
 *     :8000 call in this test).
 *
 * `composeTakeoff` is PURE (inputs → takeoff; no model/geometry/clock/IO inside the
 * boundary), so identical inputs ⇒ byte-identical output. The committed
 * `mcalevey.compose.golden.json` pins that output; any drift in the seam (or any function
 * it calls) fails this test offline.
 *
 * To regenerate the golden after an INTENTIONAL behaviour change:
 *   UPDATE_COMPOSE_GOLDEN=1 npx vitest run tests/convergence/compose-takeoff.baseline.test.ts
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";
import type { GeometryApiResult } from "../../src/lib/takeoff/geometry-api";

const FIX = resolve(process.cwd(), "tests/phase1/__fixtures__");
const VISION_GOLDEN = resolve(FIX, "mcalevey.golden.json");
const GEOMETRY_FIXTURE = resolve(FIX, "mcalevey.geometry.json");
const COMPOSE_GOLDEN = resolve(FIX, "mcalevey.compose.golden.json");

const visionTakeoff = (
  JSON.parse(readFileSync(VISION_GOLDEN, "utf8")) as { pipeline: { takeoff: TakeoffData } }
).pipeline.takeoff;
const geometry = JSON.parse(readFileSync(GEOMETRY_FIXTURE, "utf8")) as GeometryApiResult;

// mcalevey is a single-page floor plan: no separate Door & Window Schedule page, and the
// geometry pinned/measured page 0 — so pass geometryPageIndex 0 (matches geometry.page_used)
// → the page reconciliation agrees and adds no divergence note.
function compose() {
  return composeTakeoff({
    visionTakeoff,
    geometry,
    schedule: null,
    geometryPageIndex: 0,
  });
}

describe("Convergence Slice 1 — composeTakeoff baseline (cached vision, frozen, offline)", () => {
  const composed = compose();

  it("composes from cached inputs and agrees on the measured page", () => {
    expect(composed.takeoff).toBeTruthy();
    expect(composed.pageReconcile.agreed).toBe(true);
    expect(composed.pageReconcile.note).toBeNull();
  });

  it("matches the committed byte-identical baseline", () => {
    if (process.env.UPDATE_COMPOSE_GOLDEN || !existsSync(COMPOSE_GOLDEN)) {
      writeFileSync(COMPOSE_GOLDEN, JSON.stringify(composed.takeoff, null, 2) + "\n");
    }
    const golden = JSON.parse(readFileSync(COMPOSE_GOLDEN, "utf8")) as TakeoffData;
    // Deep structural equality…
    expect(composed.takeoff).toEqual(golden);
    // …and byte-identical serialisation (key order is deterministic from the seam's spreads).
    expect(JSON.stringify(composed.takeoff)).toBe(JSON.stringify(golden));
  });

  it("is PURE — composing the same frozen inputs twice yields deep-equal output", () => {
    expect(compose().takeoff).toEqual(composed.takeoff);
  });
});
