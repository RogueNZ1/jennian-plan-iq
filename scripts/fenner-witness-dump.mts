import { readFileSync } from "node:fs";
import { runDoorEngine } from "../src/lib/doors/run-doors.ts";
const de = await runDoorEngine(readFileSync("tests/doors/plans/fenner-floorplan.pdf"), 1, "1:100");
for (const w of de?.physicalOpeningWidthWitnesses ?? [])
  console.log(`${w.widthMm}mm kind=${w.openingKind ?? "?"} room=${w.room} side=${w.planSide} text="${w.text}" stub=${w.evidence.stub} leaf=${w.evidence.leaf} | ${w.note}`);
