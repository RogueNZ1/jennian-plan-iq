// Vision elevation detector measurement — Task 4 of the opening-recovery brief.
//
// DIAGNOSTIC-ONLY. This script measures how well the EXISTING vision elevation
// detector (src/lib/takeoff/extract-elevations.ts) sees the signed openings.
// It compares vision output to the signed truth purely as a scoreboard. It does
// NOT feed pricing, does NOT modify production code, and does NOT change the model
// or prompt that ships in extract-elevations.ts (the SYSTEM_PROMPT + fetch below
// are copied verbatim so the measurement is faithful to what the app runs).
//
// Pass A = the shipped prompt, scored.
// Pass B = the shipped prompt + one appended bbox instruction, used ONLY to draw
//          an eyeball overlay (never scored as production output).
//
// Run: npx tsx --env-file=.env.local scripts/vision-elevation-measure.mts
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT_DIR = resolve(ROOT, "output/diagnostics/vision-elevation");

const MODEL = "claude-opus-4-5"; // unchanged from extract-elevations.ts — do not "upgrade".
const RENDER_WIDTH = 1400; // production parity: renderPageForAnalysis maxWidth default.
const DIM_TOL_MM = 150; // stated, fixed. NEVER tune to flatter the score.

// ---------------------------------------------------------------------------
// Copied verbatim from src/lib/takeoff/extract-elevations.ts (do not edit here).
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Return ONLY valid JSON. No markdown, no prose.
You are reading an elevation drawing for a New Zealand residential dwelling.

Extract the following:

1. CLADDING - Look for text labelling cladding types on any elevation face.
   Examples: "CLADDING 1 brick", "CLADDING 2 LINEA", "70 series clay brick veneer",
   "James Hardie Linea Oblique", "Corrugate Colorsteel", "Maxiclad", "Monotek".
   Return all cladding types mentioned as an array of strings (empty array if none found).
   Also return a numeric code:
     1 = brick or masonry only (all faces brick/block/stone)
     2 = weatherboard, panel, or sheet only (no brick)
     3 = mixed (at least one brick face AND at least one non-brick face)
     null = could not determine

2. ROOF - Look for roof type/form and pitch annotation.
   Examples: "ROOF 25 deg METAL TILES", "Pressed metal Gerard Shake",
   "Longrun Corrugate Colorsteel endura 0.4 BMT roofing @ 25 deg pitch",
   "Metal tiles @ 25 deg", "Corrugated iron @ 12 deg".
   Return type string (e.g. "Hip roof - metal tiles", "Gable roof - longrun")
   and pitch in degrees as a number.

3. WALL HEIGHT - Look for any dimension showing wall height or stud height.
   Examples: "2400 STUD", "2570 STUD", "2.4m wall height".
   Return in mm (e.g. 2400). wallHeightMm = the overall wall dimension shown.
   studHeightMm = explicitly labelled stud height if stated separately.

4. ELEVATION FACES - List which elevation faces are shown.
   Examples: "NORTH WESTERN ELEVATION", "Elevation A", "SOUTH ELEVATION".
   Return as an array of strings using whatever label appears on the drawing.

5. WINDOW COUNT - For each elevation face shown, count the number of window openings visible.
   Include highlight windows, raking windows, and any glazed area that is clearly a window.
   Return as { "face label": count }.

6. EXTERNAL OPENING LEDGER - For each elevation face, list every visible external-wall
   opening as an item in elevationOpenings.
   - Include windows, sliders/stackers, ranch sliders, entry doors, PA doors, laundry doors,
     garage windows, and garage doors.
   - Count one physical framed wall opening as one item. Do NOT count individual panes,
     mullions, rails, brick/course lines, roof planes, shadows, or separate panels inside a
     garage door as separate openings.
   - Set type to "garage_door" ONLY for the solid sectional/roller garage door opening.
   - Everything else in an external wall is a QS glazed opening.
   - Copy visible W/D labels where present (for example W01, D03); otherwise label=null.
   - Extract widthMm and heightMm only when dimensions are printed or unambiguous; otherwise null.
   - Use quantity > 1 only for repeated identical openings on the same face.
   - Put the cladding label for the face/opening where visible; otherwise null.
   - Use confidence high only when the opening and type are clear on the drawing.

