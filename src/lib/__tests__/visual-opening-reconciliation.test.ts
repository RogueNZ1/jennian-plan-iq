import { describe, expect, it } from "vitest";
import type { Opening } from "../takeoff/takeoff-types";
import type { VisualOpeningAudit } from "../takeoff/visual-opening-audit";
import {
  reconcileVisualOpenings,
  visualReconciliationFlags,
} from "../takeoff/visual-opening-reconciliation";

function audit(openings: VisualOpeningAudit["openings"]): VisualOpeningAudit {
  return {
    pageNumber: 1,
    method: "visual_qs",
    openings,
    warnings: [],
    summary: {
      totalOpenings: openings.length,
      qsGlazedOpenings: openings.filter((o) => o.type !== "garage_door").length,
      garageDoors: openings.filter((o) => o.type === "garage_door").length,
      uncertain: 0,
    },
  };
}

function vo(
  id: string,
  type: VisualOpeningAudit["openings"][number]["type"],
  height_m: number | null,
  width_m: number | null,
): VisualOpeningAudit["openings"][number] {
  return {
    id,
    type,
    room: null,
    label: null,
    height_m,
    width_m,
    x: 0.5,
    y: 0.5,
    confidence: "high",
    evidence: "",
    flags: [],
  };
}

function opening(type: Opening["type"], glazed = true): Opening {
  return {
    type,
    room: null,
    height_m: 1,
    width_m: 1,
    glazed,
    cladding: null,
    area_m2: 1,
    source: "vision",
    confidence: "medium",
  };
}

describe("visual-opening-reconciliation", () => {
  it("passes when visual and composed paths agree", () => {
    const report = reconcileVisualOpenings({
      audit: audit([vo("O1", "window", 1, 1), vo("O2", "garage_door", 2.1, 2.7)]),
      openings: [opening("window"), opening("sectional_door", false)],
      garageDoorSize: "2.7×2.1",
    });

    expect(report?.status).toBe("pass");
    expect(report?.issues).toEqual([]);
  });

  it("flags visual QS opening-count and garage-door disagreements", () => {
    const report = reconcileVisualOpenings({
      audit: audit([
        vo("O1", "window", 1, 1),
        vo("O2", "external_door", null, null),
        vo("O3", "pa_door", null, null),
        vo("O4", "garage_door", 2.52, 2.8),
      ]),
      openings: [opening("window"), opening("sectional_door", false)],
      garageDoorSize: "2.7×2.1",
    });

    expect(report?.status).toBe("review");
    expect(report?.issues.map((i) => i.field)).toEqual(["windows_by_room", "garage_door_size"]);
    expect(report?.issues.find((i) => i.field === "garage_door_size")).toMatchObject({
      severity: "warning",
    });
    expect(visualReconciliationFlags(report, "garage_door_size").join(" ")).toContain(
      "outside the garage-door plausibility band",
    );
    expect(visualReconciliationFlags(report, "windows_by_room").join(" ")).toContain(
      "Visual QS found 3 QS-glazed",
    );
  });
});
