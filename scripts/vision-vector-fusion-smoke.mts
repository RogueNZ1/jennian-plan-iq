// Vision + vector fusion smoke test.
//
// DIAGNOSTIC-ONLY. This does not change pricing or production data.
//
// Purpose:
//   1. Render a tight Fenner garage-elevation crop.
//   2. Draw numbered deterministic vector candidates (openings + frame slots).
//   3. Ask vision to select/group/classify candidate IDs only.
//   4. Write overlays + JSON so we can see whether AI helps choose from exact boxes
//      instead of trying to draw loose boxes itself.
//
// Run:
//   npx tsx --env-file=.env.local scripts/vision-vector-fusion-smoke.mts

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runElevationVectorEvidence } from "../src/lib/takeoff/run-elevation-vector-openings.ts";
import {
  callVisionModel,
  getAnthropicApiKey,
  safeParseJson,
} from "../src/lib/takeoff/anthropic-client.ts";
import type { ElevationOpeningCandidate } from "../src/lib/takeoff/extract-elevations.ts";
import type { ElevationVectorOpening } from "../src/lib/takeoff/elevation-vector-openings.ts";
import type { FrameOpeningSlot } from "../src/lib/takeoff/elevation-opening-slots.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT_DIR = resolve(ROOT, "output/diagnostics/vision-vector-fusion");
const FENNER_ELEVATIONS = resolve(ROOT, "tests/doors/plans/fenner-elevations.pdf");
const FENNER_TRUTH = resolve(ROOT, "tests/fixtures/fenner/ground-truth.json");
const PAGE_NUMBER = 1;
const RENDER_WIDTH = 2800;
const PT_PER_MM = 72 / 25.4;
const ELEVATION_SCALE = 100;

type PdfRect = { x0: number; x1: number; y0: number; y1: number };
type CandidateKind = "vector_opening" | "frame_slot";

type Candidate = {
  id: string;
  kind: CandidateKind;
  source: string;
  faceBandId: string;
  suggestedType: string | null;
  widthMm: number;
  heightMm: number;
  rect: PdfRect;
  notes: string[];
};

type AiOpening = {
  candidateIds: string[];
  type: "window" | "slider" | "external_door" | "garage_door" | "unknown";
  confidence: "high" | "medium" | "low";
  action: "opening" | "merge" | "review";
  reason: string;
};

type AiIgnored = {
  candidateId: string;
  reason: string;
};

type AiMissedVisibleOpening = {
  description: string;
  likelyType: "window" | "slider" | "external_door" | "garage_door" | "unknown";
  reasonNoCandidate: string;
};

type AiResponse = {
  openings: AiOpening[];
  ignored: AiIgnored[];
  missedVisibleOpenings: AiMissedVisibleOpening[];
  summary: string;
};

type TruthOpening = {
  room: string;
  widthMm: number;
  heightMm: number;
  areaM2: number;
};

type ScoredOpening = {
  ai: AiOpening;
  foundCandidateIds: string[];
  missingCandidateIds: string[];
  recovered: {
    widthMm: number | null;
    heightMm: number | null;
    areaM2: number | null;
  };
  deterministicSanity: {
    status: "pass" | "review" | "fail";
    reasons: string[];
  };
  nearestTruth: {
    room: string;
    widthMm: number;
    heightMm: number;
    areaM2: number;
    widthDeltaMm: number;
    heightDeltaMm: number;
    areaDeltaM2: number | null;
    dimensionCompatible: boolean;
  } | null;
};

function mmToPt(mm: number): number {
  return (mm / ELEVATION_SCALE) * PT_PER_MM;
}

function ptToMm(pt: number): number {
  return Math.round((pt / PT_PER_MM) * ELEVATION_SCALE);
}

