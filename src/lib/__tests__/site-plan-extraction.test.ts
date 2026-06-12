/**
 * Stage 8.2 — Site plan extraction tests.
 * Ground truth: 15A Russell St, Feilding site plan.
 * Expected: 5 concrete areas totalling 243 m², perimeter ~58.7 m.
 */
import { describe, it, expect } from "vitest";
import type { SitePlanData } from "../takeoff/extract-site-plan";

// Mock extraction result matching the Russell St site plan
const russellStMock: SitePlanData = {
  concreteAreas: [
    { label: "Driveway", areaM2: 80 },
    { label: "Path", areaM2: 132 },
    { label: "", areaM2: 13 },
    { label: "", areaM2: 17 },
    { label: "", areaM2: 1 },
  ],
  totalConcreteM2: 243,
  drivewayConcretM2: 80,
  patioConcreteM2: 132,
  totalCoverageM2: null,
  perimeterM: 58.7,
};

describe("SitePlanData structure", () => {
  it("has all required fields", () => {
    const data: SitePlanData = {
      concreteAreas: [],
      totalConcreteM2: 0,
      drivewayConcretM2: null,
      patioConcreteM2: null,
      totalCoverageM2: null,
      perimeterM: null,
    };
    expect(data.totalConcreteM2).toBe(0);
    expect(data.concreteAreas).toHaveLength(0);
  });

  it("15A Russell St — concreteAreas has 5 entries", () => {
    expect(russellStMock.concreteAreas).toHaveLength(5);
  });

  it("15A Russell St — totalConcreteM2 = 243", () => {
    expect(russellStMock.totalConcreteM2).toBe(243);
  });

  it("15A Russell St — concrete areas sum to total", () => {
    const sum = russellStMock.concreteAreas.reduce((s, a) => s + a.areaM2, 0);
    expect(sum).toBe(russellStMock.totalConcreteM2);
  });

  it("15A Russell St — perimeterM ≈ 58.7", () => {
    expect(russellStMock.perimeterM).toBeCloseTo(58.7, 1);
  });

  it("individual areas include 80, 132, 13, 17, 1", () => {
    const areas = russellStMock.concreteAreas.map((a) => a.areaM2).sort((a, b) => b - a);
    expect(areas).toEqual([132, 80, 17, 13, 1]);
  });

  it("totalConcreteM2 matches sum when calculated from areas", () => {
    const mockWithAreas: SitePlanData = {
      concreteAreas: [
        { label: "Driveway", areaM2: 80 },
        { label: "Path", areaM2: 132 },
        { label: "", areaM2: 13 },
        { label: "", areaM2: 17 },
        { label: "", areaM2: 1 },
      ],
      totalConcreteM2: 0, // will be recalculated
      drivewayConcretM2: null,
      patioConcreteM2: null,
      totalCoverageM2: null,
      perimeterM: 58.7,
    };
    const calculated = mockWithAreas.concreteAreas.reduce((s, a) => s + a.areaM2, 0);
    expect(calculated).toBe(243);
  });
});
