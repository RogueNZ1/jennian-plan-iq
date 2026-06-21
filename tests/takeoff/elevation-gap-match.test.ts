import { describe, expect, it } from "vitest";
import { matchElevationToFloorPlanGaps } from "../../src/lib/takeoff/elevation-gap-match";
import type { ElevationData } from "../../src/lib/takeoff/extract-elevations";
import type { FloorPlanGapCandidate } from "../../src/lib/takeoff/floor-plan-gaps";

const baseGap: FloorPlanGapCandidate = {
  id: "floorplan-gap-1",
  widthMm: 1800,
  x: 100,
  y: 100,
  orientation: "horizontal",
  wallFaceId: "H-17",
  wallThicknessMm: 190,
  confidence: "medium",
  roomLabel: "LOUNGE",
  roomSide: "south",
  alternateRoomLabels: [],
  routing: {
    confidence: "medium",
    ambiguous: false,
    reason: "gap routed to LOUNGE on the south side of the wall",
  },
  note: "measured floor-plan wall gap near LOUNGE; height still needs text/elevation/schedule confirmation",
};

function elevations(openings: ElevationData["elevationOpenings"]): ElevationData {
  return {
    claddingTypes: [],
    claddingTypeCode: null,
    roofType: null,
    roofPitchDegrees: null,
    wallHeightMm: null,
    studHeightMm: null,
    facesPresent: ["North"],
    windowCountPerFace: {},
    externalDoorCount: 0,
    gableEndCount: 0,
    garageDoorsPresent: false,
    elevationOpenings: openings,
  };
}

describe("elevation to floor-plan gap matching", () => {
  it("recovers height evidence when one elevation opening uniquely supports one gap", () => {
    const matches = matchElevationToFloorPlanGaps({
      gaps: [baseGap],
      elevations: elevations([
        {
          face: "North",
          type: "window",
          label: "W01",
          widthMm: 1810,
          heightMm: 1300,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
      ]),
    });

    expect(matches.get("floorplan-gap-1")).toMatchObject({
      source: "elevation_measurement",
      face: "North",
      label: "W01",
      widthMm: 1810,
      heightMm: 1300,
      widthDeltaMm: 10,
      confidence: "high",
      expectedFace: "north",
      faceCheck: "matched",
    });
  });

  it("does not let a known wrong elevation face support a floor-plan gap", () => {
    const matches = matchElevationToFloorPlanGaps({
      gaps: [baseGap],
      elevations: elevations([
        {
          face: "South",
          type: "window",
          label: "W01",
          widthMm: 1810,
          heightMm: 1300,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
      ]),
    });

    expect(matches.size).toBe(0);
  });

  it("fails open when elevation face labels are generated rather than cardinal", () => {
    const matches = matchElevationToFloorPlanGaps({
      gaps: [baseGap],
      elevations: elevations([
        {
          face: "elevation-face-1",
          type: "window",
          label: "W01",
          widthMm: 1810,
          heightMm: 1300,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
      ]),
    });

    expect(matches.get("floorplan-gap-1")).toMatchObject({
      face: "elevation-face-1",
      expectedFace: "north",
      faceCheck: "unknown",
      heightMm: 1300,
    });
  });

  it("does not recover height when repeated elevation openings make identity ambiguous", () => {
    const matches = matchElevationToFloorPlanGaps({
      gaps: [baseGap],
      elevations: elevations([
        {
          face: "North",
          type: "window",
          label: "W01",
          widthMm: 1800,
          heightMm: 1300,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
        {
          face: "North",
          type: "window",
          label: "W02",
          widthMm: 1800,
          heightMm: 1100,
          quantity: 1,
          cladding: null,
          confidence: "high",
          notes: [],
        },
      ]),
    });

    expect(matches.size).toBe(0);
  });
});
