import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPageGeometry } from "../src/lib/doors/pdf-adapter";
import { traceExteriorWallEvidence } from "../src/lib/takeoff/exterior-wall-trace";
import { parsePlanText } from "../src/lib/takeoff/plan-text";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outPath = resolve(root, "output/diagnostics/exterior-wall-trace-four-job.json");

const jobs = [
  { id: "fenner", plan: "tests/doors/plans/fenner-floorplan.pdf" },
  { id: "christian", plan: "tests/doors/plans/christian-floorplan-page6.pdf" },
  { id: "beddis", plan: "tests/fixtures/beddis/concept-floorplan.pdf" },
  { id: "15a", plan: "tests/fixtures/15a/floorplan.pdf" },
] as const;

async function traceJob(job: (typeof jobs)[number]) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const plan = resolve(root, job.plan);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(plan)),
    disableFontFace: true,
  } as never).promise;
  try {
    const page = await doc.getPage(1);
    const geom = await extractPageGeometry(page as never);
    const planText = parsePlanText(geom.labels);
    const trace = traceExteriorWallEvidence({
      segments: geom.segments,
      rooms: planText.rooms.map((room) => ({
        name: room.name,
        x: room.x,
        y: room.y,
        widthMm: room.widthMm,
        depthMm: room.depthMm,
      })),
      scale: 100,
      printedPerimeterM: planText.titleAreas?.perimeterM ?? null,
    });

    return {
      id: job.id,
      plan: job.plan,
      printedPerimeterM: trace.printedPerimeterM,
      tracedExteriorEvidenceM: trace.tracedExteriorEvidenceM,
      bridgedExteriorEvidenceM: trace.bridgedExteriorEvidenceM,
      perimeterCandidateM: trace.perimeterCandidateM,
      perimeterCandidateSource: trace.perimeterCandidateSource,
      perimeterLineM: trace.perimeterLineM,
      perimeterMeasurementTrusted: trace.perimeterMeasurementTrusted,
      perimeterCandidateTrusted: trace.perimeterCandidateTrusted,
      visualLoopClosed: trace.visualLoopClosed,
      exteriorRunCount: trace.runs.length,
      perimeterRunCount: trace.perimeterRuns.length,
      bridgeCount: trace.perimeterBridges.length,
    };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

const results = [];
for (const job of jobs) results.push(await traceJob(job));

writeFileSync(outPath, `${JSON.stringify({ jobs: results }, null, 2)}\n`);
console.log(`wrote ${outPath}`);
for (const result of results) {
  console.log(
    [
      result.id,
      `printed=${result.printedPerimeterM ?? "?"}`,
      `candidate=${result.perimeterCandidateM}`,
      `drawn=${result.perimeterLineM}`,
      `closed=${result.visualLoopClosed}`,
      `trusted=${result.perimeterCandidateTrusted}`,
      `source=${result.perimeterCandidateSource}`,
    ].join("\t"),
  );
}
