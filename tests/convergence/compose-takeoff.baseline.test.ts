// @vitest-environment node
/**
 * Convergence — composeTakeoff baseline (offline, deterministic).
 *
 * Slice 1 proved the extracted seam is reproducible. Slice 2 changed the OUTPUT SHAPE:
 * composeTakeoff now returns an `EnrichedTakeoff` (every QS field wrapped in
 * { value, source, confidence, discrepancy_flags }). So the Slice 1 byte-identical
 * comparison against the bare golden is GONE — replaced by two proofs:
 *
 *   (a) VALUES PRESERVED — unwrapTakeoff(enriched) deep-equals the Slice 1 bare golden,
 *       so the enrichment changed no number; and
 *   (b) METADATA CORRECT — source / confidence / discrepancy_flags are populated from the
 *       provenance the seam already tracks, and the global flags are migrated onto the
 *       field they belong to.
 *
 * Still entirely OFFLINE and downstream of the cached, non-deterministic vision model:
 *   - cached VISION takeoff  → tests/phase1/__fixtures__/mcalevey.golden.json (pipeline.takeoff)
 *   - cached GEOMETRY result → tests/phase1/__fixtures__/mcalevey.geometry.json (frozen)
 * composeTakeoff is PURE, so identical inputs ⇒ deterministic output.
 *
 * To regenerate the bare golden after an INTENTIONAL value change:
 *   UPDATE_COMPOSE_GOLDEN=1 npx vitest run tests/convergence/compose-takeoff.baseline.test.ts
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import { unwrapTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
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

// mcalevey is a single-page floor plan: no separate schedule page; geometry measured page 0,
// so pinning page 0 agrees (no page-divergence note).
function compose() {
  return composeTakeoff({ visionTakeoff, geometry, schedule: null, geometryPageIndex: 0 });
}

describe("Convergence — composeTakeoff baseline (cached vision, frozen, offline)", () => {
  const composed = compose();

  it("composes from cached inputs and agrees on the measured page", () => {
    expect(composed.enriched).toBeTruthy();
    expect(composed.pageReconcile.agreed).toBe(true);
    expect(composed.pageReconcile.note).toBeNull();
  });

  // ── (a) VALUES PRESERVED ───────────────────────────────────────────────────────
  it("unwrap(enriched) deep-equals the Slice 1 bare golden — enrichment changed no value", () => {
    const bare = unwrapTakeoff(composed.enriched);
    if (process.env.UPDATE_COMPOSE_GOLDEN || !existsSync(COMPOSE_GOLDEN)) {
      writeFileSync(COMPOSE_GOLDEN, JSON.stringify(bare, null, 2) + "\n");
    }
    const golden = JSON.parse(readFileSync(COMPOSE_GOLDEN, "utf8")) as TakeoffData;
    expect(bare).toEqual(golden);
  });

  it("the global notes view equals the bare notes (backward-compat preserved)", () => {
    expect(composed.enriched.notes).toBe(unwrapTakeoff(composed.enriched).notes);
  });

  // ── (b) METADATA CORRECT ───────────────────────────────────────────────────────
  it("populates source from the provenance the seam tracks", () => {
    const e = composed.enriched;
    // geometry-measured fields
    expect(e.floor_area_m2.source).toBe("geometry");
    expect(e.external_wall_lm.source).toBe("geometry");
    expect(e.internal_wall_lm.source).toBe("geometry");
    expect(e.ceiling_height_m.source).toBe("geometry");
    // derived areas
    expect(e.external_wall_area_m2.source).toBe("derived");
    expect(e.total_area_m2.source).toBe("derived");
    // mcalevey: the vector garage (2080) did NOT override the vision read (6044) → vision;
    // no vector window count present → the count is the vision/callout value.
    expect(e.garage_door_size.source).toBe("vision");
    expect(e.window_count.source).toBe("vision");
    // pure vision fields
    expect(e.roof_area_m2.source).toBe("vision");
    expect(e.bathroom_count.source).toBe("vision");
  });

  it("populates confidence from geometry confidence + F-022 status", () => {
    const e = composed.enriched;
    expect(e.floor_area_m2.confidence).toBe("high"); // geometry confidence.floor_area
    expect(e.external_wall_lm.confidence).toBe("high"); // geometry confidence.perimeter
    expect(e.internal_wall_lm.confidence).toBe("mid"); // "medium" → "mid"
    expect(e.garage_door_size.confidence).toBe("low"); // F-022 disagreed (6044 vs 2080)
  });

  it("migrates the global flags onto the field they belong to", () => {
    const e = composed.enriched;
    // F-022 garage disagreement rides on garage_door_size, not a global blob.
    expect(e.garage_door_size.discrepancy_flags.join(" ")).toContain("garage_door_width");
    // The entrance assumption / unresolved-width flag rides on windows_by_room.
    expect(e.windows_by_room.discrepancy_flags.join(" ")).toContain("entrance door");
    expect(e.windows_by_room.discrepancy_flags.join(" ")).toContain(
      "width unresolved — confirm against plan",
    );
    // Every migrated flag is still present in the global notes view (nothing lost).
    for (const f of [
      ...e.garage_door_size.discrepancy_flags,
      ...e.windows_by_room.discrepancy_flags,
    ]) {
      expect(e.notes).toContain(f);
    }
  });

  it("is PURE — composing the same frozen inputs twice yields deep-equal output", () => {
    expect(compose().enriched).toEqual(composed.enriched);
  });

  // ── (a) PIPELINE PARITY — run.ts assembles the same inputs and calls the same function ──
  it("run.ts's page-pin assembly yields identical output to the /upload-style call", () => {
    // run.ts pins geometry to the 1-based working page → 0-based index (workingPageNumber − 1),
    // the C3 fix. For mcalevey (single floor-plan page) that resolves to index 0 — the page
    // geometry measured — so the page reconciliation agrees and the enriched output is the
    // SAME pure function on the SAME inputs as Pipeline B.
    const workingPageNumber = 1;
    const geometryPageIndex = workingPageNumber - 1; // = 0
    const viaRunTs = composeTakeoff({ visionTakeoff, geometry, schedule: null, geometryPageIndex });
    expect(viaRunTs.enriched).toEqual(composed.enriched);
    expect(viaRunTs.pageReconcile.agreed).toBe(true);
  });

  it("does not let a contradicted geometry floor-area candidate overwrite vision/title-block area", () => {
    const poisonedGeometry: GeometryApiResult = {
      ...geometry,
      measurements: {
        ...geometry.measurements,
        floor_area_m2: 60.4,
        perimeter_m: 60.4,
      },
      confidence: {
        ...geometry.confidence,
        floor_area: "medium",
        notes: [
          "floor_area_m2: geometry=175.37, printed=60.4, diff=190.3%",
          ...geometry.confidence.notes,
        ],
      },
      ocr_raw: {
        ...geometry.ocr_raw,
        living_area_m2: 60.4,
        perimeter_m: 60.4,
      },
    };
    const visionWithPrintedArea: TakeoffData = {
      ...visionTakeoff,
      floor_area_m2: 170.8,
    };

    const result = composeTakeoff({
      visionTakeoff: visionWithPrintedArea,
      geometry: poisonedGeometry,
      schedule: null,
      geometryPageIndex: 0,
    }).enriched;

    expect(result.floor_area_m2.value).toBe(170.8);
    expect(result.floor_area_m2.source).toBe("vision");
    expect(result.floor_area_m2.confidence).toBe("mid");
    expect(result.floor_area_m2.discrepancy_flags.join(" ")).toContain(
      "rejected geometry candidate 175.37",
    );
    expect(result.notes).toContain("rejected geometry candidate 175.37");
  });
});
