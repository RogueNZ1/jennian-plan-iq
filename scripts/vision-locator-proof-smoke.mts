// Vision locator -> deterministic proof smoke test.
//
// DIAGNOSTIC-ONLY. Calls the shipped Visual QS floor-plan prompt, then pushes
// those locators through the real deterministic recovery/promotion gate:
//   visual locator -> physical floor width witness -> elevation opening -> priced/review.
//
// Run:
//   npx tsx --env-file=.env.local scripts/vision-locator-proof-smoke.mts

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPageGeometry } from "../src/lib/doors/pdf-adapter.ts";
import { parsePlanText } from "../src/lib/takeoff/plan-text.ts";
import {
  detectPhysicalOpeningWidthWitnesses,
  detectPrintedWindowCodeWitnesses,
  type PlanPrintedWindowCodeWitness,
} from "../src/lib/takeoff/floor-opening-witnesses.ts";
import { runElevationVectorEvidence } from "../src/lib/takeoff/run-elevation-vector-openings.ts";
import { mergeElevationVectorOpenings } from "../src/lib/takeoff/elevation-vector-openings.ts";
import { normaliseVisualOpeningAudit } from "../src/lib/takeoff/visual-opening-audit.ts";
import { recoverVisualAuditFromElevationLedger } from "../src/lib/takeoff/visual-opening-elevation-recovery.ts";
import { promoteVisualOpenings } from "../src/lib/takeoff/visual-opening-promotion.ts";
import { ANTHROPIC_MODEL, safeParseJson } from "../src/lib/takeoff/anthropic-client.ts";
import type { VisualOpeningAudit } from "../src/lib/takeoff/visual-opening-audit.ts";
import type { ElevationOpeningCandidate } from "../src/lib/takeoff/extract-elevations.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT_DIR = resolve(ROOT, "output/diagnostics/vision-locator-proof");
const RENDER_WIDTH = 1400;
const DIM_TOL_MM = 180;
const NEAR_WITNESS_FACTOR = 0.18;

type JobCfg = {
  job: string;
  floorPlan: string;
  floorPage: number;
  elevation: string;
  elevationPage: number;
  truth: string;
};

const JOBS: JobCfg[] = [
  {
    job: "fenner",
    floorPlan: "tests/doors/plans/fenner-floorplan.pdf",
    floorPage: 1,
    elevation: "tests/doors/plans/fenner-elevations.pdf",
    elevationPage: 1,
    truth: "tests/fixtures/fenner/ground-truth.json",
  },
  {
    job: "15a",
    floorPlan: "tests/fixtures/15a/floorplan.pdf",
    floorPage: 1,
    elevation: "tests/fixtures/15a/elevations.pdf",
    elevationPage: 1,
    truth: "tests/fixtures/15a/ground-truth.json",
  },
  {
    job: "oneil",
    floorPlan: "tests/fixtures/oneil/floorplan.pdf",
    floorPage: 1,
    elevation: "tests/fixtures/oneil/elevations.pdf",
    elevationPage: 1,
    truth: "tests/fixtures/oneil/ground-truth.json",
  },
  {
    job: "beddis",
    floorPlan: "tests/fixtures/beddis/concept-floorplan.pdf",
    floorPage: 1,
    elevation: "tests/fixtures/beddis/prelim.pdf",
    elevationPage: 5,
    truth: "tests/fixtures/beddis/ground-truth.json",
  },
];

type TruthOpening = {
  room: string;
  widthMm: number;
  heightMm: number;
};

function loadTruth(relPath: string): TruthOpening[] {
  const raw = JSON.parse(readFileSync(resolve(ROOT, relPath), "utf8")) as Record<string, unknown>;
  const sourceRows = Array.isArray(raw.manual_openings)
    ? raw.manual_openings
    : ((raw.joinery_bench as { openings?: unknown[] } | undefined)?.openings ?? []);
  const out: TruthOpening[] = [];
  for (const row of sourceRows as Array<Record<string, unknown>>) {
    const qty = typeof row.qty === "number" && row.qty > 0 ? Math.round(row.qty) : 1;
    const widthM = typeof row.width_m === "number" ? row.width_m : null;
    const heightM = typeof row.height_m === "number" ? row.height_m : null;
    if (widthM == null || heightM == null) continue;
    for (let i = 0; i < qty; i++) {
      out.push({
        room: String(row.room ?? ""),
        widthMm: Math.round(widthM * 1000),
        heightMm: Math.round(heightM * 1000),
      });
    }
  }
  return out;
}

