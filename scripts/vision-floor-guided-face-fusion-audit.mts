// Floor-guided vision/vector face fusion audit.
//
// DIAGNOSTIC-ONLY. This does not change pricing or production data.
//
// Purpose:
//   For each face that the deterministic face-map has actually proven:
//     floor-plan rows for that plan side + exact vector elevation candidates
//     -> vision maps F-row IDs to C-candidate IDs
//     -> deterministic scoring marks pass / review / fail.
//
// Run:
//   npx tsx --env-file=.env.local scripts/vision-floor-guided-face-fusion-audit.mts

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPageGeometry } from "../src/lib/doors/pdf-adapter.ts";
import {
  detectPhysicalOpeningWidthWitnesses,
  detectPrintedWindowCodeWitnesses,
} from "../src/lib/takeoff/floor-opening-witnesses.ts";
import { detectPlanSideLengthWitnesses } from "../src/lib/takeoff/floor-side-lengths.ts";
import {
  buildOpeningFaceMap,
  type OpeningFaceAnchor,
  type OpeningSignatureFloorRow,
  type PlanSide,
} from "../src/lib/takeoff/opening-face-map.ts";
import { buildOpeningSignatureFloorRows } from "../src/lib/takeoff/opening-floor-signatures.ts";
import { parsePlanText } from "../src/lib/takeoff/plan-text.ts";
import { runElevationVectorEvidence } from "../src/lib/takeoff/run-elevation-vector-openings.ts";
import {
  callVisionModel,
  getAnthropicApiKey,
  safeParseJson,
} from "../src/lib/takeoff/anthropic-client.ts";
import type { ElevationOpeningCandidate } from "../src/lib/takeoff/extract-elevations.ts";
import type {
  ElevationFaceBand,
  ElevationVectorOpening,
} from "../src/lib/takeoff/elevation-vector-openings.ts";
import type {
  FrameRectangleCandidate,
  FrameAssemblyMember,
  FrameOpeningSlot,
} from "../src/lib/takeoff/elevation-opening-slots.ts";
import { frameRectangleCandidates } from "../src/lib/takeoff/elevation-opening-slots.ts";
import type { Segment } from "../src/lib/doors/door-engine.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT_DIR = resolve(ROOT, "output/diagnostics/vision-floor-guided-face-fusion");
const FENNER_FLOORPLAN = resolve(ROOT, "tests/doors/plans/fenner-floorplan.pdf");
const FENNER_ELEVATIONS = resolve(ROOT, "tests/doors/plans/fenner-elevations.pdf");
const FENNER_TRUTH = resolve(ROOT, "tests/fixtures/fenner/ground-truth.json");
const PAGE_NUMBER = 1;
const RENDER_WIDTH = 2800;
const PT_PER_MM = 72 / 25.4;
const ELEVATION_SCALE = 100;
const MAX_SINGLE_OPENING_CANDIDATE_WIDTH_MM = 5200;

type PdfRect = { x0: number; x1: number; y0: number; y1: number };
type CandidateKind = "vector_opening" | "frame_assembly" | "raw_frame_rescue";

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
  compatibleFloorRowIds: string[];
};

type FloorGuideRow = OpeningSignatureFloorRow & {
  id: string;
  order: number;
};

type AiOpening = {
  candidateIds: string[];
  floorRowIds?: string[];
  type: "window" | "slider" | "external_door" | "garage_door" | "unknown";
  confidence: "high" | "medium" | "low";
  action: "opening" | "merge" | "review";
  candidateFit?: "fits" | "partial" | "oversized" | "fragment" | "wrong" | "unclear";
  candidateFitReason?: string;
  reason: string;
};

type AiIgnored = {
  candidateId: string;
  reason: string;
};

