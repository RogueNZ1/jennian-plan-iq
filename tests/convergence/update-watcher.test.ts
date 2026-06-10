// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isNewerBuild } from "../../src/components/jennian/UpdateWatcher";

describe("isNewerBuild — never nag on a guess", () => {
  it("no baked id (local dev) → never", () => {
    expect(isNewerBuild(undefined, "abc")).toBe(false);
    expect(isNewerBuild("", "abc")).toBe(false);
  });
  it("malformed served payload → never", () => {
    expect(isNewerBuild("abc", null)).toBe(false);
    expect(isNewerBuild("abc", 42)).toBe(false);
    expect(isNewerBuild("abc", "")).toBe(false);
  });
  it("same id → no toast; different id → toast", () => {
    expect(isNewerBuild("abc", "abc")).toBe(false);
    expect(isNewerBuild("abc", "def")).toBe(true);
  });
});
