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
import {
  resolveGeometryPageIndex,
  reconcileGeometryPage,
} from "../../src/lib/takeoff/page-of-truth";
import {
  preferVectorGarage,
  preferVectorOpenings,
  resolveOpeningWidths,
  visionOpeningWidthsMm,
  preferVectorEntrance,
  entranceAssumptionNote,
} from "../../src/lib/takeoff/vector-annotations";
import { reconcileVectorVision } from "../../src/lib/takeoff/reconcile-annotations";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import { unwrapTakeoff } from "../../src/lib/takeoff/enriched-takeoff";

const DIR = resolve(process.cwd(), "tests/fixtures/harrison");
const RENDER = resolve(DIR, "_render");
const PAGETEXT = resolve(DIR, "_pagetext");
const GEOMETRY_BASE = process.env.GEOMETRY_BASE ?? "http://localhost:8000";
const RUN = !!process.env.HARRISON_LIVE;

const TRUTH = JSON.parse(readFileSync(resolve(DIR, "ground-truth.json"), "utf8")).truth as Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
  any
>;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
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
    const conceptGeomPage = resolveGeometryPageIndex(
      pick ? pick.index : null,
      pages.map((n) => ({ pageNumber: n })),
    );
    out.concept.geometry = await geometry("concept.pdf", conceptGeomPage);
    out.concept.geometry_page_requested = conceptGeomPage ?? null;
    out.concept.page_reconciliation = reconcileGeometryPage(
      conceptGeomPage,
      out.concept.geometry.page_used,
    );
    const conceptVector = out.concept.geometry.vector_annotations;
    out.concept.vector_annotations = conceptVector ?? null;

    if (pick) {
      const page = pages[pick.index];
      const ctx = ctxByPage[page];
      const rawAnn = await extractAnnotations(b64(`concept-${page}.jpg`), ctx);
      const takeoff = classifyAnnotations(rawAnn, ctx);

      // F-022 — capture the VISION garage size before the vector override cross-checks it.
      // Harrison is the TRUE POSITIVE: vision flaked the garage to 2710 (→ "2.7×2.1").
      const visionGarageSize = takeoff.garage_door_size;

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
      // F-022 — capture the VISION window count before preferVectorOpenings overrides it.
      const visionWindowCount = finalTakeoff.window_count;
      finalTakeoff = preferVectorOpenings(finalTakeoff, conceptVector);
      out.concept.opening_widths = resolveOpeningWidths(
        visionOpeningWidthsMm(finalTakeoff),
        conceptVector,
      );

      // ── Phase 4, Slice 3: fold the ASSERTED entrance door into the opening set. Harrison
      // prints "Frame to Frame 1430" near the entry/porch label, so the engine reads WIDTH
      // 1430 (width_source "vector_text", data-driven); HEIGHT is the asserted standard
      // 2.1m. Ext-wall area is NOT recomputed. Capture the VISION entry-door width (if any)
      // before the override so F-022 can cross-check it.
      const visionEntranceWidthMm =
        finalTakeoff.windows_by_room?.entrance?.width_m != null
          ? Math.round(finalTakeoff.windows_by_room.entrance.width_m * 1000)
          : null;
      finalTakeoff = preferVectorEntrance(finalTakeoff, conceptVector);
      const entranceNote = entranceAssumptionNote(conceptVector);
      if (entranceNote) {
        finalTakeoff = {
          ...finalTakeoff,
          notes: [finalTakeoff.notes, entranceNote].filter(Boolean).join(" "),
        };
      }

      // ── F-022: vector ↔ vision cross-check. Harrison is the TRUE POSITIVE — vision read
      // the garage as 2710 (→ "2.7×2.1") while the vector layer read 4800; the paths
      // disagree materially, so reconciliation flags garage_door_width (vector still wins
      // the value, 4.8×2.1). The window count (vision callouts ~15 vs vector 14) is within
      // tolerance → not flagged. The disagreement note rides on takeoff.notes.
      const reconciliation = reconcileVectorVision(
        visionGarageSize,
        visionWindowCount,
        conceptVector,
        visionEntranceWidthMm,
      );
      if (reconciliation.note) {
        finalTakeoff = {
          ...finalTakeoff,
          notes: [finalTakeoff.notes, reconciliation.note].filter(Boolean).join(" "),
        };
      }
      out.concept.reconciliation = reconciliation;
      out.concept.vision_garage_size = visionGarageSize;
      out.concept.entrance = finalTakeoff.windows_by_room?.entrance ?? null;

      // ── Convergence Slice 3: the SHARED composeTakeoff seam (the exact function run.ts and
      // /upload both call) on the same page-pinned, no-schedule inputs. Harrison is the F-022
      // TRUE POSITIVE (vision 2.7 vs vector 4.8) and the printed-width entrance — composeTakeoff
      // must carry both onto their fields. Asserted against the Harrison scorecard in the DoD.
      const composed = composeTakeoff({
        visionTakeoff: takeoff,
        geometry: out.concept.geometry,
        schedule: null,
        geometryPageIndex: conceptGeomPage,
      });
      out.concept.composed = composed.enriched;
      out.concept.composed_bare = unwrapTakeoff(composed.enriched);

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
      floor_area_m2: {
        got: t.floor_area_m2,
        truth: TRUTH.floor_area_m2,
        delta: delta(t.floor_area_m2, TRUTH.floor_area_m2),
      },
      external_wall_lm: { got: t.external_wall_lm, truth_perimeter_m: TRUTH.perimeter_m },
      // Derived (Phase 2d). ext wall area = perimeter × stud − openings (QS D21);
      // total area = floor + alfresco (QS D14). Reported with deltas — inherits the
      // opening/alfresco extraction, so not hard-asserted to the QS figure.
      external_wall_area_m2: {
        got: t.external_wall_area_m2 ?? null,
        truth: TRUTH.external_wall_area_m2,
        delta: delta(t.external_wall_area_m2 ?? null, TRUTH.external_wall_area_m2),
      },
      total_area_m2: {
        got: t.total_area_m2 ?? null,
        truth: TRUTH.total_area_m2,
        delta: delta(t.total_area_m2 ?? null, TRUTH.total_area_m2),
      },
      window_count: {
        got: t.window_count,
        truth_plan_callouts: TRUTH.window_count_plan_callouts,
        windows_proper: TRUTH.windows_proper_count,
      },
      garage_door_size: {
        got: t.garage_door_size,
        truth: `${TRUTH.garage_door.width_m}×${TRUTH.garage_door.height_m}`,
      },
      internal_door_count: {
        got: t.internal_door_count,
        truth_standard: TRUTH.interior_doors.standard,
        note: "plan may show doubles (2/710, 2/610); QS simplified to 7/0/0 — report, do not tune",
      },
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
    expect(out.concept.takeoff.window_count).toBe(
      out.concept.vector_annotations.openings.window_count,
    );
    expect(out.concept.window_source).toBe("floor_plan_callouts"); // source label unchanged
    expect(out.concept.opening_widths.source).toBe("vector");
    expect(out.concept.opening_widths.preferred_vector).toBe(true);
    expect(out.concept.opening_widths.widths_mm.length).toBe(
      out.concept.vector_annotations.openings.widths_raw.length,
    );
    expect(out.concept.opening_widths.widths_mm).toContain(4800);

    // ── F-022 definition of done (vector ↔ vision cross-check) — TRUE POSITIVE ──
    // The canonical loose-coupling failure: live vision can misread the garage door
    // string (older runs saw "2.7×2.1"; current runs can surface raw text like
    // "2/710"), while the deterministic vector layer reads 4800. F-022 must SURFACE
    // the disagreement, and the resolved value must remain vector 4.8×2.1.
    expect(out.concept.vision_garage_size).toBeTruthy();
    expect(out.concept.vision_garage_size).not.toBe("4.8×2.1");
    expect(out.concept.reconciliation).not.toBeNull();
    const recGarage = out.concept.reconciliation.fields.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
      (f: any) => f.field === "garage_door_width",
    );
    expect(recGarage.status).toBe("disagree");
    expect(recGarage.visionValue).not.toBe(4800);
    expect(recGarage.vectorValue).toBe(4800);
    expect(out.concept.reconciliation.flags.length).toBeGreaterThanOrEqual(1);
    expect(out.concept.reconciliation.note).toContain("garage_door_width");
    // The flag reached real output (takeoff.notes), the same channel the reviewer reads.
    expect(out.concept.takeoff.notes).toContain("reconciliation: garage_door_width");
    // Signal-only: the disagreement did NOT change the resolved value — vector still wins.
    expect(out.concept.takeoff.garage_door_size).toBe("4.8×2.1");
    // Window-count vision can vary across live runs; if it materially disagrees, the
    // same reconciliation channel must carry that flag instead of hiding it.
    const recWindow = out.concept.reconciliation.fields.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
      (f: any) => f.field === "window_count",
    );
    expect(["agree", "disagree"]).toContain(recWindow.status);
    if (recWindow.status === "disagree") {
      expect(out.concept.reconciliation.note).toContain("window_count");
      expect(out.concept.takeoff.notes).toContain("reconciliation: window_count");
    }

    // ── Phase 4, Slice 3 definition of done (asserted entrance — printed width) ─
    // Harrison annotates "Frame to Frame 1430" near the entry/porch label, so the engine
    // reads the WIDTH data-driven (1430mm, width_source "vector_text") while still
    // ASSERTING the standard 2.1m height. This is the data-driven counterpart to Beddis'
    // standard-assumed width. The door is folded into the opening set; ext-wall is NOT
    // recomputed (stays gated on the window heights).
    expect(out.concept.vector_annotations.entrance).not.toBeNull();
    expect(out.concept.vector_annotations.entrance.height_mm).toBe(2100);
    expect(out.concept.vector_annotations.entrance.height_source).toBe("standard_assumed");
    expect(out.concept.vector_annotations.entrance.width_mm).toBe(1430);
    expect(out.concept.vector_annotations.entrance.width_source).toBe("vector_text");
    // Folded into the opening set as 1.43 wide × 2.1 high.
    expect(out.concept.entrance).toEqual({ qty: 1, height_m: 2.1, width_m: 1.43 });
    expect(out.concept.takeoff.windows_by_room.entrance).toEqual({
      qty: 1,
      height_m: 2.1,
      width_m: 1.43,
    });
    // Honesty rails: height flagged assumed-standard; the width is CREDITED to the printed
    // frame-to-frame dimension (not flagged as assumed); the entry door is counted in the opening area.
    expect(out.concept.takeoff.notes).toContain("height assumed standard 2.1m");
    expect(out.concept.takeoff.notes).toContain(
      "width 1.43m read from the printed frame-to-frame dimension",
    );
    expect(out.concept.takeoff.notes).toContain("counted in the opening area");
    // Single-source (vision reads no entry door) → the entrance width cross-check is
    // uncheckable, never a false flag — even though a printed width exists on the vector side.
    const recEntrance = out.concept.reconciliation.fields.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf.js/Supabase boundary types are deliberately loose here
      (f: any) => f.field === "entrance_door_width",
    );
    expect(recEntrance.status).toBe("uncheckable");

    // ── Convergence Slice 3 definition of done (shared composeTakeoff on prod inputs) ──
    // run.ts calls this SAME pure function with the same page-pinned inputs; proving it on
    // the Harrison ground truth proves the production path's numbers before any DB work.
    const cmp = out.concept.composed;
    // Harrison regression: geometry/OCR can mislabel the printed perimeter (60.4) as
    // floor area. The composer must keep the vision/title-block area and carry the
    // rejected geometry candidate as a review flag.
    expect(cmp.floor_area_m2.value).toBe(out.concept.takeoff.floor_area_m2);
    expect(cmp.floor_area_m2.value).toBeGreaterThan(160);
    expect(cmp.floor_area_m2.source).toBe("vision");
    expect(cmp.floor_area_m2.discrepancy_flags.join(" ")).toContain(
      "rejected geometry candidate 175.37",
    );
    expect(cmp.external_wall_lm.source).toBe("geometry");
    // Window count is the vector-preferred floor-plan W-code count.
    expect(cmp.window_count.value).toBe(out.concept.vector_annotations.openings.window_count);
    expect(cmp.window_count.source).toBe("vector");
    // Garage: F-022 TRUE POSITIVE — vector 4.8 wins over the 2.7 vision flake. The value is
    // vector-sourced, the disagreement is low-confidence, and the flag rides on the field.
    expect(cmp.garage_door_size.value).toBe("4.8×2.1");
    expect(cmp.garage_door_size.source).toBe("vector");
    expect(cmp.garage_door_size.confidence).toBe("low");
    expect(cmp.garage_door_size.discrepancy_flags.join(" ")).toContain("garage_door_width");
    // Printed-width entrance folded into the opening set (1.43 × 2.1), credited (not assumed).
    expect(cmp.windows_by_room.value.entrance).toEqual({ qty: 1, height_m: 2.1, width_m: 1.43 });
    expect(cmp.windows_by_room.discrepancy_flags.join(" ")).toContain(
      "width 1.43m read from the printed frame-to-frame dimension",
    );
    // Global notes view carries every migrated flag (backward-compat / M2 survival).
    expect(cmp.notes).toBe(out.concept.composed_bare.notes);
    expect(cmp.notes).toContain("reconciliation: garage_door_width");
  }, 600000);
});
