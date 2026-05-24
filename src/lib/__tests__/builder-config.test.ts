import { describe, it, expect } from "vitest";
import { detectBuilder, UNKNOWN_BUILDER, BUILDER_CONFIGS } from "../takeoff/builder-config";

describe("detectBuilder", () => {
  it("matches Jennian Homes by alias", () => {
    expect(detectBuilder("Jennian Homes Manawatū")).toEqual(
      BUILDER_CONFIGS.find((b) => b.name === "Jennian Homes"),
    );
  });

  it("matches by short alias 'jennian'", () => {
    expect(detectBuilder("jennian")).toEqual(
      BUILDER_CONFIGS.find((b) => b.name === "Jennian Homes"),
    );
  });

  it("matches G.J. Gardner", () => {
    expect(detectBuilder("G.J. Gardner Homes")).toEqual(
      BUILDER_CONFIGS.find((b) => b.name === "G.J. Gardner"),
    );
  });

  it("matches Sentinel Homes", () => {
    expect(detectBuilder("Sentinel Homes NZ")).toEqual(
      BUILDER_CONFIGS.find((b) => b.name === "Sentinel Homes"),
    );
  });

  it("returns UNKNOWN_BUILDER for unrecognised text", () => {
    expect(detectBuilder("Acme Construction")).toEqual(UNKNOWN_BUILDER);
  });

  it("is case-insensitive", () => {
    expect(detectBuilder("JENNIAN HOMES")).toEqual(
      BUILDER_CONFIGS.find((b) => b.name === "Jennian Homes"),
    );
  });
});
