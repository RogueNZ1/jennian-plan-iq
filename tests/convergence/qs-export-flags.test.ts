// @vitest-environment node
/**
 * Convergence Slice 6 — QS export reads takeoff_json (primary) + relational fallback + flags.
 *
 * All offline / mocked-data (no DB, no jobId so writeIQDataSheetFull skips Supabase):
 *   (a) FALLBACK is PERMANENT + byte-identical — a job with NO enriched takeoff (null json,
 *       i.e. every pre-deploy job) produces the relational export unchanged, and the .xlsx is
 *       byte-identical to one built with no flags at all.
 *   (b) ENRICHED — when an enriched takeoff is present, its converged VALUES overlay the base
 *       and its per-field discrepancy_flags surface as a "Review Notes" sheet a QS actually
 *       reads (and, separately, the review UI renders data.reviewFlags).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import {
  applyEnrichedTakeoff,
  buildQSDataInputSheet,
  buildReviewNotesSheet,
  type QSExportData,
} from "../../src/lib/iq-qs-export";
import { composeTakeoff } from "../../src/lib/takeoff/compose-takeoff";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import type { TakeoffData } from "../../src/lib/takeoff/takeoff-types";
import type { GeometryApiResult } from "../../src/lib/takeoff/geometry-api";

// A realistic enriched takeoff from the frozen mcalevey fixtures (it carries the garage F-022
// flag + the entrance unresolved-width flag — exactly the kind a QS must confirm).
const FIX = resolve(process.cwd(), "tests/phase1/__fixtures__");
const visionTakeoff = (
  JSON.parse(readFileSync(resolve(FIX, "mcalevey.golden.json"), "utf8")) as {
    pipeline: { takeoff: TakeoffData };
  }
).pipeline.takeoff;
const geometry = JSON.parse(
  readFileSync(resolve(FIX, "mcalevey.geometry.json"), "utf8"),
) as GeometryApiResult;
const enriched: EnrichedTakeoff = composeTakeoff({
  visionTakeoff,
  geometry,
  schedule: null,
  geometryPageIndex: 0,
}).enriched;

/** A minimal-but-complete relational QSExportData base (the "today" shape, pre-overlay). */
function baseData(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0001",
    clientName: "Jane Client",
    address: "1 Test St, Palmerston North",
    templateId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    floorAreaM2: 100,
    perimeterLm: 40,
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
    clientFirstName: "Jane",
    clientSurname: "Client",
    streetAddress: "1 Test St",
    addressLine2: null,
    city: "Palmerston North",
    email: null,
    phone: null,
    jmwNumber: "JM-0001",
    planVersion: "1",
    exteriorWallLengthLm: 40,
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
    intDoorBarnSlider: 0,
    intDoorDouble: 0,
    intDoorCavitySlider: 0,
    ceilingHatch: 0,
    atticStair: 0,
    letterboxUrban: 0,
    washingLine: 0,
    heatPumpWallUnit: 0,
    heatPumpDucted: 0,
    specItems: {},
    ...over,
  };
}

// The real export's binary (XLSX.write) does not round-trip under node/vitest, so — like the
// existing qs-export tests — we validate the WorkSheet objects the export is assembled from by
// inspecting their cells directly.
const allText = (ws: XLSX.WorkSheet): string =>
  Object.keys(ws)
    .filter((k) => !k.startsWith("!"))
    .map((k) => String((ws[k] as XLSX.CellObject).v ?? ""))
    .join(" ");

describe("Slice 6 — applyEnrichedTakeoff overlay + fallback", () => {
  it("FALLBACK: null enriched returns the base unchanged (relational), no reviewFlags", () => {
    const base = baseData();
    const out = applyEnrichedTakeoff(base, null);
    expect(out.takeoffSource).toBe("relational");
    expect(out.reviewFlags).toBeUndefined();
    // every base field is untouched
    expect({ ...out, takeoffSource: undefined }).toEqual({ ...base, takeoffSource: undefined });
  });

  it("ENRICHED: present takeoff overlays converged values + attaches per-field flags", () => {
    const out = applyEnrichedTakeoff(baseData(), enriched);
    expect(out.takeoffSource).toBe("enriched");
    // geometry-measured values win over the relational base
    expect(out.floorAreaM2).toBe(enriched.floor_area_m2.value);
    expect(out.perimeterLm).toBe(enriched.external_wall_lm.value);
    expect(out.exteriorWallLengthLm).toBe(enriched.external_wall_lm.value);
    expect(out.garageAreaM2).toBe(enriched.garage_area_m2.value);
    // flags carried over, named by field
    expect(out.reviewFlags && out.reviewFlags.length).toBeGreaterThan(0);
    const flat = (out.reviewFlags ?? []).flatMap((f) => f.flags).join(" ");
    expect(flat).toContain("garage_door_width"); // F-022 disagreement
    expect(flat).toContain("width assumed 1.0m — confirm against plan"); // entrance unresolved-width fallback
  });
});

