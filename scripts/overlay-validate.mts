/**
 * Plan-overlay visual validation (dev-only, not bundled).
 *
 * Renders the Alexandra bench plan and composites three layers so a human can verify the
 * coordinate contract end-to-end before the overlay ships:
 *   - RED circles  = door-engine hits (persisted shape), mapped adapter-space → user-space
 *                    → viewport (the EXACT path the verification overlay uses)
 *   - BLUE crosses = the bench file's hand-labelled ground-truth positions (Haydon, 10 Jun)
 *   - GREEN boxes  = live W-code text labels from the page (pdf.js v5 text positions)
 *
 * Run:  npx tsx scripts/overlay-validate.mts
 * Deps: @napi-rs/canvas + tsx, installed --no-save (intentionally NOT in package.json).
 * Out:  /tmp/overlay-check.png
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PLAN = resolve(here, "../tests/doors/plans/alexandra.pdf");
const BENCH = resolve(here, "../tests/doors/alexandra.bench.json");
const OUT = "/tmp/overlay-check.png";
const SCALE = 2;

// inverse of the pdf-adapter's toPage — mirrors src/lib/verification/plan-overlay.ts
function adapterToUser(x: number, y: number, view: number[]) {
  const [x0, , , y1] = [view[0], view[1], view[2], view[3]];
  return { ux: x + x0, uy: y1 - y };
}

// pdf.js 4.x (engine) and 5.x (renderer) cannot share one process — the fake-worker
// singleton sticks. The engine phase runs in a child process and emits JSON.
async function enginePhase() {
  const { runDoorEngine } = await import("../src/lib/doors/run-doors");
  const bench = JSON.parse(readFileSync(BENCH, "utf8"));
  const engine = await runDoorEngine(readFileSync(PLAN), bench.page ?? 1, bench.scaleText ?? "1:100");
  if (!engine) throw new Error("engine returned null");
  const hits = [...engine.hinged, ...engine.doubles, ...engine.cavity, ...engine.flags];
  process.stdout.write("JSON:" + JSON.stringify({ hits, meta: engine.pageMeta }));
}

async function main() {
  if (process.argv.includes("--engine-only")) return enginePhase();
  const bench = JSON.parse(readFileSync(BENCH, "utf8"));

  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("npx", ["tsx", fileURLToPath(import.meta.url), "--engine-only"], {
    cwd: resolve(here, ".."),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const { hits, meta } = JSON.parse(out.slice(out.indexOf("JSON:") + 5)) as {
    hits: Array<{ type: string; widthMm: number; x: number; y: number; confidence: string }>;
    meta: { pageNumber: number; view: number[]; width: number; height: number } | undefined;
  };
  if (!meta) throw new Error("pageMeta missing — run-doors patch not active");
  console.log(`engine: ${hits.length} hits · page view [${meta.view.join(", ")}]`);

  // render with the APP'S pdf.js line (v5 legacy) — the overlay component's renderer.
  // Fresh read: the engine's pdf.js 4.x transfers/detaches the first buffer.
  const renderBytes = readFileSync(PLAN);
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // run-doors pointed the shared GlobalWorkerOptions at the 4.x worker — repoint to v5's own.
  pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(renderBytes.buffer, renderBytes.byteOffset, renderBytes.byteLength),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const page = await doc.getPage(bench.page ?? 1);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  // RED: engine hits via the production mapping path
  ctx.lineWidth = 2.5;
  ctx.font = "bold 16px sans-serif";
  hits.forEach((h, i) => {
    const { ux, uy } = adapterToUser(h.x, h.y, meta.view);
    const [vx, vy] = viewport.convertToViewportPoint(ux, uy);
    ctx.strokeStyle = h.confidence === "flag" ? "#b45309" : "#dc2626";
    ctx.beginPath();
    ctx.arc(vx, vy, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(`D${i + 1}`, vx + 16, vy - 10);
  });

  // BLUE: bench ground-truth `near` positions (already adapter space per the bench format)
  for (const d of bench.doors ?? []) {
    const { ux, uy } = adapterToUser(d.near[0], d.near[1], meta.view);
    const [vx, vy] = viewport.convertToViewportPoint(ux, uy);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx - 10, vy); ctx.lineTo(vx + 10, vy);
    ctx.moveTo(vx, vy - 10); ctx.lineTo(vx, vy + 10);
    ctx.stroke();
  }

  // GREEN: live W-codes from page text (v5 transforms are user-space)
  const tc = await page.getTextContent();
  let wCount = 0;
  for (const it of tc.items as Array<{ str?: string; transform?: number[] }>) {
    const s = (it.str ?? "").trim();
    if (!/^W\d{1,3}[a-z]?$/i.test(s)) continue;
    const t = it.transform!;
    const [vx, vy] = viewport.convertToViewportPoint(t[4], t[5]);
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 2;
    ctx.strokeRect(vx - 6, vy - 18, 44, 24);
    wCount++;
  }
  console.log(`W-codes circled: ${wCount}`);

  writeFileSync(OUT, await canvas.encode("png"));
  console.log("wrote", OUT, `${canvas.width}x${canvas.height}`);
  await doc.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
