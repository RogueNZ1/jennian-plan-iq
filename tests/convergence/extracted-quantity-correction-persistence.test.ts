// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EnrichedTakeoff } from "../../src/lib/takeoff/enriched-takeoff";
import type { ExtractedQuantity } from "../../src/lib/takeoff/extracted-quantity-ledger";
import {
  toExtractedQuantityDbRow,
  type ExtractedQuantityDbRow,
  type ExtractedQuantityInsertRow,
  type ExtractedQuantityPersistenceClient,
} from "../../src/lib/takeoff/extracted-quantity-persistence";
import type {
  ExtractedQuantityCorrection,
  ExtractedQuantityCorrectionDbRow,
  ExtractedQuantityCorrectionInsertRow,
} from "../../src/lib/takeoff/extracted-quantity-corrections";
import {
  insertExtractedQuantityCorrection,
  loadExtractedQuantityCorrectionsForRun,
  revertExtractedQuantityCorrection,
  type ExtractedQuantityCorrectionPersistenceClient,
} from "../../src/lib/takeoff/extracted-quantity-correction-persistence";
import { resolveEffectiveExtractedQuantityAuthorityForRun } from "../../src/lib/takeoff/extracted-quantity-authority";

const timestamp = "2026-06-29T00:00:00.000Z";

