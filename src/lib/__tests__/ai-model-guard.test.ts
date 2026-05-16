/**
 * Model guard — prevents regression to non-working models.
 *
 * History:
 *   - openai/gpt-4o and openai/gpt-5 were tried on the Lovable AI gateway and
 *     both failed — gpt-5 doesn't exist, gpt-4o cannot reliably read NZ architectural
 *     plan text at the required accuracy.
 *   - concept.functions.ts was migrated to the Anthropic API directly (claude-opus-4-5).
 *   - vision.functions.ts stays on the Lovable gateway — google/gemini-2.5-pro ONLY.
 *
 * These tests read source files directly so any model change breaks the build
 * before it reaches production.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../");

function readSrc(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("AI model guard — concept pipeline uses Anthropic API", () => {
  it("concept.functions.ts uses claude-opus-4-5", () => {
    const src = readSrc("src/lib/takeoff/concept.functions.ts");
    expect(src).toContain("claude-opus-4-5");
  });

  it("concept.functions.ts uses ANTHROPIC_API_KEY (not Lovable gateway)", () => {
    const src = readSrc("src/lib/takeoff/concept.functions.ts");
    expect(src).toContain("ANTHROPIC_API_KEY");
    expect(src).not.toContain("ai.gateway.lovable.dev");
  });

  it("concept.functions.ts does NOT reference any openai/ model", () => {
    const src = readSrc("src/lib/takeoff/concept.functions.ts");
    const match = src.match(/["']openai\/[^"']+["']/);
    expect(match).toBeNull();
  });
});

describe("AI model guard — vision pipeline uses Lovable gateway with Gemini", () => {
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
