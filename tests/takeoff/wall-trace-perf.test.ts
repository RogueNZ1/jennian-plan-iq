/**
 * Perf locks for the prelim-set hang (13 Jun 2026): two live runs died stuck at
 * 'running' with NULL payloads because the v1 trace was O(n²) on a working
 * drawing's segment density. These tests simulate that density and pin BOTH
 * behaviours: past the cap → instant honest skip; under the cap → the sweep
 * finishes fast. A trace that can't finish fast must not run at all.
 */
import { describe, it, expect } from "vitest";
import { traceInteriorWalls } from "../../src/lib/takeoff/wall-trace";
import type { Segment } from "../../src/lib/doors/door-engine";

function denseField(n: number): Segment[] {
  const segs: Segment[] = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < n; i++) {
    const v = rnd() > 0.5;
    const o = rnd() * 800,
      a = rnd() * 800,
      len = 12 + rnd() * 60;
    segs.push(v ? { x0: o, y0: a, x1: o, y1: a + len } : { x0: a, y0: o, x1: a + len, y1: o });
  }
  return segs;
}

const rooms = Array.from({ length: 12 }, (_, i) => ({ x: 100 + i * 60, y: 100 + (i % 3) * 200 }));

describe("wall-trace performance contract", () => {
  it("past the density cap → instant honest skip (the hang killer)", () => {
    const t0 = performance.now();
    const wt = traceInteriorWalls(denseField(40000), 100, rooms);
    const ms = performance.now() - t0;
    expect(wt.internalWallLm).toBe(0);
    expect(wt.ribbonCount).toBe(0);
    expect(ms).toBeLessThan(800);
  });

  it("a dense-but-legal field finishes in seconds via the sweep, never minutes", () => {
    const t0 = performance.now();
    const wt = traceInteriorWalls(denseField(15000), 100, rooms);
    const ms = performance.now() - t0;
    console.log(`[perf] 15k segments → ${ms.toFixed(0)}ms, ${wt.ribbonCount} ribbons`);
    expect(ms).toBeLessThan(6000);
  });
});
