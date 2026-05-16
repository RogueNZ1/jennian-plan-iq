/**
 * Model guard — prevents regression to non-working GPT models.
 *
 * History: openai/gpt-4o and openai/gpt-5 were tried on the Lovable AI
 * gateway and both failed — gpt-5 doesn't exist, gpt-4o cannot reliably
 * read NZ architectural plan text at the required accuracy.
 * google/gemini-2.5-pro is the ONLY model confirmed working.
 *
 * These tests read the source files directly so any model change breaks
 * the build before it reaches production.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../");

function readSrc(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("AI model guard — Lovable gateway must use Gemini", () => {
  it("concept.functions.ts uses google/gemini-2.5-pro", () => {
    const src = readSrc("src/lib/takeoff/concept.functions.ts");
    expect(src).toContain("google/gemini-2.5-pro");
  });

  it("concept.functions.ts does NOT reference any openai/ model", () => {
    const src = readSrc("src/lib/takeoff/concept.functions.ts");
    const match = src.match(/["']openai\/[^"']+["']/);
    expect(match).toBeNull();
  });

  it("vision.functions.ts uses google/gemini-2.5-pro", () => {
    const src = readSrc("src/lib/takeoff/vision.functions.ts");
    expect(src).toContain("google/gemini-2.5-pro");
  });

  it("vision.functions.ts does NOT reference any openai/ model", () => {
    const src = readSrc("src/lib/takeoff/vision.functions.ts");
    const match = src.match(/["']openai\/[^"']+["']/);
    expect(match).toBeNull();
  });
});
