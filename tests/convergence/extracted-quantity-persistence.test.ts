// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyEnrichedTakeoff,
  buildDropInSheet,
  buildQSDataInputSheet,
  type QSExportData,
} from "../../src/lib/iq-qs-export";
import {
  fromExtractedQuantityDbRow,
  loadActiveExtractedQuantityRows,
  persistExtractedQuantityRowsForRun,
  toExtractedQuantityDbRow,
  type ExtractedQuantityDbRow,
  type ExtractedQuantityInsertRow,
  type ExtractedQuantityPersistenceClient,
} from "../../src/lib/takeoff/extracted-quantity-persistence";
import { buildExtractedQuantityReadModel } from "../../src/lib/takeoff/extracted-quantity-read-model";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";

const timestamp = "2026-06-28T00:00:00.000Z";

function q(over: Partial<ExtractedQuantity>): ExtractedQuantity {
  return {
    id: "q-1",
    jobId: "job-1",
    runId: "run-1",
    category: "window",
    label: "Window",
    count: 1,
    widthMm: 1400,
    heightMm: 1200,
    lengthMm: null,
    areaM2: 1.68,
    status: "extracted",
    confidence: 95,
    warnings: [],
    source: "visual_detection",
    evidence: [
      {
        page: 2,
        bbox: [10, 20, 30, 40],
        text: "W01 1400x1200",
        source: "visual_detection",
        confidence: 90,
        warnings: ["dimension witness"],
        witnessIds: ["visual-opening-1"],
        scale: "1:100",
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...over,
  };
}

function baseData(over: Partial<QSExportData> = {}): QSExportData {
  return {
    jobNumber: "JM-0060",
    clientName: "Test Client",
    address: "1 Test St",
    templateId: null,
    createdAt: timestamp,
    floorAreaM2: 160,
    perimeterLm: 58.13,
    internalWallLm: null,
    gableSpanM: null,
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
    city: null,
    email: null,
    phone: null,
    jmwNumber: "JM-0060",
    planVersion: "1",
    exteriorWallLengthLm: 58.13,
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
    intDoorStandard: 11,
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
    moduleItems: [],
    ...over,
  };
}

function enrichedWithQuantities(rows: ExtractedQuantity[]): EnrichedTakeoff {
  const empty = { value: null, source: "derived", confidence: "low", discrepancy_flags: [] };
  return {
    floor_area_m2: { value: 160, source: "geometry", confidence: "high", discrepancy_flags: [] },
    ceiling_height_m: { value: 2.4, source: "vision", confidence: "mid", discrepancy_flags: [] },
    external_wall_lm: {
      value: 58.13,
      source: "geometry",
      confidence: "mid",
      discrepancy_flags: [],
    },
    internal_wall_lm: { value: null, source: "geometry", confidence: "low", discrepancy_flags: [] },
    roof_area_m2: { value: null, source: "derived", confidence: "low", discrepancy_flags: [] },
    external_wall_area_m2: {
      value: null,
      source: "derived",
      confidence: "low",
      discrepancy_flags: [],
    },
    window_count: { value: null, source: "vision", confidence: "low", discrepancy_flags: [] },
    internal_door_count: empty,
    bathroom_count: empty,
    ensuite_count: empty,
    laundry_count: empty,
    kitchen_count: empty,
    foundation_type: empty,
    windows_by_room: empty,
    windows_schedule: empty,
    door_breakdown: empty,
    garage_door_size: empty,
    garage_area_m2: { value: null, source: "vision", confidence: "low", discrepancy_flags: [] },
    alfresco_area_m2: { value: null, source: "vision", confidence: "low", discrepancy_flags: [] },
    gable_span_m: { value: null, source: "derived", confidence: "low", discrepancy_flags: [] },
    total_area_m2: empty,
    openings: [],
    opening_evidence: [],
    extracted_quantities: rows,
    notes: "",
  } as EnrichedTakeoff;
}

class InMemoryExtractedQuantityClient implements ExtractedQuantityPersistenceClient {
  rows: ExtractedQuantityDbRow[] = [];

  from = (table: "extracted_quantity_rows") => {
    expect(table).toBe("extracted_quantity_rows");
    return {
      update: (values: { superseded_at: string }) => {
        return {
          eq: (column: "job_id", jobId: string) => {
            expect(column).toBe("job_id");
            return {
              is: (isColumn: "superseded_at", value: null) => {
                expect(isColumn).toBe("superseded_at");
                expect(value).toBeNull();
                return {
                  neq: async (neqColumn: "run_id", runId: string) => {
                    expect(neqColumn).toBe("run_id");
                    this.rows = this.rows.map((row) =>
                      row.job_id === jobId && row.superseded_at == null && row.run_id !== runId
                        ? { ...row, superseded_at: values.superseded_at }
                        : row,
                    );
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      },
      insert: async (values: ExtractedQuantityInsertRow[]) => {
        this.rows.push(
          ...values.map((row) => ({
            ...row,
            created_at: row.created_at ?? timestamp,
            updated_at: row.updated_at ?? timestamp,
            superseded_at: row.superseded_at ?? null,
          })),
        );
        return { data: null, error: null };
      },
      select: (columns: "*") => {
        expect(columns).toBe("*");
        return {
          eq: (column: "job_id", jobId: string) => {
            expect(column).toBe("job_id");
            return {
              eq: (eqColumn: "run_id", runId: string) => {
                expect(eqColumn).toBe("run_id");
                return {
                  is: async (isColumn: "superseded_at", value: null) => {
                    expect(isColumn).toBe("superseded_at");
                    expect(value).toBeNull();
                    return {
                      data: this.rows.filter(
                        (row) =>
                          row.job_id === jobId && row.run_id === runId && row.superseded_at == null,
                      ),
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
  };
}

describe("extracted quantity persistence", () => {
  it("persists extracted quantity rows with jobId and runId", async () => {
    const client = new InMemoryExtractedQuantityClient();
    const result = await persistExtractedQuantityRowsForRun(client, {
      jobId: "job-1",
      runId: "run-1",
      quantities: [q({ id: "perimeter", category: "exterior_perimeter", lengthMm: 58130 })],
      now: timestamp,
    });

    expect(result).toEqual({ written: true, rowCount: 1, error: null });
    expect(client.rows[0]).toMatchObject({ id: "perimeter", job_id: "job-1", run_id: "run-1" });
  });

  it("loads only active-run extracted quantity rows", async () => {
    const client = new InMemoryExtractedQuantityClient();
    await persistExtractedQuantityRowsForRun(client, {
      jobId: "job-1",
      runId: "run-old",
      quantities: [q({ id: "old", runId: "run-old" })],
      now: timestamp,
    });
    await persistExtractedQuantityRowsForRun(client, {
      jobId: "job-1",
      runId: "run-new",
      quantities: [q({ id: "new", runId: "run-new" })],
      now: "2026-06-28T01:00:00.000Z",
    });

    const active = await loadActiveExtractedQuantityRows(client, {
      jobId: "job-1",
      activeRunId: "run-new",
    });
    expect(active.rows.map((row) => row.id)).toEqual(["new"]);
  });

  it("supersedes previous extracted quantity rows on rerun", async () => {
    const client = new InMemoryExtractedQuantityClient();
    await persistExtractedQuantityRowsForRun(client, {
      jobId: "job-1",
      runId: "run-old",
      quantities: [q({ id: "old", runId: "run-old" })],
      now: timestamp,
    });
    await persistExtractedQuantityRowsForRun(client, {
      jobId: "job-1",
      runId: "run-new",
      quantities: [q({ id: "new", runId: "run-new" })],
      now: "2026-06-28T01:00:00.000Z",
    });

    expect(client.rows.find((row) => row.run_id === "run-old")?.superseded_at).toBe(
      "2026-06-28T01:00:00.000Z",
    );
    expect(client.rows.find((row) => row.run_id === "run-new")?.superseded_at).toBeNull();
  });

  it("keeps old run rows available for history but inactive", async () => {
    const client = new InMemoryExtractedQuantityClient();
    await persistExtractedQuantityRowsForRun(client, {
      jobId: "job-1",
      runId: "run-old",
      quantities: [q({ id: "old", runId: "run-old" })],
      now: timestamp,
    });
    await persistExtractedQuantityRowsForRun(client, {
      jobId: "job-1",
      runId: "run-new",
      quantities: [q({ id: "new", runId: "run-new" })],
      now: "2026-06-28T01:00:00.000Z",
    });

    expect(client.rows.find((row) => row.id === "old")?.superseded_at).not.toBeNull();
    expect(client.rows.map((row) => row.id)).toEqual(["old", "new"]);
  });

  it("does not silently mix rows from multiple runIds", () => {
    expect(() =>
      buildExtractedQuantityReadModel([
        q({ id: "old", runId: "run-old" }),
        q({ id: "new", runId: "run-new" }),
      ]),
    ).toThrow(/multiple runIds without activeRunId/);
  });

  it("throws or blocks when multiple runIds are present without activeRunId", async () => {
    const client = new InMemoryExtractedQuantityClient();
    client.rows = [
      toExtractedQuantityDbRow(q({ id: "old", runId: "run-old" })),
      toExtractedQuantityDbRow(q({ id: "new", runId: "run-new" })),
    ].map((row) => ({ ...row, created_at: timestamp, updated_at: timestamp }));

    const result = await loadActiveExtractedQuantityRows(client, { jobId: "job-1" });
    expect(result.rows).toEqual([]);
    expect(result.error).toMatch(/activeRunId is required/);
  });

  it("loads persisted extracted rows only for the requested activeRunId", async () => {
    const client = new InMemoryExtractedQuantityClient();
    client.rows = [
      toExtractedQuantityDbRow(q({ id: "old", runId: "run-old" })),
      toExtractedQuantityDbRow(q({ id: "new", runId: "run-new" })),
    ].map((row) => ({ ...row, created_at: timestamp, updated_at: timestamp }));

    const result = await loadActiveExtractedQuantityRows(client, {
      jobId: "job-1",
      activeRunId: "run-new",
    });

    expect(result.error).toBeNull();
    expect(result.rows.map((row) => row.id)).toEqual(["new"]);
  });

  it("returns no active persisted rows when only older run rows exist", async () => {
    const client = new InMemoryExtractedQuantityClient();
    client.rows = [toExtractedQuantityDbRow(q({ id: "old", runId: "run-old" }))].map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
    }));

    const result = await loadActiveExtractedQuantityRows(client, {
      jobId: "job-1",
      activeRunId: "run-new",
    });

    expect(result).toEqual({ rows: [], error: null });
  });

  it("old unsuperseded rows are not active for a newer runId", async () => {
    const client = new InMemoryExtractedQuantityClient();
    client.rows = [toExtractedQuantityDbRow(q({ id: "old-active-looking", runId: "run-old" }))].map(
      (row) => ({ ...row, created_at: timestamp, updated_at: timestamp }),
    );

    const result = await loadActiveExtractedQuantityRows(client, {
      jobId: "job-1",
      activeRunId: "run-new",
    });

    expect(result.rows).toEqual([]);
  });

  it("preserves unknown dimensions as null after persistence round trip", () => {
    const row = toExtractedQuantityDbRow(
      q({ id: "unknown", widthMm: 1030, heightMm: null, areaM2: null }),
    );
    const roundTrip = fromExtractedQuantityDbRow({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    });

    expect(roundTrip.heightMm).toBeNull();
    expect(roundTrip.areaM2).toBeNull();
  });

  it("preserves assumed-height rows as needs_review with null height and null area after persistence round trip", () => {
    const row = toExtractedQuantityDbRow(
      q({
        id: "assumed-height",
        status: "needs_review",
        heightMm: null,
        areaM2: null,
        warnings: ["assumed_height_rejected", "area_not_calculated"],
      }),
    );
    const roundTrip = fromExtractedQuantityDbRow({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    });

    expect(roundTrip.status).toBe("needs_review");
    expect(roundTrip.heightMm).toBeNull();
    expect(roundTrip.areaM2).toBeNull();
    expect(roundTrip.warnings).toContain("assumed_height_rejected");
  });

  it("preserves warnings after persistence round trip", () => {
    const row = toExtractedQuantityDbRow(
      q({ warnings: ["height_not_extracted", "area_not_calculated"] }),
    );
    const roundTrip = fromExtractedQuantityDbRow({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    });

    expect(roundTrip.warnings).toEqual(["height_not_extracted", "area_not_calculated"]);
  });

  it("preserves evidence page, bbox, and text after persistence round trip", () => {
    const row = toExtractedQuantityDbRow(q({ id: "evidence" }));
    const roundTrip = fromExtractedQuantityDbRow({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    });

    expect(roundTrip.evidence[0]).toMatchObject({
      page: 2,
      bbox: [10, 20, 30, 40],
      text: "W01 1400x1200",
      source: "visual_detection",
      scale: "1:100",
      witnessIds: ["visual-opening-1"],
    });
  });

  it("numbers export reads active persisted ledger rows when available", () => {
    const activeReadModel = buildExtractedQuantityReadModel([
      q({ id: "active-perimeter", runId: "run-active", category: "exterior_perimeter" }),
    ]);
    const data = applyEnrichedTakeoff(
      baseData(),
      enrichedWithQuantities([q({ id: "stale-perimeter", runId: "run-old" })]),
      { extractedQuantityReadModel: activeReadModel },
    );

    expect(data.extractedQuantityReadModel?.rows.map((row) => row.id)).toEqual([
      "active-perimeter",
    ]);
  });

  it("does not prefer persisted extracted rows from an older run over fresh takeoff_json", () => {
    const stalePersisted = buildExtractedQuantityReadModel([
      q({ id: "old-persisted", runId: "run-old", category: "exterior_perimeter" }),
    ]);
    const data = applyEnrichedTakeoff(
      baseData(),
      enrichedWithQuantities([q({ id: "fresh-json", runId: "run-new", category: "window" })]),
      { extractedQuantityReadModel: null },
    );

    expect(stalePersisted.rows.map((row) => row.id)).toEqual(["old-persisted"]);
    expect(data.extractedQuantityReadModel?.rows.map((row) => row.id)).toEqual(["fresh-json"]);
    expect(data.extractedQuantityReadModel?.runIds).toEqual(["run-new"]);
  });

  it("falls back to fresh takeoff_json extracted quantities when current-run persisted rows are unavailable", () => {
    const data = applyEnrichedTakeoff(
      baseData(),
      enrichedWithQuantities([
        q({
          id: "fresh-unknown",
          runId: "run-new",
          widthMm: 1030,
          heightMm: null,
          areaM2: null,
          status: "needs_review",
          warnings: ["assumed_height_rejected", "area_not_calculated"],
        }),
      ]),
      { extractedQuantityReadModel: null },
    );

    const row = data.extractedQuantityReadModel?.rows[0];
    expect(row?.id).toBe("fresh-unknown");
    expect(row?.heightMm).toBeNull();
    expect(row?.areaM2).toBeNull();
    expect(row?.status).toBe("needs_review");
    expect(row?.warnings).toContain("assumed_height_rejected");
  });

  it("persistence failure after takeoff_json write cannot make old rows the active authority", async () => {
    const client = new InMemoryExtractedQuantityClient();
    client.rows = [toExtractedQuantityDbRow(q({ id: "old-persisted", runId: "run-old" }))].map(
      (row) => ({ ...row, created_at: timestamp, updated_at: timestamp }),
    );

    const result = await loadActiveExtractedQuantityRows(client, {
      jobId: "job-1",
      activeRunId: "run-new",
    });
    const data = applyEnrichedTakeoff(
      baseData(),
      enrichedWithQuantities([q({ id: "fresh-json", runId: "run-new" })]),
      {
        extractedQuantityReadModel: result.rows.length
          ? buildExtractedQuantityReadModel(result.rows)
          : null,
      },
    );

    expect(result.rows).toEqual([]);
    expect(data.extractedQuantityReadModel?.rows.map((row) => row.id)).toEqual(["fresh-json"]);
  });

  it("rerun cannot produce fresh takeoff_json with stale active extracted quantities", () => {
    const activeReadModel = buildExtractedQuantityReadModel([
      q({ id: "fresh-active", runId: "run-new", category: "window" }),
    ]);
    const data = applyEnrichedTakeoff(
      baseData(),
      enrichedWithQuantities([q({ id: "stale-json", runId: "run-old", category: "window" })]),
      { extractedQuantityReadModel: activeReadModel },
    );

    expect(data.extractedQuantityReadModel?.runIds).toEqual(["run-new"]);
    expect(data.extractedQuantityReadModel?.rows.map((row) => row.id)).toEqual(["fresh-active"]);
  });

  it("existing QS/pricing workbook behaviour remains unchanged", () => {
    const activeReadModel = buildExtractedQuantityReadModel([
      q({ id: "active-perimeter", runId: "run-active", category: "exterior_perimeter" }),
    ]);
    const withLedger = baseData({ extractedQuantityReadModel: activeReadModel });
    const withoutLedger = baseData();

    expect(buildQSDataInputSheet(withLedger)).toEqual(buildQSDataInputSheet(withoutLedger));
    expect(buildDropInSheet(withLedger)).toEqual(buildDropInSheet(withoutLedger));
  });
});
