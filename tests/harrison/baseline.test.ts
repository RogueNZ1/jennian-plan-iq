// @vitest-environment node
/**
 * Harrison baseline accuracy run (job 25191, Lot 9 Feilding) — validation set #2.
 *
 * MEASUREMENT ONLY — no data-logic fixes. Runs the real concept pipeline
 * (recognisePlan → extractAnnotations → classifyAnnotations) plus the local
 * geometry service against the Harrison concept rev 4 (6-page) set, and dumps every
 * QS-relevant quantity so it can be scored against tests/fixtures/harrison/ground-truth.json.
 *
 * What this set exercises that Beddis could not:
 *  - NO separate window-schedule page → the no-schedule fallback path
 *    (aggregateWindows(null, …) → source "floor_plan_callouts"). Windows are the
 *    floor-plan callouts W01–W14.
 *  - A newer Jennian drawing template (project 25191, A101–A302) → page
 *    classification + extraction must generalise beyond the one Beddis template.
 *  - Garage door reads 2150×4800 (Beddis was 2210×4800) → tolerant 2.0–2.4m band.
 *
 * Answer key = the QS, always (ground-truth.json). Primary input = concept rev 4.
 * Page images are pre-rendered by poppler into tests/fixtures/harrison/_render/
 * (see tests/fixtures/harrison/README.md). Page text → _pagetext/.
 *
 * Gated: HARRISON_LIVE=1 (real Anthropic calls + geometry on :8000).
 *   HARRISON_LIVE=1 npx vitest run tests/harrison/baseline.test.ts
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
  pickWindowSchedule,
  type ScoredPage,
} from "../../src/lib/pdf-page-classify";
import { aggregateWindows, applyWindowAggregate } from "../../src/lib/takeoff/aggregate-windows";
import { resolveGeometryPageIndex, reconcileGeometryPage } from "../../src/lib/takeoff/page-of-truth";
import {
  preferVectorGarage,
  preferVectorOpenings,
  resolveOpeningWidths,
  visionOpeningWidthsMm,
} from "../../src/lib/takeoff/vector-annotations";

const DIR = resolve(process.cwd(), "tests/fixtures/harrison");
const RENDER = resolve(DIR, "_render");
const PAGETEXT = resolve(DIR, "_pagetext");
const GEOMETRY_BASE = process.env.GEOMETRY_BASE ?? "http://localhost:8000";
const RUN = !!process.env.HARRISON_LIVE;

const TRUTH = JSON.parse(readFileSync(resolve(DIR, "ground-truth.json"), "utf8")).truth as Record<
  string,
  any
>;

const b64 = (p: string) => readFileSync(resolve(RENDER, p)).toString("base64");

async function geometry(pdf: string, page?: number) {
  const buf = readFileSync(resolve(DIR, pdf));
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), pdf);
  // Phase 3 — pin geometry to the AI-classified floor-plan page (0-based) when provided,
  // mirroring upload.tsx's measurePlanGeometry(planFile, name, geometryPageIndex).
  const url = page != null && page >= 0 ? `${GEOMETRY_BASE}/measure?page=${page}` : `${GEOMETRY_BASE}/measure`;
  const res = await fetch(url, { method: "POST", body: form });
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

const pageText = (p: string) => readFileSync(resolve(PAGETEXT, p), "utf8");
const scoreFromText = (text: string): ScoredPage => {
  const dimHits = (text.match(/\b\d{2,5}\b/g) ?? []).length;
  const { type, confidence } = classifyText(text, dimHits);
  return { pageType: type, confidence, score: scoreFor(type, confidence) };
};

const delta = (got: number | null, truth: number) =>
  got === null ? null : Number((got - truth).toFixed(2));

describe.skipIf(!RUN)("Harrison baseline (job 25191)", () => {
  beforeAll(() => loadEnvLocal());

  it("runs the full pipeline on concept rev 4 and dumps a scorecard", async () => {
    const out: any = { generatedAt: new Date().toISOString(), concept: {} };

    // ── CONCEPT rev 4: 6-page set. Pass 0 on every page, then production page
    // selection picks the real floor plan from the text layer — same path as
    // upload.tsx (analyzePdfPages → pickPrimaryFloorplan).
    const pages = [1, 2, 3, 4, 5, 6];
    const pass0: Array<{ page: number } & ReturnType<typeof ctxSummary>> = [];
    const ctxByPage: Record<number, PlanContext> = {};
    for (const p of pages) {
      const ctx = await recognisePlan(b64(`concept-${p}.jpg`), `concept-p${p}.jpg`);
      ctxByPage[p] = ctx;
      pass0.push({ page: p, ...ctxSummary(ctx) });
    }
    out.concept.pass0_by_page = pass0;

    const scoredPages = pages.map((p) => scoreFromText(pageText(`concept-${p}.txt`)));
    out.concept.page_classes = pages.map((p, i) => ({
      page: p,
      type: scoredPages[i].pageType,
      confidence: scoredPages[i].confidence,
      score: scoredPages[i].score,
    }));
    const pick = pickPrimaryFloorplan(scoredPages);
    out.concept.selected = pick ? { page: pages[pick.index], certainty: pick.certainty } : null;

    // Harrison has NO Door & Window Schedule. Record what (if anything) the schedule
    // picker thinks it found — we expect nothing — but the canonical window set comes
    // from the floor-plan callouts via the no-schedule fallback path.
    const schedPick = pickWindowSchedule(scoredPages);
    out.concept.schedule_page = schedPick ? pages[schedPick.index] : null;

    // ── Phase 3: page-of-truth — this is the run that exposed the bug. Geometry,
    // left to auto-detect, measured the site plan while the AI selected the A201 floor
    // plan. Now pin geometry to the AI-classified floor-plan page and record the
    // reconciliation (requested page vs geometry's page_used). Fetched here (before the
    // takeoff seam) so the Phase 4 vector_annotations feed the garage override.
    const conceptGeomPage = resolveGeometryPageIndex(pick ? pick.index : null, pages.map((n) => ({ pageNumber: n })));
    out.concept.geometry = await geometry("concept.pdf", conceptGeomPage);
    out.concept.geometry_page_requested = conceptGeomPage ?? null;
    out.concept.page_reconciliation = reconcileGeometryPage(conceptGeomPage, out.concept.geometry.page_used);
    const conceptVector = out.concept.geometry.vector_annotations;
    out.concept.vector_annotations = conceptVector ?? null;

    if (pick) {
      const page = pages[pick.index];
      const ctx = ctxByPage[page];
      const rawAnn = await extractAnnotations(b64(`concept-${page}.jpg`), ctx);
      const takeoff = classifyAnnotations(rawAnn, ctx);

      // ── Phase 4, Slice 1: prefer the deterministic vector garage width (the dim-pair
      // the engine read nearest a /garage/i label) over the vision annotation. Harrison
      // has no schedule, so only the garage field is hybridised here; falls back to
      // vision when the vector layer is absent/unusable.
      const takeoffVec = preferVectorGarage(takeoff, conceptVector);

      // No-schedule fallback: reconcile against a null schedule so the source is
      // recorded as "floor_plan_callouts". Windows come only from the W-code callouts.
      const agg = aggregateWindows(null, takeoffVec.windows_by_room);
      let finalTakeoff = applyWindowAggregate(takeoffVec, agg);

      // ── Phase 4, Slice 2: prefer the deterministic vector window COUNT. Harrison has
      // NO schedule, so the only vector count is the floor-plan W-codes (W01…W14). Also
      // resolve the opening WIDTHS off the vector layer (parsed via the shared
      // parseDimsMm). Ext-wall area stays gated on heights and is NOT recomputed.
      finalTakeoff = preferVectorOpenings(finalTakeoff, conceptVector);
      out.concept.opening_widths = resolveOpeningWidths(visionOpeningWidthsMm(finalTakeoff), conceptVector);

      out.concept.chosen_page = page;
      out.concept.raw_window_annotations = rawAnn.openingAnnotations.length;
      out.concept.raw_internal_door_annotations = rawAnn.internalDoorAnnotations.length;
      out.concept.raw_garage_door_annotations = rawAnn.garageDoorAnnotations;
      out.concept.takeoff = finalTakeoff;
      out.concept.window_source = agg.source;
    } else {
      out.concept.chosen_page = null;
      out.concept.takeoff = null;
      out.concept.window_source = null;
    }

    // Scorecard: deltas vs the QS answer key (report — not all are hard-asserted,
    // since the QS, not any plan's printed number, is truth and some values are AI-read).
    const t = out.concept.takeoff;
    out.concept.scorecard = t && {
      floor_area_m2: { got: t.floor_area_m2, truth: TRUTH.floor_area_m2, delta: delta(t.floor_area_m2, TRUTH.floor_area_m2) },
      external_wall_lm: { got: t.external_wall_lm, truth_perimeter_m: TRUTH.perimeter_m },
      // Derived (Phase 2d). ext wall area = perimeter × stud − openings (QS D21);
      // total area = floor + alfresco (QS D14). Reported with deltas — inherits the
      // opening/alfresco extraction, so not hard-asserted to the QS figure.
      external_wall_area_m2: { got: t.external_wall_area_m2 ?? null, truth: TRUTH.external_wall_area_m2, delta: delta(t.external_wall_area_m2 ?? null, TRUTH.external_wall_area_m2) },
      total_area_m2: { got: t.total_area_m2 ?? null, truth: TRUTH.total_area_m2, delta: delta(t.total_area_m2 ?? null, TRUTH.total_area_m2) },
      window_count: { got: t.window_count, truth_plan_callouts: TRUTH.window_count_plan_callouts, windows_proper: TRUTH.windows_proper_count },
      garage_door_size: { got: t.garage_door_size, truth: `${TRUTH.garage_door.width_m}×${TRUTH.garage_door.height_m}` },
      internal_door_count: { got: t.internal_door_count, truth_standard: TRUTH.interior_doors.standard, note: "plan may show doubles (2/710, 2/610); QS simplified to 7/0/0 — report, do not tune" },
    };

    // ── SECONDARY (report-only): earlier 08.12.25 revision, run only if present.
    // perimeter 59.89 ≠ QS 60.4 — revision-robustness check, NOT graded vs QS.
    if (existsSync(resolve(DIR, "floorplan-0812.pdf"))) {
      out.rev0812 = { geometry: await geometry("floorplan-0812.pdf") };
    }

    const path = resolve(RENDER, "baseline-results.json");
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log("HARRISON_BASELINE_WRITTEN=" + path);
    console.log("HARRISON_RESULTS=" + JSON.stringify(out));
    expect(existsSync(path)).toBe(true);

    // ── Definition of done ────────────────────────────────────────────────────
    // Page selection picks a real floor plan from the newer template, and the AI
    // takeoff returns non-null core values (not an empty/overlay page).
    expect(out.concept.selected).not.toBeNull();
    expect(out.concept.takeoff).not.toBeNull();
    expect(out.concept.takeoff.floor_area_m2).not.toBeNull();
    expect(out.concept.takeoff.external_wall_lm).not.toBeNull();

    // ── Phase 3 definition of done (page-of-truth reconciliation) ─────────────
    // Geometry no longer silently measures the site plan: it is pinned to the AI's
    // floor-plan page and the two layers resolve to the SAME page. The AI floor-plan
    // page (selected) and geometry's page_used must match (0-based = selected − 1).
    expect(out.concept.geometry_page_requested).toBe(out.concept.selected.page - 1);
    expect(out.concept.geometry.page_used).toBe(out.concept.selected.page - 1);
    expect(out.concept.page_reconciliation.agreed).toBe(true);

    // No-schedule path: there is no A501 schedule, so windows must come from the
    // floor-plan callouts. (Records the path Beddis could not exercise.)
    expect(out.concept.window_source).toBe("floor_plan_callouts");
    expect(out.concept.takeoff.window_count).not.toBeNull();

    // Garage door: 2150×4800 must still classify to the QS double-garage size 4.8×2.1
    // (tolerant 2.0–2.4m height band; 2150 ∈ [2000,2400]).
    expect(out.concept.takeoff.garage_door_size).toBe("4.8×2.1");

    // ── Phase 4, Slice 1 definition of done (vector-first hybrid) ──────────────
    // The engine reads the garage dim-pair (2,150 × 4,800) nearest the /garage/i label
    // deterministically — the 2710 vision flake is gone — and resolves the 4.8m double
    // garage. Harrison carries NO Door & Window Schedule, so the schedule field is null
    // (the safeguard simply never fires) — proving the no-schedule path is unaffected.
    expect(out.concept.vector_annotations).not.toBeNull();
    expect(out.concept.vector_annotations.vector_usable).toBe(true);
    expect(out.concept.vector_annotations.garage).not.toBeNull();
    expect(out.concept.vector_annotations.garage.width_mm).toBe(4800);
    expect(out.concept.vector_annotations.schedule).toBeNull();

    // ── Phase 4, Slice 2 definition of done (vector widths + counts, ungated) ──
    // No schedule → the ONLY vector window count is the floor-plan W-codes (W01…W14),
    // and it is preferred over the vision callout count. Opening widths are read off the
    // vector layer deterministically (parsed via the shared parseDimsMm) and include the
    // 4.8m double garage. This proves the no-schedule template on the same seam. Ext-wall
    // area stays gated on per-window heights (a later slice) and is not resolved here.
    expect(out.concept.vector_annotations.openings).not.toBeNull();
    expect(out.concept.vector_annotations.openings.window_count).toBeGreaterThanOrEqual(13);
    expect(out.concept.vector_annotations.openings.datum_mm).toBeGreaterThanOrEqual(1500);
    expect(out.concept.vector_annotations.openings.widths_raw.length).toBeGreaterThan(0);
    // Window count is the vector-preferred floor-plan W-code count.
    expect(out.concept.takeoff.window_count).toBe(out.concept.vector_annotations.openings.window_count);
    expect(out.concept.window_source).toBe("floor_plan_callouts"); // source label unchanged
    expect(out.concept.opening_widths.source).toBe("vector");
    expect(out.concept.opening_widths.preferred_vector).toBe(true);
    expect(out.concept.opening_widths.widths_mm.length).toBe(
      out.concept.vector_annotations.openings.widths_raw.length,
    );
    expect(out.concept.opening_widths.widths_mm).toContain(4800);
  }, 600000);
});
