// @vitest-environment node
/**
 * Route 2 Stage B — foldSymbolOpenings: land the label-anchored single-width openings into
 * openings[] with asserted heights, glaze-by-type, sectional reconcile, and the present-but-
 * flagged entry fallback. Gated to the no-schedule path (symbol_openings present) so
 * schedule/datum jobs (Beddis/Harrison) are a strict no-op → byte-unchanged.
 */
import { describe, it, expect } from "vitest";
import { foldSymbolOpenings, deriveOpeningTotals } from "../../src/lib/takeoff/derive-fields";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";
import type { VectorSymbolOpening, VectorEntrance } from "../../src/lib/takeoff/geometry-api";

const win = (room: string, h: number, w: number): Opening => ({
  type: "window", room, height_m: h, width_m: w, glazed: true, cladding: null,
  area_m2: Math.round(h * w * 100) / 100, source: "vision", confidence: "medium",
});
const sym = (type: VectorSymbolOpening["type"], width_mm: number): VectorSymbolOpening => ({
  type, width_mm, width_source: "callout", label_dist_mm: 1000, page: 0,
});
const byType = (os: Opening[], t: Opening["type"]) => os.find((o) => o.type === t);

describe("Route 2 — foldSymbolOpenings", () => {
  it("NO-OP on the schedule path (symbol_openings null/empty) → byte-unchanged", () => {
    const base = [win("Bed 1", 1.3, 1.5)];
    const r1 = foldSymbolOpenings(base, null, "4.8×2.1");
    expect(r1.openings).toBe(base); // same reference — nothing rebuilt
    expect(r1.garage_door_size).toBe("4.8×2.1");
    const r2 = foldSymbolOpenings(base, [], "4.8×2.1");
    expect(r2.openings).toBe(base);
    // Even with a vector.entrance present (Beddis/Harrison carry one), no symbols → strict no-op.
    const entrance: VectorEntrance = { type: "entry", width_mm: null, width_source: "unresolved", height_mm: 2100, height_source: "standard_assumed", label: "ENTRY", page: 0 };
    expect(foldSymbolOpenings(base, null, "4.8×2.1", entrance).openings).toBe(base);
  });

  it("15A-shaped: folds 4 callouts, asserts heights, reconciles the garbled garage", () => {
    const vision = [win("Bed 1", 1.3, 1.5), win("Lounge", 1.3, 1.5)];
    const syms = [sym("sectional_door", 2700), sym("garage_window", 2000), sym("slider", 2000), sym("entrance", 1030)];
    const r = foldSymbolOpenings(vision, syms, "5 950"); // garbled vision garage read

    expect(r.garage_door_size).toBe("2.7×2.1"); // callout sectional wins, fixes "5 950"
    expect(r.openings.length).toBe(6); // 2 vision + 4 recovered

    const sec = byType(r.openings, "sectional_door")!;
    expect(sec).toMatchObject({ width_m: 2.7, height_m: 2.1, glazed: false, source: "callout", height_source: "asserted" });
    expect(sec.flags?.join(" ")).toContain("height assumed standard 2.1m");

    const gw = byType(r.openings, "garage_window")!;
    // Phase 2: garage_window resolves like every other symbol type — asserted standard
    // height, FLAGGED — instead of the old unresolved 0 (which zeroed its area + E-cell).
    expect(gw).toMatchObject({ width_m: 2, height_m: 2.1, glazed: true, height_source: "asserted" });
    expect(gw.flags?.join(" ")).toContain("height assumed standard 2.1m");

    expect(byType(r.openings, "slider")).toMatchObject({ width_m: 2, height_m: 2.1, glazed: true, source: "callout" });
    expect(byType(r.openings, "entrance")).toMatchObject({ width_m: 1.03, height_m: 2.1, glazed: true });

    // window_count: 2 windows + slider + garage_window included; sectional + entry excluded (doors).
    expect(deriveOpeningTotals(r.openings).window_count).toBe(4);
  });

  it("O'Neil-shaped: no garage callout double-count; entry present-but-flagged via fallback", () => {
    const vision = [win("Bed 2", 1.3, 1.5)];
    const syms = [sym("sectional_door", 4800), sym("pa_door", 960), sym("slider", 3000)];
    const entrance: VectorEntrance = { type: "entry", width_mm: null, width_source: "unresolved", height_mm: 2100, height_source: "standard_assumed", label: "PORCH:", page: 0 };
    const r = foldSymbolOpenings(vision, syms, "4.8×2.1", entrance);

    expect(r.garage_door_size).toBe("4.8×2.1"); // callout confirms existing 4.8
    // PA door is a door → excluded from window_count; slider included.
    expect(byType(r.openings, "pa_door")).toMatchObject({ width_m: 0.96, glazed: true });

    const e = byType(r.openings, "entrance")!;
    expect(e).toBeDefined();          // never dropped
    expect(e.width_m).toBe(1.0);      // last-resort assumed width — no longer a 0-area phantom
    expect(e.area_m2).toBe(2.1);      // 2.1 (asserted height) × 1.0 (assumed width) — contributes glass area
    expect(e.source).toBe("unresolved"); // provenance still flags the real width as unknown
    expect(e.confidence).toBe("low");
    expect(e.flags?.join(" ")).toContain("width assumed 1.0m — confirm against plan");
    // count: 1 window + slider; sectional/PA/entry excluded.
    expect(deriveOpeningTotals(r.openings).window_count).toBe(2);
  });

  it("a clean callout entry wins over the unresolved vector-entrance fallback (no double entry)", () => {
    const r = foldSymbolOpenings([win("Bed 1", 1.3, 1.5)], [sym("entrance", 1030)], "x",
      { type: "entry", width_mm: null, width_source: "unresolved", height_mm: 2100, height_source: "standard_assumed", label: "ENTRY", page: 0 });
    const entries = r.openings.filter((o) => o.type === "entrance");
    expect(entries.length).toBe(1);
    expect(entries[0].width_m).toBe(1.03); // the callout, not the unresolved fallback
  });
});