type AiMissedVisibleOpening = {
  floorRowIds?: string[];
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
  floorGuideMatches: Array<{
    id: string;
    source: string;
    room: string;
    widthMm: number;
    heightMm: number;
    widthDeltaMm: number | null;
    heightDeltaMm: number | null;
    dimensionCompatible: boolean;
  }>;
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

type FaceAudit = {
  planSide: PlanSide;
  elevationFace: string;
  anchorKind: OpeningFaceAnchor["kind"];
  anchorNote: string;
  crop: PdfRect;
  floorRows: FloorGuideRow[];
  candidates: Candidate[];
  ai: AiResponse;
  scoredOpenings: ScoredOpening[];
  unmatchedFloorRows: FloorGuideRow[];
  scoreSummary: {
    floorRows: number;
    candidates: number;
    selectedOpenings: number;
    sanityPass: number;
    sanityReview: number;
    sanityFail: number;
    assemblySplitConflicts: number;
    floorGuideCompatible: number;
    truthCompatible: number;
    unmatchedFloorRows: number;
    missedVisibleOpenings: number;
  };
  artifacts: {
    candidateOverlay: string;
    selectedOverlay: string;
  };
  rawAiText: string;
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

function rectArea(rect: PdfRect): number {
  return Math.max(1, (rect.x1 - rect.x0) * (rect.y1 - rect.y0));
}

function rectOverlapRatio(a: PdfRect, b: PdfRect): number {
  const width = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const height = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / Math.min(rectArea(a), rectArea(b));
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

function memberKey(member: FrameAssemblyMember): string {
  return [member.x0, member.x1, member.y0, member.y1, member.widthMm, member.heightMm]
    .map((value) => Math.round(value * 100) / 100)
    .join("|");
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

async function pageGeometry(pdfPath: string, pageNumber: number) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(pageNumber);
    const view = page.view as number[];
    return {
      page: { width: view[2] - view[0], height: view[3] - view[1] },
      geom: await extractPageGeometry(page as never),
    };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

function floorSideOrderValue(row: OpeningSignatureFloorRow): number {
  if (row.planSide === "plan_top" || row.planSide === "plan_bottom") return row.x;
  return row.y;
}

function floorGuideRowsForPlanSide(
  floorSignatureRows: readonly OpeningSignatureFloorRow[],
  planSide: PlanSide,
): FloorGuideRow[] {
  return floorSignatureRows
    .filter(
      (row): row is OpeningSignatureFloorRow & { planSide: PlanSide } => row.planSide === planSide,
    )
    .sort((a, b) => floorSideOrderValue(a) - floorSideOrderValue(b))
    .map((row, index) => ({
      ...row,
      id: `F${index + 1}`,
      order: floorSideOrderValue(row),
    }));
}

function candidateTable(candidates: readonly Candidate[]): string {
  return candidates
    .map(
      (candidate) =>
        `${candidate.id}: ${candidate.kind}, ${candidate.widthMm}x${candidate.heightMm}mm, ` +
        `${candidate.faceBandId}, source=${candidate.source}, ` +
        `compatibleFloorRows=${candidate.compatibleFloorRowIds.join(",") || "none"}`,
    )
    .join("\n");
}

function floorGuideTable(rows: readonly FloorGuideRow[]): string {
  if (rows.length === 0) return "No floor-plan guide rows for this face.";
  return rows
    .map(
      (row) =>
        `${row.id}: ${row.source}, room=${row.room}, ${row.widthMm}x${row.heightMm}mm, ` +
        `${row.planSide}, order=${Math.round(row.order)}, note=${row.note}`,
    )
    .join("\n");
}

function fusionSystemPrompt(): string {
  return `Return ONLY valid JSON. No markdown, no prose.
You are reviewing one residential elevation face crop with numbered deterministic vector candidate boxes.

Your job is NOT to measure and NOT to draw boxes.
Your job is to map floor-plan guide rows to elevation candidate IDs, then classify the physical openings.

Rules:
- Use only candidate IDs printed on the image and listed in the candidate table.
- Use the floor-plan guide rows as the primary expectation: width, likely height, side, and order.
- A floor guide row is not automatically true. If the image/candidate geometry disagrees, mark it missing or review instead of forcing a match.
- A real opening is a window, slider/ranch slider, external door, or sectional/roller garage door.
- Ignore cladding boards, brick hatch, roof lines, dimension text, shadows, mullions, and panels inside one opening.
- Count physical outer openings, not visible glass fragments. One outer frame / one break in the wall = one opening row.
- Sidelights, highlights, gable/triangular glass, door leaves, panes, mullions, and fixed glass inside the same outer frame are components of the same opening. Merge them into one opening.
- Do not output "slider plus window" when the window/glass is inside the same 3.6m slider/door assembly. Return one opening with all relevant candidate IDs.
- If multiple candidate IDs are parts of the same physical opening, put them together in one candidateIds array and set action="merge".
- If one candidate already covers the full outer frame, do not also include nested/adjacent component candidate IDs inside it.
- Only link a floorRowId to a candidate when the candidate table says that candidate is compatible with that floor row, or when a merged outer assembly is clearly compatible as a whole.
- Repeated same-size windows are normal. Do not flag or reject candidates just because two openings have the same dimensions.
- Judge candidate fit visually against the floor guide and picture:
  - candidateFit="fits" when the box covers the whole physical outer opening well enough for measurement.
  - candidateFit="partial" when the box covers only half/part of the opening.
  - candidateFit="oversized" when the box includes cladding, wall area, or multiple openings.
  - candidateFit="fragment" when the box is a pane/mullion/sash inside a larger opening.
  - candidateFit="wrong" when it is not the expected opening.
  - candidateFit="unclear" when the image cannot decide.
- Prefer one physical opening over nested parts. A lower pane, mullion bay, inner rail rectangle, or duplicate nested box inside a larger already-selected opening is not another opening.
- Only classify a candidate as external_door if an actual door leaf/opening is visible. A skinny vertical cladding board, brick pier, mullion, or frame side is not a door.
- If a floor row is expected but no candidate fits, list it in missedVisibleOpenings with the floorRowIds.
- If a visible opening has no usable candidate ID, list it in missedVisibleOpenings instead of inventing a box.
- The candidate table deliberately does not tell you the detector's suggested type. Use the picture.

Return exactly:
{
  "openings": [
    {
      "candidateIds": ["C1"],
      "floorRowIds": ["F1"],
      "type": "window" | "slider" | "external_door" | "garage_door" | "unknown",
      "confidence": "high" | "medium" | "low",
      "action": "opening" | "merge" | "review",
      "candidateFit": "fits" | "partial" | "oversized" | "fragment" | "wrong" | "unclear",
      "candidateFitReason": "short reason",
      "reason": "short reason"
    }
  ],
  "ignored": [
    { "candidateId": "C2", "reason": "short reason" }
  ],
  "missedVisibleOpenings": [
    {
      "floorRowIds": ["F2"],
      "description": "short location/type description",
      "likelyType": "window" | "slider" | "external_door" | "garage_door" | "unknown",
      "reasonNoCandidate": "why no candidate ID fits"
    }
  ],
  "summary": "short summary"
}`;
}

async function callCandidateSelector(args: {
  overlayPng: string;
  candidates: readonly Candidate[];
  floorGuideRows: readonly FloorGuideRow[];
  planSide: PlanSide;
  elevationFace: string;
}): Promise<{ raw: string; parsed: AiResponse | null }> {
  const userText = `Map the floor-plan guide rows to these deterministic elevation candidates.

Face:
${args.planSide} -> ${args.elevationFace}

Candidate table:
${candidateTable(args.candidates)}

Floor-plan guide rows for this elevation face:
${floorGuideTable(args.floorGuideRows)}

Remember: floor rows guide expected openings; vector boxes provide measurement candidates; vision decides mapping/grouping/classification. Do not invent boxes.`;

  const raw = await callVisionModel(
    getAnthropicApiKey(),
    fusionSystemPrompt(),
    userText,
    readFileSync(args.overlayPng).toString("base64"),
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
    if (widthMm > MAX_SINGLE_OPENING_CANDIDATE_WIDTH_MM)
      reasons.push("slider width above one-opening candidate limit; likely merged assemblies");
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

function combineSanity(
  base: ScoredOpening["deterministicSanity"],
  additions: Array<{ status: "review" | "fail"; reason: string }>,
): ScoredOpening["deterministicSanity"] {
  if (additions.length === 0) return base;
  const hasFail = additions.some((addition) => addition.status === "fail");
  const status = hasFail ? "fail" : base.status === "fail" ? "fail" : "review";
  return {
    status,
    reasons: [...base.reasons, ...additions.map((addition) => addition.reason)],
  };
}

function rectContains(outer: PdfRect, inner: PdfRect, pad = 1): boolean {
  return (
    inner.x0 >= outer.x0 - pad &&
    inner.x1 <= outer.x1 + pad &&
    inner.y0 >= outer.y0 - pad &&
    inner.y1 <= outer.y1 + pad
  );
}

function rectGap(a: PdfRect, b: PdfRect): { x: number; y: number } {
  return {
    x: Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)),
    y: Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)),
  };
}

function overlapLengthRatio(a0: number, a1: number, b0: number, b1: number): number {
  const overlap = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const minLength = Math.max(1, Math.min(a1 - a0, b1 - b0));
  return overlap / minLength;
}

function sameAssemblyEdgeTouch(a: PdfRect, b: PdfRect): boolean {
  const gap = rectGap(a, b);
  const horizontalOverlap = overlapLengthRatio(a.x0, a.x1, b.x0, b.x1);
  const verticalOverlap = overlapLengthRatio(a.y0, a.y1, b.y0, b.y1);
  return (gap.y <= 2 && horizontalOverlap >= 0.55) || (gap.x <= 2 && verticalOverlap >= 0.55);
}

function truthDimensionCompatible(widthMm: number, heightMm: number, truth: TruthOpening): boolean {
  const widthTolerance = Math.max(150, Math.round(truth.widthMm * 0.06));
  const heightTolerance = Math.max(150, Math.round(truth.heightMm * 0.08));
  return (
    Math.abs(widthMm - truth.widthMm) <= widthTolerance &&
    Math.abs(heightMm - truth.heightMm) <= heightTolerance
  );
}

function floorDimensionCompatible(widthMm: number, heightMm: number, row: FloorGuideRow): boolean {
  const widthTolerance = Math.max(180, Math.round(row.widthMm * 0.08));
  const heightTolerance = Math.max(180, Math.round(row.heightMm * 0.1));
  return (
    Math.abs(widthMm - row.widthMm) <= widthTolerance &&
    Math.abs(heightMm - row.heightMm) <= heightTolerance
  );
}

function compatibleFloorRowIds(
  candidate: Pick<Candidate, "widthMm" | "heightMm">,
  floorRows: readonly FloorGuideRow[],
): string[] {
  return floorRows
    .filter((row) => floorDimensionCompatible(candidate.widthMm, candidate.heightMm, row))
    .map((row) => row.id);
}

function floorDeltaScore(
  candidate: Pick<Candidate, "widthMm" | "heightMm">,
  floorRows: readonly FloorGuideRow[],
): number {
  return Math.min(
    ...floorRows.map(
      (row) =>
        Math.abs(candidate.widthMm - row.widthMm) + Math.abs(candidate.heightMm - row.heightMm),
    ),
  );
}

function scoreAiOpenings(args: {
  ai: AiResponse;
  candidates: readonly Candidate[];
  floorGuideRows: readonly FloorGuideRow[];
  truth: readonly TruthOpening[];
}): ScoredOpening[] {
  const byId = new Map(args.candidates.map((candidate) => [candidate.id, candidate]));
  const floorById = new Map(args.floorGuideRows.map((row) => [row.id, row]));
  const contexts = args.ai.openings.map((opening) => {
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
    const floorGuideMatches = (opening.floorRowIds ?? []).map((id) => {
      const row = floorById.get(id);
      return row == null
        ? {
            id,
            source: "missing_floor_row",
            room: "",
            widthMm: 0,
            heightMm: 0,
            widthDeltaMm: null,
            heightDeltaMm: null,
            dimensionCompatible: false,
          }
        : {
            id: row.id,
            source: row.source,
            room: row.room,
            widthMm: row.widthMm,
            heightMm: row.heightMm,
            widthDeltaMm: widthMm == null ? null : widthMm - row.widthMm,
            heightDeltaMm: heightMm == null ? null : heightMm - row.heightMm,
            dimensionCompatible:
              widthMm != null &&
              heightMm != null &&
              floorDimensionCompatible(widthMm, heightMm, row),
          };
    });
    return {
      opening,
      selected,
      foundCandidateIds,
      missingCandidateIds,
      union,
      widthMm,
      heightMm,
      areaM2,
      floorGuideMatches,
    };
  });
  const selectedFloorRowUseCount = new Map<string, number>();
  for (const context of contexts) {
    for (const floorRowId of context.opening.floorRowIds ?? []) {
      selectedFloorRowUseCount.set(floorRowId, (selectedFloorRowUseCount.get(floorRowId) ?? 0) + 1);
    }
  }

  return contexts.map((context, index) => {
    const { opening, foundCandidateIds, missingCandidateIds, union, widthMm, heightMm, areaM2 } =
      context;
    const additions: Array<{ status: "review" | "fail"; reason: string }> = [];
    if ((opening.floorRowIds ?? []).length === 0) {
      additions.push({
        status: "review",
        reason: "selected visible opening has no floor-plan guide row; evidence only",
      });
    } else if (
      context.floorGuideMatches.length > 0 &&
      !context.floorGuideMatches.some((match) => match.dimensionCompatible)
    ) {
      additions.push({
        status: "fail",
        reason: "selected candidate dimensions do not agree with linked floor-plan row",
      });
    }
    for (const floorRowId of opening.floorRowIds ?? []) {
      if ((selectedFloorRowUseCount.get(floorRowId) ?? 0) > 1) {
        additions.push({
          status: "fail",
          reason: `floor-plan guide row ${floorRowId} reused by multiple selected openings; identity/count unresolved`,
        });
      }
    }
    if (opening.candidateFit && opening.candidateFit !== "fits") {
      additions.push({
        status:
          opening.candidateFit === "wrong" || opening.candidateFit === "fragment"
            ? "fail"
            : "review",
        reason: `vision candidate-fit ${opening.candidateFit}: ${opening.candidateFitReason ?? "no reason supplied"}`,
      });
    }
    if (union) {
      for (let otherIndex = 0; otherIndex < contexts.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        const other = contexts[otherIndex];
        if (!other.union) continue;
        const thisArea = rectArea(union);
        const otherArea = rectArea(other.union);
        const overlap = rectOverlapRatio(union, other.union);
        if (thisArea <= otherArea && (rectContains(other.union, union, 2) || overlap >= 0.55)) {
          additions.push({
            status: "fail",
            reason: `candidate selection overlaps/is contained by ${other.opening.candidateIds.join("+")}; likely same outer assembly split into multiple openings`,
          });
          break;
        }
        if (thisArea > otherArea && (rectContains(union, other.union, 2) || overlap >= 0.55)) {
          additions.push({
            status: "review",
            reason: `selection contains/overlaps ${other.opening.candidateIds.join("+")}; verify same outer assembly was not split`,
          });
        }
      }
    }
    const deterministicSanity = combineSanity(
      openingSanity(opening.type, widthMm, heightMm),
      additions,
    );
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
      floorGuideMatches: context.floorGuideMatches,
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

function unmatchedFloorRows(args: {
  floorGuideRows: readonly FloorGuideRow[];
  ai: AiResponse;
}): FloorGuideRow[] {
  const referenced = new Set([
    ...args.ai.openings.flatMap((opening) => opening.floorRowIds ?? []),
    ...args.ai.missedVisibleOpenings.flatMap((opening) => opening.floorRowIds ?? []),
  ]);
  return args.floorGuideRows.filter((row) => !referenced.has(row.id));
}

function cropForBand(band: ElevationFaceBand, page: { width: number; height: number }): PdfRect {
  return {
    x0: Math.max(0, band.x0 - 90),
    x1: Math.min(page.width, band.x1 + 90),
    y0: Math.max(0, band.y0 - 65),
    y1: Math.min(page.height, band.y1 + 45),
  };
}

function buildCleanCandidateList(args: {
  vectorOpenings: readonly ElevationVectorOpening[];
  slots: readonly FrameOpeningSlot[];
  elevationSegments: readonly Segment[];
  floorRows: readonly FloorGuideRow[];
  faceBandId: string;
  crop: PdfRect;
}): Candidate[] {
  const candidates: Omit<Candidate, "id">[] = [];

  for (const opening of args.vectorOpenings) {
    if (opening.widthMm == null || opening.heightMm == null) continue;
    if (opening.faceBandId !== args.faceBandId) continue;
    if (
      opening.source !== "sectional_garage_door" &&
      opening.widthMm > MAX_SINGLE_OPENING_CANDIDATE_WIDTH_MM
    ) {
      continue;
    }
    const skinnyFullHeight = opening.heightMm >= 1750 && opening.widthMm < 700;
    if (
      opening.source !== "sectional_garage_door" &&
      opening.source !== "multi_panel_slider" &&
      skinnyFullHeight
    ) {
      continue;
    }
    const rect = rectForOpening(opening);
    if (!rectIntersects(rect, args.crop)) continue;
    candidates.push({
      kind: "vector_opening",
      source: opening.source,
      faceBandId: opening.faceBandId,
      suggestedType: opening.type,
      widthMm: opening.widthMm,
      heightMm: opening.heightMm,
      rect,
      notes: opening.notes,
      compatibleFloorRowIds: [],
    });
  }

  const slotsByGroup = new Map<string, FrameOpeningSlot[]>();
  for (const slot of args.slots) {
    if (slot.faceBandId !== args.faceBandId) continue;
    const rect = { x0: slot.x0, x1: slot.x1, y0: slot.y0, y1: slot.y1 };
    if (!rectIntersects(rect, args.crop)) continue;
    const existing = slotsByGroup.get(slot.groupId);
    if (existing) existing.push(slot);
    else slotsByGroup.set(slot.groupId, [slot]);
  }

  for (const [groupId, groupSlots] of slotsByGroup.entries()) {
    const memberMap = new Map<string, FrameAssemblyMember>();
    for (const slot of groupSlots) {
      for (const member of slot.members) memberMap.set(memberKey(member), member);
    }
    const members = [...memberMap.values()];
    const rect = rectUnion(members.map((member) => member));
    if (!rect || !rectIntersects(rect, args.crop)) continue;
    const widthMm = ptToMm(rect.x1 - rect.x0);
    const heightMm = ptToMm(rect.y1 - rect.y0);
    if (widthMm > MAX_SINGLE_OPENING_CANDIDATE_WIDTH_MM) continue;
    if (heightMm >= 1750 && widthMm < 700) continue;
    candidates.push({
      kind: "frame_assembly",
      source: groupId,
      faceBandId: groupSlots[0]?.faceBandId ?? "unknown-face",
      suggestedType: null,
      widthMm,
      heightMm,
      rect,
      notes: [
        `${groupSlots.length} slots; ${members.length} unique member rects; assembly-level menu candidate`,
      ],
      compatibleFloorRowIds: [],
    });
  }

  const refined = candidates.filter((candidate) => {
    if (candidate.kind !== "frame_assembly") return true;
    return !candidates.some(
      (other) =>
        other !== candidate &&
        other.kind === "vector_opening" &&
        rectArea(other.rect) < rectArea(candidate.rect) &&
        rectOverlapRatio(candidate.rect, other.rect) >= 0.62,
    );
  });

  const rawRescues: Omit<Candidate, "id">[] = [];
  const frameRects = frameRectangleCandidates(args.elevationSegments)
    .filter((rect) => rectIntersects(rect, args.crop))
    .filter((rect) => rect.widthMm >= 400 && rect.widthMm <= 2200)
    .filter((rect) => rect.heightMm >= 450 && rect.heightMm <= 2450)
    .filter((rect) => !(rect.heightMm >= 1750 && rect.widthMm < 700))
    .filter((rect) => compatibleFloorRowIds(rect, args.floorRows).length > 0)
    .sort(
      (a, b) =>
        floorDeltaScore(a, args.floorRows) - floorDeltaScore(b, args.floorRows) ||
        rectArea(b) - rectArea(a),
    );
  for (const rect of frameRects) {
    const duplicateOfExisting = refined.some(
      (candidate) =>
        rectOverlapRatio(candidate.rect, rect) >= 0.55 || rectContains(candidate.rect, rect, 2),
    );
    if (duplicateOfExisting) continue;
    const duplicateOfRescue = rawRescues.some(
      (candidate) =>
        rectOverlapRatio(candidate.rect, rect) >= 0.55 ||
        rectContains(candidate.rect, rect, 2) ||
        rectContains(rect, candidate.rect, 2) ||
        sameAssemblyEdgeTouch(candidate.rect, rect),
    );
    if (duplicateOfRescue) continue;
    rawRescues.push({
      kind: "raw_frame_rescue",
      source: "raw_frame_rescue",
      faceBandId: args.faceBandId,
      suggestedType: "window",
      widthMm: rect.widthMm,
      heightMm: rect.heightMm,
      rect,
      notes: [
        "raw elevation frame rectangle inside face crop; rescue candidate because face-band slot detector did not surface this opening",
      ],
      compatibleFloorRowIds: [],
    });
  }

  const withCompatibility = [...refined, ...rawRescues].map((candidate) => ({
    ...candidate,
    compatibleFloorRowIds: compatibleFloorRowIds(candidate, args.floorRows),
  }));

  const deFragmented = withCompatibility.filter((candidate) => {
    if (candidate.compatibleFloorRowIds.length > 0) return true;
    return !withCompatibility.some(
      (other) =>
        other !== candidate &&
        other.compatibleFloorRowIds.length > 0 &&
        (rectContains(other.rect, candidate.rect, 2) ||
          rectOverlapRatio(other.rect, candidate.rect) >= 0.55 ||
          sameAssemblyEdgeTouch(other.rect, candidate.rect)),
    );
  });

  const floorGuided = deFragmented.filter(
    (candidate) =>
      candidate.compatibleFloorRowIds.length > 0 || candidate.source === "sectional_garage_door",
  );

  return floorGuided
    .sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0)
    .map((candidate, index) => ({ ...candidate, id: `C${index + 1}` }));
}

async function drawCandidateOverlay(args: {
  fullImagePath: string;
  page: { width: number; height: number };
  crop: PdfRect;
  candidates: readonly Candidate[];
  floorRows: readonly FloorGuideRow[];
  outPng: string;
  ai?: AiResponse;
  scoredOpenings?: readonly ScoredOpening[];
  title: string;
}) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(args.fullImagePath);
  const scale = image.width / args.page.width;
  const sx = args.crop.x0 * scale;
  const sy = args.crop.y0 * scale;
  const sw = (args.crop.x1 - args.crop.x0) * scale;
  const sh = (args.crop.y1 - args.crop.y0) * scale;
  const panelWidth = 520;
  const canvas = createCanvas(Math.ceil(sw + panelWidth), Math.ceil(sh));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  const selectedIds = new Set(args.ai?.openings.flatMap((opening) => opening.candidateIds) ?? []);
  const statusByCandidateId = new Map<string, ScoredOpening["deterministicSanity"]["status"]>();
  for (const opening of args.scoredOpenings ?? []) {
    for (const candidateId of opening.ai.candidateIds) {
      statusByCandidateId.set(candidateId, opening.deterministicSanity.status);
    }
  }
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
    const status = statusByCandidateId.get(candidate.id);
    ctx.lineWidth = selected ? 5 : 3;
    ctx.strokeStyle =
      status === "pass"
        ? "#16a34a"
        : status === "review"
          ? "#f59e0b"
          : status === "fail"
            ? "#dc2626"
            : selected
              ? "#16a34a"
              : ignored
                ? "#6b7280"
                : "#2563eb";
    ctx.setLineDash(selected || ignored ? [] : [7, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    drawText(candidate.id, x + 4, Math.max(16, y - 5), ctx.strokeStyle);
  }

  const panelX = Math.ceil(sw) + 18;
  ctx.fillStyle = "#111827";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(args.title, panelX, 30);
  ctx.font = "13px sans-serif";
  ctx.fillText(`Candidates: ${args.candidates.length}`, panelX, 54);
  ctx.fillText(`Floor rows: ${args.floorRows.length}`, panelX, 74);
  ctx.fillText(`Selected: ${args.ai?.openings.length ?? 0}`, panelX, 94);
  if (args.scoredOpenings) {
    const pass = args.scoredOpenings.filter(
      (opening) => opening.deterministicSanity.status === "pass",
    ).length;
    const review = args.scoredOpenings.filter(
      (opening) => opening.deterministicSanity.status === "review",
    ).length;
    const fail = args.scoredOpenings.filter(
      (opening) => opening.deterministicSanity.status === "fail",
    ).length;
    ctx.fillText(`Score: ${pass} pass / ${review} review / ${fail} fail`, panelX, 114);
  }
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("Floor guide", panelX, args.scoredOpenings ? 146 : 126);
  ctx.font = "12px sans-serif";
  let y = args.scoredOpenings ? 168 : 148;
  for (const row of args.floorRows.slice(0, 10)) {
    ctx.fillText(`${row.id} ${row.room.slice(0, 18)} ${row.widthMm}x${row.heightMm}`, panelX, y);
    y += 17;
  }
  if (args.ai?.summary) {
    y += 12;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("AI summary", panelX, y);
    y += 20;
    ctx.font = "12px sans-serif";
    const words = args.ai.summary.split(/\s+/);
    let line = "";
    for (const word of words) {
      if ((line + " " + word).length > 62) {
        ctx.fillText(line, panelX, y);
        y += 16;
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) ctx.fillText(line, panelX, y);
  }

  writeFileSync(args.outPng, await canvas.encode("png"));
}

async function auditFace(args: {
  fullImagePath: string;
  page: { width: number; height: number };
  anchor: OpeningFaceAnchor;
  band: ElevationFaceBand;
  vectorOpenings: readonly ElevationVectorOpening[];
  slots: readonly FrameOpeningSlot[];
  elevationSegments: readonly Segment[];
  floorSignatureRows: readonly OpeningSignatureFloorRow[];
  truth: readonly TruthOpening[];
}): Promise<FaceAudit> {
  const crop = cropForBand(args.band, args.page);
  const floorRows = floorGuideRowsForPlanSide(args.floorSignatureRows, args.anchor.planSide);
  const candidates = buildCleanCandidateList({
    vectorOpenings: args.vectorOpenings,
    slots: args.slots,
    elevationSegments: args.elevationSegments,
    floorRows,
    faceBandId: args.anchor.elevationFaceBandId,
    crop,
  });
  const slug = `${args.anchor.planSide}-${args.anchor.elevationFace}`;
  const candidateOverlay = resolve(OUT_DIR, `${slug}-candidate-ids.png`);
  await drawCandidateOverlay({
    fullImagePath: args.fullImagePath,
    page: args.page,
    crop,
    candidates,
    floorRows,
    outPng: candidateOverlay,
    title: `${args.anchor.planSide} -> ${args.anchor.elevationFace}`,
  });

  const aiResult = await callCandidateSelector({
    overlayPng: candidateOverlay,
    candidates,
    floorGuideRows: floorRows,
    planSide: args.anchor.planSide,
    elevationFace: args.anchor.elevationFace,
  });
  const ai = normaliseAiResponse(aiResult.parsed);
  const scoredOpenings = scoreAiOpenings({
    ai,
    candidates,
    floorGuideRows: floorRows,
    truth: args.truth,
  });
  const selectedOverlay = resolve(OUT_DIR, `${slug}-ai-selection.png`);
  await drawCandidateOverlay({
    fullImagePath: args.fullImagePath,
    page: args.page,
    crop,
    candidates,
    floorRows,
    ai,
    scoredOpenings,
    outPng: selectedOverlay,
    title: `${args.anchor.planSide} -> ${args.anchor.elevationFace}`,
  });
  const unmatched = unmatchedFloorRows({ floorGuideRows: floorRows, ai });

  return {
    planSide: args.anchor.planSide,
    elevationFace: args.anchor.elevationFace,
    anchorKind: args.anchor.kind,
    anchorNote: args.anchor.note,
    crop,
    floorRows,
    candidates,
    ai,
    scoredOpenings,
    unmatchedFloorRows: unmatched,
    scoreSummary: {
      floorRows: floorRows.length,
      candidates: candidates.length,
      selectedOpenings: scoredOpenings.length,
      sanityPass: scoredOpenings.filter((opening) => opening.deterministicSanity.status === "pass")
        .length,
      sanityReview: scoredOpenings.filter(
        (opening) => opening.deterministicSanity.status === "review",
      ).length,
      sanityFail: scoredOpenings.filter((opening) => opening.deterministicSanity.status === "fail")
        .length,
      assemblySplitConflicts: scoredOpenings.filter((opening) =>
        opening.deterministicSanity.reasons.some((reason) =>
          /same outer assembly|split/.test(reason),
        ),
      ).length,
      floorGuideCompatible: scoredOpenings.filter((opening) =>
        opening.floorGuideMatches.some((match) => match.dimensionCompatible),
      ).length,
      truthCompatible: scoredOpenings.filter((opening) => opening.nearestTruth?.dimensionCompatible)
        .length,
      unmatchedFloorRows: unmatched.length,
      missedVisibleOpenings: ai.missedVisibleOpenings.length,
    },
    artifacts: { candidateOverlay, selectedOverlay },
    rawAiText: aiResult.raw,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const floor = await pageGeometry(FENNER_FLOORPLAN, PAGE_NUMBER);
  const planText = parsePlanText(floor.geom.labels);
  const physicalWitnesses = detectPhysicalOpeningWidthWitnesses({
    planText,
    segments: floor.geom.segments,
    labels: floor.geom.labels,
    scale: 100,
  });
  const printedCodeWitnesses = detectPrintedWindowCodeWitnesses(planText);
  const floorSignatureRows = buildOpeningSignatureFloorRows({
    planText,
    physicalWitnesses,
    printedCodeWitnesses,
  });
  const floorSideLengthWitnesses = detectPlanSideLengthWitnesses(floor.geom.labels);

  const elevation = await runElevationVectorEvidence(readFileSync(FENNER_ELEVATIONS), PAGE_NUMBER);
  const elevationPage = await pageGeometry(FENNER_ELEVATIONS, PAGE_NUMBER);
  const faceMap = buildOpeningFaceMap({
    planText,
    elevationOpenings: elevation.elevationOpenings,
    faceBands: elevation.elevationFaceBands,
    physicalOpeningWitnesses: physicalWitnesses,
    openingSlots: elevation.elevationOpeningSlots,
    floorSignatureRows,
    floorSideLengthWitnesses,
  });
  const fullImagePath = renderPdfPage(FENNER_ELEVATIONS, resolve(OUT_DIR, "fenner-elevation-2800"));
  const bandsById = new Map(elevation.elevationFaceBands.map((band) => [band.id, band]));
  const anchors = [...faceMap.byPlanSide.values()].sort((a, b) =>
    a.planSide.localeCompare(b.planSide),
  );
  const truth = loadTruth();
  const faces: FaceAudit[] = [];
  for (const anchor of anchors) {
    const band = bandsById.get(anchor.elevationFaceBandId);
    if (!band) continue;
    console.log(`auditing ${anchor.planSide} -> ${anchor.elevationFace} (${anchor.kind})`);
    faces.push(
      await auditFace({
        fullImagePath,
        page: elevationPage.page,
        anchor,
        band,
        vectorOpenings: elevation.elevationOpenings,
        slots: elevation.elevationOpeningSlots,
        elevationSegments: elevationPage.geom.segments,
        floorSignatureRows,
        truth,
      }),
    );
  }

  const mappedPlanSides = new Set(faces.map((face) => face.planSide));
  const unmappedPlanSides = (
    ["plan_top", "plan_bottom", "plan_left", "plan_right"] as const
  ).filter((side) => !mappedPlanSides.has(side));
  const report = {
    job: "fenner",
    mode: "diagnostic_only_floor_guided_face_fusion",
    mappedFaces: faces.length,
    unmappedPlanSides,
    faceMap: [...faceMap.byPlanSide.entries()].map(([planSide, anchor]) => ({
      planSide,
      elevationFace: anchor.elevationFace,
      kind: anchor.kind,
      note: anchor.note,
    })),
    floorSideLengthWitnesses,
    faces,
    artifacts: {
      fullImagePath,
    },
  };
  writeFileSync(
    resolve(OUT_DIR, "fenner-face-fusion-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log("\nFace fusion summary");
  for (const face of faces) {
    console.log(
      `${face.planSide} -> ${face.elevationFace} ${face.anchorKind}: ` +
        `floor=${face.scoreSummary.floorRows}, candidates=${face.scoreSummary.candidates}, ` +
        `selected=${face.scoreSummary.selectedOpenings}, pass=${face.scoreSummary.sanityPass}, ` +
        `review=${face.scoreSummary.sanityReview}, fail=${face.scoreSummary.sanityFail}, ` +
        `assembly-splits=${face.scoreSummary.assemblySplitConflicts}, ` +
        `floor-compatible=${face.scoreSummary.floorGuideCompatible}, unmatched=${face.scoreSummary.unmatchedFloorRows}`,
    );
    for (const opening of face.scoredOpenings) {
      const recovered =
        opening.recovered.widthMm == null || opening.recovered.heightMm == null
          ? "?x?"
          : `${opening.recovered.widthMm}x${opening.recovered.heightMm}`;
      const floorMatch = opening.floorGuideMatches.length
        ? opening.floorGuideMatches
            .map(
              (match) => `${match.id}:${match.room} d=${match.widthDeltaMm}/${match.heightDeltaMm}`,
            )
            .join("|")
        : "no floor row";
      console.log(
        `  ${opening.ai.type.padEnd(13)} ${opening.ai.candidateIds.join("+").padEnd(10)} ` +
          `${recovered.padEnd(10)} ${opening.deterministicSanity.status.padEnd(6)} ${floorMatch}`,
      );
    }
    if (face.unmatchedFloorRows.length > 0) {
      console.log(
        `  unmatched floor rows: ${face.unmatchedFloorRows
          .map((row) => `${row.id}:${row.room} ${row.widthMm}x${row.heightMm}`)
          .join(", ")}`,
      );
    }
  }
  console.log(`wrote ${resolve(OUT_DIR, "fenner-face-fusion-audit.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