describe("Slice 6 opening evidence review output", () => {
  it("ENRICHED: opening evidence ledger is surfaced as review flags without pricing it", () => {
    const out = applyEnrichedTakeoff(baseData(), {
      ...enriched,
      total_opening_sqm: 12.34,
      glazed_sqm: 11.11,
      opening_evidence: [
        {
          id: "floorplan-gap-1",
          status: "review",
          priced: false,
          type: "unknown",
          room: "Lounge",
          width_m: 1.8,
          height_m: 1.3,
          area_m2: null,
          evidence: [
            {
              source: "floorplan_gap",
              role: "width",
              confidence: "high",
              width_m: 1.8,
              room: "Lounge",
              wall_face_id: "H-37",
              note: "measured physical gap in floor-plan wall line",
            },
            {
              source: "elevation_measurement",
              role: "height",
              confidence: "high",
              width_m: 1.8,
              height_m: 1.3,
              room: "Lounge",
              wall_face_id: "H-37",
              note: "North elevation supports height 1300mm",
            },
          ],
          review_flags: [
            "Measured floor-plan wall gap 1800mm near Lounge on wall face H-37; elevation North supports height 1300mm; not priced until height/type are confirmed by text, elevation, schedule, or review.",
          ],
          conflicts: [],
        },
      ],
    });

    const flags = out.reviewFlags ?? [];
    const evidence = flags.find((f) => f.field === "Opening evidence - floorplan-gap-1");
    expect(evidence).toBeDefined();
    expect(evidence?.flags.join(" ")).toContain("not priced");
    expect(evidence?.flags.join(" ")).toContain("floorplan_gap width");
    expect(evidence?.flags.join(" ")).toContain("elevation_measurement height");
    expect(evidence?.flags.join(" ")).toContain("H-37");
    expect(out.openings).toEqual(enriched.openings);
  });
});

