import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractPageGeometry } from "../src/lib/doors/pdf-adapter.ts";
import { parsePlanText } from "../src/lib/takeoff/plan-text.ts";
import { recoverFloorPlanLabelAssignments } from "../src/lib/takeoff/floor-plan-label-recovery.ts";

async function labels(pdf: string) {
  const pdfjs = await import("pdfjs-dist-door/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(resolve(pdf))), disableFontFace: true } as never).promise;
  try {
    const geom = await extractPageGeometry((await doc.getPage(1)) as never);
    return recoverFloorPlanLabelAssignments({ planText: parsePlanText(geom.labels), page: 1 });
  } finally { await doc.destroy().catch(() => {}); }
}
for (const [name, pdf] of [["WEST STREET", "tests/doors/plans/west-street.pdf"], ["FENNER", "tests/doors/plans/fenner-floorplan.pdf"]] as const) {
  const a = await labels(pdf);
  const green = a.filter((x) => x.status === "extracted");
  const review = a.filter((x) => x.status === "review");
  const m2 = Math.round(green.reduce((s, x) => s + x.areaM2, 0) * 100) / 100;
  console.log(`=== ${name} ===`);
  console.log(`labels: ${a.length} | GREEN: ${green.length} | review: ${review.length} | GREEN GLASS: ${m2} m2`);
  for (const g of green) console.log(`  GREEN ${g.text} @ ${g.room ?? "?"} = ${g.areaM2} m2`);
  for (const r of review) console.log(`  review ${r.text} @ ${r.room ?? "?"} (${r.reason.split(": ").pop()})`);
}
