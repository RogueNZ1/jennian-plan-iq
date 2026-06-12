/**
 * Phase 1 — Task 3: cached-replay harness (offline, deterministic).
 *
 * Replays run 1's cached raw AI responses (mcalevey.replay.json) through the real
 * parse + classify logic and asserts the result deep-equals the golden pipeline
 * (mcalevey.golden.json). No Anthropic key, no network — proves the pipeline is
 * reproducible from a fixed model output. Skips if fixtures don't exist yet
 * (i.e. before the live harness has been run once).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { GOLDEN_PATH, REPLAY_PATH, normalizePipeline } from "./pipeline";

vi.mock("../../src/lib/takeoff/anthropic-client", async (orig) => {
  const actual = await orig<typeof import("../../src/lib/takeoff/anthropic-client")>();
  return { ...actual, getAnthropicApiKey: () => "test-key", callVisionModel: vi.fn() };
});

import * as anthropic from "../../src/lib/takeoff/anthropic-client";
import { recognisePlan } from "../../src/lib/takeoff/recognise-plan";
import { extractAnnotations } from "../../src/lib/takeoff/extract-annotations";
import { classifyAnnotations } from "../../src/lib/takeoff/classify-annotations";

const mockVision = () => vi.mocked(anthropic.callVisionModel);
const hasFixtures = existsSync(GOLDEN_PATH) && existsSync(REPLAY_PATH);

describe.skipIf(!hasFixtures)(
  "Phase 1 — cached replay reproduces the golden pipeline offline",
  () => {
    beforeEach(() => vi.clearAllMocks());

    it("replaying cached AI responses yields the golden planContext + takeoff", async () => {
      const replay = JSON.parse(readFileSync(REPLAY_PATH, "utf8")) as {
        recognise: string;
        extract: string;
      };
      const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { pipeline: unknown };

      mockVision().mockResolvedValueOnce(replay.recognise).mockResolvedValueOnce(replay.extract);

      const ctx = await recognisePlan("cached-b64", "mcalevey.pdf");
      const raw = await extractAnnotations("cached-b64", ctx);
      const takeoff = classifyAnnotations(raw, ctx);

      expect(normalizePipeline(ctx, takeoff)).toEqual(golden.pipeline);
    });
  },
);