// ── Phase 2 — resolveOpeningHeightM (symbol path height resolver) ────────────
import { resolveOpeningHeightM } from "../../src/lib/takeoff/derive-fields";

describe("Phase 2 — resolveOpeningHeightM", () => {
  it("unresolved (no extracted height) → asserted standard 2.1m, FLAGGED — never 0", () => {
    const r = resolveOpeningHeightM(undefined);
    expect(r.height_m).toBe(2.1);
    expect(r.height_source).toBe("asserted");
    expect(r.flag).toContain("height assumed standard 2.1m");
    expect(resolveOpeningHeightM(null)).toEqual(r);
  });

  it("a REAL extracted height always wins and is never overwritten (no flag)", () => {
    const r = resolveOpeningHeightM(1300);
    expect(r.height_m).toBe(1.3);
    expect(r.height_source).toBe("callout");
    expect(r.flag).toBeNull();
  });

  it("a zero/garbage extracted height does not count as resolved", () => {
    expect(resolveOpeningHeightM(0).height_source).toBe("asserted");
    expect(resolveOpeningHeightM(-500).height_source).toBe("asserted");
  });

  it("garage_window via the fold: flagged standard height with REAL area, not 0 area", () => {
    const r = foldSymbolOpenings([], [sym("garage_window", 2000)], null);
    const gw = byType(r.openings, "garage_window")!;
    expect(gw.height_m).toBe(2.1);
    expect(gw.area_m2).toBe(4.2); // 2.1 × 2.0 — previously 0, which understated glazing
    expect(gw.height_source).toBe("asserted");
  });

  it("garage_window with an engine-supplied height_mm keeps the extracted height (never overwritten)", () => {
    const withHeight: VectorSymbolOpening = { ...sym("garage_window", 2000), height_mm: 1300 };
    const r = foldSymbolOpenings([], [withHeight], null);
    const gw = byType(r.openings, "garage_window")!;
    expect(gw.height_m).toBe(1.3);
    expect(gw.height_source).toBe("callout");
    expect(gw.flags ?? []).toEqual([]); // no asserted-height flag on a real read
  });
});
