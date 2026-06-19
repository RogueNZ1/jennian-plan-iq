// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildOpeningScheduleProjectionRows,
  IQ_TAKEOFF_OPENING_SOURCE,
  projectEnrichedOpeningsToSchedule,
} from "../../src/lib/takeoff/opening-schedule-projection";
import type { Opening } from "../../src/lib/takeoff/takeoff-types";

const opening = (over: Partial<Opening>): Opening => ({
  type: "window",
  room: "Bed 1",
  height_m: 1.1,
  width_m: 0.8,
  glazed: true,
  cladding: null,
  area_m2: 0.88,
  source: "vision",
  confidence: "medium",
  ...over,
});

function mockClient(options?: {
  existingRows?: ReturnType<typeof buildOpeningScheduleProjectionRows>;
  insertErrors?: Array<{ message: string } | null>;
}) {
  const calls = {
    selects: [] as string[],
    deletes: [] as Array<Record<string, string>>,
    neqs: [] as Array<Record<string, string>>,
    inserts: [] as unknown[][],
  };
  let insertIndex = 0;
  const filter = <T>(result: T) => ({
    eq(columnA: string, valueA: string) {
      calls.deletes.push({ [columnA]: valueA });
      return {
        eq(columnB: string, valueB: string) {
          calls.deletes.push({ [columnB]: valueB });
          return {
            async neq(columnC: string, valueC: string) {
              calls.neqs.push({ [columnC]: valueC });
              return result;
            },
          };
        },
      };
    },
  });
  const client = {
    from(table: "opening_schedule") {
      expect(table).toBe("opening_schedule");
      return {
        select(columns: string) {
          calls.selects.push(columns);
          return filter({ data: options?.existingRows ?? [], error: null });
        },
        delete() {
          return filter({ error: null });
        },
        async insert(rows: unknown[]) {
          calls.inserts.push(rows);
          const error = options?.insertErrors?.[insertIndex++] ?? null;
          return { error };
        },
      };
    },
  };
  return { client, calls };
}

describe("opening schedule projection", () => {
  it("maps adjudicated canonical openings into review-table rows", () => {
    const rows = buildOpeningScheduleProjectionRows({
      jobId: "job-1",
      createdBy: "user-1",
      openings: [
        opening({ type: "window", room: "Bed 1", confidence: "medium" }),
        opening({ type: "sectional_door", room: "Garage", height_m: 2.1, width_m: 4.8 }),
        opening({ type: "entrance", room: "Entry", height_m: 2.1, width_m: 1 }),
      ],
    });

    expect(rows.map((r) => [r.opening_type, r.room_name, r.width_mm, r.height_mm])).toEqual([
      ["window", "Bed 1", 800, 1100],
      ["garage_door", "Garage", 4800, 2100],
      ["external_door", "Entry", 1000, 2100],
    ]);
    expect(rows.every((r) => r.source === IQ_TAKEOFF_OPENING_SOURCE)).toBe(true);
    expect(rows.every((r) => r.review_status === "review_required")).toBe(true);
    expect(rows[0].confidence).toBe("mid");
  });

  it("replaces only unconfirmed prior IQ projections before inserting current rows", async () => {
    const { client, calls } = mockClient();

    const result = await projectEnrichedOpeningsToSchedule(client, {
      jobId: "job-1",
      createdBy: "user-1",
      openings: [opening({ room: "Bed 1" })],
    });

    expect(result).toEqual({ written: true, inserted: 1, error: null });
    expect(calls.selects[0]).toContain("opening_type");
    expect(calls.deletes).toEqual([
      { job_id: "job-1" },
      { source: IQ_TAKEOFF_OPENING_SOURCE },
      { job_id: "job-1" },
      { source: IQ_TAKEOFF_OPENING_SOURCE },
    ]);
    expect(calls.neqs).toEqual([{ review_status: "confirmed" }, { review_status: "confirmed" }]);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toHaveLength(1);
  });

  it("restores previous unconfirmed IQ projection rows if inserting current rows fails", async () => {
    const previous = buildOpeningScheduleProjectionRows({
      jobId: "job-1",
      createdBy: "user-1",
      openings: [opening({ room: "Previous" })],
    });
    const { client, calls } = mockClient({
      existingRows: previous,
      insertErrors: [{ message: "insert failed" }, null],
    });

    const result = await projectEnrichedOpeningsToSchedule(client, {
      jobId: "job-1",
      createdBy: "user-1",
      openings: [opening({ room: "Current" })],
    });

    expect(result).toEqual({ written: false, inserted: 0, error: "insert failed" });
    expect(calls.inserts).toHaveLength(2);
    expect(calls.inserts[0]).toMatchObject([{ room_name: "Current" }]);
    expect(calls.inserts[1]).toEqual(previous);
  });
});
