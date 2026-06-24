// @vitest-environment node
/**
 * Joinery-bench DIAGNOSTIC — read-only measurement, NO data-logic fixes.
 *
 * Runs the live exterior-openings extraction (recognisePlan → extractAnnotations →
 * classifyAnnotations, plus the no-schedule vector overrides and the geometry engine)
 * for the two jobs that have no prior baseline-results.json: 15A Russell St and O'Neil.
 * Beddis + Harrison already have their live takeoff captured in
 * tests/fixtures/<job>/_render/baseline-results.json, so they are scored from those.
 *
 * Each job's live takeoff is dumped to tests/fixtures/<job>/_render/diag-results.json
 * so it can be scored against ground-truth.json's joinery_bench block OUTSIDE this file.
 * This test asserts only that a non-null takeoff was produced — the scoring/ranking is
 * a human (report) step. Picks NO fix.
 *
 * Gated: BENCH_DIAG=1 (real Anthropic calls + geometry on :8000).
 *   BENCH_DIAG=1 npx vitest run tests/convergence/joinery-bench-diagnostic.test.ts
 */
import { describe, it, beforeAll, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "../phase1/pipeline";
import { recognisePlan } from "../../src/lib/takeoff/recognise-plan";
import { extractAnnotations } from "../../src/lib/takeoff/extract-annotations";
import { classifyAnnotations } from "../../src/lib/takeoff/classify-annotations";
import {
  preferVectorGarage,
  preferVectorOpenings,
  resolveOpeningWidths,
  visionOpeningWidthsMm,
  preferVectorEntrance,
} from "../../src/lib/takeoff/vector-annotations";
import { aggregateWindows, applyWindowAggregate } from "../../src/lib/takeoff/aggregate-windows";

const GEOMETRY_BASE = process.env.GEOMETRY_BASE ?? "http://localhost:8000";
const RUN = !!process.env.BENCH_DIAG;

// Jobs without a prior live run. Each: one rendered floor-plan page + the source PDF.
const JOBS = [
  { id: "15a", floorRender: "floorplan-1.jpg", floorPdf: "floorplan.pdf" },
  { id: "oneil", floorRender: "floorplan-1.jpg", floorPdf: "floorplan.pdf" },
];

async function geometry(dir: string, pdf: string, page = 0) {
  const buf = readFileSync(resolve(dir, pdf));
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), pdf);
  const res = await fetch(`${GEOMETRY_BASE}/measure?page=${page}`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`geometry ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

describe.skipIf(!RUN)("Joinery-bench diagnostic (15A + O'Neil)", () => {
  beforeAll(() => loadEnvLocal());

  for (const job of JOBS) {
    it(
      `runs live extraction for ${job.id} and dumps diag-results.json`,
      async () => {
        const DIR = resolve(process.cwd(), `tests/fixtures/${job.id}`);
        const RENDER = resolve(DIR, "_render");
        const b64 = readFileSync(resolve(RENDER, job.floorRender)).toString("base64");

        const out: any = { job: job.id, generatedAt: new Date().toISOString() };

        // Pass 0: plan context off the floor-plan render.
        const ctx = await recognisePlan(b64, `${job.id}-${job.floorRender}`);
        out.pass0 = {
          builder: ctx.builder.name,
          sheetType: ctx.sheetType,
          scaleString: ctx.scaleString,
          studHeightMm: ctx.studHeightMm,
          livingAreaM2: ctx.livingAreaM2,
          perimeterM: ctx.perimeterM,
        };

        // Geometry (pinned to the floor-plan page) — perimeter/floor + vector layer.
        out.geometry = await geometry(DIR, job.floorPdf, 0);
        const vector = out.geometry.vector_annotations ?? null;
        out.vector_annotations = vector;

        // Vision openings → classify → no-schedule vector overrides (same seam as Harrison).
        const rawAnn = await extractAnnotations(b64, ctx);
        out.raw_window_annotations = rawAnn.openingAnnotations.length;
        out.raw_internal_door_annotations = rawAnn.internalDoorAnnotations.length;
        out.raw_garage_door_annotations = rawAnn.garageDoorAnnotations;

        const takeoff = classifyAnnotations(rawAnn, ctx);
        out.vision_garage_size = takeoff.garage_door_size;
        out.vision_window_count = takeoff.window_count;

        const takeoffVec = preferVectorGarage(takeoff, vector);
        const agg = aggregateWindows(null, takeoffVec.windows_by_room);
        let finalTakeoff = applyWindowAggregate(takeoffVec, agg);
        finalTakeoff = preferVectorOpenings(finalTakeoff, vector);
        out.opening_widths = resolveOpeningWidths(visionOpeningWidthsMm(finalTakeoff), vector);
        finalTakeoff = preferVectorEntrance(finalTakeoff, vector);

        out.window_source = agg.source;
        out.takeoff = finalTakeoff;

        const path = resolve(RENDER, "diag-results.json");
        writeFileSync(path, JSON.stringify(out, null, 2));
        console.log(`DIAG_WRITTEN_${job.id}=` + path);

        // Read-only: only assert a takeoff landed. No grading here.
        expect(out.takeoff).not.toBeNull();
        expect(out.takeoff.window_count == null || typeof out.takeoff.window_count === "number").toBe(true);
        expect(existsSync(path)).toBe(true);
      },
      600000,
    );
  }
});