function q(overrides: Partial<ExtractedQuantity> = {}): ExtractedQuantity {
  return {
    id: "opening-1",
    jobId: "job-1",
    runId: "run-current",
    category: "window",
    label: "Window 1",
    count: 1,
    widthMm: 1400,
    heightMm: null,
    lengthMm: null,
    areaM2: null,
    status: "needs_review",
    confidence: 70,
    warnings: ["height_not_extracted", "area_not_calculated"],
    source: "vector_geometry",
    evidence: [{ page: 2, bbox: [10, 20, 30, 40], text: "W01 width witness" }],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function correction(
  overrides: Partial<ExtractedQuantityCorrection> = {},
): ExtractedQuantityCorrection {
  return {
    id: "correction-1",
    jobId: "job-1",
    runId: "run-current",
    extractedQuantityId: "opening-1",
    visualAnchorId: "anchor-1",
    action: "set_dimension",
    field: "heightMm",
    before: null,
    after: 2100,
    reason: "Confirmed from schedule",
    evidenceRefs: [{ kind: "manual_reference", note: "Window schedule" }],
    createdBy: "user-1",
    createdAt: timestamp,
    ...overrides,
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
    internal_wall_lm: empty,
    roof_area_m2: empty,
    external_wall_area_m2: empty,
    window_count: empty,
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
    garage_area_m2: empty,
    alfresco_area_m2: empty,
    gable_span_m: empty,
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
      update: (values: { superseded_at: string }) => ({
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
      }),
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

class InMemoryCorrectionClient implements ExtractedQuantityCorrectionPersistenceClient {
  rows: ExtractedQuantityCorrectionDbRow[] = [];

  from = (table: "extracted_quantity_corrections") => {
    expect(table).toBe("extracted_quantity_corrections");
    return {
      insert: (values: ExtractedQuantityCorrectionInsertRow) => ({
        select: (columns: "*") => {
          expect(columns).toBe("*");
          return {
            single: async () => {
              const row: ExtractedQuantityCorrectionDbRow = {
                id: values.id ?? `correction-${this.rows.length + 1}`,
                ...values,
                created_at: values.created_at ?? timestamp,
              };
              this.rows.push(row);
              return { data: row, error: null };
            },
          };
        },
      }),
      select: (columns: "*") => {
        expect(columns).toBe("*");
        return {
          eq: (jobColumn: "job_id", jobId: string) => {
            expect(jobColumn).toBe("job_id");
            return {
              eq: (runColumn: "run_id", runId: string) => {
                expect(runColumn).toBe("run_id");
                return {
                  is: (revertedColumn: "reverted_at", value: null) => {
                    expect(revertedColumn).toBe("reverted_at");
                    expect(value).toBeNull();
                    return {
                      order: async (orderColumn: "created_at", options: { ascending: boolean }) => {
                        expect(orderColumn).toBe("created_at");
                        const rows = this.rows
                          .filter(
                            (row) =>
                              row.job_id === jobId &&
                              row.run_id === runId &&
                              row.reverted_at == null,
                          )
                          .sort((a, b) =>
                            options.ascending
                              ? a.created_at.localeCompare(b.created_at)
                              : b.created_at.localeCompare(a.created_at),
                          );
                        return { data: rows, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
      update: (values: { reverted_at: string; reverted_by: string; revert_reason: string }) => ({
        eq: (jobColumn: "job_id", jobId: string) => {
          expect(jobColumn).toBe("job_id");
          return {
            eq: (runColumn: "run_id", runId: string) => {
              expect(runColumn).toBe("run_id");
              return {
                eq: (idColumn: "id", correctionId: string) => {
                  expect(idColumn).toBe("id");
                  return {
                    is: (revertedColumn: "reverted_at", value: null) => {
                      expect(revertedColumn).toBe("reverted_at");
                      expect(value).toBeNull();
                      return {
                        select: (columns: "*") => {
                          expect(columns).toBe("*");
                          return {
                            single: async () => {
                              const index = this.rows.findIndex(
                                (row) =>
                                  row.job_id === jobId &&
                                  row.run_id === runId &&
                                  row.id === correctionId &&
                                  row.reverted_at == null,
                              );
                              if (index < 0) {
                                return { data: null, error: { message: "correction not found" } };
                              }
                              this.rows[index] = { ...this.rows[index], ...values };
                              return { data: this.rows[index], error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      }),
    };
  };
}

function sourceText(): string {
  return [
    "src/lib/takeoff/extracted-quantity-correction-persistence.ts",
    "src/lib/takeoff/extracted-quantity-authority.ts",
  ]
    .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
    .join("\n");
}

describe("extracted quantity correction persistence", () => {
  it("persists a correction event without mutating extracted_quantity_rows", async () => {
    const extractedClient = new InMemoryExtractedQuantityClient();
    extractedClient.rows = [toExtractedQuantityDbRow(q())].map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
    }));
    const before = JSON.parse(JSON.stringify(extractedClient.rows));
    const correctionClient = new InMemoryCorrectionClient();

    const result = await insertExtractedQuantityCorrection(correction(), correctionClient);

    expect(result.error).toBeNull();
    expect(result.correction?.id).toBe("correction-1");
    expect(extractedClient.rows).toEqual(before);
  });

  it("loads corrections only for matching jobId and runId", async () => {
    const client = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction({ id: "current" }), client);
    await insertExtractedQuantityCorrection(
      correction({ id: "other-job", jobId: "job-2" }),
      client,
    );
    await insertExtractedQuantityCorrection(
      correction({ id: "other-run", runId: "run-old" }),
      client,
    );

    const result = await loadExtractedQuantityCorrectionsForRun(
      { jobId: "job-1", runId: "run-current" },
      client,
    );

    expect(result.error).toBeNull();
    expect(result.corrections.map((item) => item.id)).toEqual(["current"]);
  });

  it("does not load old-run corrections for current run", async () => {
    const client = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction({ id: "old", runId: "run-old" }), client);

    const result = await loadExtractedQuantityCorrectionsForRun(
      { jobId: "job-1", runId: "run-current" },
      client,
    );

    expect(result.corrections).toEqual([]);
  });

  it("excludes reverted corrections from active correction load", async () => {
    const client = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction({ id: "active" }), client);
    await insertExtractedQuantityCorrection(
      correction({ id: "reverted", revertedAt: "2026-06-29T01:00:00.000Z" }),
      client,
    );

    const result = await loadExtractedQuantityCorrectionsForRun(
      { jobId: "job-1", runId: "run-current" },
      client,
    );

    expect(result.corrections.map((item) => item.id)).toEqual(["active"]);
  });

  it("marks correction reverted without deleting it", async () => {
    const client = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction({ id: "to-revert" }), client);

    const result = await revertExtractedQuantityCorrection(
      {
        jobId: "job-1",
        runId: "run-current",
        correctionId: "to-revert",
        revertedBy: "user-2",
        revertReason: "Entered against wrong witness",
        revertedAt: "2026-06-29T02:00:00.000Z",
      },
      client,
    );

    expect(result.error).toBeNull();
    expect(client.rows).toHaveLength(1);
    expect(client.rows[0]).toMatchObject({
      id: "to-revert",
      reverted_at: "2026-06-29T02:00:00.000Z",
      reverted_by: "user-2",
      revert_reason: "Entered against wrong witness",
    });
    const active = await loadExtractedQuantityCorrectionsForRun(
      { jobId: "job-1", runId: "run-current" },
      client,
    );
    expect(active.corrections).toEqual([]);
  });
});

describe("effective extracted quantity authority", () => {
  it("applies corrections to current-run rows", async () => {
    const persistence = new InMemoryExtractedQuantityClient();
    persistence.rows = [toExtractedQuantityDbRow(q())].map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    }));
    const corrections = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction(), corrections);

    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      { persistence, corrections },
      {
        jobId: "job-1",
        enrichedRun: { run: { id: "run-current", started_at: timestamp }, enriched: null },
      },
    );

    expect(authority.source).toBe("persisted_current_run");
    expect(authority.correctionSource).toBe("corrections_applied");
    expect(authority.correctionCount).toBe(1);
    expect(authority.readModel?.rows[0]).toMatchObject({
      id: "opening-1",
      heightMm: 2100,
      status: "needs_review",
      correctionState: "corrected",
    });
  });

  it("does not apply corrections to stale rows", async () => {
    const persistence = new InMemoryExtractedQuantityClient();
    persistence.rows = [toExtractedQuantityDbRow(q())].map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    }));
    const corrections = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction({ runId: "run-old" }), corrections);

    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      { persistence, corrections },
      {
        jobId: "job-1",
        enrichedRun: { run: { id: "run-current", started_at: timestamp }, enriched: null },
      },
    );

    expect(authority.correctionCount).toBe(0);
    expect(authority.readModel?.rows[0]).toMatchObject({
      id: "opening-1",
      heightMm: null,
      correctionState: "uncorrected",
    });
  });

  it("preserves active-run selection semantics", async () => {
    const persistence = new InMemoryExtractedQuantityClient();
    persistence.rows = [
      toExtractedQuantityDbRow(q({ id: "old-row", runId: "run-old" })),
      toExtractedQuantityDbRow(q({ id: "current-row", runId: "run-current" })),
    ].map((row) => ({ ...row, created_at: timestamp, updated_at: timestamp, superseded_at: null }));

    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      { persistence, corrections: new InMemoryCorrectionClient() },
      {
        jobId: "job-1",
        enrichedRun: { run: { id: "run-current", started_at: timestamp }, enriched: null },
      },
    );

    expect(authority.readModel?.rows.map((row) => row.id)).toEqual(["current-row"]);
    expect(authority.readModel?.runIds).toEqual(["run-current"]);
  });

  it("does not silently mix runIds", async () => {
    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      {
        persistence: new InMemoryExtractedQuantityClient(),
        corrections: new InMemoryCorrectionClient(),
      },
      {
        jobId: "job-1",
        enrichedRun: {
          run: { id: "run-current", started_at: timestamp },
          enriched: enrichedWithQuantities([
            q({ id: "current-json", runId: "run-current" }),
            q({ id: "old-json", runId: "run-old" }),
          ]),
        },
      },
    );

    expect(authority.source).toBe("takeoff_json_fallback");
    expect(authority.readModel?.rows.map((row) => row.id)).toEqual(["current-json"]);
    expect(authority.readModel?.runIds).toEqual(["run-current"]);
  });

  it("falls back to takeoff_json only when current-run persisted rows are unavailable", async () => {
    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      {
        persistence: new InMemoryExtractedQuantityClient(),
        corrections: new InMemoryCorrectionClient(),
      },
      {
        jobId: "job-1",
        enrichedRun: {
          run: { id: "run-current", started_at: timestamp },
          enriched: enrichedWithQuantities([q({ id: "fresh-json", runId: "run-current" })]),
        },
      },
    );

    expect(authority.source).toBe("takeoff_json_fallback");
    expect(authority.readModel?.rows.map((row) => row.id)).toEqual(["fresh-json"]);
  });

  it("set_dimension correction changes effective value but does not promote status", async () => {
    const persistence = new InMemoryExtractedQuantityClient();
    persistence.rows = [toExtractedQuantityDbRow(q())].map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    }));
    const corrections = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction(), corrections);

    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      { persistence, corrections },
      {
        jobId: "job-1",
        enrichedRun: { run: { id: "run-current", started_at: timestamp }, enriched: null },
      },
    );

    expect(authority.readModel?.rows[0]).toMatchObject({
      heightMm: 2100,
      status: "needs_review",
    });
  });

  it("set_status correction explicitly changes effective status", async () => {
    const persistence = new InMemoryExtractedQuantityClient();
    persistence.rows = [toExtractedQuantityDbRow(q())].map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    }));
    const corrections = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(
      correction({
        id: "status-correction",
        action: "set_status",
        field: "status",
        before: "needs_review",
        after: "extracted",
      }),
      corrections,
    );

    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      { persistence, corrections },
      {
        jobId: "job-1",
        enrichedRun: { run: { id: "run-current", started_at: timestamp }, enriched: null },
      },
    );

    expect(authority.readModel?.rows[0]).toMatchObject({
      status: "extracted",
      correctedFields: ["status"],
    });
  });

  it("ignore_row correction excludes row from clean totals", async () => {
    const persistence = new InMemoryExtractedQuantityClient();
    persistence.rows = [
      toExtractedQuantityDbRow(q({ status: "extracted", heightMm: 1200, areaM2: 1.68 })),
    ].map((row) => ({ ...row, created_at: timestamp, updated_at: timestamp, superseded_at: null }));
    const corrections = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(
      correction({
        action: "ignore_row",
        field: "ignoreReason",
        before: "extracted",
        after: "duplicate",
      }),
      corrections,
    );

    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      { persistence, corrections },
      {
        jobId: "job-1",
        enrichedRun: { run: { id: "run-current", started_at: timestamp }, enriched: null },
      },
    );

    expect(authority.readModel?.groups.ignored.map((row) => row.id)).toEqual(["opening-1"]);
    expect(authority.readModel?.cleanTotals).toEqual({ count: 0, lengthMm: 0, areaM2: 0 });
  });

  it("keeps original row auditable", async () => {
    const persistence = new InMemoryExtractedQuantityClient();
    persistence.rows = [toExtractedQuantityDbRow(q())].map((row) => ({
      ...row,
      created_at: timestamp,
      updated_at: timestamp,
      superseded_at: null,
    }));
    const corrections = new InMemoryCorrectionClient();
    await insertExtractedQuantityCorrection(correction(), corrections);

    const authority = await resolveEffectiveExtractedQuantityAuthorityForRun(
      { persistence, corrections },
      {
        jobId: "job-1",
        enrichedRun: { run: { id: "run-current", started_at: timestamp }, enriched: null },
      },
    );

    expect(authority.readModel?.rows[0].original).toMatchObject({
      heightMm: null,
      status: "needs_review",
      warnings: ["height_not_extracted", "area_not_calculated"],
    });
  });

  it("does not read legacy stores as correction storage", () => {
    const source = sourceText();
    expect(source).not.toContain("quantity_overrides");
    expect(source).not.toContain("opening_schedule");
    expect(source).not.toContain("module_items");
    expect(source).not.toContain("visual_opening_corrections");
  });
});
