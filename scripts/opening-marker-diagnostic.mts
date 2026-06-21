/**
 * Opening marker diagnostic (dev-only, not bundled).
 *
 * Renders a floor-plan page and overlays deterministic opening evidence:
 *   - purple squares = standalone width-only text witnesses
 *   - green bars = exterior floor-plan gap candidates
 *   - orange bars = interior/ambiguous/review-only gap candidates
 *
 * The side panel lists large elevation vector candidates. This is intended as the
 * evidence surface for JEN-40 before adding any pricing recovery.
 *
 * Run:
 *   npx tsx scripts/opening-marker-diagnostic.mts
 *
 * Out:
 *   output/diagnostics/opening-marker-fenner.png
 *   output/diagnostics/opening-marker-fenner.json
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const defaultPlan = resolve(root, "tests/doors/plans/fenner-floorplan.pdf");
const defaultElevations = resolve(root, "tests/doors/plans/fenner-elevations.pdf");
const defaultOutBase = resolve(root, "output/diagnostics/opening-marker-fenner");
const renderDpi = 144;
const pdfPointsPerMmAt100 = 72 / 25.4 / 100;

type WidthWitness = {
  widthMm: number;
  x: number;
  y: number;
  vertical: boolean;
  text: string;
};

type GapCandidate = {
  id: string;
  widthMm: number;
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
  envelopeSide: "exterior" | "interior" | "ambiguous";
  confidence: "medium" | "low";
  roomLabel?: string | null;
  roomSide?: "north" | "south" | "east" | "west" | null;
  alternateRoomLabels?: string[];
  reason: string;
};

type ElevationCandidate = {
  face: string;
  type: string;
  label: string | null;
  widthMm: number | null;
  heightMm: number | null;
  confidence: string;
};

type DiagnosticData = {
  plan: string;
  elevations: string;
  page: number;
  view: number[];
  pageSize: { width: number; height: number };
  standaloneOpeningWidths: WidthWitness[];
  draftingIssues: Array<{ kind: string; text: string; x: number; y: number }>;
  floorPlanGaps: GapCandidate[];
  elevationOpenings: ElevationCandidate[];
};

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? resolve(root, found.slice(prefix.length)) : fallback;
}

function widthMmToPdfPoints(widthMm: number): number {
  return widthMm * pdfPointsPerMmAt100;
}

async function collectDiagnosticData(): Promise<DiagnosticData> {
  const plan = argValue("plan", defaultPlan);
  const elevations = argValue("elevations", defaultElevations);
  const pageNumber = Number(process.argv.find((arg) => arg.startsWith("--page="))?.slice(7) ?? 1);
  const { parsePlanText } = await import("../src/lib/takeoff/plan-text");
  const { detectFloorPlanGaps } = await import("../src/lib/takeoff/floor-plan-gaps");
  const { extractPageGeometry } = await import("../src/lib/doors/pdf-adapter");
  const { runElevationVectorOpenings } =
    await import("../src/lib/takeoff/run-elevation-vector-openings");
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(plan)),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(pageNumber);
    const view = page.view as number[];
    const geom = await extractPageGeometry(page as never);
    const planText = parsePlanText(geom.labels);
    const gaps = detectFloorPlanGaps({
      segments: geom.segments,
      scale: 100,
      rooms: planText.rooms.map((room) => ({ name: room.name, x: room.x, y: room.y })),
    });
    const elevationOpenings = await runElevationVectorOpenings(readFileSync(elevations), 1);
    return {
      plan,
      elevations,
      page: pageNumber,
      view,
      pageSize: { width: view[2] - view[0], height: view[3] - view[1] },
      standaloneOpeningWidths: planText.standaloneOpeningWidths ?? [],
      draftingIssues: planText.draftingIssues ?? [],
      floorPlanGaps: gaps.map((gap) => ({
        id: gap.id,
        widthMm: gap.widthMm,
        x: gap.x,
        y: gap.y,
        orientation: gap.orientation,
        envelopeSide: gap.envelopeSide,
        confidence: gap.confidence,
        roomLabel: gap.roomLabel,
        roomSide: gap.roomSide,
        alternateRoomLabels: gap.alternateRoomLabels,
        reason: gap.routing.reason,
      })),
      elevationOpenings: elevationOpenings.map((opening) => ({
        face: opening.face,
        type: opening.type,
        label: opening.label ?? null,
        widthMm: opening.widthMm ?? null,
        heightMm: opening.heightMm ?? null,
        confidence: opening.confidence,
      })),
    };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

function findPdftoppm(): string {
  const bundled =
    process.platform === "win32"
      ? resolve(
          process.env.USERPROFILE ?? "",
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pdftoppm.exe",
        )
      : "pdftoppm";
  const candidates =
    process.platform === "win32" ? [bundled, "pdftoppm.exe", "pdftoppm"] : [bundled];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-h"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("pdftoppm was not found. Install Poppler or use the Codex bundled runtime.");
}

function renderPlanWithPoppler(plan: string, page: number, outBase: string): string {
  const renderDir = resolve(dirname(outBase), "_render");
  mkdirSync(renderDir, { recursive: true });
  const prefix = resolve(renderDir, `plan-page-${page}`);
  execFileSync(findPdftoppm(), [
    "-f",
    String(page),
    "-l",
    String(page),
    "-r",
    String(renderDpi),
    "-png",
    "-singlefile",
    plan,
    prefix,
  ]);
  return `${prefix}.png`;
}

function drawLabel(
  ctx: import("@napi-rs/canvas").CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.font = "bold 13px sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

async function main() {
  const plan = argValue("plan", defaultPlan);
  const outBase = argValue("out", defaultOutBase);
  const outDir = dirname(outBase);
  mkdirSync(outDir, { recursive: true });

  const data = await collectDiagnosticData();
  writeFileSync(`${outBase}.json`, `${JSON.stringify(data, null, 2)}\n`);

  const renderPath = renderPlanWithPoppler(plan, data.page, outBase);
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(renderPath);
  const renderScale = image.width / data.pageSize.width;
  const legendWidth = 560;
  const canvas = createCanvas(Math.ceil(image.width + legendWidth), Math.ceil(image.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  const toCanvas = (x: number, y: number): [number, number] => [x * renderScale, y * renderScale];

  for (const gap of data.floorPlanGaps) {
    const [cx, cy] = toCanvas(gap.x, gap.y);
    const half = (widthMmToPdfPoints(gap.widthMm) * renderScale) / 2;
    const exterior = gap.envelopeSide === "exterior";
    ctx.strokeStyle = exterior ? "#16a34a" : "#f97316";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = exterior ? 5 : 3;
    ctx.beginPath();
    if (gap.orientation === "horizontal") {
      ctx.moveTo(cx - half, cy);
      ctx.lineTo(cx + half, cy);
    } else {
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx, cy + half);
    }
    ctx.stroke();
    drawLabel(
      ctx,
      `${gap.id.replace("floorplan-gap-", "G")} ${gap.widthMm}`,
      cx + 8,
      cy - 8,
      ctx.strokeStyle,
    );
  }

  for (const witness of data.standaloneOpeningWidths) {
    const [x, y] = toCanvas(witness.x, witness.y);
    ctx.strokeStyle = "#7c3aed";
    ctx.fillStyle = "rgba(124, 58, 237, 0.14)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(x - 10, y - 10, 20, 20);
    ctx.fill();
    ctx.stroke();
    drawLabel(ctx, witness.text, x + 12, y - 10, "#7c3aed");
  }

  const panelX = Math.ceil(image.width) + 24;
  ctx.fillStyle = "#111827";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("Opening Marker Diagnostic", panelX, 34);
  ctx.font = "13px sans-serif";
  ctx.fillText(`Plan page ${data.page}`, panelX, 58);
  ctx.fillText(`Standalone widths: ${data.standaloneOpeningWidths.length}`, panelX, 78);
  ctx.fillText(`Floor-plan gaps: ${data.floorPlanGaps.length}`, panelX, 98);
  ctx.fillText(`Elevation candidates: ${data.elevationOpenings.length}`, panelX, 118);

  ctx.fillStyle = "#16a34a";
  ctx.fillRect(panelX, 145, 18, 5);
  ctx.fillStyle = "#111827";
  ctx.fillText("Exterior floor-plan gap", panelX + 28, 150);
  ctx.fillStyle = "#f97316";
  ctx.fillRect(panelX, 169, 18, 5);
  ctx.fillStyle = "#111827";
  ctx.fillText("Interior/ambiguous review-only gap", panelX + 28, 174);
  ctx.strokeStyle = "#7c3aed";
  ctx.strokeRect(panelX, 191, 16, 16);
  ctx.fillStyle = "#111827";
  ctx.fillText("Width-only text witness", panelX + 28, 204);

  ctx.font = "bold 15px sans-serif";
  ctx.fillText("Large elevation vector candidates", panelX, 242);
  ctx.font = "12px sans-serif";
  let y = 265;
  const largeElevation = data.elevationOpenings
    .filter((opening) => (opening.widthMm ?? 0) >= 1200)
    .sort((a, b) => (b.widthMm ?? 0) - (a.widthMm ?? 0))
    .slice(0, 18);
  for (const opening of largeElevation) {
    const line = `${opening.face} ${opening.type} ${opening.widthMm ?? "?"}x${opening.heightMm ?? "?"} ${opening.confidence}`;
    ctx.fillText(line, panelX, y);
    y += 18;
  }

  ctx.font = "bold 15px sans-serif";
  ctx.fillText("Drafting issues", panelX, y + 20);
  ctx.font = "12px sans-serif";
  y += 43;
  for (const issue of data.draftingIssues.slice(0, 6)) {
    ctx.fillText(issue.text.slice(0, 58), panelX, y);
    y += 18;
  }

  writeFileSync(`${outBase}.png`, await canvas.encode("png"));
  console.log(`wrote ${outBase}.png`);
  console.log(`wrote ${outBase}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
