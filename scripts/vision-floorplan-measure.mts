// Vision-on-FLOORPLAN measurement — scores the shipped floor-plan vision reader
// (extract-annotations.ts → extractAnnotations) against BOTH the signed truth AND the
// deterministic floor-vector witnesses, on all four jobs.
//
// DIAGNOSTIC-ONLY. No production code/tolerance/pricing touched. It imports and calls the
// SHIPPED extractAnnotations verbatim (faithful — no prompt copy) and the SHIPPED
// deterministic floor-witness detectors. Truth is used only as a scoreboard.
//
// Scores to the council's tightened bar (vision = locator/witness only):
//   1. Does it AGREE with the floor vectors on which openings exist? (room+width)
//   2. Does it READ printed H×W correctly? (vs truth, with error)
//   3. Does it attach to the right ROOM?
//   4. Does it AVOID room/run dimensions? (precision / false positives)
//   5. Does it improve O'Neil/15a/Beddis WITHOUT breaking Fenner? (four-job table)
//
// Run: npx tsx --env-file=.env.local scripts/vision-floorplan-measure.mts
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractAnnotations, type RawAnnotation } from "../src/lib/takeoff/extract-annotations.ts";
import { BUILDER_CONFIGS } from "../src/lib/takeoff/builder-config.ts";
import type { PlanContext } from "../src/lib/takeoff/plan-context.ts";
import { extractPageGeometry } from "../src/lib/doors/pdf-adapter.ts";
import { parsePlanText, type PlanText } from "../src/lib/takeoff/plan-text.ts";
import {
  detectPhysicalOpeningWidthWitnesses,
  detectPrintedWindowCodeWitnesses,
} from "../src/lib/takeoff/floor-opening-witnesses.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT_DIR = resolve(ROOT, "output/diagnostics/vision-floorplan");
const RENDER_WIDTH = 1400; // production parity (renderPageForAnalysis default).
const DIM_TOL_MM = 100; // floor dims are printed exact; generous for OCR slips. Reported, fixed.
const WIDTH_TOL_MM = 120; // vision<->witness width agreement.

// ---------------------------------------------------------------------------
// Truth (same normalisation as the elevation harness)
// ---------------------------------------------------------------------------
interface TruthOpening {
  room: string;
  widthMm: number;
  heightMm: number;
  bucket: "glazed" | "door" | "garage";
}

function bucketFromType(type: string | undefined, room: string, glazed: boolean | undefined): TruthOpening["bucket"] {
  const ty = (type ?? "").toLowerCase();
  const r = (room ?? "").toLowerCase();
  if (ty.includes("sectional") || /garage\s*door/.test(r)) return "garage";
  if (ty.includes("door") || /entrance|entry|\bpa\b|laundry/.test(r)) return "door";
  if (glazed === false) return "door";
  return "glazed";
}

