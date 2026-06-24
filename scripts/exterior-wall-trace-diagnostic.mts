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
import { basename, dirname, resolve } from "node:path";
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
type CanvasPoint = { x: number; y: number };
type RasterExteriorBoundary = {
  points: CanvasPoint[];
  estimatedLengthM: number | null;
  crop: { x0: number; y0: number; x1: number; y1: number };
};

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? resolve(root, found.slice(prefix.length)) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
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
  const prefix = resolve(renderDir, basename(outBase));
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

function dilate(mask: Uint8Array, width: number, height: number, radius: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (mask[yy * width + xx]) {
            found = true;
            break;
          }
        }
      }
      if (found) out[y * width + x] = 1;
    }
  }
  return out;
}

function erode(mask: Uint8Array, width: number, height: number, radius: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ok = true;
      for (let dy = -radius; dy <= radius && ok; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          ok = false;
          break;
        }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || !mask[yy * width + xx]) {
            ok = false;
            break;
          }
        }
      }
      if (ok) out[y * width + x] = 1;
    }
  }
  return out;
}

function closeMask(mask: Uint8Array, width: number, height: number, radius: number) {
  return erode(dilate(mask, width, height, radius), width, height, radius);
}

function traceRasterExteriorBoundary(args: {
  ctx: import("@napi-rs/canvas").CanvasRenderingContext2D;
  imageWidth: number;
  imageHeight: number;
  renderScale: number;
  rooms: readonly RoomPoint[];
  runs: readonly ExteriorRun[];
  scale: number;
}): RasterExteriorBoundary | null {
  if (args.rooms.length === 0) return null;
  const runPoints = args.runs
    .filter((run) => run.lengthM >= 1)
    .flatMap((run) =>
      run.vertical
        ? [
            { x: run.outsideOffset, y: run.lo },
            { x: run.outsideOffset, y: run.hi },
          ]
        : [
            { x: run.lo, y: run.outsideOffset },
            { x: run.hi, y: run.outsideOffset },
          ],
    );
  const basis = runPoints.length > 0 ? runPoints : args.rooms;
  const xs = basis.map((point) => point.x * args.renderScale);
  const ys = basis.map((point) => point.y * args.renderScale);
  const pad = 90;
  const crop = {
    x0: Math.max(0, Math.floor(Math.min(...xs) - pad)),
    y0: Math.max(0, Math.floor(Math.min(...ys) - pad)),
    x1: Math.min(args.imageWidth - 1, Math.ceil(Math.max(...xs) + pad)),
    y1: Math.min(args.imageHeight - 1, Math.ceil(Math.max(...ys) + pad)),
  };
  const width = crop.x1 - crop.x0 + 1;
  const height = crop.y1 - crop.y0 + 1;
  if (width < 50 || height < 50) return null;

  const data = args.ctx.getImageData(crop.x0, crop.y0, width, height).data;
  const dark = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a > 180 && luminance < 92 && Math.max(r, g, b) - Math.min(r, g, b) < 42) dark[p] = 1;
  }

  const wall = closeMask(closeMask(dark, width, height, 5), width, height, 9);
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const pushOutside = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (outside[idx] || wall[idx]) return;
    outside[idx] = 1;
    queue.push(idx);
  };
  for (let x = 0; x < width; x++) {
    pushOutside(x, 0);
    pushOutside(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushOutside(0, y);
    pushOutside(width - 1, y);
  }
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % width;
    const y = Math.floor(idx / width);
    pushOutside(x + 1, y);
    pushOutside(x - 1, y);
    pushOutside(x, y + 1);
    pushOutside(x, y - 1);
  }

  const boundary = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (!wall[idx]) continue;
      if (
        outside[idx - 1] ||
        outside[idx + 1] ||
        outside[idx - width] ||
        outside[idx + width]
      ) {
        boundary[idx] = 1;
      }
    }
  }

  const seen = new Uint8Array(width * height);
  const components: CanvasPoint[][] = [];
  for (let i = 0; i < boundary.length; i++) {
    if (!boundary[i] || seen[i]) continue;
    const component: CanvasPoint[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = Math.floor(idx / width);
      component.push({ x: x + crop.x0, y: y + crop.y0 });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
          const next = yy * width + xx;
          if (boundary[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (component.length >= 80) components.push(component);
  }

  if (components.length === 0) return null;
  const runDistance = (point: CanvasPoint, run: ExteriorRun) => {
    const offset = run.outsideOffset * args.renderScale;
    const lo = run.lo * args.renderScale;
    const hi = run.hi * args.renderScale;
    if (run.vertical) {
      const y = Math.min(Math.max(point.y, lo), hi);
      return Math.hypot(point.x - offset, point.y - y);
    }
    const x = Math.min(Math.max(point.x, lo), hi);
    return Math.hypot(point.x - x, point.y - offset);
  };
  const wallRuns = args.runs.filter((run) => run.lengthM >= 1.5);
  const scored = components
    .map((component) => {
      const nearWall = component.filter((point) =>
        wallRuns.some((run) => runDistance(point, run) <= 18),
      ).length;
      return { component, nearWall };
    })
    .filter(({ component, nearWall }) => nearWall >= Math.min(40, component.length * 0.2));

  const selected = scored.length > 0 ? scored.map((item) => item.component) : components;
  selected.sort((a, b) => b.length - a.length);
  const points = selected.slice(0, 6).flat();
  const pxPerM = args.renderScale * createScaleRuler(args.scale).mmToPdfPoints(1000);
  const estimatedLengthM = points.length > 0 ? Math.round((points.length / pxPerM) * 100) / 100 : null;
  return { points, estimatedLengthM, crop };
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

  const rooms = planText.rooms.map((room) => ({
    name: room.name,
    x: room.x,
    y: room.y,
    widthMm: room.widthMm,
    depthMm: room.depthMm,
  }));
  const printedPerimeterM = planText.titleAreas?.perimeterM ?? null;
  const trace = traceExteriorWallEvidence({
    segments: geom.segments,
    rooms,
    scale,
    printedPerimeterM,
  });
  const runs = trace.runs;
  const breaks = trace.breaks;
  const perimeterRuns = trace.perimeterRuns;
  const perimeterBridges = trace.perimeterBridges;
  const perimeterLine = trace.perimeterLine;
  const tracedLengthM = trace.tracedExteriorEvidenceM;

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
  const rasterBoundary = hasFlag("raster-boundary")
    ? traceRasterExteriorBoundary({
        ctx,
        imageWidth: image.width,
        imageHeight: image.height,
        renderScale,
        rooms,
        runs,
        scale,
      })
    : null;

  writeFileSync(
    `${outBase}.json`,
    `${JSON.stringify(
      {
        plan,
        scale,
        geometryBounds: { width: geom.width, height: geom.height },
        renderScale,
        printedPerimeterM: trace.printedPerimeterM,
        tracedExteriorEvidenceM: trace.tracedExteriorEvidenceM,
        bridgedExteriorEvidenceM: trace.bridgedExteriorEvidenceM,
        shortfallM: trace.shortfallM,
        bridgedShortfallM: trace.bridgedShortfallM,
        perimeterCandidateM: trace.perimeterCandidateM,
        perimeterCandidateSource: trace.perimeterCandidateSource,
        perimeterMeasurementTrusted: trace.perimeterMeasurementTrusted,
        perimeterCandidateTrusted: trace.perimeterCandidateTrusted,
        perimeterLineM: trace.perimeterLineM,
        visualLoopClosed: trace.visualLoopClosed,
        rasterExteriorBoundaryM: rasterBoundary?.estimatedLengthM ?? null,
        rasterExteriorBoundaryCrop: rasterBoundary?.crop ?? null,
        exteriorRuns: runs.map((run) => ({
          vertical: run.vertical,
          outsideOffset: Math.round(run.outsideOffset * 100) / 100,
          lo: Math.round(run.lo * 100) / 100,
          hi: Math.round(run.hi * 100) / 100,
          lengthM: run.lengthM,
          thicknessMm: run.thicknessMm,
          confidence: run.confidence,
          rooms: run.rooms,
        })),
        collinearBreaks: breaks,
        perimeterRuns: perimeterRuns.map((run) => ({
          vertical: run.vertical,
          outsideOffset: Math.round(run.outsideOffset * 100) / 100,
          lo: Math.round(run.lo * 100) / 100,
          hi: Math.round(run.hi * 100) / 100,
          lengthM: run.lengthM,
          thicknessMm: run.thicknessMm,
          confidence: run.confidence,
          rooms: run.rooms,
        })),
        perimeterBridges,
        perimeterLine,
      },
      null,
      2,
    )}\n`,
  );

  if (rasterBoundary) {
    ctx.fillStyle = "rgba(190, 24, 93, 0.85)";
    for (const point of rasterBoundary.points) {
      ctx.fillRect(point.x, point.y, 1.5, 1.5);
    }
  }

  for (const line of perimeterLine) {
    const [x0, y0] = line.vertical ? toCanvas(line.offset, line.lo) : toCanvas(line.lo, line.offset);
    const [x1, y1] = line.vertical ? toCanvas(line.offset, line.hi) : toCanvas(line.hi, line.offset);
    ctx.strokeStyle = trace.perimeterCandidateTrusted ? "#dc2626" : "#ea580c";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (line.kind === "opening") {
      drawLabel(ctx, `${(line.widthMm / 1000).toFixed(2)}m bridged`, (x0 + x1) / 2 + 7, (y0 + y1) / 2 + 18, "#dc2626");
    }
  }

  for (const gap of breaks) {
    if (
      perimeterBridges.some(
        (bridge) =>
          bridge.vertical === gap.vertical &&
          Math.abs(bridge.offset - gap.offset) < 0.01 &&
          Math.abs(bridge.lo - gap.lo) < 0.01 &&
          Math.abs(bridge.hi - gap.hi) < 0.01,
      )
    )
      continue;
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
  ctx.fillText(`Bridged evidence: ${trace.bridgedExteriorEvidenceM.toFixed(2)}m`, panelX, 106);
  ctx.fillText(
    `Selected candidate: ${trace.perimeterCandidateM.toFixed(2)}m`,
    panelX,
    128,
  );
  ctx.fillText(`Drawn line: ${trace.perimeterLineM.toFixed(2)}m`, panelX, 150);
  ctx.fillText(
    `Raster outside boundary: ${rasterBoundary?.estimatedLengthM?.toFixed(2) ?? "?"}m`,
    panelX,
    172,
  );
  if (printedPerimeterM != null) {
    ctx.fillText(
      `Candidate delta: ${trace.bridgedShortfallM?.toFixed(2) ?? "?"}m`,
      panelX,
      194,
    );
  }
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(panelX, 200, 30, 5);
  ctx.fillStyle = "#111827";
  ctx.fillText(
    trace.visualLoopClosed
      ? "Closed exterior wall line"
      : "Exterior wall evidence, not a closed line",
    panelX + 42,
    206,
  );
  ctx.fillStyle = "#be185d";
  ctx.fillRect(panelX, 224, 30, 5);
  ctx.fillStyle = "#111827";
  ctx.fillText("Raster boundary touching outside air", panelX + 42, 230);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(panelX, 254);
  ctx.lineTo(panelX + 30, 254);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText("Collinear break to review as opening/door", panelX + 42, 258);
  ctx.font = "bold 15px sans-serif";
  ctx.fillText(
    trace.perimeterMeasurementTrusted
      ? `Measurement candidate: trusted (${trace.perimeterCandidateSource})`
      : `Measurement candidate: untrusted (${trace.perimeterCandidateSource})`,
    panelX,
    302,
  );
  ctx.fillText(
    trace.visualLoopClosed ? "Visual loop: closed" : "Visual loop: NOT CLOSED",
    panelX,
    324,
  );
  ctx.fillText(
    trace.perimeterCandidateTrusted ? "Perimeter trace: trusted" : "Perimeter trace: NOT TRUSTED",
    panelX,
    346,
  );
  ctx.fillText("Longest traced runs", panelX, 384);
  ctx.font = "12px sans-serif";
  let y = 408;
  for (const run of perimeterRuns.slice(0, 16)) {
    ctx.fillText(
      `${run.vertical ? "V" : "H"} ${run.lengthM.toFixed(2)}m ${run.confidence} ${run.rooms.slice(0, 2).join("/")}`,
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
