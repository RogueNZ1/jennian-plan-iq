// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX } from "../opening-review-guards";

const mockState = vi.hoisted(() => ({
  openingRows: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table !== "opening_schedule") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select() {
          return {
            eq(_column: string, id: string) {
              return {
                async maybeSingle() {
                  return { data: mockState.openingRows.get(id) ?? null, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              mockState.updates.push({ id, patch });
              return { error: null };
            },
          };
        },
      };
    },
  },
}));

describe("blocked opening measurement guards", () => {
  beforeEach(() => {
    mockState.openingRows.clear();
    mockState.updates.length = 0;
    mockState.openingRows.set("blocked-opening", {
      job_id: "job-1",
      review_status: "review_required",
      source_evidence: `${BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX} (candidate-1)`,
      notes: null,
    });
  });

  it("refuses to confirm review-only blocked opening rows", async () => {
    const { updateOpening } = await import("../iq-measurements");

    await expect(updateOpening("blocked-opening", { review_status: "confirmed" })).rejects.toThrow(
      "cannot be confirmed",
    );
    expect(mockState.updates).toHaveLength(0);
  });

  it("refuses to push review-only blocked opening rows to modules", async () => {
    const { pushMeasurementToModule } = await import("../iq-measurements");

    await expect(
      pushMeasurementToModule({
        jobId: "job-1",
        moduleId: "iq-core",
        label: "Blocked opening",
        unit: "qty",
        value: 1,
        createdBy: "user-1",
        openingId: "blocked-opening",
      }),
    ).rejects.toThrow("cannot be pushed");
  });
});
