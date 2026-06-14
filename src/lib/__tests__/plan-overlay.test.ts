import { describe, it, expect } from "vitest";
import {
  adapterToUser,
  buildDoorMarkers,
  buildVisualOpeningMarkers,
  isWindowCode,
  summariseMarkers,
} from "../verification/plan-overlay";

/** The pdf-adapter's forward transform, reproduced verbatim for the inverse proof. */
function toPage(ux: number, uy: number, view: number[]): [number, number] {
  const [x0, y0, , y1] = view;
  const height = y1 - y0;
  return [ux - x0, height - (uy - y0)];
}

describe("plan-overlay", () => {
  it("adapterToUser is the exact inverse of the adapter's toPage (zero-origin view)", () => {
    const view = [0, 0, 841.9, 595.3]; // A1 landscape-ish points
    for (const [ux, uy] of [
      [0, 0],
      [100, 50],
      [841.9, 595.3],
      [607, 387],
    ]) {
      const [px, py] = toPage(ux, uy, view);
      const back = adapterToUser(px, py, view);
      expect(back.ux).toBeCloseTo(ux, 9);
      expect(back.uy).toBeCloseTo(uy, 9);
    }
  });

  it("adapterToUser survives a non-zero view origin (cropped media box)", () => {
    const view = [12, 34, 853.9, 629.3];
    const [px, py] = toPage(200, 300, view);
    const back = adapterToUser(px, py, view);
    expect(back.ux).toBeCloseTo(200, 9);
    expect(back.uy).toBeCloseTo(300, 9);
  });

  it("buildDoorMarkers numbers in reading order: top→bottom, then left→right within a row", () => {
    const markers = buildDoorMarkers([
      { type: "hinged", widthMm: 810, x: 500, y: 400, confidence: "confirmed" },
      { type: "hinged", widthMm: 710, x: 100, y: 100, confidence: "confirmed" },
      { type: "double", widthMm: 1620, x: 90, y: 405, confidence: "confirmed" }, // same row as first (within tolerance)
      { type: "cavity", widthMm: 760, x: 300, y: 100, confidence: "flag", note: "ambiguous arc" },
    ]);
    expect(markers.map((m) => m.label)).toEqual(["D1", "D2", "D3", "D4"]);
    // row 1 (y≈100): x=100 then x=300 · row 2 (y≈400±tol): x=90 then x=500
    expect(markers[0]).toMatchObject({ x: 100, y: 100 });
    expect(markers[1]).toMatchObject({ x: 300, y: 100, confidence: "flag", note: "ambiguous arc" });
    expect(markers[2]).toMatchObject({ x: 90, y: 405, type: "double" });
    expect(markers[3]).toMatchObject({ x: 500, y: 400 });
  });

  it("buildDoorMarkers is empty-safe", () => {
    expect(buildDoorMarkers(null)).toEqual([]);
    expect(buildDoorMarkers(undefined)).toEqual([]);
    expect(buildDoorMarkers([])).toEqual([]);
  });

  it("isWindowCode matches plan window codes and rejects lookalikes", () => {
    for (const ok of ["W1", "W12", "W3a", " W7 ", "w2"]) expect(isWindowCode(ok), ok).toBe(true);
    for (const no of ["WC", "W", "SW1", "W1234", "WALL", "D1", "W1.2"]) {
      expect(isWindowCode(no), no).toBe(false);
    }
  });

  it("summariseMarkers tallies confidence and type", () => {
    const s = summariseMarkers(
      buildDoorMarkers([
        { type: "hinged", widthMm: 810, x: 1, y: 1, confidence: "confirmed" },
        { type: "hinged", widthMm: 760, x: 2, y: 1, confidence: "confirmed" },
        { type: "double", widthMm: 1620, x: 3, y: 1, confidence: "confirmed" },
        { type: "cavity", widthMm: 760, x: 4, y: 1, confidence: "flag" },
      ]),
    );
    expect(s).toEqual({ confirmed: 3, flagged: 1, byType: { hinged: 2, double: 1, cavity: 1 } });
  });

  it("buildVisualOpeningMarkers preserves visual QS order and marker ids", () => {
    const markers = buildVisualOpeningMarkers([
      {
        id: "O7",
        type: "window",
        room: "Bed 2",
        label: "1300x1500",
        height_m: 1.3,
        width_m: 1.5,
        x: 0.25,
        y: 0.4,
        confidence: "high",
        evidence: "printed 1300x1500 on external wall",
        flags: [],
      },
      {
        id: "",
        type: "garage_door",
        room: "Garage",
        label: null,
        height_m: null,
        width_m: null,
        x: 0.75,
        y: 0.8,
        confidence: "medium",
        evidence: "sectional door symbol",
        flags: ["size unreadable"],
      },
    ]);
    expect(markers.map((m) => m.markerLabel)).toEqual(["O7", "O2"]);
    expect(markers[1]).toMatchObject({ type: "garage_door", x: 0.75, y: 0.8 });
  });
});

import { stitchTextItems } from "../verification/plan-overlay";

describe("stitchTextItems", () => {
  const g = (s: string, x: number, y: number, w = 5, fs = 8) => ({
    str: s,
    transform: [fs, 0, 0, fs, x, y],
    width: w,
  });

  it("stitches one-glyph-per-item runs (Qt plans) into whole labels", () => {
    const labels = stitchTextItems([g("W", 100, 50), g("1", 105.5, 50), g("2", 110.8, 50)]);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ text: "W12", ux: 100, uy: 50 });
  });

  it("keeps separate labels separate (big gap, different baselines)", () => {
    const labels = stitchTextItems([
      g("W", 100, 50),
      g("1", 105.5, 50),
      g("W", 300, 50),
      g("2", 305.5, 50), // far along same row
      g("W", 100, 200),
      g("3", 105.5, 200), // different row
    ]);
    expect(labels.map((l) => l.text).sort()).toEqual(["W1", "W2", "W3"]);
  });

  it("passes through already-whole items unchanged", () => {
    const labels = stitchTextItems([g("KITCHEN", 10, 10, 40), g("W7", 400, 10)]);
    expect(labels.map((l) => l.text).sort()).toEqual(["KITCHEN", "W7"]);
  });

  it("ignores empty/whitespace items", () => {
    expect(stitchTextItems([g(" ", 1, 1), g("", 2, 1)])).toEqual([]);
  });
});
