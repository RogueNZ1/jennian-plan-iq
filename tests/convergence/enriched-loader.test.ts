// @vitest-environment node
/**
 * Phase 1 (export faithfulness) — loadEnrichedTakeoffJson run-row selection.
 *
 * Root-cause guard: the loader previously took ONLY the single latest takeoff_runs row.
 * One failed/incomplete re-run (takeoff_json null) after a good run silently flipped the
 * entire export onto the relational fallback — on enriched-only jobs that meant an empty
 * garage block and canonical-only openings (e.g. a lounge slider) vanishing from the grid.
 * The loader must now return the most recent run that actually CARRIES a takeoff_json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rowsHolder: { rows: Array<Record<string, unknown>>; error: unknown } = {
  rows: [],
  error: null,
};

// NOTE: relative specifier, not "@/..." — vite-tsconfig-paths only applies the alias to
// files inside tsconfig's include (src/**), and this test lives under tests/.
vi.mock("../../src/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockImplementation((n: number) =>
                Promise.resolve(
                  rowsHolder.error
                    ? { data: null, error: rowsHolder.error }
                    : { data: rowsHolder.rows.slice(0, n), error: null },
                ),
              ),
          }),
        }),
      }),
    })),
  },
}));

import { loadEnrichedTakeoffJson } from "../../src/lib/iq-qs-export";

const GOOD_JSON = { floor_area_m2: { value: 100 }, openings: [{ type: "slider" }] };
const OLDER_JSON = { floor_area_m2: { value: 99 }, openings: [] };

beforeEach(() => {
  rowsHolder.rows = [];
  rowsHolder.error = null;
});

describe("loadEnrichedTakeoffJson — run selection", () => {
  it("skips a latest FAILED run (null payload) and returns the previous run's takeoff_json", async () => {
    rowsHolder.rows = [
      { started_at: "2026-06-09T10:00:00Z", takeoff_json: null }, // failed re-run
      { started_at: "2026-06-08T10:00:00Z", takeoff_json: GOOD_JSON }, // the real data
    ];
    const out = await loadEnrichedTakeoffJson("job-jm0020");
    expect(out).toEqual(GOOD_JSON);
  });

  it("returns the MOST RECENT payload when several rows carry one", async () => {
    rowsHolder.rows = [
      { started_at: "2026-06-09T10:00:00Z", takeoff_json: GOOD_JSON },
      { started_at: "2026-06-08T10:00:00Z", takeoff_json: OLDER_JSON },
    ];
    const out = await loadEnrichedTakeoffJson("job-jm0020");
    expect(out).toEqual(GOOD_JSON);
  });

  it("returns null when no row carries a payload (pre-migration / never-converged job)", async () => {
    rowsHolder.rows = [
      { started_at: "2026-06-09T10:00:00Z", takeoff_json: null },
      { started_at: "2026-06-08T10:00:00Z" }, // column absent entirely
    ];
    expect(await loadEnrichedTakeoffJson("job-legacy")).toBeNull();
  });

  it("returns null on no rows at all", async () => {
    expect(await loadEnrichedTakeoffJson("job-empty")).toBeNull();
  });

  it("non-object payloads are skipped, not returned", async () => {
    rowsHolder.rows = [
      { started_at: "2026-06-09T10:00:00Z", takeoff_json: "corrupt-string" },
      { started_at: "2026-06-08T10:00:00Z", takeoff_json: GOOD_JSON },
    ];
    expect(await loadEnrichedTakeoffJson("job-x")).toEqual(GOOD_JSON);
  });
});