7. EXTERNAL DOORS - Count external door openings visible across all elevations.
   Do not count garage door openings here.

8. GABLE ENDS - Count only cladded vertical wall gable triangles below the roof line.
   Do NOT count triangular roof/hip planes, roof silhouettes, ridge triangles, or hip roof
   faces as gable ends. If the elevations show a hip roof with rectangular walls below the
   eaves and no triangular wall cladding, return gableEndCount: 0.

9. GARAGE DOORS - Are any garage door openings visible? true or false.

Return exactly this JSON structure:
{
  "claddingTypes": string[],
  "claddingTypeCode": 1 | 2 | 3 | null,
  "roofType": string | null,
  "roofPitchDegrees": number | null,
  "wallHeightMm": number | null,
  "studHeightMm": number | null,
  "facesPresent": string[],
  "windowCountPerFace": { [face: string]: number },
  "externalDoorCount": number,
  "gableEndCount": number,
  "garageDoorsPresent": boolean,
  "elevationOpenings": Array<{
    "face": string,
    "type": "window" | "slider" | "external_door" | "garage_door" | "unknown",
    "label": string | null,
    "widthMm": number | null,
    "heightMm": number | null,
    "quantity": number,
    "cladding": string | null,
    "confidence": "high" | "medium" | "low",
    "notes": string[]
  }>
}`;

// Pass B only: the "boxing contract" the council (Codex) named — one row per
// INDIVIDUAL opening (no quantity grouping) + a mandatory normalized bbox. Used only
// to draw overlays and test whether vision boxes the visible openings cleanly.
const BBOX_SUFFIX = `

ADDITIONAL DIAGNOSTIC CONTRACT (overrides the quantity rule above for THIS response only):
- Output ONE item in elevationOpenings per INDIVIDUAL physical opening. Do NOT group
  repeats: if a face has 7 identical windows, return 7 separate items, each with
  quantity:1. NEVER use quantity > 1.
- For EVERY item add a "bbox" field: "bbox": [x, y, w, h] as fractions between 0 and 1 of
  the FULL image width/height. x,y = top-left corner of the opening's tight bounding box on
  THIS image; w,h = its width/height as fractions. Give your best visual estimate even if unsure.
- Keep every other field and rule exactly as specified above (garage_door ONLY for the solid
  sectional/roller door; everything else glazed or door as before).`;

function extractJson(text: string): string {
  let cleaned = text.replace(/```(?:json|JSON)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return cleaned;
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OpeningType = "window" | "slider" | "external_door" | "garage_door" | "unknown";

interface VisionOpening {
  face: string;
  type: OpeningType;
  label: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  cladding: string | null;
  confidence: "high" | "medium" | "low";
  notes: string[];
  bbox?: [number, number, number, number] | null;
}

interface VisionResult {
  garageDoorsPresent: boolean;
  externalDoorCount: number;
  facesPresent: string[];
  windowCountPerFace: Record<string, number>;
  claddingTypeCode: number | null;
  elevationOpenings: VisionOpening[];
  _rawLen: number;
}

