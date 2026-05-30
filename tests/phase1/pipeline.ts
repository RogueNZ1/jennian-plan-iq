/**
 * Phase 1 reproducibility harness — shared helpers.
 *
 * Drives the concept pipeline's AI passes (recognisePlan → extractAnnotations →
 * classifyAnnotations) plus the local geometry service, and normalises the output
 * for deterministic comparison. Used by both the live 3-run harness
 * (live-runs.test.ts) and the offline cached-replay test (replay.test.ts).
 *
 * Canonical plan substitution: JM-0003's source PDF is not available locally, so
 * mcalevey.pdf (the on-disk geometry validation fixture) is the canonical harness
 * plan. Recorded here and in FIX_LOG.md.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PlanContext } from "../../src/lib/takeoff/plan-context";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";
import type { GeometryApiResult } from "../../src/lib/takeoff/geometry-api";

export const ROOT = process.cwd();
export const FIXTURES = resolve(ROOT, "tests/phase1/__fixtures__");
export const CANONICAL_PDF = resolve(ROOT, "tests/e2e/fixtures/mcalevey.pdf");
export const IMAGE_B64_PATH = resolve(FIXTURES, "mcalevey.page1.b64.txt");
export const GOLDEN_PATH = resolve(FIXTURES, "mcalevey.golden.json");
export const REPLAY_PATH = resolve(FIXTURES, "mcalevey.replay.json");

export const SUBSTITUTION_NOTE =
  "Canonical harness plan: JM-0003 source PDF unavailable locally; substituted " +
  "mcalevey.pdf (on-disk geometry validation fixture). See FIX_LOG.md.";

const GEOMETRY_BASE = process.env.GEOMETRY_BASE ?? "http://localhost:8000";

export function loadImageB64(): string {
  return readFileSync(IMAGE_B64_PATH, "utf8").trim();
}

/** Populate process.env from .env.local for keys not already set (server-side). */
export function loadEnvLocal(): void {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export async function runGeometry(pdfPath = CANONICAL_PDF): Promise<GeometryApiResult> {
  const buf = readFileSync(pdfPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), "mcalevey.pdf");
  const res = await fetch(`${GEOMETRY_BASE}/measure`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`geometry ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as GeometryApiResult;
  if (!data.success) throw new Error("geometry returned success=false");
  return data;
}

const r2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100);

/** Normalised, comparable view of the AI-derived pipeline output (replayable offline). */
export function normalizePipeline(planContext: PlanContext, takeoffData: TakeoffData) {
  return {
    planContext: {
      builder: planContext.builder.name,
      scaleString: planContext.scaleString,
      scaleFactor: planContext.scaleFactor,
      dimensionFormat: planContext.dimensionFormat,
      dimensionFormatSource: planContext.dimensionFormatSource,
      studHeightMm: planContext.studHeightMm,
      sheetType: planContext.sheetType,
      livingAreaM2: planContext.livingAreaM2,
      perimeterM: planContext.perimeterM,
    },
    takeoff: takeoffData,
  };
}

/** The QS-relevant quantities the audit (§4) showed drifting across runs of JM-0003. */
export function buildRecord(takeoffData: TakeoffData, geometry: GeometryApiResult) {
  const m = geometry.measurements;
  return {
    floor_area_m2: r2(m.floor_area_m2),
    perimeter_m: r2(m.perimeter_m),
    external_wall_length_m: r2(m.external_wall_length_m),
    internal_wall_length_m: r2(m.internal_wall_length_m),
    window_count: takeoffData.window_count,
    internal_door_count: takeoffData.internal_door_count,
    garage_door_size: takeoffData.garage_door_size,
    roof_area_m2: r2(takeoffData.roof_area_m2),
  };
}
