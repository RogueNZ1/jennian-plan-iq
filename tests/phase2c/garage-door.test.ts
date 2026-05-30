// @vitest-environment node
/**
 * Phase 2c — Garage-door classification (F-003).
 *
 * Pure unit tests against classifyGarageDoorAnnotation in src/lib/takeoff/classify.ts.
 *
 * Domain fact (Haydon + QS): garage doors are normal door height (~2.1m, rarely
 * taller) and distinguished by WIDTH. The QS recognises three sizes, all 2.1m high:
 * 2.4×2.1 (single), 2.7×2.1 (single), 4.8×2.1 (double). So classification is by the
 * combination — tolerant height band ~2.0–2.4m AND garage width ~2.4–5.4m — and the
 * width is recovered regardless of annotation format (commas, spaces, or no `x`).
 *
 * Root cause this fixes: the window parser (/^(\d+)[xX×](\d+)$/) rejected the Beddis
 * "2,210 x 4,800" (commas + spaces) and the no-`x` "4800" form, so the garage door
 * fell through unclassified.
 */
import { describe, it, expect } from "vitest";
import { classifyGarageDoorAnnotation, classifyGarageDoor } from "../../src/lib/takeoff/classify";

describe("classifyGarageDoorAnnotation — Beddis-style double garage", () => {
  it("classifies '2,210 x 4,800' (commas + spaces) as 4.8×2.1", () => {
    const r = classifyGarageDoorAnnotation("2,210 x 4,800");
    expect(r).not.toBeNull();
    expect(r!.label).toBe("4.8×2.1");
    expect(r!.cell).toBe("H176");
    expect(r!.widthMm).toBe(4800);
    expect(r!.heightMm).toBe(2100);
  });

  it("is format-independent — width is the larger number either way", () => {
    expect(classifyGarageDoorAnnotation("4800x2210")!.label).toBe("4.8×2.1"); // WIDTH×HEIGHT, no spaces
    expect(classifyGarageDoorAnnotation("2210x4800")!.label).toBe("4.8×2.1"); // HEIGHT×WIDTH
    expect(classifyGarageDoorAnnotation("2210 × 4800")!.label).toBe("4.8×2.1"); // unicode ×
  });
});

describe("classifyGarageDoorAnnotation — no-`x` format (width recovered)", () => {
  it("treats a lone width callout as the garage width, height defaults to 2.1m", () => {
    expect(classifyGarageDoorAnnotation("4800")!.label).toBe("4.8×2.1");
    expect(classifyGarageDoorAnnotation("2400")!.label).toBe("2.4×2.1");
    expect(classifyGarageDoorAnnotation("2,700")!.label).toBe("2.7×2.1");
  });

  it("snaps a lone near-standard width to the nearest QS size", () => {
    expect(classifyGarageDoorAnnotation("2681")!.label).toBe("2.7×2.1"); // → nearest 2700
    expect(classifyGarageDoorAnnotation("2450")!.label).toBe("2.4×2.1"); // → nearest 2400
    expect(classifyGarageDoorAnnotation("4900")!.label).toBe("4.8×2.1"); // → nearest 4800
  });
});

describe("classifyGarageDoorAnnotation — metre units", () => {
  it("converts metre annotations to mm", () => {
    expect(classifyGarageDoorAnnotation("4.8 x 2.1")!.label).toBe("4.8×2.1");
    expect(classifyGarageDoorAnnotation("2.4")!.label).toBe("2.4×2.1");
  });
});

describe("classifyGarageDoorAnnotation — three QS categories", () => {
  it("maps each standard width to its category and cell", () => {
    const single24 = classifyGarageDoorAnnotation("2400")!;
    const single27 = classifyGarageDoorAnnotation("2700")!;
    const double48 = classifyGarageDoorAnnotation("4800")!;
    expect([single24.label, single24.cell]).toEqual(["2.4×2.1", "H178"]);
    expect([single27.label, single27.cell]).toEqual(["2.7×2.1", "H180"]);
    expect([double48.label, double48.cell]).toEqual(["4.8×2.1", "H176"]);
  });
});

describe("classifyGarageDoorAnnotation — no false positives (combination gate)", () => {
  it("rejects a too-narrow opening (below the garage width band)", () => {
    // e.g. an interior or entry door width near the garage label.
    expect(classifyGarageDoorAnnotation("2000")).toBeNull();
    expect(classifyGarageDoorAnnotation("900")).toBeNull();
  });

  it("rejects a too-wide value (above the garage band — keeps McAlevey '6044' raw)", () => {
    // Phase 1 golden: McAlevey reads "6044"; out of band → not classified, stays raw.
    expect(classifyGarageDoorAnnotation("6044")).toBeNull();
  });

  it("rejects when the height is out of the tolerant band (a room box, not a door)", () => {
    // "4800 x 6000" — both large → height 4800 (min) is well above 2.4m → not a door.
    expect(classifyGarageDoorAnnotation("4800 x 6000")).toBeNull();
    // A tall opening: width 4800 but height 3000 → out of the ~2.0–2.4m band.
    expect(classifyGarageDoorAnnotation("3000 x 4800")).toBeNull();
  });

  it("accepts the tolerant height band edges (2100 and 2210 both pass)", () => {
    expect(classifyGarageDoorAnnotation("2100 x 4800")!.label).toBe("4.8×2.1");
    expect(classifyGarageDoorAnnotation("2210 x 4800")!.label).toBe("4.8×2.1");
  });

  it("returns null on empty / non-numeric text", () => {
    expect(classifyGarageDoorAnnotation("")).toBeNull();
    expect(classifyGarageDoorAnnotation("GARAGE")).toBeNull();
  });
});

describe("classifyGarageDoor (width→cell) stays consistent with the snapped widths", () => {
  it("maps the three canonical widths to their cells", () => {
    expect(classifyGarageDoor(4800)).toBe("H176");
    expect(classifyGarageDoor(2700)).toBe("H180");
    expect(classifyGarageDoor(2400)).toBe("H178");
  });
});
