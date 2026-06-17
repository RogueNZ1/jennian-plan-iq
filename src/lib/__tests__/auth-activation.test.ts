import { describe, expect, it } from "vitest";

import { canEnterApp, requiresPasswordSetup } from "../auth/activation";

describe("auth activation gate", () => {
  it("requires password setup while a profile is still invited", () => {
    expect(requiresPasswordSetup("invited")).toBe(true);
    expect(canEnterApp("invited")).toBe(false);
  });

  it("allows active profiles into the app", () => {
    expect(requiresPasswordSetup("active")).toBe(false);
    expect(canEnterApp("active")).toBe(true);
  });

  it("does not treat missing or suspended status as app-ready", () => {
    expect(canEnterApp(null)).toBe(false);
    expect(canEnterApp(undefined)).toBe(false);
    expect(canEnterApp("suspended")).toBe(false);
  });
});
