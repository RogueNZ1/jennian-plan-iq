// @vitest-environment node
/**
 * Beddis baseline accuracy run (job 26001, 20 Tukere Crescent).
 *
 * MEASUREMENT ONLY — no data-logic fixes. Runs the real concept pipeline
 * (recognisePlan → extractAnnotations → classifyAnnotations) plus the local
 * geometry service against the Beddis prelim and concept plans, and dumps every
 * QS-relevant quantity so it can be scored against tests/fixtures/beddis/ground-truth.json.
 *
 * Page images are pre-rendered by poppler into tests/fixtures/beddis/_render/
 * (mirrors production renderPageForAnalysis: one page → 1400px-wide JPEG → AI).
 *
 * Gated: BEDDIS_LIVE=1 (real Anthropic calls + geometry on :8000).
 *   BEDDIS_LIVE=1 npx vitest run tests/beddis/baseline.test.ts
 */
import { describe, it, beforeAll, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "../phase1/pipeline";
import { recognisePlan } from "../../src/lib/takeoff/recognise-plan";
import { extractAnnotations } from "../../src/lib/takeoff/extract-annotations";
import { classifyAnnotations } from "../../src/lib/takeoff/classify-annotations";
import type { PlanContext } from "../../src/lib/takeoff/plan-context";
import {
  classifyText,
  scoreFor,
  pickPrimaryFloorplan,
  type ScoredPage,
} from "../../src/lib/pdf-page-classify";

const DIR = resolve(process.cwd(), "tests/fixtures/beddis");
const RENDER = resolve(DIR, "_render");
const PAGETEXT = resolve(DIR, "_pagetext");
const GEOMETRY_BASE = process.env.GEOMETRY_BASE ?? "http://localhost:8000";
const RUN = !!process.env.BEDDIS_LIVE;

const b64 = (p: string) => readFileSync(resolve(RENDER, p)).toString("base64");

async function geometry(pdf: string) {
  const buf = readFileSync(resolve(DIR, pdf));
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), pdf);
  const res = await fetch(`${GEOMETRY_BASE}/measure`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`geometry ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

const ctxSummary = (c: PlanContext) => ({
  builder: c.builder.name,
  sheetType: c.sheetType,
  scaleString: c.scaleString,
  scaleFactor: c.scaleFactor,
  dimensionFormat: c.dimensionFormat,
  studHeightMm: c.studHeightMm,
  studHeightSource: c.studHeightSource,
  livingAreaM2: c.livingAreaM2,
  perimeterM: c.perimeterM,
});

/**
 * Production page selection (Phase 2a): classify each page from its PDF text
 * layer via the real classifyText, score it, and let pickPrimaryFloorplan choose —
 * exactly what analyzePdfPages → pickPrimaryFloorplan does in upload.tsx, minus the
 * thumbnail render. Replaces the old Pass-0 sheetType + pref() heuristic, which was
 * a harness artifact that picked the dimensions-only overlay and nulled the takeoff.
 */
const pageText = (p: string) => readFileSync(resolve(PAGETEXT, p), "utf8");
const scoreFromText = (text: string): ScoredPage => {
  const dimHits = (text.match(/\b\d{2,5}\b/g) ?? []).length;
  const { type, confidence } = classifyText(text, dimHits);
  return { pageType: type, confidence, score: scoreFor(type, confidence) };
};

describe.skipIf(!RUN)("Beddis baseline (job 26001)", () => {
  beforeAll(() => loadEnvLocal());

  it("runs the full pipeline on prelim + concept and dumps a scorecard", async () => {
    const out: any = { generatedAt: new Date().toISOString(), prelim: {}, concept: {} };

    // ── PRELIM: Pass 0 on every page → see how the pipeline handles a multi-page set
    const prelimPages = [1, 2, 3, 4, 5, 6, 7];
    const pass0: Array<{ page: number } & ReturnType<typeof ctxSummary>> = [];
    const ctxByPage: Record<number, PlanContext> = {};
    for (const p of prelimPages) {
      const ctx = await recognisePlan(b64(`prelim-${p}.jpg`), `prelim-p${p}.jpg`);
      ctxByPage[p] = ctx;
      pass0.push({ page: p, ...ctxSummary(ctx) });
    }
    out.prelim.pass0_by_page = pass0;

    // Production page selection (Phase 2a): classify each page from its text layer
    // and let pickPrimaryFloorplan choose — the same path upload.tsx runs.
    const scoredPages = prelimPages.map((p) => scoreFromText(pageText(`prelim-${p}.txt`)));
    out.prelim.page_classes = prelimPages.map((p, i) => ({
      page: p,
      type: scoredPages[i].pageType,
      confidence: scoredPages[i].confidence,
      score: scoredPages[i].score,
    }));
    const pick = pickPrimaryFloorplan(scoredPages);
    out.prelim.selected = pick ? { page: prelimPages[pick.index], certainty: pick.certainty } : null;

    if (pick) {
      const page = prelimPages[pick.index];
      const ctx = ctxByPage[page];
      const rawAnn = await extractAnnotations(b64(`prelim-${page}.jpg`), ctx);
      const takeoff = classifyAnnotations(rawAnn, ctx);
      out.prelim.chosen_page = page;
      out.prelim.takeoff = takeoff;
      out.prelim.raw_window_annotations = rawAnn.openingAnnotations.length;
      out.prelim.raw_internal_door_annotations = rawAnn.internalDoorAnnotations.length;
      out.prelim.raw_garage_door_annotations = rawAnn.garageDoorAnnotations;
    } else {
      out.prelim.chosen_page = null;
      out.prelim.takeoff = null;
    }
    out.prelim.geometry = await geometry("prelim.pdf");

    // ── CONCEPT: single page floor plan
    const cctx = await recognisePlan(b64("concept-1.jpg"), "concept-1.jpg");
    out.concept.pass0 = ctxSummary(cctx);
    if (cctx.sheetType === "floor_plan" || cctx.sheetType === "dimension_plan") {
      const rawAnn = await extractAnnotations(b64("concept-1.jpg"), cctx);
      const takeoff = classifyAnnotations(rawAnn, cctx);
      out.concept.takeoff = takeoff;
      out.concept.raw_window_annotations = rawAnn.openingAnnotations.length;
      out.concept.raw_internal_door_annotations = rawAnn.internalDoorAnnotations.length;
      out.concept.raw_garage_door_annotations = rawAnn.garageDoorAnnotations;
    } else {
      out.concept.takeoff = null;
    }
    out.concept.geometry = await geometry("concept-floorplan.pdf");

    const path = resolve(RENDER, "baseline-results.json");
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log("BEDDIS_BASELINE_WRITTEN=" + path);
    console.log("BEDDIS_RESULTS=" + JSON.stringify(out));
    expect(existsSync(path)).toBe(true);

    // ── Phase 2a definition of done ───────────────────────────────────────────
    // Production page selection now picks the real floor plan (prelim page 3),
    // not the dimensions-only overlay (page 4). The prelim AI takeoff must read
    // the floor plan and return non-null core values instead of an empty page.
    expect(out.prelim.selected).not.toBeNull();
    expect(out.prelim.chosen_page).toBe(3);
    expect(out.prelim.takeoff.floor_area_m2).not.toBeNull();
    expect(out.prelim.takeoff.external_wall_lm).not.toBeNull();
  }, 600000);
});
