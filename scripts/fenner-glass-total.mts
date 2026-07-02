import { readFileSync } from "node:fs";
import { runDoorEngine } from "../src/lib/doors/run-doors.ts";
import { composeTakeoff } from "../src/lib/takeoff/compose-takeoff.ts";
import { buildExtractedQuantityReadModel } from "../src/lib/takeoff/extracted-quantity-read-model.ts";
import type { TakeoffData } from "../src/lib/takeoff/extract-concept.ts";

const de = await runDoorEngine(readFileSync("tests/doors/plans/fenner-floorplan.pdf"), 1, "1:100");
const { enriched } = composeTakeoff({
  visionTakeoff: { floor_area_m2: null, windows_by_room: {} } as unknown as TakeoffData,
  geometry: null, schedule: null, geometryPageIndex: undefined,
  doorEngine: de as never, visualOpeningAudit: null, visualOpeningAuditRequired: true,
  elevationData: null, jobId: "fenner-glass", runId: "run-glass-1",
  ledgerTimestamp: new Date().toISOString(),
});
const rm = buildExtractedQuantityReadModel(enriched.extracted_quantities ?? [], { activeRunId: "run-glass-1" });
const glass = rm.groups.extracted.filter((r) => (r.category === "window" || r.category === "exterior_door") && r.areaM2 != null);
const total = Math.round(glass.reduce((s, r) => s + (r.areaM2 ?? 0), 0) * 100) / 100;
console.log(`GREEN GLASS ROWS: ${glass.length} | TOTAL: ${total} m2 (signed ex-garage witness: 48.05 m2)`);
for (const r of glass) console.log(`  ${String(r.label ?? "").padEnd(46)} ${r.widthMm}x${r.heightMm} = ${r.areaM2} m2`);
