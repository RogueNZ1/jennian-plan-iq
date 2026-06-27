import { describe, expect, it } from "vitest";
import {
  formatVisualOpeningCorrectionHints,
  visualOpeningCorrectionHintFromRow,
} from "@/lib/takeoff/visual-opening-correction-hints";

describe("visual opening correction hints", () => {
  it("turns saved overlay corrections into prompt-safe hints", () => {
    const hint = visualOpeningCorrectionHintFromRow({
      marker_label: "O4",
      opening_id: "O4",
      correction_type: "component_of_opening",
      corrected_type: null,
      reason: "Gable glass belongs to the slider assembly below.",
      marker_snapshot: {
        type: "window",
        room: "Lounge",
        label: "3600x2100",
        width_m: 3.6,
        height_m: 2.1,
        x: 0.38,
        y: 0.42,
        evidence: "vision split gable glass from slider",
        flags: ["review"],
      },
    });

    expect(hint).toMatchObject({
      markerLabel: "O4",
      correctionType: "component_of_opening",
      marker: {
        type: "window",
        room: "Lounge",
        width_m: 3.6,
        height_m: 2.1,
      },
    });

    const prompt = formatVisualOpeningCorrectionHints([hint!]);
    expect(prompt).toContain("HUMAN CORRECTION MEMORY FOR THIS JOB");
    expect(prompt).toContain("component_of_opening");
    expect(prompt).toContain("do not return it as a separate opening");
    expect(prompt).toContain("Gable glass belongs to the slider assembly below.");
  });

  it("does not emit prompt text when no corrections exist", () => {
    expect(formatVisualOpeningCorrectionHints([])).toBe("");
  });
});
