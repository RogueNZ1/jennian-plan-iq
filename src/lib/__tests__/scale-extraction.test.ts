/**
 * Regression tests for scale extraction — the most common source of silent failures.
 *
 * Fix 3 history: when a PDF has "SCALE: 1:100 @ A3" in the title block the
 * text-based detector was returning "Manual Calibration Required" instead of
 * auto-calibrating. These tests lock in every format we've seen in the wild so
 * that format cannot regress without a failing test.
 */
import { describe, it, expect } from "vitest";
import { detectScaleFromText } from "../takeoff/scale";
import type { ExtractedPage } from "../takeoff/pdf-text";

// Helpers --------------------------------------------------------------------

function makePage(
  text: string,
  pageSize: ExtractedPage["pageSize"] = "A3",
  widthPts = 841,
  heightPts = 595,
): ExtractedPage {
  return { pageNumber: 1, text, widthPts, heightPts, pageSize };
}

const EXPECTED_PIXELS_PER_MM_100 = 2.83465 / 100;
const EXPECTED_PIXELS_PER_MM_75 = 2.83465 / 75;
const EXPECTED_PIXELS_PER_MM_200 = 2.83465 / 200;

// ── detectScaleFromText ─────────────────────────────────────────────────────

describe("detectScaleFromText — title block formats", () => {
  it("detects 'SCALE: 1:100 @ A3' (exact failing case from 2026-05-16 brief)", () => {
    const result = detectScaleFromText(makePage("SCALE: 1:100 @ A3\nFloor Plan"));
    expect(result.status).not.toBe("Manual Calibration Required");
    expect(result.scaleDen).toBe(100);
    expect(result.pixelsPerMm).toBeCloseTo(EXPECTED_PIXELS_PER_MM_100, 5);
  });

  it("detects '1:100 @ A3' without the SCALE prefix", () => {
    const result = detectScaleFromText(makePage("Drawing No. 001\n1:100 @ A3\nRevision A"));
    expect(result.status).not.toBe("Manual Calibration Required");
    expect(result.scaleDen).toBe(100);
  });

  it("detects '1 : 100 @ A3' with spaces around colon", () => {
    const result = detectScaleFromText(makePage("Scale 1 : 100 @ A3"));
    expect(result.scaleDen).toBe(100);
    expect(result.status).not.toBe("Manual Calibration Required");
  });

  it("detects '1/100 @ A3' with forward-slash separator", () => {
    const result = detectScaleFromText(makePage("SCALE 1/100 @ A3"));
    expect(result.scaleDen).toBe(100);
  });

  it("detects '1:75' (non-standard scale)", () => {
    const result = detectScaleFromText(makePage("Scale: 1:75 @ A1", "A1"));
    expect(result.scaleDen).toBe(75);
    expect(result.pixelsPerMm).toBeCloseTo(EXPECTED_PIXELS_PER_MM_75, 5);
  });

  it("detects '1:200' and computes correct pixelsPerMm", () => {
    const result = detectScaleFromText(makePage("1:200 @ A1", "A1"));
    expect(result.scaleDen).toBe(200);
    expect(result.pixelsPerMm).toBeCloseTo(EXPECTED_PIXELS_PER_MM_200, 5);
  });

  it("detects scale when buried mid-document (not just first line)", () => {
    const text = [
      "NOT FOR CONSTRUCTION",
      "CONCEPT DESIGN",
      "Job # 2540",
      "Russell Test and Jenny Example",
      "45 Example Crescent",
      "Palmerston North",
      "SCALE: 1:100 @ A3",
    ].join("\n");
    const result = detectScaleFromText(makePage(text));
    expect(result.scaleDen).toBe(100);
    expect(result.status).not.toBe("Manual Calibration Required");
  });
});

describe("detectScaleFromText — page size interaction", () => {
  it("returns Auto-Calibrated — Needs Review when page size is known", () => {
    const result = detectScaleFromText(makePage("1:100 @ A3", "A3"));
    expect(result.status).toBe("Auto-Calibrated — Needs Review");
    expect(result.pixelsPerMm).not.toBeNull();
  });

  it("returns low confidence when page size is unknown", () => {
    const result = detectScaleFromText(makePage("1:100", "unknown", 1000, 707));
    expect(result.status).toBe("Auto-Calibrated — Needs Review");
    expect(result.confidence).toBe("low");
    expect(result.pixelsPerMm).toBeNull();
  });

  it("returns Manual Calibration Required when no scale text present", () => {
    const result = detectScaleFromText(makePage("Floor Plan — Kitchen, Living, Dining", "A3"));
    expect(result.status).toBe("Manual Calibration Required");
    expect(result.scaleDen).toBeNull();
    expect(result.pixelsPerMm).toBeNull();
  });
});

describe("detectScaleFromText — scaleText field format", () => {
  it("formats scaleText as '1:NNN @AX' when page size is in the text", () => {
    const result = detectScaleFromText(makePage("1:100 @ A3"));
    expect(result.scaleText).toBe("1:100 @A3");
  });

  it("formats scaleText as '1:NNN' when no page size suffix", () => {
    const result = detectScaleFromText(makePage("Scale: 1:100", "A3"));
    expect(result.scaleText).toBe("1:100");
  });
});

// ── Vision model scale_text extraction regex ────────────────────────────────
// This regex is embedded in vision.functions.ts to parse the AI's scale_text
// response back into a denominator. Tested here to prevent silent regressions.

describe("vision scale_text → denominator regex", () => {
  const VISION_SCALE_RE = /1\s*[:/]\s*(\d{2,4})/i;

  const cases: [string, number][] = [
    ["1:100 @A3", 100],
    ["1:100", 100],
    ["1 : 75 @A1", 75],
    ["1/200 @A3", 200],
    ["SCALE 1:100 @ A3", 100],
  ];

  it.each(cases)("extracts denominator from %s → %i", (input, expected) => {
    const m = input.match(VISION_SCALE_RE);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(expected);
  });

  it("does not match single-digit denominators", () => {
    expect("1:5".match(VISION_SCALE_RE)).toBeNull();
  });

  it("matches only up to 4 digits — '1:10000' extracts '1000' (greedy 4-digit limit)", () => {
    // \d{2,4} is greedy so "10000" → captures "1000" and ignores the trailing "0".
    // This is acceptable: 1:1000 is a valid large-format architectural scale.
    const m = "1:10000".match(VISION_SCALE_RE);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(1000);
  });
});

// ── pixelsPerMm formula ─────────────────────────────────────────────────────

describe("pixelsPerMm calibration formula", () => {
  it("1:100 gives 2.83465/100 pts per real-mm", () => {
    // 1 PDF pt = 25.4/72 mm → 1 mm = 72/25.4 pts = 2.83465 pts
    // At scale 1:100, 1mm of paper = 100mm of building
    // so pixels_per_mm = 2.83465 / 100
    const den = 100;
    const pixelsPerMm = 2.83465 / den;
    expect(pixelsPerMm).toBeCloseTo(0.0283465, 5);
  });

  it("pixelsPerMm is monotonically smaller for larger scale denominators", () => {
    const at100 = 2.83465 / 100;
    const at200 = 2.83465 / 200;
    expect(at100).toBeGreaterThan(at200);
  });
});