function rectForOpening(opening: ElevationOpeningCandidate & { x: number; y: number }): PdfRect {
  const widthPt = mmToPt(opening.widthMm ?? 0);
  const heightPt = mmToPt(opening.heightMm ?? 0);
  return {
    x0: opening.x - widthPt / 2,
    x1: opening.x + widthPt / 2,
    y0: opening.y - heightPt / 2,
    y1: opening.y + heightPt / 2,
  };
}

function rectIntersects(a: PdfRect, b: PdfRect): boolean {
  return Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
}

function loadTruth(): TruthOpening[] {
  const raw = JSON.parse(readFileSync(FENNER_TRUTH, "utf8")) as {
    manual_openings?: Array<Record<string, unknown>>;
  };
  const out: TruthOpening[] = [];
  for (const row of raw.manual_openings ?? []) {
    const qty = typeof row.qty === "number" && row.qty > 0 ? Math.round(row.qty) : 1;
    const widthM = typeof row.width_m === "number" ? row.width_m : null;
    const heightM = typeof row.height_m === "number" ? row.height_m : null;
    if (widthM == null || heightM == null) continue;
    for (let i = 0; i < qty; i += 1) {
      out.push({
        room: typeof row.room === "string" ? row.room : "",
        widthMm: Math.round(widthM * 1000),
        heightMm: Math.round(heightM * 1000),
        areaM2: Math.round(widthM * heightM * 100) / 100,
      });
    }
  }
  return out;
}

function findPdftoppm(): string {
  const bundled = resolve(
    process.env.USERPROFILE ?? "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm.exe",
  );
  const candidates = [bundled, "pdftoppm.exe", "pdftoppm"];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-h"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("pdftoppm was not found.");
}

