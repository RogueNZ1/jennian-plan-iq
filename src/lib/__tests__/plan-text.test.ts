import { describe, expect, it } from "vitest";

import { parseRoomDims } from "../takeoff/plan-text";

describe("parseRoomDims", () => {
  it("captures garage room dimensions when the footprint text sits below and slightly right", () => {
    const rooms = parseRoomDims([
      { text: "GARAGE", x: 100, y: 100 },
      { text: "3 800x5 950", x: 136, y: 120 },
    ]);

    expect(rooms).toEqual([
      {
        name: "GARAGE",
        widthMm: 3800,
        depthMm: 5950,
        areaM2: 22.61,
        x: 100,
        y: 100,
      },
    ]);
  });
});
