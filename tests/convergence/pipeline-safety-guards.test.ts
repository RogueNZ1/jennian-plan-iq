/**
 * PIPELINE SAFETY GUARDS — regression tests from the 12 Jun geometry outage.
 *
 * The geometry layer silently 401'd for two days (catch→null) while takeoffs ran
 * vision-only with NO indication. Law under test: a geometry-less run is LOUD —
 * flagged at the compose seam AND on the export — and known-bad fields never
 * print priceable numbers.
 */
import { describe, it, expect } from "vitest";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";
import { buildDropInSheet, type QSExportData } from "../../src/lib/iq-qs-export";

function cellVal(ws: ReturnType<typeof buildDropInSheet>, addr: string): unknown {
  const c = ws[addr] as { v?: unknown } | undefined;
  return c?.v ?? undefined;
}
function manualText(ws: ReturnType<typeof buildDropInSheet>): string {
  const lines: string[] = [];
  for (let r = 47; r <= 80; r++) {
    const v = cellVal(ws, `A${r}`);
    if (typeof v === "string") lines.push(v);
  }
  return lines.join("\n");
}

const minimalVision = {
  floor_area_m2: 139.4,
  garage_area_m2: 36,
  alfresco_area_m2: null,
  external_wall_lm: 56,
  internal_wall_lm: 40,
  roof_area_m2: 160,
  total_area_m2: 139.4,
  window_count: 9,
  external_door_count: 2,
  internal_door_count: 10,
  bathroom_count: 1,
  ensuite_count: 1,
  laundry_count: 1,
  kitchen_count: 1,
  ceiling_height_m: 2.4,
  foundation_type: "slab",
  windows_by_room: {},
  door_breakdown: {},
  garage_door_size: "3x2.1",
  notes: "",
} as unknown as TakeoffData;

describe("geometry_status flag at the compose seam", () => {
  it("geometry null → loud unavailable flag on the enriched takeoff", () => {
    const out = composeTakeoff({
      visionTakeoff: minimalVision,
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
    });
    const gs = out.enriched.geometry_status;
    expect(gs?.value).toBe("unavailable");
    expect(gs?.source).toBe("flagged-unknown");
    expect((gs?.discrepancy_flags ?? []).join(" ")).toContain("GEOMETRY LAYER UNAVAILABLE");
  });

  it("missing foundation defaults to TC1 instead of raising an unknown/error value", () => {
    const out = composeTakeoff({
      visionTakeoff: { ...minimalVision, foundation_type: null },
      geometry: null,
      schedule: null,
      geometryPageIndex: undefined,
    });

    expect(out.enriched.foundation_type.value).toBe("TC1");
    expect(out.enriched.foundation_type.source).toBe("asserted");
    expect(out.enriched.foundation_type.discrepancy_flags).toEqual([]);
  });

  it("geometry-present runs stay byte-identical: field absent", () => {
    const geometry = {
      success: true,
      page_used: 0,
      scale: { string: "1:100", value: 100 },
      confidence: { floor_area: "high", perimeter: "high", notes: [] },
      measurements: {
        floor_area_m2: 139.4,
        perimeter_m: 56.2,
        external_wall_length_m: 56.2,
        internal_wall_length_m: 7,
        internal_wall_confidence: "medium",
        garage_area_m2: null,
        alfresco_area_m2: null,
        stud_height_mm: 2400,
        bounding_box_m: null,
        room_count: 4,
        main_room_count: 4,
        rooms: [],
      },
    } as never;
    const out = composeTakeoff({
      visionTakeoff: minimalVision,
      geometry,
      schedule: null,
      geometryPageIndex: 0,
    });
    expect("geometry_status" in out.enriched).toBe(false);
  });

  it("sectional garage callout confirms garage size and clears width-conflict flags", () => {
    const geometry = {
      success: true,
      page_used: 0,
      total_pages: 1,
      scale: { string: "1:100", factor: 100, source: "text", pixels_per_mm: null },
      confidence: { floor_area: "high", perimeter: "high", notes: [] },
      ocr_raw: {
        living_area_m2: 139.4,
        perimeter_m: 56.2,
        garage_area_m2: null,
        alfresco_area_m2: null,
        stud_height_mm: 2400,
      },
      measurements: {
        floor_area_m2: 139.4,
        perimeter_m: 56.2,
        external_wall_length_m: 56.2,
        internal_wall_length_m: 7,
        internal_wall_confidence: "medium",
        garage_area_m2: null,
        alfresco_area_m2: null,
        stud_height_mm: 2400,
        bounding_box_m: null,
        room_count: 4,
        main_room_count: 4,
        rooms: [],
      },
      vector_annotations: {
        vector_usable: true,
        garage: { width_mm: 1870, height_mm: 2100, raw: "1870", page: 0, distance_px: 20 },
        schedule: null,
        openings: null,
        entrance: null,
        symbol_openings: [
          {
            type: "sectional_door",
            width_mm: 3000,
            width_source: "callout",
            label_dist_mm: 1000,
            height_mm: 2100,
            page: 0,
          },
        ],
      },
    } as never;

    const out = composeTakeoff({
      visionTakeoff: { ...minimalVision, garage_door_size: "4.0×2.1" },
      geometry,
      schedule: null,
      geometryPageIndex: 0,
    }).enriched;

    expect(out.garage_door_size.value).toBe("3x2.1");
    expect(out.garage_door_size.confidence).toBe("high");
    expect(out.garage_door_size.discrepancy_flags.join(" ")).not.toContain("garage_door_width");
  });

  it("same numeric garage size with a normalised separator keeps reconciliation flags", () => {
    const geometry = {
      success: true,
      page_used: 0,
      total_pages: 1,
      scale: { string: "1:100", factor: 100, source: "text", pixels_per_mm: null },
      confidence: { floor_area: "high", perimeter: "high", notes: [] },
      ocr_raw: {
        living_area_m2: 170.8,
        perimeter_m: 60.4,
        garage_area_m2: null,
        alfresco_area_m2: null,
        stud_height_mm: 2400,
      },
      measurements: {
        floor_area_m2: 170.8,
        perimeter_m: 60.4,
        external_wall_length_m: 60.4,
        internal_wall_length_m: null,
        internal_wall_confidence: "low",
        garage_area_m2: null,
        alfresco_area_m2: null,
        stud_height_mm: 2400,
        bounding_box_m: null,
        room_count: 0,
        main_room_count: 0,
        rooms: [],
      },
      vector_annotations: {
        vector_usable: true,
        garage: { width_mm: 4800, height_mm: 2150, raw: "2,150 x 4,800", page: 0 },
        schedule: null,
        openings: { window_count: 14, widths_raw: ["4,800"], datum_mm: 2150, page: 0 },
        entrance: null,
        symbol_openings: null,
      },
    } as never;

    const out = composeTakeoff({
      visionTakeoff: { ...minimalVision, garage_door_size: "2.7×2.1", window_count: 1 },
      geometry,
      schedule: null,
      geometryPageIndex: 0,
    }).enriched;

    expect(out.garage_door_size.value).toBe("4.8x2.1");
    expect(out.garage_door_size.confidence).toBe("low");
    expect(out.garage_door_size.discrepancy_flags.join(" ")).toContain("garage_door_width");
  });
});

