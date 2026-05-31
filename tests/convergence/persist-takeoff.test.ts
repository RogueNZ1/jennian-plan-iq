// @vitest-environment node
/**
 * Convergence Slice 5 — persistence adapter (offline, mocked Supabase).
 *
 * Proves the takeoff_json write adapter WITHOUT touching any database:
 *   - it writes the serialised enriched takeoff to takeoff_runs.takeoff_json with the right
 *     shape (only that column, the right row);
 *   - it touches ONLY takeoff_runs — the existing relational writes (extracted_quantities /
 *     opening_schedule / module_items) are not its concern and are left exactly as today;
 *   - a forced write failure (DB error, thrown call, or oversize payload) is caught and
 *     SKIPPED — the adapter returns { written: false } and never throws, so the job save is
 *     never broken.
 *
 * The enriched payload is a realistic one built by composeTakeoff on the frozen mcalevey
 * fixtures (downstream of the cached vision model — no live AI, no geometry server).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  persistEnrichedTakeoff,
  serializeEnrichedTakeoff,
  MAX_TAKEOFF_JSON_BYTES,
  type TakeoffJsonWriter,
} from "../../src/lib/takeoff/persist-takeoff";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";
import type { GeometryApiResult } from "../../src/lib/takeoff/geometry-api";

const FIX = resolve(process.cwd(), "tests/phase1/__fixtures__");
const visionTakeoff = (
  JSON.parse(readFileSync(resolve(FIX, "mcalevey.golden.json"), "utf8")) as {
    pipeline: { takeoff: TakeoffData };
  }
).pipeline.takeoff;
const geometry = JSON.parse(
  readFileSync(resolve(FIX, "mcalevey.geometry.json"), "utf8"),
) as GeometryApiResult;
const enriched: EnrichedTakeoff = composeTakeoff({
  visionTakeoff,
  geometry,
  schedule: null,
  geometryPageIndex: 0,
}).enriched;

/** A mock writer that records every call and can be forced to fail. */
function mockWriter(opts: { error?: { message: string } | null; throwOn?: "update" | "eq" } = {}) {
  const calls = {
    tables: [] as string[],
    updates: [] as Array<Record<string, unknown>>,
    eqs: [] as Array<[string, string]>,
  };
  const writer: TakeoffJsonWriter = {
    from(table) {
      calls.tables.push(table);
      return {
        update(values) {
          if (opts.throwOn === "update") throw new Error("boom-update");
          calls.updates.push(values as Record<string, unknown>);
          return {
            async eq(column, value) {
              if (opts.throwOn === "eq") throw new Error("boom-eq");
              calls.eqs.push([column, value]);
              return { error: opts.error ?? null };
            },
          };
        },
      };
    },
  };
  return { writer, calls };
}

describe("persist-takeoff adapter (Slice 5)", () => {
  it("writes the serialised enriched takeoff to takeoff_runs.takeoff_json (right shape, right row)", async () => {
    const { writer, calls } = mockWriter();
    const r = await persistEnrichedTakeoff(writer, "run-123", enriched);

    expect(r).toEqual({ written: true, error: null });
    expect(calls.tables).toEqual(["takeoff_runs"]);
    expect(calls.eqs).toEqual([["id", "run-123"]]);
    expect(calls.updates).toHaveLength(1);
    // ONLY the takeoff_json column is written — no other column is touched.
    expect(Object.keys(calls.updates[0])).toEqual(["takeoff_json"]);
    // The payload is the round-tripped enriched takeoff (per-field provenance preserved).
    const written = calls.updates[0].takeoff_json as EnrichedTakeoff;
    expect(written).toEqual(JSON.parse(JSON.stringify(enriched)));
    expect(written.floor_area_m2.source).toBe("geometry");
    expect(written.notes).toBe(enriched.notes);
  });

  it("touches ONLY takeoff_runs — existing relational writes are not its concern", async () => {
    const { writer, calls } = mockWriter();
    await persistEnrichedTakeoff(writer, "run-1", enriched);
    expect(new Set(calls.tables)).toEqual(new Set(["takeoff_runs"]));
  });

  it("GRACEFUL: a DB error is caught — returns written:false, never throws (job save unaffected)", async () => {
    const { writer } = mockWriter({ error: { message: 'column "takeoff_json" does not exist' } });
    const r = await persistEnrichedTakeoff(writer, "run-1", enriched);
    expect(r.written).toBe(false);
    expect(r.error).toContain("does not exist");
  });

  it("GRACEFUL: a thrown write is caught — resolves written:false, never rejects", async () => {
    const { writer } = mockWriter({ throwOn: "eq" });
    await expect(persistEnrichedTakeoff(writer, "run-1", enriched)).resolves.toEqual({
      written: false,
      error: "boom-eq",
    });
  });

  it("GRACEFUL: an oversize payload is rejected BEFORE any write is attempted", async () => {
    const huge = { ...enriched, notes: "x".repeat(MAX_TAKEOFF_JSON_BYTES + 1) } as EnrichedTakeoff;
    const { writer, calls } = mockWriter();
    const r = await persistEnrichedTakeoff(writer, "run-1", huge);
    expect(r.written).toBe(false);
    expect(r.error).toContain("too large");
    expect(calls.updates).toHaveLength(0); // never reached the DB
  });

  it("serializeEnrichedTakeoff round-trips and rejects oversize", () => {
    expect(serializeEnrichedTakeoff(enriched)).toEqual(JSON.parse(JSON.stringify(enriched)));
    const huge = { ...enriched, notes: "x".repeat(MAX_TAKEOFF_JSON_BYTES + 1) } as EnrichedTakeoff;
    expect(() => serializeEnrichedTakeoff(huge)).toThrow(/too large/);
  });
});
