import { describe, expect, it } from "vitest";
import {
  normaliseVisualOpeningAudit,
  summariseVisualOpeningAudit,
} from "../takeoff/visual-opening-audit";

describe("visual-opening-audit", () => {
  it("normalises model output and clamps image coordinates", () => {
    const audit = normaliseVisualOpeningAudit(
      {
        pageNumber: 5,
        openings: [
          {
            id: "front",
            type: "slider",
            room: "Living",
            label: "2110x2200",
            height_m: 2.11,
            width_m: 2.2,
            x: 1.4,
            y: -0.2,
            confidence: "high",
            evidence: "printed label on north external wall",
            flags: ["check elevation"],
          },
          {
            type: "not_a_type",
            x: "bad",
            y: null,
            confidence: "maybe",
          },
        ],
        warnings: ["image-only plan"],
      },
      null,
    );

    expect(audit.pageNumber).toBe(5);
    expect(audit.openings[0]).toMatchObject({ id: "front", type: "slider", x: 1, y: 0 });
    expect(audit.openings[1]).toMatchObject({
      id: "O2",
      type: "uncertain",
      x: 0.5,
      y: 0.5,
      confidence: "low",
    });
    expect(audit.warnings).toEqual(["image-only plan"]);
  });

  it("counts QS glazed openings with the garage-door exception", () => {
    const summary = summariseVisualOpeningAudit([
      {
        id: "O1",
        type: "window",
        room: "Bed 1",
        label: null,
        height_m: null,
        width_m: null,
        x: 0.1,
        y: 0.2,
        confidence: "high",
        evidence: "",
        flags: [],
      },
      {
        id: "O2",
        type: "garage_door",
        room: "Garage",
        label: null,
        height_m: null,
        width_m: null,
        x: 0.3,
        y: 0.4,
        confidence: "high",
        evidence: "",
        flags: [],
      },
      {
        id: "O3",
        type: "uncertain",
        room: null,
        label: null,
        height_m: null,
        width_m: null,
        x: 0.5,
        y: 0.6,
        confidence: "low",
        evidence: "",
        flags: [],
      },
    ]);

    expect(summary).toEqual({
      totalOpenings: 3,
      qsGlazedOpenings: 2,
      garageDoors: 1,
      uncertain: 1,
    });
  });

  it("downgrades marker coordinates that are not confirmed on the physical opening", () => {
    const audit = normaliseVisualOpeningAudit({
      openings: [
        {
          id: "O1",
          type: "window",
          room: "Bed 1",
          label: "1800x600",
          height_m: 1.8,
          width_m: 0.6,
          x: 0.2,
          y: 0.3,
          confidence: "high",
          evidence: "printed 1800x600; marker position approximate near label",
          flags: [],
        },
        {
          id: "O2",
          type: "slider",
          room: "Dining",
          label: "2110x2000",
          height_m: 2.11,
          width_m: 2,
          x: 0.4,
          y: 0.5,
          confidence: "high",
          evidence: "printed 2110x2000; marker placed on south-wall slider line",
          flags: [],
        },
      ],
    });

    expect(audit.openings[0]).toMatchObject({
      confidence: "low",
      flags: ["marker not confirmed on physical opening"],
    });
    expect(audit.openings[1]).toMatchObject({ confidence: "high", flags: [] });
    expect(audit.summary.uncertain).toBe(1);
  });

  it("does not price dimensions from a malformed or concatenated label", () => {
    const audit = normaliseVisualOpeningAudit({
      openings: [
        {
          id: "O1",
          type: "window",
          room: "Family",
          label: "1300x175036001300x1750",
          height_m: 1.3,
          width_m: 1.752,
          x: 0.2,
          y: 0.3,
          confidence: "high",
          evidence: "printed label beside Family wall",
          flags: [],
        },
      ],
    });

    expect(audit.openings[0]).toMatchObject({
      confidence: "low",
      height_m: null,
      width_m: null,
      flags: ["malformed dimension label - verify against elevations/schedule"],
    });
    expect(audit.summary.uncertain).toBe(1);
  });

  it("keeps independently confirmed dimensions but still flags a malformed label", () => {
    const audit = normaliseVisualOpeningAudit({
      openings: [
        {
          id: "O1",
          type: "slider",
          room: "Family",
          label: "1300x175036001300x1750",
          height_m: 2.1,
          width_m: 3.6,
          x: 0.2,
          y: 0.3,
          confidence: "high",
          evidence: "malformed floor-plan label; dimensions confirmed from elevation",
          flags: [],
        },
      ],
    });

    expect(audit.openings[0]).toMatchObject({
      confidence: "low",
      height_m: 2.1,
      width_m: 3.6,
      flags: ["malformed dimension label - verify against elevations/schedule"],
    });
  });
});
