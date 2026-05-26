/**
 * Internal wall confidence scoring tests.
 *
 * The confidence function mirrors pipeline/result.py:score_internal_wall_confidence.
 * Service rooms (WC, WIR, Hall, Wardrobe, Ensuite, Bath…) are NOT expected
 * to have printed dimension boxes — their absence is normal and must not
 * trigger a low-confidence warning.
 */
import { describe, it, expect } from "vitest";
import {
  scoreInternalWallConfidence,
  shouldWarnInternalWall,
  type RoomEntry,
} from "../takeoff/internal-wall-confidence";

function room(label: string, width_m = 4.0, depth_m = 3.5): RoomEntry {
  return { label, width_m, depth_m };
}

// ── scoreInternalWallConfidence ──────────────────────────────────────────────

describe("scoreInternalWallConfidence — high confidence", () => {
  it("4 main rooms on 135m² house → high (expected=4, found=4)", () => {
    const rooms = [
      room("MASTER BED"),
      room("LOUNGE"),
      room("KITCHEN"),
      room("DINING"),
    ];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 135);
    expect(confidence).toBe("high");
    expect(mainRoomCount).toBe(4);
  });

  it("5 main rooms on 200m² house → high (expected=5, found=5)", () => {
    const rooms = [
      room("MASTER BED"),
      room("BED 2"),
      room("BED 3"),
      room("LOUNGE"),
      room("KITCHEN"),
      room("GARAGE"),
    ];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 200);
    expect(confidence).toBe("high");
    expect(mainRoomCount).toBe(6);
  });

  it("3 main rooms on 110m² house → high (expected=3, found=3)", () => {
    const rooms = [room("MASTER BED"), room("LOUNGE"), room("KITCHEN")];
    const { confidence } = scoreInternalWallConfidence(rooms, 110);
    expect(confidence).toBe("high");
  });

  it("garage counts as a main room", () => {
    const rooms = [room("GARAGE"), room("LOUNGE"), room("BED 1"), room("KITCHEN")];
    const { confidence } = scoreInternalWallConfidence(rooms, 135);
    expect(confidence).toBe("high");
  });
});

describe("scoreInternalWallConfidence — medium confidence", () => {
  it("2 main rooms on 135m² house → medium (expected=4, found=2)", () => {
    const rooms = [room("MASTER BED"), room("LOUNGE")];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 135);
    expect(confidence).toBe("medium");
    expect(mainRoomCount).toBe(2);
  });

  it("3 main rooms on 150m² house → medium (expected=4, found=3)", () => {
    const rooms = [room("MASTER BED"), room("LOUNGE"), room("KITCHEN")];
    const { confidence } = scoreInternalWallConfidence(rooms, 150);
    expect(confidence).toBe("medium");
  });

  it("medium on null area with 2 main rooms", () => {
    const rooms = [room("LOUNGE"), room("KITCHEN")];
    const { confidence } = scoreInternalWallConfidence(rooms, null);
    // null area → area=0 → expected=3; found=2 → medium
    expect(confidence).toBe("medium");
  });

  it("only 1 main room → medium (1 main room is partial, not a failure)", () => {
    // 1 main room found; "low" is reserved for 0 main rooms only.
    // Reflects GJG plans where OCR reads only one dim box legibly.
    const rooms = [room("MASTER BED"), room("WC")];
    const { confidence } = scoreInternalWallConfidence(rooms, 135);
    expect(confidence).toBe("medium");
  });
});

describe("scoreInternalWallConfidence — low confidence", () => {
  it("WC and WIR only → low (service rooms not counted)", () => {
    const rooms = [room("WC"), room("WIR")];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 135);
    expect(confidence).toBe("low");
    expect(mainRoomCount).toBe(0);
  });

  it("only ensuite found → low (borderline service room, not counted)", () => {
    const rooms = [room("ENSUITE")];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 135);
    expect(confidence).toBe("low");
    expect(mainRoomCount).toBe(0);
  });

  it("hall, laundry, store → all service rooms → low", () => {
    const rooms = [room("HALL"), room("LAUNDRY"), room("STORE")];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 135);
    expect(confidence).toBe("low");
    expect(mainRoomCount).toBe(0);
  });
});

describe("scoreInternalWallConfidence — unlabelled rooms", () => {
  it("unlabelled rooms count as main rooms", () => {
    // OCR misses the label but reads the dimension box — unlabelled large room
    // is almost certainly a habitable main room
    const rooms = [
      room(""),        // unlabelled → main
      room(""),        // unlabelled → main
      room(""),        // unlabelled → main
      room(""),        // unlabelled → main
    ];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 135);
    expect(mainRoomCount).toBe(4);
    expect(confidence).toBe("high");
  });

  it("mix of labelled main + unlabelled → all count", () => {
    const rooms = [
      room("LOUNGE"),   // main
      room(""),         // unlabelled → main
      room("WC"),       // service → not counted
    ];
    const { confidence, mainRoomCount } = scoreInternalWallConfidence(rooms, 110);
    // 110m² → expected=3; found=2 → medium
    expect(mainRoomCount).toBe(2);
    expect(confidence).toBe("medium");
  });
});

// ── shouldWarnInternalWall ───────────────────────────────────────────────────

describe("shouldWarnInternalWall", () => {
  it("low → warn shown", () => {
    expect(shouldWarnInternalWall("low")).toBe(true);
  });

  it("medium → NO warn (normal: service rooms undimensioned)", () => {
    expect(shouldWarnInternalWall("medium")).toBe(false);
  });

  it("high → NO warn", () => {
    expect(shouldWarnInternalWall("high")).toBe(false);
  });

  it("null → NO warn (confidence not yet known)", () => {
    expect(shouldWarnInternalWall(null)).toBe(false);
  });

  it("undefined → NO warn", () => {
    expect(shouldWarnInternalWall(undefined)).toBe(false);
  });
});
