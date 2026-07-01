import { describe, expect, it } from "vitest";
import {
  recoverFloorPlanLabelAssignments,
  type FloorPlanLabelRecoveryAssignment,
} from "../../src/lib/takeoff/floor-plan-label-recovery";
import type { TextLabel } from "../../src/lib/doors/door-engine";
import { parseWindowCodes, type PlanText } from "../../src/lib/takeoff/plan-text";

function planText(overrides: Partial<PlanText> = {}): PlanText {
  return {
    rooms: [
      { name: "FAMILY", widthMm: 4000, depthMm: 5000, areaM2: 20, x: 100, y: 100 },
      { name: "DINING", widthMm: 3000, depthMm: 3000, areaM2: 9, x: 260, y: 100 },
      { name: "ENSUITE", widthMm: 1800, depthMm: 2400, areaM2: 4.32, x: 100, y: 260 },
    ],
    windowCodes: [{ heightMm: 1300, widthMm: 1500, x: 112, y: 102 }],
    titleAreas: {},
    ...overrides,
  };
}

function onlyAssignment(assignments: FloorPlanLabelRecoveryAssignment[]) {
  expect(assignments).toHaveLength(1);
  return assignments[0]!;
}

function label(text: string, x: number, y: number): TextLabel {
  return { text, x, y, vertical: false };
}

describe("floor-plan W x H label recovery", () => {
  it("recovers a clean floor-plan opening label when room proximity is unique", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({ planText: planText(), page: 1 }),
    );

    expect(assignment).toMatchObject({
      id: "floorplan-label-1",
      status: "extracted",
      room: "FAMILY",
      text: "1300 x 1500",
      page: 1,
      widthMm: 1500,
      heightMm: 1300,
      areaM2: 1.95,
      confidence: "medium",
      bbox: [94, 95, 130, 109],
    });
    expect(assignment.reviewFlags).toEqual([]);
  });

  it("recovers full-height narrow exterior opening labels when assignment is unique", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 2150, widthMm: 600, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment).toMatchObject({
      status: "extracted",
      room: "ENSUITE",
      text: "2150 x 600",
      widthMm: 600,
      heightMm: 2150,
      areaM2: 1.29,
    });
  });

  // Haydon doctrine (2 Jul 2026): m2 of glass is the priced quantity. Plausible
  // printed window labels are green; room assignment and narrow bands do not gate.
  it("recovers full-height narrow sidelight labels as green glass evidence", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 2150, widthMm: 400, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment.status).toBe("extracted");
    expect(assignment.room).toBe("ENSUITE");
    expect(assignment.areaM2).toBe(0.86);
  });

  it("recovers narrow low-height bathroom labels as green glass evidence", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 1100, widthMm: 600, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment.status).toBe("extracted");
    expect(assignment.areaM2).toBe(0.66);
  });

  it("ambiguous room/order assignment stays green - room is a best guess, not a gate", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 1100, widthMm: 1500, x: 180, y: 100 }],
        }),
      }),
    );

    expect(assignment.status).toBe("extracted");
    expect(assignment.reason).toContain("best guess - room assignment does not gate glass area");
  });

  it("keeps door-leaf-like labels in review - they are probably not glass", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 1980, widthMm: 810, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.reason).toContain("door-leaf-like");
  });

  it("keeps implausible window dimensions in review", () => {
    const tall = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 2600, widthMm: 1200, x: 100, y: 260 }],
        }),
      }),
    );
    expect(tall.status).toBe("review");
    expect(tall.reason).toContain("outside the plausible window range");

    const sliver = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 300, widthMm: 900, x: 100, y: 260 }],
        }),
      }),
    );
    expect(sliver.status).toBe("review");
    expect(sliver.reason).toContain("outside the plausible window range");
  });

  it("keeps labels near malformed assembly text in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          draftingIssues: [
            {
              kind: "malformed_dimension_label",
              text: "1300x175036001300x1750",
              x: 125,
              y: 115,
            },
          ],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.reason).toContain("near malformed/contaminated drafting label");
  });

  it("does not recover skylight labels as exterior opening assignments", () => {
    const windowCodes = parseWindowCodes(
      [label("780 x 1400", 100, 100), label("Skylight", 106, 112)],
      [],
    );

    expect(windowCodes).toEqual([]);
    expect(recoverFloorPlanLabelAssignments({ planText: planText({ windowCodes }) })).toEqual([]);
  });
});
