// @vitest-environment node
/**
 * Phase 1 — Task 4: live reproducibility harness.
 *
 * Gated behind PHASE1_LIVE=1 (makes real Anthropic calls + needs the local
 * geometry service on :8000). Runs the full concept pipeline 3× against the
 * canonical plan and asserts every QS-relevant quantity is identical across runs
 * — the determinism F-001 required. On success it writes:
 *   - mcalevey.golden.json  (the golden pipeline + geometry from run 1)
 *   - mcalevey.replay.json  (run 1's raw AI responses, for offline replay)
 *
 * Run: PHASE1_LIVE=1 npx vitest run tests/phase1/live-runs.test.ts
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { writeFileSync } from "node:fs";
import {
  loadEnvLocal,
  loadImageB64,
  runGeometry,
  normalizePipeline,
  buildRecord,
  GOLDEN_PATH,
  REPLAY_PATH,
  SUBSTITUTION_NOTE,
} from "./pipeline";

// Wrap the real callVisionModel so live responses still flow through, but we can
// capture run 1's raw output for the replay cache.
const captured: { response: string }[] = [];
vi.mock("../../src/lib/takeoff/anthropic-client", async (orig) => {
  const actual = await orig<typeof import("../../src/lib/takeoff/anthropic-client")>();
  return {
    ...actual,
    callVisionModel: async (
      apiKey: string,
      systemPrompt: string,
      userText: string,
      imageBase64: string,
    ) => {
      const response = await actual.callVisionModel(apiKey, systemPrompt, userText, imageBase64);
      captured.push({ response });
      return response;
    },
  };
});

import { recognisePlan } from "../../src/lib/takeoff/recognise-plan";
import { extractAnnotations } from "../../src/lib/takeoff/extract-annotations";
import { classifyAnnotations } from "../../src/lib/takeoff/classify-annotations";

const RUN_LIVE = !!process.env.PHASE1_LIVE;

describe.skipIf(!RUN_LIVE)("Phase 1 — live reproducibility (3 runs of the canonical plan)", () => {
  beforeAll(() => {
    loadEnvLocal();
  });

  it("produces byte-identical QS quantities across 3 live runs", async () => {
    const b64 = loadImageB64();
    const records: ReturnType<typeof buildRecord>[] = [];
    const pipelines: ReturnType<typeof normalizePipeline>[] = [];

    for (let run = 0; run < 3; run++) {
      captured.length = 0;
      const ctx = await recognisePlan(b64, "mcalevey.pdf");
      const raw = await extractAnnotations(b64, ctx);
      const takeoff = classifyAnnotations(raw, ctx);
      const geometry = await runGeometry();

      records.push(buildRecord(takeoff, geometry));
      pipelines.push(normalizePipeline(ctx, takeoff));

      if (run === 0) {
        writeFileSync(
          REPLAY_PATH,
          JSON.stringify(
            {
              note: SUBSTITUTION_NOTE,
              recognise: captured[0]?.response ?? null,
              extract: captured[1]?.response ?? null,
            },
            null,
            2,
          ),
        );
      }
    }

    // Write artifacts + emit the three-run table BEFORE asserting, so a determinism
    // failure still leaves the golden/replay fixtures and a full report behind.
    writeFileSync(
      GOLDEN_PATH,
      JSON.stringify(
        {
          note: SUBSTITUTION_NOTE,
          pipeline: pipelines[0],
          geometry: records[0],
          runs: records,
        },
        null,
        2,
      ),
    );

    // Per-field stability across the 3 runs (which quantities drift vs hold).
    const fields = Object.keys(records[0]) as (keyof (typeof records)[0])[];
    const stability = Object.fromEntries(
      fields.map((f) => [
        f,
        { values: records.map((r) => r[f]), stable: records.every((r) => r[f] === records[0][f]) },
      ]),
    );
    console.log("PHASE1_THREE_RUN_TABLE=" + JSON.stringify(records));
    console.log("PHASE1_STABILITY=" + JSON.stringify(stability));

    // Determinism guard: runs 2 and 3 must deep-equal run 1.
    expect(records[1]).toEqual(records[0]);
    expect(records[2]).toEqual(records[0]);
    expect(pipelines[1]).toEqual(pipelines[0]);
    expect(pipelines[2]).toEqual(pipelines[0]);
  }, 240000);
});
