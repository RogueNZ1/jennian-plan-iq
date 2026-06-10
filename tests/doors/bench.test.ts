// @vitest-environment node
/**
 * Alexandra bench — the engine's REAL gate (hand-counted ground truth:
 * 12 hinged / 4 double / 1 cavity, entry + garage excluded, zero false positives).
 * The Alexandra is Jennian's own catalogue plan (own spec lot) — committed as a
 * fixture so this gate runs on every push, no fetch plumbing, no secrets.
 * Engine README: bench is n=1 — add 1-2 more plans with hand counts before trusting
 * the engine across the catalogue. Each new plan becomes a permanent bench file here.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLAN = resolve(__dirname, "plans/alexandra.pdf");
const BENCH = resolve(__dirname, "alexandra.bench.json");
const has = existsSync(PLAN);

describe.skipIf(!has)("door engine — Alexandra bench (hand-counted ground truth)", () => {
  it("matches the bench exactly", async () => {
    const { runDoorEngine } = await import("../../src/lib/doors/run-doors");
    const bench = JSON.parse(readFileSync(BENCH, "utf8"));
    const result = await runDoorEngine(
      readFileSync(PLAN),
      bench.page ?? 1,
      bench.scaleText ?? "1:100",
    );
    expect(result, "engine returned null on the bench plan").not.toBeNull();
    const { flags: expectedFlags = 0, ...expectedCounts } = bench.expected;
    expect(result!.counts).toEqual(expectedCounts);
    expect(result!.flags).toHaveLength(expectedFlags);
  }, 60_000);
});