function loadTruth(job: string): TruthOpening[] {
  const d = JSON.parse(readFileSync(resolve(ROOT, `tests/fixtures/${job}/ground-truth.json`), "utf8"));
  if (Array.isArray(d.manual_openings)) {
    const out: TruthOpening[] = [];
    for (const row of d.manual_openings as Array<Record<string, unknown>>) {
      const qty = typeof row.qty === "number" && row.qty > 0 ? Math.round(row.qty) : 1;
      const w = Math.round((row.width_m as number) * 1000);
      const h = Math.round((row.height_m as number) * 1000);
      const room = String(row.room ?? "");
      for (let i = 0; i < qty; i++) out.push({ room, widthMm: w, heightMm: h, bucket: bucketFromType(undefined, room, undefined) });
    }
    return out;
  }
  const openings = (d.joinery_bench?.openings ?? []) as Array<Record<string, unknown>>;
  return openings.map((o) => ({
    room: String(o.room ?? ""),
    widthMm: Math.round((o.width_m as number) * 1000),
    heightMm: Math.round((o.height_m as number) * 1000),
    bucket: bucketFromType(o.type as string, String(o.room ?? ""), o.glazed as boolean | undefined),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normRoom(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function roomMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normRoom(a);
  const y = normRoom(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}
function dimClose(a: number, b: number, w: number, h: number, tol = DIM_TOL_MM): boolean {
  return (Math.abs(a - w) <= tol && Math.abs(b - h) <= tol) || (Math.abs(a - h) <= tol && Math.abs(b - w) <= tol);
}
function dimErr(a: number, b: number, w: number, h: number): number {
  return Math.min(Math.abs(a - w) + Math.abs(b - h), Math.abs(a - h) + Math.abs(b - w));
}

interface VisionOpening {
  a: number; // first printed number
  b: number; // second printed number
  room: string | null;
  nearOpening: boolean;
  text: string;
  qty: number;
}

// Parse a dimension annotation like "1100x600", "2/1100x600", "W12 1300x1800".
function parsePair(text: string): { a: number; b: number; qty: number } | null {
  const m = text.match(/(\d{3,4})\s*[xX×]\s*(\d{3,4})/);
  if (!m) return null;
  const qm = text.match(/^\s*(\d{1,2})\s*[\/@]\s*\d{3,4}\s*[xX×]/);
  return { a: Number(m[1]), b: Number(m[2]), qty: qm ? Number(qm[1]) : 1 };
}

function expandVision(anns: RawAnnotation[]): VisionOpening[] {
  const out: VisionOpening[] = [];
  for (const ann of anns) {
    const p = parsePair(ann.text);
    if (!p) continue; // non-pair (door leaf "810", a run dim "12370") — not a W×H opening
    for (let i = 0; i < Math.max(1, p.qty); i++) {
      out.push({ a: p.a, b: p.b, room: ann.nearestRoomLabel, nearOpening: ann.nearOpening, text: ann.text, qty: p.qty });
    }
  }
  return out;
}

// Looks like a room footprint / run dimension rather than a wall opening?
// Openings here run ~400..2400 (glazed) up to 4800 (garage). Rooms are bigger & squarer.
function looksLikeRoomOrRun(a: number, b: number): boolean {
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  if (big > 5200) return true; // beyond any single opening width — a run/overall dim
  if (small >= 2500 && big >= 3000) return true; // both large => room footprint, not an opening
  return false;
}

// ---------------------------------------------------------------------------
// Render + deterministic floor witnesses
// ---------------------------------------------------------------------------
function findPdftoppm(): string {
  const candidates = [
    resolve(process.env.USERPROFILE ?? "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm.exe"),
    "pdftoppm",
    "pdftoppm.exe",
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ["-v"], { stdio: "ignore" });
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error("pdftoppm not found.");
}

function renderFloor(pdfPath: string, page: number, outBase: string): string {
  mkdirSync(dirname(outBase), { recursive: true });
  execFileSync(findPdftoppm(), [
    "-f", String(page), "-l", String(page),
    "-scale-to-x", String(RENDER_WIDTH), "-scale-to-y", "-1",
    "-jpeg", "-singlefile", pdfPath, outBase,
  ]);
  return `${outBase}.jpg`;
}

interface FloorWitness { room: string; widthMm: number; planSide: string; kind: string }

async function deterministicFloorWitnesses(pdfPath: string, page: number): Promise<FloorWitness[]> {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), disableFontFace: true } as never).promise;
  try {
    const p = await doc.getPage(page);
    const geom = await extractPageGeometry(p as never);
    const planText: PlanText = parsePlanText(geom.labels);
    const physical = detectPhysicalOpeningWidthWitnesses({ planText, segments: geom.segments, labels: geom.labels, scale: 100 });
    const codes = detectPrintedWindowCodeWitnesses(planText);
    const out: FloorWitness[] = [];
    for (const w of physical) out.push({ room: w.room, widthMm: w.widthMm, planSide: String(w.planSide), kind: "physical" });
    for (const w of codes) out.push({ room: w.room, widthMm: w.widthMm, planSide: "", kind: "printed_code" });
    return out;
  } finally {
    await doc.destroy().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Plan context (only builder.name / scaleString / dimensionFormat are used by the prompt)
// ---------------------------------------------------------------------------
const jennian = BUILDER_CONFIGS.find((b) => b.name === "Jennian Homes") ?? BUILDER_CONFIGS[0];
const CONTEXT: PlanContext = {
  builder: jennian,
  scaleString: "1:100",
  scaleFactor: 100,
  dimensionFormat: jennian.defaultDimensionFormat,
  dimensionFormatSource: "builder_default",
  studHeightMm: 2400,
  studHeightSource: "builder_default",
  sheetType: "floor_plan",
  livingAreaM2: null,
  perimeterM: null,
};

interface JobCfg { job: string; pdf: string; page: number }
const JOBS: JobCfg[] = [
  { job: "fenner", pdf: resolve(ROOT, "tests/doors/plans/fenner-floorplan.pdf"), page: 1 },
  { job: "oneil", pdf: resolve(ROOT, "tests/fixtures/oneil/floorplan.pdf"), page: 1 },
  { job: "15a", pdf: resolve(ROOT, "tests/fixtures/15a/floorplan.pdf"), page: 1 },
  { job: "beddis", pdf: resolve(ROOT, "tests/fixtures/beddis/concept-floorplan.pdf"), page: 1 },
];

function fmt(n: number, d: number): string {
  return d === 0 ? "n/a" : `${n}/${d} (${Math.round((100 * n) / d)}%)`;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Greedy 1:1 match of vision openings to truth by min dim error (unordered).
function matchVisionTruth(vision: VisionOpening[], truth: TruthOpening[]) {
  const cands: Array<{ vi: number; ti: number; err: number; room: boolean }> = [];
  vision.forEach((v, vi) => {
    truth.forEach((t, ti) => {
      if (dimClose(v.a, v.b, t.widthMm, t.heightMm)) {
        cands.push({ vi, ti, err: dimErr(v.a, v.b, t.widthMm, t.heightMm), room: roomMatch(v.room, t.room) });
      }
    });
  });
  cands.sort((a, b) => a.err - b.err);
  const uv = new Set<number>(), ut = new Set<number>();
  const matches: typeof cands = [];
  for (const c of cands) {
    if (uv.has(c.vi) || ut.has(c.ti)) continue;
    uv.add(c.vi); ut.add(c.ti); matches.push(c);
  }
  return { matches, usedV: uv };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const summary: Record<string, unknown>[] = [];

  for (const cfg of JOBS) {
    console.log(`\n${"=".repeat(78)}\n${cfg.job.toUpperCase()} (floor plan)\n${"=".repeat(78)}`);
    const jpg = renderFloor(cfg.pdf, cfg.page, resolve(OUT_DIR, `${cfg.job}-floor`));
    const base64 = readFileSync(jpg).toString("base64");
    const truth = loadTruth(cfg.job);

    const witnesses = await deterministicFloorWitnesses(cfg.pdf, cfg.page);
    console.log(`rendered ${(readFileSync(jpg).length / 1024).toFixed(0)}KB · truth=${truth.length} · deterministic floor witnesses=${witnesses.length}`);

    console.log("calling shipped extractAnnotations (vision-on-floorplan)…");
    const ann = await extractAnnotations(base64, CONTEXT);
    const vision = expandVision(ann.openingAnnotations);

    // (2)+(3) vs truth. Room attribution is scored SET-BASED, not from the greedy
    // pairing: many openings share dims, so the 1:1 matcher can cross-assign same-dim
    // rooms. A matched vision opening is "room-correct" iff SOME truth opening with the
    // same dims sits in a matching room.
    const { matches } = matchVisionTruth(vision, truth);
    const roomCorrect = matches.filter((m) => {
      const v = vision[m.vi];
      return truth.some((t) => dimClose(v.a, v.b, t.widthMm, t.heightMm) && roomMatch(v.room, t.room));
    }).length;
    const medErr = median(matches.map((m) => m.err));

    // (4) precision / room+run dims
    const dimPairs = vision.length;
    const matchedV = matches.length;
    const fps = vision.filter((_, i) => !matches.some((m) => m.vi === i));
    const fpRoomRun = fps.filter((v) => looksLikeRoomOrRun(v.a, v.b)).length;

    // (1) agreement with floor vectors (room + width)
    let witnessConfirmedByVision = 0;
    for (const w of witnesses) {
      if (vision.some((v) => (Math.abs(v.a - w.widthMm) <= WIDTH_TOL_MM || Math.abs(v.b - w.widthMm) <= WIDTH_TOL_MM) && (w.room ? roomMatch(v.room, w.room) : true))) {
        witnessConfirmedByVision++;
      }
    }
    // vision openings that hit truth but NOT any deterministic witness = vision's added finds
    const visionBeyondWitness = matches.filter((m) => {
      const v = vision[m.vi];
      return !witnesses.some((w) => (Math.abs(v.a - w.widthMm) <= WIDTH_TOL_MM || Math.abs(v.b - w.widthMm) <= WIDTH_TOL_MM) && (w.room ? roomMatch(v.room, w.room) : true));
    }).length;

    console.log(`\n  -- (2) reads H×W correctly --`);
    console.log(`     opening annotations (W×H pairs): ${dimPairs}  (raw openingAnnotations=${ann.openingAnnotations.length}, roomLabels=${ann.roomLabels.length})`);
    console.log(`     dim recall vs truth: ${fmt(matchedV, truth.length)}   median read error: ${medErr === null ? "n/a" : medErr + "mm"}`);
    console.log(`  -- (3) right room --`);
    console.log(`     room attribution on matched: ${fmt(roomCorrect, matchedV)}`);
    console.log(`  -- (4) avoids room/run dims (precision) --`);
    console.log(`     precision: ${fmt(matchedV, dimPairs)} of vision pairs hit a real opening`);
    console.log(`     false positives: ${fps.length}  (of which room/run-scale: ${fpRoomRun})`);
    console.log(`  -- (1) agrees with floor vectors --`);
    console.log(`     deterministic witnesses confirmed by vision: ${fmt(witnessConfirmedByVision, witnesses.length)}`);
    console.log(`     vision openings hitting truth BEYOND any witness (added finds): ${visionBeyondWitness}`);
    console.log(`     garageDoorAnnotations: ${JSON.stringify(ann.garageDoorAnnotations)}`);

    const jobOut = {
      job: cfg.job,
      truthTotal: truth.length,
      deterministicWitnesses: witnesses.length,
      visionOpeningPairs: dimPairs,
      rawOpeningAnnotations: ann.openingAnnotations.length,
      reads_HxW: { dimRecall: matchedV, truthTotal: truth.length, medianErrMm: medErr },
      rightRoom: { roomCorrect, matched: matchedV },
      precision: { matched: matchedV, pairs: dimPairs, falsePositives: fps.length, fpRoomRun },
      agreesWithVectors: { witnessConfirmedByVision, witnesses: witnesses.length, visionBeyondWitness },
      garageDoorAnnotations: ann.garageDoorAnnotations,
      detail: {
        matches: matches.map((m) => ({ vision: `${vision[m.vi].a}x${vision[m.vi].b}@${vision[m.vi].room}`, truth: `${truth[m.ti].widthMm}x${truth[m.ti].heightMm}@${truth[m.ti].room}`, errMm: m.err, room: m.room })),
        falsePositives: fps.map((v) => ({ text: v.text, a: v.a, b: v.b, room: v.room, roomOrRun: looksLikeRoomOrRun(v.a, v.b) })),
        witnesses,
        roomLabels: ann.roomLabels,
        rawOpeningAnnotations: ann.openingAnnotations,
      },
    };
    writeFileSync(resolve(OUT_DIR, `${cfg.job}.json`), JSON.stringify(jobOut, null, 2));
    summary.push(jobOut);
  }

  writeFileSync(resolve(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${"=".repeat(78)}\nFOUR-JOB TABLE (5) — improve O'Neil/15a/Beddis without breaking Fenner\n${"=".repeat(78)}`);
  console.log("job     truth  visPairs  dimRecall  room%   precision  FP(room/run)  vec-confirm  beyond");
  for (const s of summary as any[]) {
    const r = s.reads_HxW, rm = s.rightRoom, pr = s.precision, ag = s.agreesWithVectors;
    const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) + "%" : "n/a");
    console.log(
      `${String(s.job).padEnd(7)} ${String(s.truthTotal).padEnd(6)} ${String(s.visionOpeningPairs).padEnd(9)} ${pct(r.dimRecall, r.truthTotal).padEnd(10)} ${pct(rm.roomCorrect, rm.matched).padEnd(7)} ${pct(pr.matched, pr.pairs).padEnd(10)} ${(pr.falsePositives + "(" + pr.fpRoomRun + ")").padEnd(13)} ${pct(ag.witnessConfirmedByVision, ag.witnesses).padEnd(12)} ${ag.visionBeyondWitness}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
