// @vitest-environment node
/**
 * Spec schema structural invariants. The frozen row/code contract lives in
 * tests/specs/spec-contract.test.ts — this file checks the schema is
 * internally sound regardless of its content.
 */
import { describe, it, expect } from "vitest";
import {
  SPECS,
  SPEC_GROUPS,
  SPEC_FIRST_ROW,
  SPEC_LAST_ROW,
  SPEC_BLOCK_HEADER_ROW,
  SPEC_GUARD_ROW,
  parseSpecifications,
  autoNaTargets,
  answeredCount,
} from "../specs/spec-schema";

describe("spec schema invariants", () => {
  it("ids are unique snake_case", () => {
    const ids = SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it("rows are unique, contiguous, and inside the block", () => {
    const rows = SPECS.map((s) => s.row).sort((a, b) => a - b);
    expect(rows[0]).toBe(SPEC_FIRST_ROW);
    expect(rows[rows.length - 1]).toBe(SPEC_LAST_ROW);
    rows.forEach((r, i) => expect(r).toBe(SPEC_FIRST_ROW + i));
    expect(SPEC_FIRST_ROW).toBe(SPEC_BLOCK_HEADER_ROW + 1);
    expect(SPEC_GUARD_ROW).toBeLessThan(SPEC_BLOCK_HEADER_ROW);
  });

  it("option codes are unique non-negative integers per spec; 1 exists everywhere", () => {
    for (const s of SPECS) {
      const codes = s.options.map((o) => o.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const c of codes) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
      }
      // every spec has a code-1 option (the form's first-printed/standard choice)
      expect(codes).toContain(1);
    }
  });

  it("every spec belongs to a declared group", () => {
    const groups = new Set(SPEC_GROUPS.map((g) => g.id));
    for (const s of SPECS) expect(groups.has(s.group)).toBe(true);
  });

  it("naWhen dependencies reference real specs and real codes", () => {
    for (const s of SPECS) {
      if (!s.naWhen) continue;
      const driver = SPECS.find((d) => d.id === s.naWhen!.spec);
      expect(driver, `${s.id} naWhen → ${s.naWhen.spec}`).toBeTruthy();
      for (const c of s.naWhen.codes) {
        expect(driver!.options.some((o) => o.code === c)).toBe(true);
      }
      // a spec that can auto-N/A must actually have an N/A (0) option
      expect(s.options.some((o) => o.code === 0)).toBe(true);
    }
  });

  it("heating codes follow Haydon's brief exactly: ducted=1, high wall=2", () => {
    const heating = SPECS.find((s) => s.id === "heating")!;
    expect(heating.options.find((o) => o.code === 1)!.label.toLowerCase()).toContain("ducted");
    expect(heating.options.find((o) => o.code === 2)!.label.toLowerCase()).toContain("high wall");
    expect(heating.options.find((o) => o.code === 3)!.label.toLowerCase()).toContain("gas");
    expect(heating.options.find((o) => o.code === 4)!.label.toLowerCase()).toContain("log");
  });

  it("shower codes: 1 = acrylic, 2 = tiled wet-floor", () => {
    const shower = SPECS.find((s) => s.id === "shower")!;
    expect(shower.options.find((o) => o.code === 1)!.label.toLowerCase()).toContain("acrylic");
    expect(shower.options.find((o) => o.code === 2)!.label.toLowerCase()).toContain("tiled");
  });

  it("services: 1 = residential, 2 = rural", () => {
    const svc = SPECS.find((s) => s.id === "services")!;
    expect(svc.options.find((o) => o.code === 1)!.label).toBe("Residential");
    expect(svc.options.find((o) => o.code === 2)!.label).toBe("Rural");
  });

  it("upgrade toggles use 1=No(standard), 2=Yes for uniform QS IF formulas", () => {
    for (const id of [
      "insulation_acoustic",
      "insulation_underslab",
      "insulation_hot_edge",
      "garage_carpet",
    ]) {
      const s = SPECS.find((x) => x.id === id)!;
      expect(s.options.find((o) => o.code === 1)!.label.toLowerCase()).toContain("standard");
      expect(s.options.find((o) => o.code === 2)!.label).toBe("Yes");
    }
  });

  it("no naWhen dependencies in v2 (lean schema, no rural sub-detail)", () => {
    expect(SPECS.some((s) => s.naWhen)).toBe(false);
    expect(autoNaTargets({ services: 1 })).toEqual([]);
  });

  it("parseSpecifications is defensive", () => {
    expect(parseSpecifications(null).answers).toEqual({});
    expect(
      parseSpecifications({ answers: { heating: 2, junk: "x", neg: -1, frac: 1.5 } }).answers,
    ).toEqual({ heating: 2 });
    expect(parseSpecifications("garbage").answers).toEqual({});
  });

  it("answeredCount counts against the full schema", () => {
    const { answered, total } = answeredCount({ heating: 1, shower: 2 });
    expect(total).toBe(SPECS.length);
    expect(answered).toBe(2);
  });
});