function base(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-TEST",
    clientName: "Test Client",
    address: "Full Test",
    templateId: null,
    createdAt: "",
    floorAreaM2: 139,
    perimeterLm: 56,
    firstFloorAreaM2: null,
    studHeightMm: 2400,
    alfrescoAreaM2: null,
    roofPitch: null,
    ridgeType: null,
    underlay: null,
    claddingType1: null,
    claddingType2: null,
    windows: [],
    garageDoors: [],
    interiorDoors: [],
    downpipes: [],
    heatPumps: [],
    extras: [],
    skylights: [],
    clientFirstName: "Test",
    clientSurname: "Client",
    streetAddress: "1 Test St",
    addressLine2: null,
    city: "Feilding",
    email: null,
    phone: null,
    jmwNumber: "JM-TEST",
    planVersion: "1",
    exteriorWallLengthLm: 56,
    exteriorWallHeightM: 2.4,
    pathsPatioM2: null,
    drivewayM2: null,
    windowsByRoom: {},
    downpipesWhite: 0,
    downpipesColourSteel: 0,
    downpipesPvcColoured: 0,
    garageDoor48x21Std: 0,
    garageDoor48x21Insulated: 0,
    garageDoor24x21Std: 0,
    garageDoor24x21Insulated: 0,
    garageDoor27x21Std: 0,
    garageDoor27x21Insulated: 0,
    intDoorStandard: 0,
    intDoorUGroove: 0,
    intDoorVGroove: 0,
    ...(over as object),
  } as QSExportData;
}

describe("export-level guards", () => {
  it("geometryStatus unavailable → ⚑⚑ GEOMETRY LAYER OFFLINE in the manual block", () => {
    const ws = buildDropInSheet(base({ geometryStatus: "unavailable" }));
    expect(manualText(ws)).toContain("GEOMETRY LAYER OFFLINE");
  });

  it("geometry ok / pre-flag era → no offline warning", () => {
    const ws = buildDropInSheet(base());
    expect(manualText(ws)).not.toContain("GEOMETRY LAYER OFFLINE");
    const ws2 = buildDropInSheet(base({ geometryStatus: null }));
    expect(manualText(ws2)).not.toContain("GEOMETRY LAYER OFFLINE");
  });

  it("internal walls NEVER print a priceable number until P2 (B13 blank + flag)", () => {
    const ws = buildDropInSheet(base({ internalWallLm: 7 } as Partial<QSExportData>));
    expect(cellVal(ws, "B13") ?? "").toBe("");
    expect(String(cellVal(ws, "D13") ?? "")).toContain("UNVERIFIED");
  });

  it("date stamps are NZT (B5 ISO matches Pacific/Auckland today, not UTC)", () => {
    const ws = buildDropInSheet(base());
    const expected = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(cellVal(ws, "B5")).toBe(expected);
  });
});
