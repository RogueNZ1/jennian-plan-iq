import { describe, expect, it } from "vitest";
import {
  recoverFloorPlanLabelAssignments,
  type FloorPlanLabelRecoveryAssignment,
} from "../../src/lib/takeoff/floor-plan-label-recovery";
import type { PlanText } from "../../src/lib/takeoff/plan-text";

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

  it("keeps very narrow door-like labels in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 2150, widthMm: 400, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.room).toBe("ENSUITE");
    expect(assignment.reason).toContain("dimension band is large, narrow, or door-like");
  });

  it("keeps narrow low-height bathroom labels in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 1100, widthMm: 600, x: 100, y: 260 }],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.reason).toContain("dimension band is large, narrow, or door-like");
  });

  it("keeps ambiguous room/order assignments in review", () => {
    const assignment = onlyAssignment(
      recoverFloorPlanLabelAssignments({
        planText: planText({
          windowCodes: [{ heightMm: 1100, widthMm: 1500, x: 180, y: 100 }],
        }),
      }),
    );

    expect(assignment.status).toBe("review");
    expect(assignment.reason).toContain("room/order assignment is ambiguous");
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
});
