// West Street (29A West St / JM-0032) product run-through - diagnostic only.
// Runs the committed plan through the deterministic pipeline (no vision, no
// geometry API, no Supabase) and audits the QS export handoff cells.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runDoorEngine } from "../src/lib/doors/run-doors.ts";
import { composeTakeoff } from "../src/lib/takeoff/compose-takeoff.ts";
import { buildExtractedQuantityReadModel } from "../src/lib/takeoff/extracted-quantity-read-model.ts";
import { applyEnrichedTakeoff, buildDropInSheet, type QSExportData } from "../src/lib/iq-qs-export.ts";
import { buildAiCheckSummary, aiCheckSummaryLines } from "../src/lib/ai-check-summary.ts";
import type { TakeoffData } from "../src/lib/takeoff/extract-concept.ts";

const PDF = resolve("tests/doors/plans/west-street.pdf");

function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0032", clientName: "Pearse McGougan", address: "29A West St, Feilding",
    templateId: null, createdAt: "", floorAreaM2: null as never, perimeterLm: null,
    firstFloorAreaM2: null, studHeightMm: 2400, alfrescoAreaM2: null, roofPitch: null,
    ridgeType: null, underlay: null, claddingType1: null, claddingType2: null,
    windows: [], garageDoors: [], interiorDoors: [], downpipes: [], heatPumps: [],
    extras: [], skylights: [], clientFirstName: "Pearse", clientSurname: "McGougan",
    streetAddress: "29A West St", addressLine2: null, city: "Feilding", email: null,
    phone: null, jmwNumber: "JM-0032", planVersion: "1", exteriorWallLengthLm: null,
    exteriorWallHeightM: 2.4, pathsPatioM2: null, drivewayM2: null, windowsByRoom: {},
    downpipesWhite: 0, downpipesColourSteel: 0, downpipesPvcColoured: 0,
    garageDoor48x21Std: 0, garageDoor48x21Insulated: 0, garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0, garageDoor27x21Std: 0, garageDoor27x21Insulated: 0,
    intDoorStandard: 0, intDoorUGroove: 0, intDoorVGroove: 0, intDoorBarnSlider: 0,
    intDoorDouble: 0, intDoorCavitySlider: 0, ceilingHatch: 0, atticStair: 0,
    letterboxUrban: 0, washingLine: 0, heatPumpWallUnit: 0, heatPumpDucted: 0,
    specItems: {}, openings: null, ...over,
  };
}

function cell(ws: Record<string, { v?: unknown } | unknown>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c && typeof c === "object" && "v" in c ? c.v : "";
}