describe("Slice 6 — export sheets: additive fallback + visible flags", () => {
  it("FALLBACK is ADDITIVE: a relational (null-json) job adds NO Review Notes sheet", () => {
    // null path → no flags → buildReviewNotesSheet returns null → the workbook is unchanged.
    expect(buildReviewNotesSheet(applyEnrichedTakeoff(baseData(), null).reviewFlags)).toBeNull();
    expect(buildReviewNotesSheet(undefined)).toBeNull();
    expect(buildReviewNotesSheet([])).toBeNull();
  });

  it("BYTE-IDENTICAL paste sheet: the relational (null-json) QS sheet equals today's, cell-for-cell", () => {
    const today = buildQSDataInputSheet(baseData());
    const relational = buildQSDataInputSheet(applyEnrichedTakeoff(baseData(), null));
    expect(relational).toEqual(today); // overlay no-ops when json is null → identical worksheet
  });

  it("VISIBLE: enriched flags → a 'Review Notes' sheet a QS reads, with the flag text", () => {
    const data = applyEnrichedTakeoff(baseData(), enriched);
    const ws = buildReviewNotesSheet(data.reviewFlags);
    expect(ws).not.toBeNull();
    const text = allText(ws!);
    expect(text).toContain("CONFIDENCE / REVIEW NOTES");
    expect(text).toContain("Garage door");
    expect(text).toContain("garage_door_width"); // F-022 disagreement
    expect(text).toContain("width assumed 1.0m — confirm against plan"); // entrance unresolved-width fallback
  });

  it("VISIBLE: review notes include opening evidence without changing the IQ paste cells", () => {
    const withEvidence = applyEnrichedTakeoff(baseData(), {
      ...enriched,
      opening_evidence: [
        {
          id: "floorplan-gap-1",
          status: "review",
          priced: false,
          type: "unknown",
          room: "Lounge",
          width_m: 1.8,
          height_m: 1.3,
          area_m2: null,
          evidence: [
            {
              source: "floorplan_gap",
              role: "width",
              confidence: "high",
              width_m: 1.8,
              room: "Lounge",
              wall_face_id: "H-37",
              note: "measured physical gap in floor-plan wall line",
            },
            {
              source: "elevation_measurement",
              role: "height",
              confidence: "high",
              height_m: 1.3,
              room: "Lounge",
              wall_face_id: "H-37",
              note: "North elevation supports height 1300mm",
            },
          ],
          review_flags: [
            "Measured floor-plan wall gap 1800mm near Lounge on wall face H-37; elevation North supports height 1300mm; not priced until height/type are confirmed by text, elevation, schedule, or review.",
          ],
          conflicts: [],
        },
      ],
    });
    const withoutEvidence = applyEnrichedTakeoff(baseData(), {
      ...enriched,
      opening_evidence: [],
    });

    const ws = buildReviewNotesSheet(withEvidence.reviewFlags);
    expect(ws).not.toBeNull();
    const text = allText(ws!);
    expect(text).toContain("Opening evidence - floorplan-gap-1");
    expect(text).toContain("floorplan_gap width");
    expect(text).toContain("elevation_measurement height");
    expect(text).toContain("not priced until height/type are confirmed");
    expect(buildQSDataInputSheet(withEvidence)).toEqual(buildQSDataInputSheet(withoutEvidence));
  });

  it("VISIBLE: global opening pricing block keeps local candidate evidence priced in Review Notes", () => {
    const blocked = applyEnrichedTakeoff(baseData(), {
      ...enriched,
      external_wall_area_m2: {
        ...enriched.external_wall_area_m2,
        value: null,
        discrepancy_flags: [
          "Opening pricing blocked: unresolved Visual QS reconciliation error. Visual QS found 17 QS-glazed external openings, but the composed opening set has 20. Reconcile before pricing.",
        ],
      },
      opening_evidence: [
        {
          id: "floorplan-gap-1",
          status: "priced",
          priced: true,
          type: "window",
          room: "Pantry",
          width_m: 2.75,
          height_m: 1,
          area_m2: 2.75,
          evidence: [
            {
              source: "floorplan_gap",
              role: "width",
              confidence: "high",
              width_m: 2.75,
              room: "Pantry",
              wall_face_id: "V-111",
              note: "measured floor-plan gap",
            },
          ],
          review_flags: ["Measured floor-plan wall gap promoted before global reconciliation."],
          conflicts: [],
        },
      ],
    });

    expect(blocked.openingPricingBlocked).toBe(true);
    const ws = buildReviewNotesSheet(blocked.reviewFlags);
    expect(ws).not.toBeNull();
    const text = allText(ws!);
    expect(text).toContain("Opening evidence - floorplan-gap-1");
    expect(text).toContain("Status: priced; priced");
    expect(text).toContain("Measured floor-plan wall gap promoted before global reconciliation.");
    expect(text).not.toContain("Conflicts: visual_reconciliation_error");
  });

  it("BLOCKED: partial priced openings do not repopulate export window slots", () => {
    const blocked = applyEnrichedTakeoff(baseData(), {
      ...enriched,
      openings: [
        {
          type: "window",
          room: "Lounge",
          height_m: 1.3,
          width_m: 1.8,
          glazed: true,
          cladding: null,
          area_m2: 2.34,
          source: "vector",
          confidence: "medium",
        },
      ],
      external_wall_area_m2: {
        ...enriched.external_wall_area_m2,
        value: null,
        discrepancy_flags: [
          "Opening pricing blocked: unresolved Visual QS reconciliation error. Visual QS found more openings than the composed set.",
        ],
      },
    });

    expect(blocked.openingPricingBlocked).toBe(true);
    expect(blocked.openings).toHaveLength(1);
    expect(blocked.windowsByRoom.lounge).toBeUndefined();
  });

  it("ENRICHED values reach the QS paste sheet (floor area = the geometry value, not the base)", () => {
    const enrichedSheet = buildQSDataInputSheet(applyEnrichedTakeoff(baseData(), enriched));
    // D12 = Floor Area — now the converged geometry value, overlaid from takeoff_json.
    expect(enrichedSheet["D12"]?.v).toBe(enriched.floor_area_m2.value);
  });
});
