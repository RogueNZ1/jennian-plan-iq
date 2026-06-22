/**
 * Exterior wall trace diagnostic (dev-only, not bundled).
 *
 * Draws the exterior wall-ribbon evidence before any opening recovery:
 *   - red = detected exterior wall face segments backed by thick wall ribbons
 *   - blue ticks = gaps between collinear exterior wall pieces, review as openings/breaks
 *
 * This is deliberately an evidence surface, not pricing authority. The traced length
 * is reconciled against the printed PERIMETER value from the title block.
 *
 * Run:
 *   npx tsx scripts/exterior-wall-trace-diagnostic.mts
 *
 * Out:
 *   output/diagnostics/exterior-wall-trace-fenner.png
 *   output/diagnostics/exterior-wall-trace-fenner.json
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Segment } from "../src/lib/doors/door-engine";
import { extractPageGeometry } from "../src/lib/doors/pdf-adapter";
import { traceExteriorWallEvidence } from "../src/lib/takeoff/exterior-wall-trace";
import { parsePlanText } from "../src/lib/takeoff/plan-text";
import { createScaleRuler } from "../src/lib/takeoff/scale-ruler";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const defaultPlan = resolve(root, "tests/doors/plans/fenner-floorplan.pdf");
const defaultOutBase = resolve(root, "output/diagnostics/exterior-wall-trace-fenner");
const renderDpi = 144;

type Axial = { vertical: boolean; offset: number; lo: number; hi: number };
type Ribbon = Axial & { thicknessMm: number; confidence: "medium" | "low" };
type RoomPoint = { name: string; x: number; y: number };
type ExteriorRun = Ribbon & {
  roomSide: 1 | -1;
  outsideOffset: number;
  rooms: string[];
  lengthM: number;
};
type BreakRun = {
  vertical: boolean;
  offset: number;
  lo: number;
  hi: number;
  widthMm: number;
};

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? resolve(root, found.slice(prefix.length)) : fallback;
}

function pageBounds(segments: readonly Segment[]) {
  let width = 0;
  let height = 0;
  for (const segment of segments) {
    width = Math.max(width, segment.x0, segment.x1);
    height = Math.max(height, segment.y0, segment.y1);
  }
  return { width, height };
}

function axialSegments(segments: readonly Segment[], scale: number): Axial[] {
  const ruler = createScaleRuler(scale);
  const minLen = ruler.mmToPdfPoints(450);
  const axials: Axial[] = [];
  for (const segment of segments) {
    const dx = segment.x1 - segment.x0;
    const dy = segment.y1 - segment.y0;
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;

    if (Math.abs(dy) <= Math.abs(dx) * 0.04) {
      axials.push({
        vertical: false,
        offset: (segment.y0 + segment.y1) / 2,
        lo: Math.min(segment.x0, segment.x1),
        hi: Math.max(segment.x0, segment.x1),
      });
    } else if (Math.abs(dx) <= Math.abs(dy) * 0.04) {
      axials.push({
        vertical: true,
        offset: (segment.x0 + segment.x1) / 2,
        lo: Math.min(segment.y0, segment.y1),
        hi: Math.max(segment.y0, segment.y1),
      });
    }
  }
  return axials;
}

function thickWallRibbons(segments: readonly Segment[], scale: number): Ribbon[] {
  const ruler = createScaleRuler(scale);
  const minSpacing = ruler.mmToPdfPoints(140);
  const maxSpacing = ruler.mmToPdfPoints(320);
  const minOverlap = ruler.mmToPdfPoints(800);
  const joinGap = ruler.mmToPdfPoints(300);
  const offsetTol = ruler.mmToPdfPoints(80);
  const axials = axialSegments(segments, scale);
  const pieces: Ribbon[] = [];

  for (const vertical of [false, true]) {
    const oriented = axials.filter((axial) => axial.vertical === vertical);
    oriented.sort((a, b) => a.offset - b.offset);
    const candidates: Array<{
      i: number;
      j: number;
      spacing: number;
      lo: number;
      hi: number;
      overlap: number;
    }> = [];

    for (let i = 0; i < oriented.length; i++) {
      for (let j = i + 1; j < oriented.length; j++) {
        const spacing = oriented[j].offset - oriented[i].offset;
        if (spacing > maxSpacing) break;
        if (spacing < minSpacing) continue;
        const lo = Math.max(oriented[i].lo, oriented[j].lo);
        const hi = Math.min(oriented[i].hi, oriented[j].hi);
        const overlap = hi - lo;
        if (overlap < minOverlap) continue;
        candidates.push({ i, j, spacing, lo, hi, overlap });
      }
    }

    candidates.sort((a, b) => b.overlap - a.overlap || a.spacing - b.spacing);
    const taken = new Set<number>();
    for (const candidate of candidates) {
      if (taken.has(candidate.i) || taken.has(candidate.j)) continue;
      taken.add(candidate.i);
      taken.add(candidate.j);
      pieces.push({
        vertical,
        offset: (oriented[candidate.i].offset + oriented[candidate.j].offset) / 2,
        lo: candidate.lo,
        hi: candidate.hi,
        thicknessMm: Math.round(ruler.pdfPointsToMm(candidate.spacing)),
        confidence: "medium",
      });
    }
  }

  const used = new Array(pieces.length).fill(false);
  const merged: Ribbon[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (used[i]) continue;
    const base = { ...pieces[i] };
    used[i] = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < pieces.length; j++) {
        if (used[j]) continue;
        const piece = pieces[j];
        if (piece.vertical !== base.vertical) continue;
        if (Math.abs(piece.offset - base.offset) > offsetTol) continue;
        if (piece.lo > base.hi + joinGap || piece.hi < base.lo - joinGap) continue;
        base.lo = Math.min(base.lo, piece.lo);
        base.hi = Math.max(base.hi, piece.hi);
        base.thicknessMm = Math.round((base.thicknessMm + piece.thicknessMm) / 2);
        used[j] = true;
        grew = true;
      }
    }
    merged.push(base);
  }

  const bounds = pageBounds(segments);
  return merged.filter((ribbon) => {
    const x0 = ribbon.vertical ? ribbon.offset : ribbon.lo;
    const x1 = ribbon.vertical ? ribbon.offset : ribbon.hi;
    const y0 = ribbon.vertical ? ribbon.lo : ribbon.offset;
    const y1 = ribbon.vertical ? ribbon.hi : ribbon.offset;
    return x1 >= 0 && y1 >= 0 && x0 <= bounds.width && y0 <= bounds.height;
  });
}

function sideRooms(ribbon: Ribbon, rooms: readonly RoomPoint[], scale: number, side: 1 | -1) {
  const ruler = createScaleRuler(scale);
  const sideReach = ruler.mmToPdfPoints(6500);
  const spanPad = ruler.mmToPdfPoints(1500);
  return rooms.filter((room) => {
    const along = ribbon.vertical ? room.y : room.x;
    const off = ribbon.vertical ? room.x : room.y;
    if (along < ribbon.lo - spanPad || along > ribbon.hi + spanPad) return false;
    const distance = (off - ribbon.offset) * side;
    return distance > 0 && distance <= sideReach;
  });
}

function exteriorRuns(ribbons: readonly Ribbon[], rooms: readonly RoomPoint[], scale: number) {
  const ruler = createScaleRuler(scale);
  const runs: ExteriorRun[] = [];
  for (const ribbon of ribbons) {
    const plus = sideRooms(ribbon, rooms, scale, 1);
    const minus = sideRooms(ribbon, rooms, scale, -1);
    if (plus.length > 0 === minus.length > 0) continue;
    const roomSide: 1 | -1 = plus.length > 0 ? 1 : -1;
    const outsideSide = -roomSide;
    const outsideOffset =
      ribbon.offset + outsideSide * ruler.mmToPdfPoints(Math.max(ribbon.thicknessMm, 140) / 2);
    runs.push({
      ...ribbon,
      roomSide,
      outsideOffset,
      rooms: (roomSide === 1 ? plus : minus).map((room) => room.name),
      lengthM: Math.round((ruler.pdfPointsToMm(ribbon.hi - ribbon.lo) / 1000) * 100) / 100,
    });
  }
  return runs.sort((a, b) => b.lengthM - a.lengthM);
}

function collinearBreaks(runs: readonly ExteriorRun[], scale: number): BreakRun[] {
  const ruler = createScaleRuler(scale);
  const offsetTol = ruler.mmToPdfPoints(180);
  const minGap = ruler.mmToPdfPoints(350);
  const maxGap = ruler.mmToPdfPoints(6500);
  const breaks: BreakRun[] = [];
  const groups: ExteriorRun[][] = [];
  for (const run of runs) {
    let group = groups.find(
      (candidate) =>
        candidate[0].vertical === run.vertical &&
        Math.abs(candidate[0].outsideOffset - run.outsideOffset) <= offsetTol,
    );
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(run);
  }

  for (const group of groups) {
    group.sort((a, b) => a.lo - b.lo);
    for (let i = 0; i < group.length - 1; i++) {
      const a = group[i];
      const b = group[i + 1];
      const gap = b.lo - a.hi;
      if (gap < minGap || gap > maxGap) continue;
      breaks.push({
        vertical: a.vertical,
        offset: (a.outsideOffset + b.outsideOffset) / 2,
        lo: a.hi,
        hi: b.lo,
        widthMm: Math.round(ruler.pdfPointsToMm(gap)),
      });
    }
  }
  return breaks;
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

function renderPlan(plan: string, outBase: string): string {
  const renderDir = resolve(dirname(outBase), "_render");
  mkdirSync(renderDir, { recursive: true });
  const prefix = resolve(renderDir, "exterior-trace-plan");
  execFileSync(findPdftoppm(), [
    "-f",
    "1",
    "-l",
    "1",
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
  ctx.font = "bold 14px sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

async function main() {
  const plan = argValue("plan", defaultPlan);
  const outBase = argValue("out", defaultOutBase);
  mkdirSync(dirname(outBase), { recursive: true });
  const scale = 100;

  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(plan)),
    disableFontFace: true,
  } as never).promise;
  const page = await doc.getPage(1);
  const geom = await extractPageGeometry(page as never);
  const planText = parsePlanText(geom.labels);
  await doc.destroy().catch(() => {});

  const rooms = planText.rooms.map((room) => ({ name: room.name, x: room.x, y: room.y }));
  const printedPerimeterM = planText.titleAreas?.perimeterM ?? null;
  const trace = traceExteriorWallEvidence({
    segments: geom.segments,
    rooms,
    scale,
    printedPerimeterM,
  });
  const runs = trace.runs;
  const breaks = trace.breaks;
  const tracedLengthM = trace.tracedExteriorEvidenceM;

  writeFileSync(
    `${outBase}.json`,
    `${JSON.stringify(
      {
        plan,
        scale,
        printedPerimeterM: trace.printedPerimeterM,
        tracedExteriorEvidenceM: trace.tracedExteriorEvidenceM,
        shortfallM: trace.shortfallM,
        exteriorRuns: runs.map((run) => ({
          vertical: run.vertical,
          outsideOffset: Math.round(run.outsideOffset * 100) / 100,
          lo: Math.round(run.lo * 100) / 100,
          hi: Math.round(run.hi * 100) / 100,
          lengthM: run.lengthM,
          thicknessMm: run.thicknessMm,
          rooms: run.rooms,
        })),
        collinearBreaks: breaks,
      },
      null,
      2,
    )}\n`,
  );

  const renderPath = renderPlan(plan, outBase);
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(renderPath);
  const renderScale = image.width / geom.width;
  const legendWidth = 560;
  const canvas = createCanvas(Math.ceil(image.width + legendWidth), Math.ceil(image.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  const toCanvas = (x: number, y: number): [number, number] => [x * renderScale, y * renderScale];

  for (const run of runs) {
    const [x0, y0] = run.vertical
      ? toCanvas(run.outsideOffset, run.lo)
      : toCanvas(run.lo, run.outsideOffset);
    const [x1, y1] = run.vertical
      ? toCanvas(run.outsideOffset, run.hi)
      : toCanvas(run.hi, run.outsideOffset);
    ctx.strokeStyle = run.lengthM >= 2 ? "#dc2626" : "#f97316";
    ctx.lineWidth = run.lengthM >= 2 ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (run.lengthM >= 1.5) {
      drawLabel(ctx, `${run.lengthM.toFixed(2)}m`, (x0 + x1) / 2 + 7, (y0 + y1) / 2 - 7, "#dc2626");
    }
  }

  for (const gap of breaks) {
    const [x0, y0] = gap.vertical ? toCanvas(gap.offset, gap.lo) : toCanvas(gap.lo, gap.offset);
    const [x1, y1] = gap.vertical ? toCanvas(gap.offset, gap.hi) : toCanvas(gap.hi, gap.offset);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, `${gap.widthMm}mm break`, (x0 + x1) / 2 + 7, (y0 + y1) / 2 + 18, "#2563eb");
  }

  const panelX = Math.ceil(image.width) + 24;
  ctx.fillStyle = "#111827";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("Exterior Wall Trace", panelX, 34);
  ctx.font = "13px sans-serif";
  ctx.fillText(`Printed perimeter: ${printedPerimeterM ?? "?"}m`, panelX, 62);
  ctx.fillText(`Detected wall evidence: ${tracedLengthM.toFixed(2)}m`, panelX, 84);
  if (printedPerimeterM != null) {
    ctx.fillText(
      `Shortfall before bridging: ${(printedPerimeterM - tracedLengthM).toFixed(2)}m`,
      panelX,
      106,
    );
  }
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(panelX, 134, 30, 5);
  ctx.fillStyle = "#111827";
  ctx.fillText("Exterior wall face evidence", panelX + 42, 140);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(panelX, 166);
  ctx.lineTo(panelX + 30, 166);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText("Collinear break to review as opening/door", panelX + 42, 170);
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("Longest traced runs", panelX, 214);
  ctx.font = "12px sans-serif";
  let y = 238;
  for (const run of runs.slice(0, 16)) {
    ctx.fillText(
      `${run.vertical ? "V" : "H"} ${run.lengthM.toFixed(2)}m ${run.rooms.slice(0, 3).join("/")}`,
      panelX,
      y,
    );
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