async function main() {
  const pdfData = readFileSync(PDF);
  const de = await runDoorEngine(pdfData, 1, "1:100");
  if (!de) throw new Error("door engine returned null");
  console.log("=== DOOR ENGINE ===");
  console.log("counts:", JSON.stringify(de.counts), "flags:", de.flags.length);
  console.log("wallTrace:", de.wallTrace ? `${de.wallTrace.internalWallLm} lm / ${de.wallTrace.ribbonCount} ribbons` : "none");
  const pt = de.planText;
  if (pt) {
    console.log("rooms:", pt.rooms.length, "| windowCodes:", pt.windowCodes.length, "| draftingIssues:", (pt.draftingIssues ?? []).length);
    const g = pt.rooms.find((r) => /GARAGE/i.test(r.name));
    console.log("garage room:", g ? `${g.widthMm}x${g.depthMm} = ${g.areaM2} m2` : "not found");
    console.log("titleAreas:", JSON.stringify(pt.titleAreas ?? null));
  }

  const vision = { floor_area_m2: null, windows_by_room: {} } as unknown as TakeoffData;
  const runId = "run-westst-002";
  const { enriched } = composeTakeoff({
    visionTakeoff: vision, geometry: null, schedule: null, geometryPageIndex: undefined,
    doorEngine: de as never, visualOpeningAudit: null, visualOpeningAuditRequired: true,
    elevationData: null, jobId: "west-street-diagnostic", runId,
    ledgerTimestamp: new Date().toISOString(),
  });

  console.log("\n=== ENRICHED (key fields) ===");
  console.log("floor_area:", enriched.floor_area_m2.value, "| perimeter:", enriched.external_wall_lm.value, "| geometry:", enriched.geometry_status?.value ?? "n/a");
  console.log("garage_area:", enriched.garage_area_m2.value, "| doors_auto:", JSON.stringify(enriched.door_counts_auto ?? null));
  console.log("openings[]:", (enriched.openings ?? []).length);
  for (const o of (enriched.openings ?? []).slice(0, 20))
    console.log(`  - ${o.type} ${o.room ?? "?"} ${o.height_m}x${o.width_m} src=${o.source} conf=${o.confidence}`);

  const rm = buildExtractedQuantityReadModel(enriched.extracted_quantities ?? [], { activeRunId: runId });
  console.log("\n=== LEDGER ===");
  console.log("rows:", rm.rows.length, "| clean:", rm.groups.extracted.length, "| needs_review:", rm.groups.needs_review.length, "| missing:", rm.groups.missing_evidence.length, "| conflict:", rm.groups.conflict.length, "| ignored:", rm.groups.ignored.length);
  console.log("cleanTotals:", JSON.stringify(rm.cleanTotals), "byCat:", JSON.stringify(rm.cleanTotalsByCategory));
  for (const r of rm.groups.extracted)
    console.log(`  CLEAN ${r.category} ${r.label ?? ""} count=${r.count} ${r.widthMm ?? "-"}x${r.heightMm ?? "-"} area=${r.areaM2 ?? "-"}`);

  console.log("\n=== NON-CLEAN OPENING ROWS (why) ===");
  for (const grp of ["needs_review", "missing_evidence", "conflict"] as const) {
    for (const r of rm.groups[grp].filter((x) => x.category === "window" || x.category === "opening")) {
      console.log(`  [${grp}] ${r.label ?? r.id} ${r.widthMm ?? "-"}x${r.heightMm ?? "-"} warn=${r.warnings.join(",")}`);
      for (const e of r.evidence.slice(0, 3)) console.log(`      ev: ${e.text ?? ""}`);
    }
  }
  const data = applyEnrichedTakeoff(base(), enriched, { extractedQuantityReadModel: rm });
  console.log("\nopeningPricingBlocked:", data.openingPricingBlocked);

  const summary = buildAiCheckSummary(data, { runId });
  console.log("\n=== AI TAKEOFF CHECK ===");
  for (const line of aiCheckSummaryLines(summary)) console.log("  " + line);

  const ws = buildDropInSheet(data) as never;
  console.log("\n=== IQ IMPORT CELLS ===");
  console.log("B9 floor:", cell(ws, "B9"), "| B12 extwall:", cell(ws, "B12"), "| B15 windows:", cell(ws, "B15"), "| C15:", cell(ws, "C15"));
  console.log("B24 garage size:", JSON.stringify(cell(ws, "B24")));
  console.log("doors B27-B30:", [cell(ws, "B27"), cell(ws, "B28"), cell(ws, "B29"), cell(ws, "B30")].map(String).join(" / "));
  for (let r = 33; r <= 45; r++)
    console.log(`row ${r}: ${String(cell(ws, `A${r}`)).padEnd(16)} B=${JSON.stringify(cell(ws, `B${r}`))} C=${JSON.stringify(cell(ws, `C${r}`))} D=${JSON.stringify(cell(ws, `D${r}`))}`);
  console.log("\n=== MANUAL BLOCK ===");
  for (let r = 47; r < 90; r++) {
    const v = cell(ws, `A${r}`);
    if (typeof v === "string" && v) console.log("  " + v);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
// (audit tail appended) - detail dump of non-clean window/opening rows
