/**
 * Door engine bench runner.
 * Runs the engine on a real plan PDF and gates on exact ground truth:
 *   - exact type counts (singles / doubles / cavity / barn)
 *   - every ground-truth door matched by type+width within 30pt
 *   - every mustNotAppear item absent from all outputs (including flags)
 *   - zero unexplained extras
 * Exit code 1 on any failure — wired for CI.
 *
 * Usage: npx tsx bench/run-bench.ts <plan.pdf> <bench.json>
 */
import * as fs from "fs";
import * as path from "path";
import { extractPageGeometry } from "../src/pdf-adapter";
import { detectInteriorDoors, DEFAULT_CONFIG, DoorHit } from "../src/door-engine";

async function main() {
  const [pdfPath, benchPath] = process.argv.slice(2);
  if (!pdfPath || !benchPath) {
    console.error("usage: tsx bench/run-bench.ts <plan.pdf> <bench.json>");
    process.exit(2);
  }
  const bench = JSON.parse(fs.readFileSync(benchPath, "utf8"));

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);

  const geom = await extractPageGeometry(page as any);
  console.log(`extracted: ${geom.labels.length} text lines, ${geom.segments.length} segments`);

  const cfg = { ...DEFAULT_CONFIG, scale: bench.scale ?? 100 };
  const result = detectInteriorDoors(geom, cfg);

  const all: DoorHit[] = [...result.hinged, ...result.doubles, ...result.cavity];
  let fail = 0;
  const ok = (m: string) => console.log("  PASS  " + m);
  const bad = (m: string) => { console.log("  FAIL  " + m); fail++; };

  console.log("\n── counts ──");
  for (const k of ["singles", "doubles", "cavitySliders", "barn"] as const) {
    const got = (result.counts as any)[k], want = bench.expected[k === "cavitySliders" ? "cavitySliders" : k];
    got === want ? ok(`${k}: ${got}`) : bad(`${k}: got ${got}, want ${want}`);
  }
  result.flags.length === (bench.expected.flags ?? 0)
    ? ok(`flags: ${result.flags.length}`)
    : bad(`flags: got ${result.flags.length} (${result.flags.map(f => `${f.widthMm}@${f.x | 0},${f.y | 0} ${f.note ?? ""}`).join("; ")}), want ${bench.expected.flags ?? 0}`);

  console.log("\n── per-door ──");
  const matched = new Set<DoorHit>();
  for (const gt of bench.doors) {
    const hit = all.find(h =>
      !matched.has(h) &&
      h.type === (gt.type === "cavity" ? "cavity" : gt.type) &&
      h.widthMm === gt.widthMm &&
      Math.hypot(h.x - gt.near[0], h.y - gt.near[1]) < 30
    );
    if (hit) { matched.add(hit); ok(`${gt.label} (${gt.type} ${gt.widthMm})`); }
    else bad(`${gt.label} (${gt.type} ${gt.widthMm} near ${gt.near}) — not found`);
  }

  console.log("\n── exclusions ──");
  for (const ex of bench.mustNotAppear) {
    const leak = [...all, ...result.flags].find(h =>
      Math.hypot(h.x - ex.near[0], h.y - ex.near[1]) < 30 && h.widthMm === ex.widthMm
    );
    leak ? bad(`${ex.label} leaked into output as ${leak.type}`) : ok(`${ex.label} excluded`);
  }

  console.log("\n── extras ──");
  const extras = all.filter(h => !matched.has(h));
  extras.length === 0
    ? ok("no unexplained doors")
    : extras.forEach(e => bad(`extra ${e.type} ${e.widthMm} @ (${e.x | 0},${e.y | 0}) ${e.note ?? ""}`));

  console.log(`\n${fail === 0 ? "BENCH PASS" : `BENCH FAIL (${fail})`} — ${path.basename(pdfPath)}`);
  console.log(`QS export: H187 singles=${result.counts.singles}  H192 doubles=${result.counts.doubles}  H193 cavity=${result.counts.cavitySliders}  barn=${result.counts.barn}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
