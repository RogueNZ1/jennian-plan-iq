import { describe, expect, it } from "vitest";
import {
  correctionPatternsFromHints,
  formatVisualOpeningCorrectionHints,
  formatVisualOpeningCorrectionMemory,
  visualOpeningCorrectionHintFromRow,
} from "@/lib/takeoff/visual-opening-correction-hints";

describe("visual opening correction hints", () => {
  it("turns saved overlay corrections into prompt-safe hints", () => {
    const hint = visualOpeningCorrectionHintFromRow({
      job_id: "job-1",
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
      jobId: "job-1",
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
    expect(prompt).toContain("JOB-SPECIFIC HUMAN CORRECTION MEMORY");
    expect(prompt).toContain("component_of_opening");
    expect(prompt).toContain("do not return it as a separate opening");
    expect(prompt).toContain("Gable glass belongs to the slider assembly below.");
  });

  it("promotes repeated cross-job corrections into caution patterns", () => {
    const hints = ["job-1", "job-2"].map((jobId, index) => ({
      jobId,
      markerLabel: `O${index + 1}`,
      openingId: `O${index + 1}`,
      correctionType: "not_opening" as const,
      correctedType: null,
      reason: "Different cladding panel, not a front door.",
      marker: {
        type: "external_door",
        room: null,
        label: null,
        width_m: null,
        height_m: null,
        x: null,
        y: null,
        evidence: null,
        flags: [],
      },
    }));

    const patterns = correctionPatternsFromHints(hints);
    expect(patterns).toMatchObject([
      {
        correctionType: "not_opening",
        originalType: "external_door",
        count: 2,
      },
    ]);

    const prompt = formatVisualOpeningCorrectionMemory({
      jobHints: [],
      globalExamples: hints,
      globalPatterns: patterns,
    });
    expect(prompt).toContain("GLOBAL HUMAN-CORRECTION PATTERNS");
    expect(prompt).toContain("2 prior corrections: not_opening originally marked external_door");
    expect(prompt).not.toContain("GLOBAL HUMAN-CORRECTION EXAMPLES");
    expect(prompt).not.toContain("Different cladding panel, not a front door.");
  });

  it("does not emit prompt text when no corrections exist", () => {
    expect(formatVisualOpeningCorrectionHints([])).toBe("");
  });
});
