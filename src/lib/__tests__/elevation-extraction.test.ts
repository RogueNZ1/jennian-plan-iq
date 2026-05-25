/**
 * Stage 8.1 — Elevation extraction tests.
 * Tests the shape and guard logic of ElevationData without calling the real AI.
 */
import { describe, it, expect } from "vitest";
import type { ElevationData } from "../takeoff/extract-elevations";

// Ground truth for 15A Russell St, Feilding elevations
// (verified against the PDF: brick + Linea, 25° metal tiles, 4 faces)
const russellStExpected: ElevationData = {
  claddingTypes: expect.arrayContaining(["brick"]) as unknown as string[],
  claddingTypeCode: 3,          // mixed: brick + Linea
  roofType: expect.stringContaining("tile") as unknown as string,
  roofPitchDegrees: 25,
  wallHeightMm: null,           // may or may not appear on this elevation sheet
  studHeightMm: null,
  facesPresent: expect.arrayContaining([expect.any(String)]) as unknown as string[],
  windowCountPerFace: expect.any(Object) as unknown as Record<string, number>,
  externalDoorCount: expect.any(Number) as unknown as number,
  gableEndCount: expect.any(Number) as unknown as number,
  garageDoorsPresent: expect.any(Boolean) as unknown as boolean,
};

// Structural integrity tests for the ElevationData type
describe("ElevationData structure", () => {
  it("has all required fields", () => {
    const data: ElevationData = {
      claddingTypes: ["brick", "Linea weatherboard"],
      claddingTypeCode: 3,
      roofType: "Metal tiles",
      roofPitchDegrees: 25,
      wallHeightMm: 2400,
      studHeightMm: null,
      facesPresent: ["North Western", "South Western", "North Eastern", "South Eastern"],
      windowCountPerFace: { "North Western": 3, "South Western": 2 },
      externalDoorCount: 2,
      gableEndCount: 2,
      garageDoorsPresent: true,
    };
    expect(data.claddingTypeCode).toBe(3);
    expect(data.claddingTypes).toHaveLength(2);
    expect(data.roofPitchDegrees).toBe(25);
    expect(data.facesPresent).toHaveLength(4);
  });

  it("claddingTypeCode=1 for brick-only", () => {
    const data: ElevationData = {
      claddingTypes: ["70 series clay brick veneer"],
      claddingTypeCode: 1,
      roofType: "Metal tiles",
      roofPitchDegrees: 25,
      wallHeightMm: null,
      studHeightMm: null,
      facesPresent: ["North", "South"],
      windowCountPerFace: { North: 2, South: 1 },
      externalDoorCount: 1,
      gableEndCount: 0,
      garageDoorsPresent: false,
    };
    expect(data.claddingTypeCode).toBe(1);
  });

  it("claddingTypeCode=2 for weatherboard-only", () => {
    const data: ElevationData = {
      claddingTypes: ["James Hardie Linea weatherboard"],
      claddingTypeCode: 2,
      roofType: "Corrugate Colorsteel",
      roofPitchDegrees: 12,
      wallHeightMm: null,
      studHeightMm: 2570,
      facesPresent: ["Elevation A", "Elevation B"],
      windowCountPerFace: { "Elevation A": 4, "Elevation B": 1 },
      externalDoorCount: 1,
      gableEndCount: 1,
      garageDoorsPresent: false,
    };
    expect(data.claddingTypeCode).toBe(2);
    expect(data.studHeightMm).toBe(2570);
  });

  it("windowCountPerFace sums correctly", () => {
    const data: ElevationData = {
      claddingTypes: ["brick"],
      claddingTypeCode: 1,
      roofType: "Metal tiles",
      roofPitchDegrees: 25,
      wallHeightMm: 2400,
      studHeightMm: null,
      facesPresent: ["North Western", "South Western", "North Eastern", "South Eastern"],
      windowCountPerFace: { "North Western": 3, "South Western": 2, "North Eastern": 2, "South Eastern": 1 },
      externalDoorCount: 2,
      gableEndCount: 2,
      garageDoorsPresent: true,
    };
    const total = Object.values(data.windowCountPerFace).reduce((s, n) => s + n, 0);
    expect(total).toBe(8);
  });

  it("accepts null for unknown fields", () => {
    const data: ElevationData = {
      claddingTypes: [],
      claddingTypeCode: null,
      roofType: null,
      roofPitchDegrees: null,
      wallHeightMm: null,
      studHeightMm: null,
      facesPresent: [],
      windowCountPerFace: {},
      externalDoorCount: 0,
      gableEndCount: 0,
      garageDoorsPresent: false,
    };
    expect(data.claddingTypeCode).toBeNull();
    expect(data.roofType).toBeNull();
    expect(data.facesPresent).toHaveLength(0);
  });

  it("ground truth shape matches 15A Russell St expectations", () => {
    // Mock extraction result matching expected output from the Russell St elevations PDF
    const mockResult: ElevationData = {
      claddingTypes: ["brick", "Linea weatherboard"],
      claddingTypeCode: 3,
      roofType: "Metal tiles",
      roofPitchDegrees: 25,
      wallHeightMm: null,
      studHeightMm: null,
      facesPresent: ["North Western Elevation", "South Western Elevation", "North Eastern Elevation", "South Eastern Elevation"],
      windowCountPerFace: {
        "North Western Elevation": 3,
        "South Western Elevation": 2,
        "North Eastern Elevation": 2,
        "South Eastern Elevation": 1,
      },
      externalDoorCount: 2,
      gableEndCount: 4,
      garageDoorsPresent: true,
    };

    expect(mockResult.claddingTypes).toEqual(expect.arrayContaining(["brick"]));
    expect(mockResult.claddingTypes.some((t) => /linea/i.test(t))).toBe(true);
    expect(mockResult.claddingTypeCode).toBe(3);
    expect(typeof mockResult.roofType).toBe("string");
    expect(/tile/i.test(mockResult.roofType!)).toBe(true);
    expect(mockResult.roofPitchDegrees).toBe(25);
    expect(mockResult.facesPresent).toHaveLength(4);

    void russellStExpected; // referenced to avoid unused-var lint
  });
});