interface TruthOpening {
  room: string;
  widthMm: number;
  heightMm: number;
  cladding: number | string | null;
  bucket: "glazed" | "door" | "garage"; // glazed = window/slider/garage_window
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function findPdftoppm(): string {
  const candidates = [
    process.platform === "win32"
      ? resolve(
          process.env.USERPROFILE ?? "",
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm.exe",
        )
      : "pdftoppm",
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
  throw new Error("pdftoppm not found. Install Poppler.");
}

function renderElevation(pdfPath: string, page: number, outBase: string): string {
  mkdirSync(dirname(outBase), { recursive: true });
  execFileSync(findPdftoppm(), [
    "-f",
    String(page),
    "-l",
    String(page),
    "-scale-to-x",
    String(RENDER_WIDTH),
    "-scale-to-y",
    "-1",
    "-jpeg",
    "-singlefile",
    pdfPath,
    outBase,
  ]);
  return `${outBase}.jpg`;
}

// ---------------------------------------------------------------------------
// Vision call (lifted from extract-elevations.ts handler)
// ---------------------------------------------------------------------------
async function callVision(
  imageBase64: string,
  builderName: string,
  augment: boolean,
): Promise<VisionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured (use --env-file=.env.local).");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: augment ? 4096 : 3000,
      system: augment ? SYSTEM_PROMPT + BBOX_SUFFIX : SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is an elevation sheet for a ${builderName} residential dwelling in New Zealand. Extract cladding types, roof information, wall heights, per-face external opening evidence, external doors, gable ends, and garage door presence as JSON.`,
            },
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const raw =
    json.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? "";

  const parsed = safeParseJson<Record<string, unknown>>(raw);
  if (!parsed) throw new Error(`JSON parse failed. Raw head: ${raw.slice(0, 300)}`);

  const openings = Array.isArray(parsed.elevationOpenings)
    ? (parsed.elevationOpenings as Record<string, unknown>[]).map(normaliseOpening)
    : [];

  return {
    garageDoorsPresent: parsed.garageDoorsPresent === true,
    externalDoorCount: typeof parsed.externalDoorCount === "number" ? parsed.externalDoorCount : 0,
    facesPresent: Array.isArray(parsed.facesPresent) ? (parsed.facesPresent as string[]) : [],
    windowCountPerFace:
      parsed.windowCountPerFace && typeof parsed.windowCountPerFace === "object"
        ? (parsed.windowCountPerFace as Record<string, number>)
        : {},
    claddingTypeCode: typeof parsed.claddingTypeCode === "number" ? parsed.claddingTypeCode : null,
    elevationOpenings: openings,
    _rawLen: raw.length,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function normaliseOpening(item: Record<string, unknown>): VisionOpening {
  const t = item.type;
  const type: OpeningType =
    t === "window" || t === "slider" || t === "external_door" || t === "garage_door"
      ? (t as OpeningType)
      : "unknown";
  let bbox: [number, number, number, number] | null = null;
  if (Array.isArray(item.bbox) && item.bbox.length === 4 && item.bbox.every((n) => typeof n === "number")) {
    bbox = item.bbox as [number, number, number, number];
  }
  return {
    face: typeof item.face === "string" ? item.face : "Unknown",
    type,
    label: typeof item.label === "string" ? item.label : null,
    widthMm: num(item.widthMm),
    heightMm: num(item.heightMm),
    quantity:
      typeof item.quantity === "number" && item.quantity > 0 ? Math.round(item.quantity) : 1,
    cladding: typeof item.cladding === "string" ? item.cladding : null,
    confidence:
      item.confidence === "high" || item.confidence === "medium" || item.confidence === "low"
        ? item.confidence
        : "low",
    notes: Array.isArray(item.notes) ? (item.notes as unknown[]).filter((n) => typeof n === "string") as string[] : [],
    bbox,
  };
}

// ---------------------------------------------------------------------------
// Truth loaders -> common TruthOpening[]
// ---------------------------------------------------------------------------
function bucketFromType(type: string | undefined, room: string, glazed: boolean | undefined): TruthOpening["bucket"] {
  const r = (room ?? "").toLowerCase();
  const ty = (type ?? "").toLowerCase();
  if (ty.includes("garage") && (ty.includes("door") || ty.includes("sectional"))) return "garage";
  if (ty.includes("sectional")) return "garage";
  if (/garage\s*door/.test(r) || r.includes("sectional")) return "garage";
  if (ty.includes("door") || /entrance|entry|\bpa\b|laundry door|external door/.test(r)) return "door";
  if (glazed === false) return "door";
  return "glazed";
}

function loadFennerTruth(): TruthOpening[] {
  const d = JSON.parse(readFileSync(resolve(ROOT, "tests/fixtures/fenner/ground-truth.json"), "utf8"));
  const out: TruthOpening[] = [];
  for (const row of d.manual_openings as Array<Record<string, unknown>>) {
    const qty = typeof row.qty === "number" && row.qty > 0 ? Math.round(row.qty) : 1;
    const widthMm = Math.round((row.width_m as number) * 1000);
    const heightMm = Math.round((row.height_m as number) * 1000);
    const room = String(row.room ?? "");
    const bucket = bucketFromType(undefined, room, undefined);
    for (let i = 0; i < qty; i++) out.push({ room, widthMm, heightMm, cladding: (row.cladding as number) ?? null, bucket });
  }
  return out;
}

function loadJoineryBenchTruth(job: string): TruthOpening[] {
  const d = JSON.parse(readFileSync(resolve(ROOT, `tests/fixtures/${job}/ground-truth.json`), "utf8"));
  const openings = (d.joinery_bench?.openings ?? []) as Array<Record<string, unknown>>;
  return openings.map((o) => ({
    room: String(o.room ?? ""),
    widthMm: Math.round((o.width_m as number) * 1000),
    heightMm: Math.round((o.height_m as number) * 1000),
    cladding: (o.cladding as string) ?? null,
    bucket: bucketFromType(o.type as string, String(o.room ?? ""), o.glazed as boolean | undefined),
  }));
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function visionBucket(t: OpeningType): TruthOpening["bucket"] | "unknown" {
  if (t === "window" || t === "slider") return "glazed";
  if (t === "external_door") return "door";
  if (t === "garage_door") return "garage";
  return "unknown";
}

function flattenVision(openings: VisionOpening[]): VisionOpening[] {
  const out: VisionOpening[] = [];
  for (const o of openings) {
    const q = Math.max(1, o.quantity);
    for (let i = 0; i < q; i++) out.push(o);
  }
  return out;
}

interface MatchPair {
  truthIdx: number;
  visionIdx: number;
  err: number;
  swapped: boolean;
  truth: TruthOpening;
  vision: VisionOpening;
}

function dimMatch(truth: TruthOpening[], visionWithDims: VisionOpening[]) {
  // Greedy 1:1 by minimal total abs dim error, allowing orientation swap.
  const candidates: MatchPair[] = [];
  truth.forEach((t, ti) => {
    visionWithDims.forEach((v, vi) => {
      const w = v.widthMm!;
      const h = v.heightMm!;
      const direct = Math.abs(w - t.widthMm) + Math.abs(h - t.heightMm);
      const swap = Math.abs(h - t.widthMm) + Math.abs(w - t.heightMm);
      const swapped = swap < direct;
      const errW = swapped ? Math.abs(h - t.widthMm) : Math.abs(w - t.widthMm);
      const errH = swapped ? Math.abs(w - t.heightMm) : Math.abs(h - t.heightMm);
      if (errW <= DIM_TOL_MM && errH <= DIM_TOL_MM) {
        candidates.push({ truthIdx: ti, visionIdx: vi, err: Math.min(direct, swap), swapped, truth: t, vision: v });
      }
    });
  });
  candidates.sort((a, b) => a.err - b.err);
  const usedT = new Set<number>();
  const usedV = new Set<number>();
  const matches: MatchPair[] = [];
  for (const c of candidates) {
    if (usedT.has(c.truthIdx) || usedV.has(c.visionIdx)) continue;
    usedT.add(c.truthIdx);
    usedV.add(c.visionIdx);
    matches.push(c);
  }
  return matches;
}

function countBuckets<T>(items: T[], fn: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = fn(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overlay (Pass B bboxes)
// ---------------------------------------------------------------------------
async function drawOverlay(jpgPath: string, openings: VisionOpening[], outPng: string) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(jpgPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const colorFor = (o: VisionOpening) => {
    if (o.type === "garage_door") return "#ff8800";
    if (o.widthMm && o.heightMm) return "#00cc44"; // measurable
    if (o.confidence === "low") return "#ffcc00";
    return "#ff2244";
  };
  let n = 0;
  for (const o of openings) {
    if (!o.bbox) continue;
    const [x, y, w, h] = o.bbox;
    const px = x * image.width;
    const py = y * image.height;
    const pw = w * image.width;
    const ph = h * image.height;
    ctx.lineWidth = 3;
    ctx.strokeStyle = colorFor(o);
    ctx.strokeRect(px, py, pw, ph);
    const tag = `${o.type}${o.widthMm && o.heightMm ? ` ${o.widthMm}x${o.heightMm}` : ""}`;
    ctx.font = "16px sans-serif";
    const tw = ctx.measureText(tag).width + 8;
    ctx.fillStyle = colorFor(o);
    ctx.fillRect(px, Math.max(0, py - 20), tw, 20);
    ctx.fillStyle = "#000";
    ctx.fillText(tag, px + 4, Math.max(14, py - 5));
    n++;
  }
  writeFileSync(outPng, await canvas.encode("png"));
  return n;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
interface JobCfg {
  job: string;
  pdf: string;
  page: number;
  truth: () => TruthOpening[];
  builder: string;
}

const JOBS: JobCfg[] = [
  {
    job: "fenner",
    pdf: resolve(ROOT, "tests/doors/plans/fenner-elevations.pdf"),
    page: 1,
    truth: loadFennerTruth,
    builder: "Jennian Homes",
  },
  {
    job: "oneil",
    pdf: resolve(ROOT, "tests/fixtures/oneil/elevations.pdf"),
    page: 1,
    truth: () => loadJoineryBenchTruth("oneil"),
    builder: "Jennian Homes",
  },
  {
    job: "15a",
    pdf: resolve(ROOT, "tests/fixtures/15a/elevations.pdf"),
    page: 1,
    truth: () => loadJoineryBenchTruth("15a"),
    builder: "Jennian Homes",
  },
  {
    job: "beddis",
    pdf: resolve(ROOT, "tests/fixtures/beddis/prelim.pdf"),
    page: 5, // prelim-5 = "Elevation A/B/D" sheet (prelim-3 is only a legend).
    truth: () => loadJoineryBenchTruth("beddis"),
    builder: "Jennian Homes",
  },
];

function fmtPct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${n}/${d} (${Math.round((100 * n) / d)}%)`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const summary: Record<string, unknown>[] = [];

  for (const cfg of JOBS) {
    console.log(`\n${"=".repeat(78)}\n${cfg.job.toUpperCase()}\n${"=".repeat(78)}`);
    const jpgBase = resolve(OUT_DIR, `${cfg.job}-elevation`);
    const jpgPath = renderElevation(cfg.pdf, cfg.page, jpgBase);
    const base64 = readFileSync(jpgPath).toString("base64");
    console.log(`rendered ${jpgPath} (${(readFileSync(jpgPath).length / 1024).toFixed(0)}KB)`);

    const truth = cfg.truth();
    const truthBuckets = countBuckets(truth, (t) => t.bucket);

    console.log("calling vision Pass A (faithful)…");
    const passA = await callVision(base64, cfg.builder, false);
    console.log("calling vision Pass B (augmented bbox, overlay only)…");
    const passB = await callVision(base64, cfg.builder, true);

    const visA = flattenVision(passA.elevationOpenings);
    const visBuckets = countBuckets(visA, (v) => visionBucket(v.type));
    const withDims = visA.filter((v) => v.widthMm && v.heightMm);
    const matches = dimMatch(truth, withDims);
    const dimErrs = matches.map((m) => m.err);
    const medErr = dimErrs.length ? dimErrs.sort((a, b) => a - b)[Math.floor(dimErrs.length / 2)] : null;

    const overlayPng = resolve(OUT_DIR, `${cfg.job}-overlay.png`);
    const drawn = await drawOverlay(jpgPath, passB.elevationOpenings, overlayPng);

    // Pass B = the boxing contract (one row per opening + bbox). Answers the council's
    // two questions: did it box the visible openings cleanly, and did it find the garage door.
    const passBCount = passB.elevationOpenings.length;
    const passBGarage = passB.elevationOpenings.filter((o) => o.type === "garage_door").length;
    const passBWithBbox = passB.elevationOpenings.filter((o) => o.bbox).length;
    const passBGrouped = passB.elevationOpenings.filter((o) => o.quantity > 1).length;
    const truthGarage = truthBuckets.garage ?? 0;

    // ---- report ----
    console.log(`\n  TRUTH: ${truth.length} openings  buckets=${JSON.stringify(truthBuckets)}`);
    console.log(`  VISION (Pass A): ${visA.length} openings  buckets=${JSON.stringify(visBuckets)}`);
    console.log(`  faces present: ${JSON.stringify(passA.facesPresent)}`);
    console.log(`  -- LENS 1 (did vision SEE it) --`);
    console.log(`     garage door anchor: truth=${truthBuckets.garage ?? 0}  vision.present=${passA.garageDoorsPresent}  vision.garage=${visBuckets.garage ?? 0}`);
    console.log(`     glazed count: truth=${truthBuckets.glazed ?? 0}  vision=${visBuckets.glazed ?? 0}`);
    console.log(`     door count:   truth=${truthBuckets.door ?? 0}  vision=${visBuckets.door ?? 0}`);
    console.log(`     unknown(vision junk type): ${visBuckets.unknown ?? 0}`);
    console.log(`  -- LENS 2 (is it MEASURABLE) --`);
    console.log(`     dim-availability: ${fmtPct(withDims.length, visA.length)} vision openings carry W&H`);
    console.log(`     dim recall:    ${fmtPct(matches.length, truth.length)} signed openings matched (±${DIM_TOL_MM}mm)`);
    console.log(`     dim precision: ${fmtPct(matches.length, withDims.length)} dimmed detections matched`);
    console.log(`     median dim err (matched): ${medErr === null ? "n/a" : medErr + "mm"}  swapped=${matches.filter((m) => m.swapped).length}`);
    console.log(`     junk (dimmed, matched nothing): ${withDims.length - matches.length}`);
    console.log(`  -- PASS B (boxing contract: one row per opening + bbox) --`);
    console.log(`     openings boxed: ${passBCount} vs truth ${truth.length}  (grouped rows that broke the contract: ${passBGrouped})`);
    console.log(`     bbox coverage:  ${fmtPct(passBWithBbox, passBCount)}`);
    console.log(`     GARAGE VERDICT: truth=${truthGarage}  passB.garage_door=${passBGarage}  => ${truthGarage > 0 ? (passBGarage > 0 ? "FOUND" : "MISSED") : "n/a"}`);
    console.log(`  overlay: ${overlayPng} (${drawn}/${passBCount} bboxes drawn)`);

    const jobOut = {
      job: cfg.job,
      model: MODEL,
      renderWidth: RENDER_WIDTH,
      dimTolMm: DIM_TOL_MM,
      truth: { total: truth.length, buckets: truthBuckets, openings: truth },
      lens1: {
        visionTotal: visA.length,
        visionBuckets: visBuckets,
        garageAnchor: { truth: truthBuckets.garage ?? 0, visionPresent: passA.garageDoorsPresent, visionGarage: visBuckets.garage ?? 0 },
        facesPresent: passA.facesPresent,
        windowCountPerFace: passA.windowCountPerFace,
      },
      lens2: {
        dimAvailability: { withDims: withDims.length, total: visA.length },
        dimRecall: { matched: matches.length, truthTotal: truth.length },
        dimPrecision: { matched: matches.length, dimmed: withDims.length },
        medianErrMm: medErr,
        swapped: matches.filter((m) => m.swapped).length,
        junk: withDims.length - matches.length,
        matches: matches.map((m) => ({ truth: `${m.truth.room} ${m.truth.widthMm}x${m.truth.heightMm}`, vision: `${m.vision.type} ${m.vision.widthMm}x${m.vision.heightMm}`, errMm: m.err, swapped: m.swapped })),
      },
      passBBoxing: {
        openingsBoxed: passBCount,
        truthTotal: truth.length,
        groupedRowsBrokeContract: passBGrouped,
        bboxCoverage: { withBbox: passBWithBbox, total: passBCount },
        garageVerdict: { truth: truthGarage, passBGarage, found: truthGarage > 0 && passBGarage > 0 },
      },
      passA: passA.elevationOpenings,
      passB: passB.elevationOpenings,
    };
    writeFileSync(resolve(OUT_DIR, `${cfg.job}.json`), JSON.stringify(jobOut, null, 2));
    summary.push(jobOut);
  }

  writeFileSync(resolve(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${resolve(OUT_DIR, "summary.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
