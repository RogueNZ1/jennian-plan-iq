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
  pickWindowSchedule,
  type ScoredPage,
} from "../../src/lib/pdf-page-classify";
import { readWindowSchedule } from "../../src/lib/takeoff/extract-window-schedule";
import { aggregateWindows, applyWindowAggregate } from "../../src/lib/takeoff/aggregate-windows";
import {
  resolveGeometryPageIndex,
  reconcileGeometryPage,
} from "../../src/lib/takeoff/page-of-truth";
import {
  preferVectorGarage,
  safeguardScheduleHeights,
  headDatumSafeguardNote,
  preferVectorOpenings,
  resolveOpeningWidths,
  visionOpeningWidthsMm,
  preferVectorEntrance,
  entranceAssumptionNote,
} from "../../src/lib/takeoff/vector-annotations";
import { reconcileVectorVision } from "../../src/lib/takeoff/reconcile-annotations";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import { unwrapTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import { runDoorEngine } from "../../src/lib/doors/run-doors";

const DIR = resolve(process.cwd(), "tests/fixtures/beddis");
const RENDER = resolve(DIR, "_render");
const PAGETEXT = resolve(DIR, "_pagetext");
const GEOMETRY_BASE = process.env.GEOMETRY_BASE ?? "http://localhost:8000";
const RUN = !!process.env.BEDDIS_LIVE;

const GROUND_TRUTH = JSON.parse(readFileSync(resolve(DIR, "ground-truth.json"), "utf8")) as {
  truth: Record<string, number>;
  joinery_bench: { derived: Record<string, number> };
};
const TRUTH = GROUND_TRUTH.truth;
const JOINERY_TRUTH = GROUND_TRUTH.joinery_bench.derived;

const b64 = (p: string) => readFileSync(resolve(RENDER, p)).toString("base64");

async function geometry(pdf: string, page?: number) {
  const buf = readFileSync(resolve(DIR, pdf));
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), pdf);
  // Phase 3 — pin geometry to the AI-classified floor-plan page (0-based) when provided,
  // mirroring upload.tsx's measurePlanGeometry(planFile, name, geometryPageIndex).
  const url =
    page != null && page >= 0
      ? `${GEOMETRY_BASE}/measure?page=${page}`
      : `${GEOMETRY_BASE}/measure`;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
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
    out.prelim.selected = pick
      ? { page: prelimPages[pick.index], certainty: pick.certainty }
      : null;

    // ── Phase 3: page-of-truth — pin geometry to the AI-classified floor-plan page
    // (resolveGeometryPageIndex) instead of letting it auto-detect (which could land on
    // the site plan). Record the reconciliation: requested page vs geometry's page_used.
    // Fetched here (before the takeoff seam) so the Phase 4 vector_annotations are in
    // scope to feed the garage override + head-datum safeguard, mirroring upload.tsx.
    const prelimGeomPage = resolveGeometryPageIndex(
      pick ? pick.index : null,
      prelimPages.map((n) => ({ pageNumber: n })),
    );
    out.prelim.geometry = await geometry("prelim.pdf", prelimGeomPage);
    out.prelim.geometry_page_requested = prelimGeomPage ?? null;
    out.prelim.page_reconciliation = reconcileGeometryPage(
      prelimGeomPage,
      out.prelim.geometry.page_used,
    );
    const prelimVector = out.prelim.geometry.vector_annotations;
    out.prelim.vector_annotations = prelimVector ?? null;

    if (pick) {
      const page = prelimPages[pick.index];
      const ctx = ctxByPage[page];
      const rawAnn = await extractAnnotations(b64(`prelim-${page}.jpg`), ctx);
      const takeoff = classifyAnnotations(rawAnn, ctx);
      out.prelim.chosen_page = page;
      out.prelim.raw_window_annotations = rawAnn.openingAnnotations.length;
      out.prelim.raw_internal_door_annotations = rawAnn.internalDoorAnnotations.length;
      out.prelim.raw_garage_door_annotations = rawAnn.garageDoorAnnotations;

      // F-022 — capture the VISION garage size before the vector override cross-checks it.
      const visionGarageSize = takeoff.garage_door_size;

      // ── Phase 4, Slice 1: prefer the deterministic vector garage width (the dim-pair
      // the engine read nearest a /garage/i label) over the vision annotation; falls
      // back to vision when the vector layer is absent/unusable.
      const takeoffVec = preferVectorGarage(takeoff, prelimVector);

      // ── Phase 2b: read the Door & Window Schedule as an *additional* window
      // source, then reconcile (schedule wins the canonical window set). The
      // primary floor plan above is untouched — this only supplies windows.
      const schedPick = pickWindowSchedule(scoredPages);
      const scheduleRaw = schedPick
        ? await readWindowSchedule(b64(`prelim-${prelimPages[schedPick.index]}.jpg`), {
            apiKey: process.env.ANTHROPIC_API_KEY!,
            builderName: ctx.builder.name,
          })
        : null;

      // ── Phase 4, Slice 1: head-datum safeguard — reject any schedule window height
      // read AS the engine-detected head/mounting datum (the Phase-2f over-read). Never
      // fabricates a height; a rejected height becomes null and is flagged in the notes.
      const scheduleSafeguard = safeguardScheduleHeights(scheduleRaw, prelimVector);
      const schedule = scheduleSafeguard.schedule;

      const agg = aggregateWindows(schedule, takeoffVec.windows_by_room);
      let finalTakeoff = applyWindowAggregate(takeoffVec, agg);

      // ── Phase 4, Slice 2: prefer the deterministic vector window COUNT (the schedule
      // W-codes) over the vision count, and resolve the opening WIDTHS multiset from the
      // vector layer (each width parsed through the shared parseDimsMm). Ext-wall area is
      // NOT recomputed — it stays gated on the per-window heights (still unresolved).
      // F-022 — capture the VISION window count before preferVectorOpenings overrides it.
      const visionWindowCount = finalTakeoff.window_count;
      finalTakeoff = preferVectorOpenings(finalTakeoff, prelimVector);
      out.prelim.opening_widths = resolveOpeningWidths(
        visionOpeningWidthsMm(finalTakeoff),
        prelimVector,
      );

      // ── Phase 4, Slice 3: fold the ASSERTED entrance door into the opening set
      // (windows_by_room.entrance). HEIGHT is the building standard 2.1m (asserted, not
      // measured); WIDTH is the printed frame-to-frame number when the engine read one,
      // else the entry-door standard 1.4m. Ext-wall area is NOT recomputed — it stays
      // gated on the per-window heights. Capture the VISION entry-door width (if any)
      // before the override so F-022 can cross-check it.
      const visionEntranceWidthMm =
        finalTakeoff.windows_by_room?.entrance?.width_m != null
          ? Math.round(finalTakeoff.windows_by_room.entrance.width_m * 1000)
          : null;
      finalTakeoff = preferVectorEntrance(finalTakeoff, prelimVector);
      const entranceNote = entranceAssumptionNote(prelimVector);
      if (entranceNote) {
        finalTakeoff = {
          ...finalTakeoff,
          notes: [finalTakeoff.notes, entranceNote].filter(Boolean).join(" "),
        };
      }

      const safeguardNote = headDatumSafeguardNote(scheduleSafeguard);
      if (safeguardNote) {
        finalTakeoff = {
          ...finalTakeoff,
          notes: [finalTakeoff.notes, safeguardNote].filter(Boolean).join(" "),
        };
      }

      // ── F-022: vector ↔ vision cross-check. Beddis is the TRUE NEGATIVE — vision and
      // vector agree on the 4.8m garage and 13 windows, so reconciliation must flag
      // NOTHING (no false positive). The note rides on takeoff.notes when it fires.
      const reconciliation = reconcileVectorVision(
        visionGarageSize,
        visionWindowCount,
        prelimVector,
        visionEntranceWidthMm,
      );
      if (reconciliation.note) {
        finalTakeoff = {
          ...finalTakeoff,
          notes: [finalTakeoff.notes, reconciliation.note].filter(Boolean).join(" "),
        };
      }
      out.prelim.reconciliation = reconciliation;
      out.prelim.entrance = finalTakeoff.windows_by_room?.entrance ?? null;

      // ── Convergence Slice 3: the SHARED composeTakeoff seam (the exact function run.ts
      // and /upload both call) on the same page-pinned inputs. The inline seam above keeps
      // the VISION floor/perimeter; composeTakeoff additionally applies the geometry
      // override (the true Pipeline B behaviour), so its measurement fields come from the
      // geometry engine. Asserted against the Beddis scorecard in the DoD below.
      const doorEngine = await runDoorEngine(
        readFileSync(resolve(DIR, "prelim.pdf")),
        prelimGeomPage + 1,
        out.prelim.geometry.scale?.string ?? "1:100 @ A3",
      );
      const composed = composeTakeoff({
        visionTakeoff: takeoff,
        geometry: out.prelim.geometry,
        schedule: scheduleRaw,
        geometryPageIndex: prelimGeomPage,
        doorEngine,
      });
      out.prelim.composed = composed.enriched;
      out.prelim.composed_bare = unwrapTakeoff(composed.enriched);

      out.prelim.takeoff = finalTakeoff;
      out.prelim.schedule_page = schedPick ? prelimPages[schedPick.index] : null;
      out.prelim.window_source = agg.source;
      out.prelim.schedule_windows = scheduleRaw?.windows ?? null;
      out.prelim.head_datum_flagged = scheduleSafeguard.flaggedIds;
    } else {
      out.prelim.chosen_page = null;
      out.prelim.takeoff = null;
    }

    // ── CONCEPT: single page floor plan
    const cctx = await recognisePlan(b64("concept-1.jpg"), "concept-1.jpg");
    out.concept.pass0 = ctxSummary(cctx);
    if (cctx.sheetType === "floor_plan" || cctx.sheetType === "dimension_plan") {
      const rawAnn = await extractAnnotations(b64("concept-1.jpg"), cctx);
      const takeoff = classifyAnnotations(rawAnn, cctx);
      // Concept is the earlier 3-PDF set with NO A501 schedule → windows come
      // only from floor-plan callouts. Reconcile with a null schedule so the
      // source is recorded; do NOT expect 13 here.
      const agg = aggregateWindows(null, takeoff.windows_by_room);
      out.concept.takeoff = applyWindowAggregate(takeoff, agg);
      out.concept.window_source = agg.source;
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

    // ── Phase 3 definition of done (page-of-truth reconciliation) ─────────────
    // Geometry now measures the SAME page the AI classified as the floor plan
    // (chosen_page 3 → geometry 0-based index 2), and the two layers agree. Floor
    // 165.4 / perimeter 63.8 come from that agreed page — no regression.
    expect(out.prelim.geometry_page_requested).toBe(out.prelim.chosen_page - 1);
    expect(out.prelim.geometry.page_used).toBe(out.prelim.chosen_page - 1);
    expect(out.prelim.page_reconciliation.agreed).toBe(true);
    expect(out.prelim.geometry.measurements.floor_area_m2).toBe(165.4);
    expect(out.prelim.geometry.measurements.perimeter_m).toBe(63.8);

    // ── Phase 2b definition of done ───────────────────────────────────────────
    // The Door & Window Schedule (prelim page 7 / A501) is recognised as its own
    // page type and read as the canonical window set. The prelim takeoff must
    // report the full 13 windows (W01–W13), each with H × W, sourced from the
    // schedule — not the short/incomplete floor-plan callout count.
    expect(out.prelim.schedule_page).toBe(7);
    expect(out.prelim.window_source).toBe("schedule");
    expect(out.prelim.takeoff.window_count).toBe(13);
    expect(out.prelim.takeoff.windows_schedule).not.toBeNull();
    expect(out.prelim.takeoff.windows_schedule.length).toBe(13);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
    const ids = out.prelim.takeoff.windows_schedule.map((w: any) => w.id);
    for (let n = 1; n <= 13; n++) {
      expect(ids).toContain("W" + String(n).padStart(2, "0"));
    }
    // Every window has a width. Heights may be unresolved by the head-datum safeguard
    // as an intermediate honesty rail, but the acceptance contract is the QS-priced
    // aggregate below, not preserving null heights as the desired final state.
    const flagged: string[] = out.prelim.head_datum_flagged ?? [];
    for (const w of out.prelim.takeoff.windows_schedule) {
      expect(w.width_m).not.toBeNull();
      if (!flagged.includes(w.id)) {
        expect(w.height_m).not.toBeNull();
      }
    }

    // ── Phase 2c definition of done ───────────────────────────────────────────
    // The garage door now classifies by the height+width combination instead of
    // falling through unparsed. Beddis reads "2,210 x 4,800" (double garage) and
    // must map to the QS double-garage size 4.8×2.1 — matching the answer key.
    expect(out.prelim.takeoff.garage_door_size).toBe("4.8×2.1");

    // ── Phase 4, Slice 1 definition of done (vector-first hybrid) ──────────────
    // The geometry engine now surfaces two deterministic vector reads on the
    // floor-plan page. (1) The garage dim-pair nearest the /garage/i label resolves
    // to the 4.8m double-garage width — deterministically, no vision flake. (2) The
    // Door & Window Schedule's shared head/mounting datum is detected by repetition
    // and used to reject any window height read AS that datum.
    expect(out.prelim.vector_annotations).not.toBeNull();
    expect(out.prelim.vector_annotations.vector_usable).toBe(true);
    expect(out.prelim.vector_annotations.garage).not.toBeNull();
    expect(out.prelim.vector_annotations.garage.width_mm).toBe(4800);
    expect(out.prelim.vector_annotations.schedule).not.toBeNull();
    expect(out.prelim.vector_annotations.schedule.head_datum_mm).toBeGreaterThanOrEqual(1500);
    expect(out.prelim.vector_annotations.schedule.window_count).toBe(13);
    // The garage size is unchanged in VALUE (vision and vector agree on 4.8×2.1) but is
    // now backed by the deterministic vector read rather than the flaky vision one.
    expect(out.prelim.takeoff.garage_door_size).toBe("4.8×2.1");

    // ── Phase 4, Slice 2 definition of done (vector widths + counts, ungated) ──
    // The engine now also surfaces the floor-plan opening WIDTHS and a positioned
    // W-code COUNT. The window count is vector-preferred (the schedule's 13 W-codes);
    // the widths are read deterministically off the vector layer (parsed through the
    // shared parseDimsMm). Ext-wall area is NOT resolved here — it stays gated on the
    // per-window heights, which are still unresolved (flagged below).
    expect(out.prelim.vector_annotations.openings).not.toBeNull();
    expect(out.prelim.vector_annotations.openings.window_count).toBe(13);
    expect(out.prelim.vector_annotations.openings.datum_mm).toBeGreaterThanOrEqual(1500);
    expect(out.prelim.vector_annotations.openings.widths_raw.length).toBeGreaterThan(0);
    // Window count is the vector-preferred W-code count (13), not a vision flake.
    expect(out.prelim.takeoff.window_count).toBe(13);
    // Opening widths resolved from the vector layer (preferred), deterministic and
    // identical in length to the engine's positioned width tokens; includes the 4.8m
    // double-garage opening.
    expect(out.prelim.opening_widths.source).toBe("vector");
    expect(out.prelim.opening_widths.preferred_vector).toBe(true);
    expect(out.prelim.opening_widths.widths_mm.length).toBe(
      out.prelim.vector_annotations.openings.widths_raw.length,
    );
    expect(out.prelim.opening_widths.widths_mm).toContain(4800);
    // The ext-wall confidence flag must RIDE ON THE FIELD in real output: with heights
    // rejected by the safeguard, external_wall_area_m2 is incomplete and says so.
    expect(out.prelim.takeoff.notes).toContain("external_wall_area_m2 is incomplete");

    // ── F-022 definition of done (vector ↔ vision cross-check) — TRUE NEGATIVE ──
    // Beddis is the no-false-positive case: vision and vector agree on the garage width
    // (both 4800) and the window count (both 13), so reconciliation flags NOTHING. The
    // garage field is cross-checked (status "agree"), not silently uncheckable, and no
    // reconciliation note bleeds onto takeoff.notes.
    expect(out.prelim.reconciliation).not.toBeNull();
    expect(out.prelim.reconciliation.flags).toEqual([]);
    expect(out.prelim.reconciliation.note).toBe("");
    const recGarage = out.prelim.reconciliation.fields.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
      (f: any) => f.field === "garage_door_width",
    );
    expect(recGarage.status).toBe("agree");
    expect(recGarage.vectorValue).toBe(4800);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
    const recCount = out.prelim.reconciliation.fields.find((f: any) => f.field === "window_count");
    expect(recCount.status).toBe("agree");
    // The cross-check is signal-only: it changed no value (garage still 4.8×2.1) and added
    // no disagreement note to the field.
    expect(out.prelim.takeoff.garage_door_size).toBe("4.8×2.1");
    expect(out.prelim.takeoff.notes).not.toContain("reconciliation:");

    // ── Phase 4, Slice 3 definition of done (entrance: asserted height, UNKNOWN width) ──
    // The engine asserts only the entry door HEIGHT (building standard 2.1m, flagged); the
    // WIDTH is data-driven-or-unknown and Beddis prints NO frame-to-frame number, so the
    // width is left UNRESOLVED (null / width_source "unresolved") — NEVER asserted to a
    // standard (1400 would be an overfit to this job's QS). An unknown-width door can carry
    // no opening area, so it is flagged in the notes and NOT folded into the opening set.
    expect(out.prelim.vector_annotations.entrance).not.toBeNull();
    expect(out.prelim.vector_annotations.entrance.height_mm).toBe(2100);
    expect(out.prelim.vector_annotations.entrance.height_source).toBe("standard_assumed");
    expect(out.prelim.vector_annotations.entrance.width_mm).toBeNull();
    expect(out.prelim.vector_annotations.entrance.width_source).toBe("unresolved");
    // Unknown width → the door is NOT folded into the opening set (no fabricated area).
    expect(out.prelim.entrance).toBeNull();
    expect(out.prelim.takeoff.windows_by_room?.entrance).toBeUndefined();
    // Honesty rails: height flagged assumed-standard, width flagged as the last-resort
    // assumed 1.0m (never a fabricated measured 1.4), and the entry door is counted now.
    expect(out.prelim.takeoff.notes).toContain("height assumed standard 2.1m");
    expect(out.prelim.takeoff.notes).toContain("width assumed 1.0m — confirm against plan");
    expect(out.prelim.takeoff.notes).not.toContain("assumed standard 1.4");
    expect(out.prelim.takeoff.notes).toContain("counted in the opening area");
    // The vector width is unresolved (null) → the entrance width cross-check is uncheckable,
    // never a false flag.
    const recEntrance = out.prelim.reconciliation.fields.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
      (f: any) => f.field === "entrance_door_width",
    );
    expect(recEntrance.status).toBe("uncheckable");
    expect(recEntrance.vectorValue).toBeNull();

    // ── Phase 2d definition of done (derived fields) ──────────────────────────
    // external_wall_area_m2 = perimeter × stud − total_opening_area (QS D21 = 109.2).
    // This is the money accuracy gate: the baseline must fail if IQ only gets counts
    // right while under-materialising dimensioned opening rows.
    expect(out.prelim.takeoff.external_wall_area_m2).not.toBeNull();
    expect(out.prelim.takeoff.total_area_m2).not.toBeNull();

    // ── Convergence Slice 3 definition of done (shared composeTakeoff on prod inputs) ──
    // run.ts now calls this SAME pure function with the same page-pinned inputs, so proving
    // it on the Beddis ground truth proves the production path's numbers before any DB work.
    const cmp = out.prelim.composed;
    // Geometry-measured fields come from the engine (the override Pipeline B applies), with
    // provenance recorded — matching the Beddis scorecard (floor 165.4 / perimeter 63.8).
    expect(cmp.floor_area_m2.value).toBe(165.4);
    expect(cmp.floor_area_m2.source).toBe("geometry");
    expect(cmp.external_wall_lm.value).toBe(63.8);
    expect(cmp.external_wall_lm.source).toBe("geometry");
    // Vector-preferred window count (the schedule's 13 W-codes).
    expect(cmp.window_count.value).toBe(13);
    // Garage 4.8×2.1; Beddis is the F-022 TRUE NEGATIVE (vision & vector agree → no flag).
    expect(cmp.garage_door_size.value).toBe("4.8x2.1");
    expect(cmp.garage_door_size.discrepancy_flags).toHaveLength(0);
    // Entrance unknown-width flag rides on windows_by_room (asserted height, width not found).
    const wbrFlags = cmp.windows_by_room.discrepancy_flags.join(" ");
    expect(wbrFlags).toContain("height assumed standard 2.1m");
    expect(wbrFlags).toContain("width assumed 1.0m — confirm against plan");
    // Derived QS-priced outputs must match the signed-off workbook truth, not only the
    // window count. This is the red/green gate for opening-dimension recovery.
    expect(cmp.external_wall_area_m2.source).toBe("derived");
    const recoveredRows = (cmp.openings ?? []).filter((o) =>
      o.flags?.join(" ").includes("height recovered from the printed W-code"),
    );
    expect(recoveredRows.length).toBeGreaterThan(0);
    expect(recoveredRows.every((o) => o.source === "schedule")).toBe(true);
    expect(recoveredRows.every((o) => o.height_source === "asserted")).toBe(true);
    expect(recoveredRows[0].flags?.join(" ")).toContain("height recovered from the printed W-code");
    expect(cmp.total_opening_sqm).toBeCloseTo(JOINERY_TRUTH.total_opening_sqm, 0);
    expect(cmp.glazed_sqm).toBeCloseTo(JOINERY_TRUTH.glazed_sqm, 0);
    expect(cmp.external_wall_area_m2.value).toBeCloseTo(TRUTH.external_wall_area_m2, 0);
    expect(cmp.total_area_m2.value).not.toBeNull();
    // The global notes view still carries every migrated flag (backward-compat / M2 survival).
    expect(cmp.notes).toBe(out.prelim.composed_bare.notes);
    expect(cmp.notes).toContain("width assumed 1.0m — confirm against plan");
  }, 600000);
});