function renderPdfPage(pdfPath: string, outBase: string): string {
  mkdirSync(dirname(outBase), { recursive: true });
  execFileSync(findPdftoppm(), [
    "-f",
    String(PAGE_NUMBER),
    "-l",
    String(PAGE_NUMBER),
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

async function pageSize(pdfPath: string): Promise<{ width: number; height: number }> {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(PAGE_NUMBER);
    const view = page.view as number[];
    return { width: view[2] - view[0], height: view[3] - view[1] };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

function candidateTable(candidates: readonly Candidate[]): string {
  return candidates
    .map(
      (candidate) =>
        `${candidate.id}: ${candidate.kind}, ${candidate.widthMm}x${candidate.heightMm}mm, ` +
        `${candidate.faceBandId}, source=${candidate.source}`,
    )
    .join("\n");
}

function fusionSystemPrompt(): string {
  return `Return ONLY valid JSON. No markdown, no prose.
You are reviewing a residential elevation crop with numbered deterministic vector candidate boxes.

Your job is NOT to measure and NOT to draw boxes.
Your job is to select, group, and classify the candidate IDs that correspond to real external openings.

Rules:
- Use only candidate IDs printed on the image and listed in the candidate table.
- A real opening is a window, slider/ranch slider, external door, or sectional/roller garage door.
- Ignore cladding boards, brick hatch, roof lines, dimension text, shadows, mullions, and panels inside one opening.
- If multiple candidate IDs are parts of the same physical opening, put them together in one candidateIds array and set action="merge".
- Prefer one physical opening over nested parts. A lower pane, mullion bay, inner rail rectangle, or duplicate nested box inside a larger already-selected opening is not another opening.
- Only classify a candidate as external_door if an actual door leaf/opening is visible. A skinny vertical cladding board, brick pier, mullion, or frame side is not a door.
- If a visible opening has no usable candidate ID, list it in missedVisibleOpenings instead of inventing a box.
- The candidate table deliberately does not tell you the detector's suggested type. Use the picture.

Return exactly:
{
  "openings": [
    {
      "candidateIds": ["C1"],
      "type": "window" | "slider" | "external_door" | "garage_door" | "unknown",
      "confidence": "high" | "medium" | "low",
      "action": "opening" | "merge" | "review",
      "reason": "short reason"
    }
  ],
  "ignored": [
    { "candidateId": "C2", "reason": "short reason" }
  ],
  "missedVisibleOpenings": [
    {
      "description": "short location/type description",
      "likelyType": "window" | "slider" | "external_door" | "garage_door" | "unknown",
      "reasonNoCandidate": "why no candidate ID fits"
    }
  ],
  "summary": "short summary"
}`;
}

async function callCandidateSelector(
  overlayPng: string,
  candidates: readonly Candidate[],
): Promise<{
  raw: string;
  parsed: AiResponse | null;
}> {
  const userText = `Select/group/classify only these deterministic candidates.

Candidate table:
${candidateTable(candidates)}

Remember: the boxes are deterministic measurement candidates. You are only deciding which IDs are real openings and how to group/classify them.`;

  const raw = await callVisionModel(
    getAnthropicApiKey(),
    fusionSystemPrompt(),
    userText,
    readFileSync(overlayPng).toString("base64"),
    "image/png",
  );
  return { raw, parsed: safeParseJson<AiResponse>(raw) };
}

function normaliseAiResponse(value: AiResponse | null): AiResponse {
  if (!value) {
    return {
      openings: [],
      ignored: [],
      missedVisibleOpenings: [],
      summary: "AI response did not parse.",
    };
  }
  return {
    openings: Array.isArray(value.openings) ? value.openings : [],
    ignored: Array.isArray(value.ignored) ? value.ignored : [],
    missedVisibleOpenings: Array.isArray(value.missedVisibleOpenings)
      ? value.missedVisibleOpenings
      : [],
    summary: typeof value.summary === "string" ? value.summary : "",
  };
}

function rectUnion(rects: readonly PdfRect[]): PdfRect | null {
  if (rects.length === 0) return null;
  return {
    x0: Math.min(...rects.map((rect) => rect.x0)),
    x1: Math.max(...rects.map((rect) => rect.x1)),
    y0: Math.min(...rects.map((rect) => rect.y0)),
    y1: Math.max(...rects.map((rect) => rect.y1)),
  };
}

function openingSanity(
  type: AiOpening["type"],
  widthMm: number | null,
  heightMm: number | null,
): ScoredOpening["deterministicSanity"] {
  const reasons: string[] = [];
  if (widthMm == null || heightMm == null) {
    return { status: "fail", reasons: ["no recovered vector dimensions"] };
  }
  if (widthMm < 350 || heightMm < 400) reasons.push("too small to be a physical opening");
  if (widthMm > 6200 || heightMm > 2800) reasons.push("too large for one physical opening");

  if (type === "garage_door") {
    if (widthMm < 2200 || widthMm > 6000) reasons.push("garage door width outside expected range");
    if (heightMm < 1800 || heightMm > 2450)
      reasons.push("garage door height outside expected range");
  } else if (type === "external_door") {
    if (widthMm < 700)
      reasons.push("external door width below 700mm; likely frame/window artefact");
    if (widthMm > 1600)
      reasons.push("external door width above 1600mm; likely slider/garage/opening group");
    if (heightMm < 1800 || heightMm > 2450)
      reasons.push("external door height outside expected range");
  } else if (type === "slider") {
    if (widthMm < 1200) reasons.push("slider width below 1200mm");
    if (heightMm < 1750 || heightMm > 2450) reasons.push("slider height outside expected range");
  } else if (type === "window") {
    if (widthMm < 400 || widthMm > 5200) reasons.push("window width outside expected range");
    if (heightMm < 450 || heightMm > 2450) reasons.push("window height outside expected range");
  }

  if (reasons.length > 0) return { status: "fail", reasons };
  const reviewReasons: string[] = [];
  if (type === "unknown") reviewReasons.push("AI classified opening as unknown");
  if (type === "window" && heightMm >= 1800) {
    reviewReasons.push("door-height glazed opening needs floor/elevation row proof before pricing");
  }
  return reviewReasons.length > 0
    ? { status: "review", reasons: reviewReasons }
    : { status: "pass", reasons: ["dimension/type sanity passed"] };
}

function truthDimensionCompatible(widthMm: number, heightMm: number, truth: TruthOpening): boolean {
  const widthTolerance = Math.max(150, Math.round(truth.widthMm * 0.06));
  const heightTolerance = Math.max(150, Math.round(truth.heightMm * 0.08));
  return (
    Math.abs(widthMm - truth.widthMm) <= widthTolerance &&
    Math.abs(heightMm - truth.heightMm) <= heightTolerance
  );
}

function scoreAiOpenings(args: {
  ai: AiResponse;
  candidates: readonly Candidate[];
  truth: readonly TruthOpening[];
}): ScoredOpening[] {
  const byId = new Map(args.candidates.map((candidate) => [candidate.id, candidate]));
  return args.ai.openings.map((opening) => {
    const selected = opening.candidateIds
      .map((id) => byId.get(id))
      .filter((candidate) => candidate != null);
    const foundCandidateIds = selected.map((candidate) => candidate.id);
    const missingCandidateIds = opening.candidateIds.filter((id) => !byId.has(id));
    const union = rectUnion(selected.map((candidate) => candidate.rect));
    const widthMm = union ? ptToMm(union.x1 - union.x0) : null;
    const heightMm = union ? ptToMm(union.y1 - union.y0) : null;
    const areaM2 =
      widthMm != null && heightMm != null
        ? Math.round((widthMm / 1000) * (heightMm / 1000) * 100) / 100
        : null;
    const deterministicSanity = openingSanity(opening.type, widthMm, heightMm);
    const nearestTruth =
      widthMm != null && heightMm != null
        ? ([...args.truth]
            .map((truth) => ({
              truth,
              distance:
                Math.abs(widthMm - truth.widthMm) + Math.abs(heightMm - truth.heightMm) * 1.4,
            }))
            .sort((a, b) => a.distance - b.distance)[0]?.truth ?? null)
        : null;
    return {
      ai: opening,
      foundCandidateIds,
      missingCandidateIds,
      recovered: {
        widthMm,
        heightMm,
        areaM2,
      },
      deterministicSanity,
      nearestTruth: nearestTruth
        ? {
            room: nearestTruth.room,
            widthMm: nearestTruth.widthMm,
            heightMm: nearestTruth.heightMm,
            areaM2: nearestTruth.areaM2,
            widthDeltaMm: widthMm == null ? 0 : widthMm - nearestTruth.widthMm,
            heightDeltaMm: heightMm == null ? 0 : heightMm - nearestTruth.heightMm,
            areaDeltaM2:
              areaM2 == null ? null : Math.round((areaM2 - nearestTruth.areaM2) * 100) / 100,
            dimensionCompatible:
              widthMm != null &&
              heightMm != null &&
              truthDimensionCompatible(widthMm, heightMm, nearestTruth),
          }
        : null,
    };
  });
}

async function drawCandidateOverlay(args: {
  fullImagePath: string;
  page: { width: number; height: number };
  crop: PdfRect;
  candidates: readonly Candidate[];
  outPng: string;
  ai?: AiResponse;
}) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(args.fullImagePath);
  const scale = image.width / args.page.width;
  const sx = args.crop.x0 * scale;
  const sy = args.crop.y0 * scale;
  const sw = (args.crop.x1 - args.crop.x0) * scale;
  const sh = (args.crop.y1 - args.crop.y0) * scale;
  const canvas = createCanvas(Math.ceil(sw), Math.ceil(sh));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  const selectedIds = new Set(args.ai?.openings.flatMap((opening) => opening.candidateIds) ?? []);
  const ignoredIds = new Set(args.ai?.ignored.map((ignored) => ignored.candidateId) ?? []);

  const drawText = (text: string, x: number, y: number, color: string) => {
    ctx.font = "bold 15px sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  for (const candidate of args.candidates) {
    const x = (candidate.rect.x0 - args.crop.x0) * scale;
    const y = (candidate.rect.y0 - args.crop.y0) * scale;
    const w = (candidate.rect.x1 - candidate.rect.x0) * scale;
    const h = (candidate.rect.y1 - candidate.rect.y0) * scale;
    const selected = selectedIds.has(candidate.id);
    const ignored = ignoredIds.has(candidate.id);
    ctx.lineWidth = selected ? 5 : 3;
    ctx.strokeStyle = selected
      ? "#16a34a"
      : ignored
        ? "#6b7280"
        : candidate.kind === "vector_opening"
          ? "#f59e0b"
          : "#2563eb";
    ctx.setLineDash(selected || ignored ? [] : [7, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    drawText(candidate.id, x + 4, Math.max(16, y - 5), ctx.strokeStyle);
  }

  if (args.ai) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(12, 12, Math.min(canvas.width - 24, 900), 72);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(
      "AI selected green candidates only; grey ignored; blue/orange unselected.",
      24,
      38,
    );
    ctx.font = "14px sans-serif";
    ctx.fillText(args.ai.summary.slice(0, 120), 24, 63);
  }

  writeFileSync(args.outPng, await canvas.encode("png"));
}

function buildCandidateList(args: {
  vectorOpenings: readonly ElevationVectorOpening[];
  slots: readonly FrameOpeningSlot[];
  crop: PdfRect;
}): Candidate[] {
  const candidates: Candidate[] = [];
  let index = 1;
  for (const opening of args.vectorOpenings) {
    if (opening.widthMm == null || opening.heightMm == null) continue;
    const rect = rectForOpening(opening);
    if (!rectIntersects(rect, args.crop)) continue;
    candidates.push({
      id: `C${index++}`,
      kind: "vector_opening",
      source: opening.source,
      faceBandId: opening.faceBandId,
      suggestedType: opening.type,
      widthMm: opening.widthMm,
      heightMm: opening.heightMm,
      rect,
      notes: opening.notes,
    });
  }
  for (const slot of args.slots) {
    const rect = { x0: slot.x0, x1: slot.x1, y0: slot.y0, y1: slot.y1 };
    if (!rectIntersects(rect, args.crop)) continue;
    candidates.push({
      id: `C${index++}`,
      kind: "frame_slot",
      source: slot.groupId,
      faceBandId: slot.faceBandId,
      suggestedType: null,
      widthMm: slot.widthMm,
      heightMm: slot.heightMm,
      rect,
      notes: [
        `${slot.slotMemberRects} member rects; group ${slot.groupWidthMm}x${slot.groupHeightMm}mm; likelyMulti=${slot.groupLikelyMultiOpening}`,
      ],
    });
  }
  return candidates.sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const page = await pageSize(FENNER_ELEVATIONS);
  const evidence = await runElevationVectorEvidence(readFileSync(FENNER_ELEVATIONS), PAGE_NUMBER);
  const garage = evidence.elevationOpenings.find(
    (opening): opening is ElevationVectorOpening =>
      opening.type === "garage_door" && opening.widthMm != null && opening.heightMm != null,
  );
  if (!garage) throw new Error("Fenner garage-door vector candidate was not found.");

  const garageRect = rectForOpening(garage);
  const band = evidence.elevationFaceBands.find((candidate) => candidate.id === garage.faceBandId);
  const baseCrop = band
    ? {
        x0: Math.min(band.x0, garageRect.x0),
        x1: Math.max(band.x1, garageRect.x1),
        y0: Math.min(band.y0, garageRect.y0),
        y1: Math.max(band.y1, garageRect.y1),
      }
    : garageRect;
  const crop: PdfRect = {
    x0: Math.max(0, baseCrop.x0 - 90),
    x1: Math.min(page.width, baseCrop.x1 + 90),
    y0: Math.max(0, baseCrop.y0 - 60),
    y1: Math.min(page.height, baseCrop.y1 + 40),
  };

  const fullImagePath = renderPdfPage(FENNER_ELEVATIONS, resolve(OUT_DIR, "fenner-elevation-2800"));
  const candidates = buildCandidateList({
    vectorOpenings: evidence.elevationOpenings,
    slots: evidence.elevationOpeningSlots,
    crop,
  });

  const candidateOverlay = resolve(OUT_DIR, "fenner-garage-candidate-ids.png");
  await drawCandidateOverlay({ fullImagePath, page, crop, candidates, outPng: candidateOverlay });

  const aiResult = await callCandidateSelector(candidateOverlay, candidates);
  const ai = normaliseAiResponse(aiResult.parsed);
  const scoredOpenings = scoreAiOpenings({ ai, candidates, truth: loadTruth() });
  const selectedOverlay = resolve(OUT_DIR, "fenner-garage-ai-selection.png");
  await drawCandidateOverlay({
    fullImagePath,
    page,
    crop,
    candidates,
    ai,
    outPng: selectedOverlay,
  });

  const report = {
    job: "fenner",
    mode: "diagnostic_only_vector_candidates_ai_selects_ids",
    page,
    crop,
    garageVectorCandidate: garage,
    candidates,
    ai,
    scoredOpenings,
    scoreSummary: {
      selectedOpenings: scoredOpenings.length,
      sanityPass: scoredOpenings.filter((opening) => opening.deterministicSanity.status === "pass")
        .length,
      sanityReview: scoredOpenings.filter(
        (opening) => opening.deterministicSanity.status === "review",
      ).length,
      sanityFail: scoredOpenings.filter((opening) => opening.deterministicSanity.status === "fail")
        .length,
      truthCompatible: scoredOpenings.filter((opening) => opening.nearestTruth?.dimensionCompatible)
        .length,
    },
    rawAiText: aiResult.raw,
    artifacts: {
      candidateOverlay,
      selectedOverlay,
      fullImagePath,
    },
  };
  writeFileSync(
    resolve(OUT_DIR, "fenner-garage-fusion.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(`wrote ${candidateOverlay}`);
  console.log(`wrote ${selectedOverlay}`);
  console.log(`wrote ${resolve(OUT_DIR, "fenner-garage-fusion.json")}`);
  console.log(`AI summary: ${ai.summary}`);
  console.log(
    `AI openings: ${ai.openings
      .map((opening) => `${opening.type}:${opening.candidateIds.join("+")}:${opening.confidence}`)
      .join(", ")}`,
  );
  console.log(
    `score: sanity pass=${scoredOpenings.filter((opening) => opening.deterministicSanity.status === "pass").length}, ` +
      `review=${scoredOpenings.filter((opening) => opening.deterministicSanity.status === "review").length}, ` +
      `fail=${scoredOpenings.filter((opening) => opening.deterministicSanity.status === "fail").length}, ` +
      `truth-compatible=${scoredOpenings.filter((opening) => opening.nearestTruth?.dimensionCompatible).length}`,
  );
  for (const opening of scoredOpenings) {
    const recovered =
      opening.recovered.widthMm == null || opening.recovered.heightMm == null
        ? "?x?"
        : `${opening.recovered.widthMm}x${opening.recovered.heightMm}`;
    const truth = opening.nearestTruth
      ? `${opening.nearestTruth.room} ${opening.nearestTruth.widthMm}x${opening.nearestTruth.heightMm} ` +
        `d=${opening.nearestTruth.widthDeltaMm}/${opening.nearestTruth.heightDeltaMm}`
      : "no truth";
    console.log(
      `  ${opening.ai.type.padEnd(13)} ${opening.ai.candidateIds.join("+").padEnd(10)} ` +
        `${recovered.padEnd(10)} ${opening.deterministicSanity.status.padEnd(6)} ${truth}`,
    );
  }
  if (ai.missedVisibleOpenings.length > 0) {
    console.log(`Missed visible openings: ${ai.missedVisibleOpenings.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