function normRoom(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function roomMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normRoom(a);
  const y = normRoom(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

function dimsMatch(widthMm: number, heightMm: number, truth: TruthOpening): boolean {
  return (
    Math.abs(widthMm - truth.widthMm) <= DIM_TOL_MM &&
    Math.abs(heightMm - truth.heightMm) <= DIM_TOL_MM
  );
}

function compatibleType(
  visualType: VisualOpeningAudit["openings"][number]["type"],
  elevationType: ElevationOpeningCandidate["type"],
): boolean {
  if (visualType === "garage_door") return elevationType === "garage_door";
  if (visualType === "slider") return elevationType === "slider";
  if (visualType === "external_door" || visualType === "pa_door") {
    return elevationType === "external_door";
  }
  if (visualType === "window" || visualType === "garage_window") return elevationType === "window";
  return false;
}

function usableElevationOpening(
  candidate: ElevationOpeningCandidate,
): candidate is ElevationOpeningCandidate & {
  widthMm: number;
  heightMm: number;
  confidence: "high" | "medium";
} {
  return (
    candidate.quantity === 1 &&
    candidate.widthMm != null &&
    candidate.heightMm != null &&
    candidate.widthMm > 0 &&
    candidate.heightMm > 0 &&
    candidate.confidence !== "low"
  );
}

function widthToleranceMm(widthMm: number): number {
  return Math.max(100, Math.round(widthMm * 0.08));
}

function visualPrintedDimsAgree(
  opening: VisualOpeningAudit["openings"][number],
  witness: PlanPrintedWindowCodeWitness,
): boolean {
  if (opening.width_m == null || opening.height_m == null) return true;
  const visualWidthMm = Math.round(opening.width_m * 1000);
  const visualHeightMm = Math.round(opening.height_m * 1000);
  const widthTol = Math.max(DIM_TOL_MM, Math.round(witness.widthMm * 0.12));
  const heightTol = Math.max(DIM_TOL_MM, Math.round(witness.heightMm * 0.12));
  const direct =
    Math.abs(visualWidthMm - witness.widthMm) <= widthTol &&
    Math.abs(visualHeightMm - witness.heightMm) <= heightTol;
  const swapped =
    Math.abs(visualHeightMm - witness.widthMm) <= widthTol &&
    Math.abs(visualWidthMm - witness.heightMm) <= heightTol;
  return direct || swapped;
}

function witnessDistance(
  opening: VisualOpeningAudit["openings"][number],
  witness: { x: number; y: number },
  page: { width: number; height: number },
): number {
  return Math.hypot(witness.x - opening.x * page.width, witness.y - opening.y * page.height);
}

function findPdftoppm(): string {
  const candidates = [
    resolve(
      process.env.USERPROFILE ?? "",
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm.exe",
    ),
    "pdftoppm",
    "pdftoppm.exe",
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-v"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error("pdftoppm not found.");
}

function renderPage(pdfPath: string, page: number, outBase: string): string {
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

async function getPdfPage(pdfPath: string, pageNumber: number) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist-door/legacy/build/pdf.worker.mjs";
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    disableFontFace: true,
  } as never).promise;
  const page = await doc.getPage(pageNumber);
  return { doc, page };
}

async function floorEvidence(pdfPath: string, pageNumber: number) {
  const { doc, page } = await getPdfPage(pdfPath, pageNumber);
  try {
    const geom = await extractPageGeometry(page as never);
    const view = (page as { view: number[] }).view;
    const width = view[2] - view[0];
    const height = view[3] - view[1];
    const planText = parsePlanText(geom.labels);
    const physicalOpeningWidthWitnesses = detectPhysicalOpeningWidthWitnesses({
      planText,
      segments: geom.segments,
      labels: geom.labels,
      scale: 100,
    });
    const printedWindowCodeWitnesses = detectPrintedWindowCodeWitnesses(planText);
    return {
      page: { width, height },
      physicalOpeningWidthWitnesses,
      printedWindowCodeWitnesses,
      planText,
    };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

async function elevationEvidence(pdfPath: string, pageNumber: number) {
  const vector = await runElevationVectorEvidence(readFileSync(pdfPath), pageNumber);
  return mergeElevationVectorOpenings(null, vector);
}

function visualAuditSystemPrompt(): string {
  const sourcePath = resolve(ROOT, "src/lib/takeoff/concept.functions.ts");
  const source = readFileSync(sourcePath, "utf8");
  const fnIndex = source.indexOf("export const extractVisualOpeningAuditFn");
  if (fnIndex < 0) throw new Error("Could not locate extractVisualOpeningAuditFn.");
  const marker = "const system = `";
  const start = source.indexOf(marker, fnIndex);
  if (start < 0) throw new Error("Could not locate visual audit system prompt.");
  const bodyStart = start + marker.length;
  const end = source.indexOf("`;", bodyStart);
  if (end < 0) throw new Error("Could not locate visual audit system prompt terminator.");
  return source.slice(bodyStart, end);
}

async function callVisualAudit(
  apiKey: string,
  floorImageBase64: string,
  elevationImageBase64: string | null,
  pageNumber: number,
): Promise<VisualOpeningAudit> {
  const images = elevationImageBase64
    ? [floorImageBase64, elevationImageBase64]
    : [floorImageBase64];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      temperature: 0,
      system: visualAuditSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Run the Visual QS external-opening audit on this floor plan page. Page number: ${pageNumber}. ${
                elevationImageBase64
                  ? "A second image is supplied: use the elevations only to confirm dimensions for openings visible on the floor plan."
                  : "No elevation image is supplied."
              }`,
            },
            ...images.map((imageBase64) => ({
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 240)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const raw =
    json.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("") ?? "";
  const parsed = safeParseJson<unknown>(raw);
  if (!parsed) {
    throw new Error(`Visual audit response was not valid JSON: ${raw.slice(0, 240)}`);
  }
  return normaliseVisualOpeningAudit(parsed, pageNumber);
}

function nearestWitnessCount(
  audit: VisualOpeningAudit,
  witnesses: ReturnType<typeof detectPhysicalOpeningWidthWitnesses>,
  page: { width: number; height: number },
): number {
  const maxDistancePt = Math.max(page.width, page.height) * NEAR_WITNESS_FACTOR;
  return audit.openings.filter((opening) =>
    witnesses.some((witness) => {
      const x = opening.x * page.width;
      const y = opening.y * page.height;
      return Math.hypot(witness.x - x, witness.y - y) <= maxDistancePt;
    }),
  ).length;
}

function printedCodeDiagnostics(
  audit: VisualOpeningAudit,
  witnesses: readonly PlanPrintedWindowCodeWitness[],
  elevationOpenings: readonly ElevationOpeningCandidate[],
  page: { width: number; height: number },
): {
  nearPrintedCode: number;
  printedCodeWithElevationProof: number;
  details: Array<Record<string, unknown>>;
} {
  const usableElevation = elevationOpenings.filter(usableElevationOpening);
  const maxDistancePt = Math.max(page.width, page.height) * NEAR_WITNESS_FACTOR;
  let nearPrintedCode = 0;
  let printedCodeWithElevationProof = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const opening of audit.openings) {
    const nearby = witnesses
      .map((witness) => ({
        witness,
        distance: witnessDistance(opening, witness, page),
      }))
      .filter(
        ({ witness, distance }) =>
          distance <= maxDistancePt &&
          (!opening.room || roomMatch(opening.room, witness.room)) &&
          visualPrintedDimsAgree(opening, witness),
      )
      .sort((a, b) => a.distance - b.distance);
    if (nearby.length > 0) nearPrintedCode++;

    const compatibleElevation = usableElevation.filter((candidate) =>
      compatibleType(opening.type, candidate.type),
    );
    const proofs = nearby.flatMap(({ witness }) =>
      compatibleElevation
        .filter(
          (candidate) =>
            Math.abs(candidate.widthMm - witness.widthMm) <= widthToleranceMm(witness.widthMm) &&
            Math.abs(candidate.heightMm - witness.heightMm) <= DIM_TOL_MM,
        )
        .map((candidate) => ({ witness, candidate })),
    );
    if (proofs.length === 1) printedCodeWithElevationProof++;

    details.push({
      id: opening.id,
      type: opening.type,
      room: opening.room,
      label: opening.label,
      visualWidthMm: opening.width_m == null ? null : Math.round(opening.width_m * 1000),
      visualHeightMm: opening.height_m == null ? null : Math.round(opening.height_m * 1000),
      nearbyPrintedCodes: nearby.slice(0, 5).map(({ witness, distance }) => ({
        room: witness.room,
        widthMm: witness.widthMm,
        heightMm: witness.heightMm,
        planSide: witness.planSide,
        distancePt: Math.round(distance),
      })),
      compatibleElevationCount: compatibleElevation.length,
      printedCodeElevationProofs: proofs.slice(0, 5).map(({ witness, candidate }) => ({
        room: witness.room,
        code: `${witness.heightMm}x${witness.widthMm}`,
        face: candidate.face,
        elevation: `${candidate.widthMm}x${candidate.heightMm}`,
        type: candidate.type,
      })),
      printedCodeProofCount: proofs.length,
    });
  }

  return { nearPrintedCode, printedCodeWithElevationProof, details };
}

function matchPromotionsToTruth(
  promoted: ReturnType<typeof promoteVisualOpenings>["openings"] | undefined,
  truth: readonly TruthOpening[],
): number {
  const used = new Set<number>();
  let matches = 0;
  for (const opening of promoted ?? []) {
    const widthMm = Math.round(opening.width_m * 1000);
    const heightMm = Math.round(opening.height_m * 1000);
    const index = truth.findIndex(
      (row, i) =>
        !used.has(i) &&
        dimsMatch(widthMm, heightMm, row) &&
        (!opening.room || roomMatch(opening.room, row.room)),
    );
    if (index >= 0) {
      used.add(index);
      matches++;
    }
  }
  return matches;
}

function fmt(n: number, d: number): string {
  return d === 0 ? "n/a" : `${n}/${d}`;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured (use --env-file=.env.local).");
  mkdirSync(OUT_DIR, { recursive: true });
  const summary: Array<Record<string, unknown>> = [];

  for (const job of JOBS) {
    console.log(`\n${"=".repeat(76)}\n${job.job.toUpperCase()}\n${"=".repeat(76)}`);
    const floorPdf = resolve(ROOT, job.floorPlan);
    const elevationPdf = resolve(ROOT, job.elevation);
    const truth = loadTruth(job.truth);
    const floorImage = renderPage(floorPdf, job.floorPage, resolve(OUT_DIR, `${job.job}-floor`));
    const elevationImage = existsSync(elevationPdf)
      ? renderPage(elevationPdf, job.elevationPage, resolve(OUT_DIR, `${job.job}-elevation`))
      : null;
    const floorBase64 = readFileSync(floorImage).toString("base64");
    const elevationBase64 = elevationImage ? readFileSync(elevationImage).toString("base64") : null;

    const [floor, elevations] = await Promise.all([
      floorEvidence(floorPdf, job.floorPage),
      elevationEvidence(elevationPdf, job.elevationPage),
    ]);

    console.log(
      `deterministic: physicalWidths=${floor.physicalOpeningWidthWitnesses.length} elevationOpenings=${elevations?.elevationOpenings?.length ?? 0}`,
    );
    console.log("calling visual floor locator...");
    const visual = await callVisualAudit(apiKey, floorBase64, elevationBase64, job.floorPage);
    const nearby = nearestWitnessCount(visual, floor.physicalOpeningWidthWitnesses, floor.page);
    const recovered = recoverVisualAuditFromElevationLedger(visual, elevations, {
      physicalOpeningWidthWitnesses: floor.physicalOpeningWidthWitnesses,
      page: floor.page,
    });
    const recoveredOpenings = recovered?.openings ?? [];
    const proofOpenings = recoveredOpenings.filter((opening) => opening.recoveryProof?.kind);
    const printedCodeDiag = printedCodeDiagnostics(
      visual,
      floor.printedWindowCodeWitnesses,
      elevations?.elevationOpenings ?? [],
      floor.page,
    );
    const promoted = promoteVisualOpenings(recovered);
    const truthMatchedPromotions = matchPromotionsToTruth(promoted?.openings, truth);
    const areaM2 =
      promoted?.openings.reduce((sum, opening) => sum + (opening.area_m2 ?? 0), 0) ?? 0;

    console.log(
      `visual=${visual.openings.length} nearPhysical=${nearby} nearPrinted=${printedCodeDiag.nearPrintedCode} printedProof=${printedCodeDiag.printedCodeWithElevationProof} proof=${proofOpenings.length} promoted=${promoted?.openings.length ?? 0} truthMatched=${fmt(truthMatchedPromotions, promoted?.openings.length ?? 0)} area=${areaM2.toFixed(2)}m2`,
    );

    const jobOut = {
      job: job.job,
      truthRows: truth.length,
      physicalWidthWitnesses: floor.physicalOpeningWidthWitnesses.length,
      printedWindowCodeWitnesses: floor.printedWindowCodeWitnesses.length,
      elevationOpenings: elevations?.elevationOpenings?.length ?? 0,
      visualOpenings: visual.openings.length,
      visualNearPhysicalWitness: nearby,
      visualNearPrintedCodeWitness: printedCodeDiag.nearPrintedCode,
      visualWithPrintedCodeElevationProof: printedCodeDiag.printedCodeWithElevationProof,
      visualWithDeterministicProof: proofOpenings.length,
      promotedOpenings: promoted?.openings.length ?? 0,
      promotedAreaM2: Math.round(areaM2 * 100) / 100,
      promotedTruthMatches: truthMatchedPromotions,
      promoted: promoted?.openings ?? [],
      visualOpeningsDetail: recoveredOpenings.map((opening) => ({
        id: opening.id,
        type: opening.type,
        room: opening.room,
        label: opening.label,
        width_m: opening.width_m,
        height_m: opening.height_m,
        x: opening.x,
        y: opening.y,
        confidence: opening.confidence,
        recoveryProof: opening.recoveryProof ?? null,
        flags: opening.flags,
        evidence: opening.evidence,
      })),
      printedCodeDiagnostics: printedCodeDiag.details,
      warnings: recovered?.warnings ?? visual.warnings,
    };
    writeFileSync(resolve(OUT_DIR, `${job.job}.json`), JSON.stringify(jobOut, null, 2));
    summary.push(jobOut);
  }

  writeFileSync(resolve(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${"=".repeat(76)}\nSUMMARY\n${"=".repeat(76)}`);
  console.log("job     truth visual nearPhys nearCode codeProof proof promoted truthMatch area");
  for (const row of summary) {
    console.log(
      `${String(row.job).padEnd(7)} ${String(row.truthRows).padEnd(5)} ${String(row.visualOpenings).padEnd(6)} ${String(row.visualNearPhysicalWitness).padEnd(8)} ${String(row.visualNearPrintedCodeWitness).padEnd(8)} ${String(row.visualWithPrintedCodeElevationProof).padEnd(9)} ${String(row.visualWithDeterministicProof).padEnd(5)} ${String(row.promotedOpenings).padEnd(8)} ${String(row.promotedTruthMatches).padEnd(10)} ${String(row.promotedAreaM2)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
