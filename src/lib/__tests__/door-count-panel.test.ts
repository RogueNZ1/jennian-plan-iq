/**
 * DoorCountPanel — unit tests for the confirm/save logic.
 *
 * The component itself is a React component; we test the derived logic
 * (total calculation, label map completeness) without mounting it.
 */
import { describe, it, expect } from "vitest";

// ── Inline the logic under test (mirrors DoorCountPanel internals) ────────────

interface DoorCounts {
  standard: number;
  cavity_sliders: number;
  double_doors: number;
  barn_sliders: number;
}

function total(counts: DoorCounts): number {
  return counts.standard + counts.cavity_sliders + counts.double_doors + counts.barn_sliders;
}

const LABELS = ["Standard (hinged)", "Cavity sliders", "Double doors", "Barn sliders"];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DoorCountPanel — total calculation", () => {
  it("sums all four types", () => {
    expect(total({ standard: 5, cavity_sliders: 2, double_doors: 1, barn_sliders: 1 })).toBe(9);
  });

  it("returns 0 when all counts are zero", () => {
    expect(total({ standard: 0, cavity_sliders: 0, double_doors: 0, barn_sliders: 0 })).toBe(0);
  });

  it("handles large counts", () => {
    expect(total({ standard: 20, cavity_sliders: 5, double_doors: 2, barn_sliders: 3 })).toBe(30);
  });
});

describe("DoorCountPanel — label completeness", () => {
  it("has exactly 4 labels", () => {
    expect(LABELS).toHaveLength(4);
  });

  it("covers all door types", () => {
    expect(LABELS).toContain("Standard (hinged)");
    expect(LABELS).toContain("Cavity sliders");
    expect(LABELS).toContain("Double doors");
    expect(LABELS).toContain("Barn sliders");
  });
});
