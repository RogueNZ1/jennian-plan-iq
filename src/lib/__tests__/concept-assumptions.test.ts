import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase before importing module under test
const mockInsert = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mockInsert })),
  },
}));

import { applyConceptAssumptions } from "../takeoff/concept-assumptions";

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
});

describe("applyConceptAssumptions — confidence formula", () => {
  it("returns 100 when all labels already exist (no inserts needed)", async () => {
    // Simulate: all 19 standard labels already extracted
    const { applyConceptAssumptions: fn } = await import("../takeoff/concept-assumptions");
    // Build a set with enough labels to cover every spec
    const existingLabels = new Set([
      "Window — Bed 1 (assumed)",
      "Window — Bed 2 (assumed)",
      "Window — Bed 3 (assumed)",
      "Window — Bathroom (assumed)",
      "Window — Living (assumed)",
      "Door — Entry (assumed)",
      "Door — Passage (assumed)",
      "Door — WC / Laundry (assumed)",
      "Foundation — Raft slab (assumed)",
      "Insulation — Floor (assumed)",
      "Insulation — Ceiling (assumed)",
      "Electrical — Standard allowance (assumed)",
      "Plumbing — Hot water cylinder (assumed)",
      "Plumbing — Shower (assumed)",
      "Plumbing — Bath (assumed)",
      "Plumbing — WC (assumed)",
      "Roofing — Coverage area (assumed)",
      "Roofing — Ridge length (assumed)",
      "Roofing — Eaves (assumed)",
      "Cladding area (assumed)",
    ]);
    const result = await fn({ jobId: "j1", runId: "r1", floorAreaM2: 120, existingLabels });
    expect(result.confidenceScore).toBe(100);
    expect(result.inserted).toBe(0);
  });

  it("returns 0 confidence when no items extracted and all assumed", async () => {
    const result = await applyConceptAssumptions({
      jobId: "j1", runId: "r1", floorAreaM2: 120, existingLabels: new Set(),
    });
    // 0 extracted / (0 + 20) = 0%
    expect(result.confidenceScore).toBe(0);
  });

  it("scores correctly with partial extraction", async () => {
    // 10 labels already extracted, 10 will be assumed → 10/(10+10) = 50%
    const existingLabels = new Set([
      "Window — Bed 1 (assumed)",
      "Window — Bed 2 (assumed)",
      "Window — Bed 3 (assumed)",
      "Window — Bathroom (assumed)",
      "Window — Living (assumed)",
      "Door — Entry (assumed)",
      "Door — Passage (assumed)",
      "Door — WC / Laundry (assumed)",
      "Foundation — Raft slab (assumed)",
      "Insulation — Floor (assumed)",
    ]);
    const result = await applyConceptAssumptions({
      jobId: "j2", runId: "r2", floorAreaM2: 150, existingLabels,
    });
    expect(result.confidenceScore).toBe(50);
    expect(result.inserted).toBe(10);
    expect(result.skipped).toBe(10);
  });
});

describe("applyConceptAssumptions — skip-if-existing", () => {
  it("does not insert rows whose labels are already in existingLabels", async () => {
    const existingLabels = new Set([
      "Window — Bed 1 (assumed)",
      "Door — Entry (assumed)",
    ]);
    await applyConceptAssumptions({
      jobId: "j3", runId: "r3", floorAreaM2: 100, existingLabels,
    });
    const insertedRows: Array<{ label: string }> = mockInsert.mock.calls[0]?.[0] ?? [];
    const insertedLabels = insertedRows.map((r) => r.label);
    expect(insertedLabels).not.toContain("Window — Bed 1 (assumed)");
    expect(insertedLabels).not.toContain("Door — Entry (assumed)");
  });

  it("all inserted rows have value_source=assumed and review_status=review_required", async () => {
    await applyConceptAssumptions({
      jobId: "j4", runId: "r4", floorAreaM2: 100, existingLabels: new Set(),
    });
    const rows: Array<{ value_source: string; review_status: string }> = mockInsert.mock.calls[0]?.[0] ?? [];
    rows.forEach((r) => {
      expect(r.value_source).toBe("assumed");
      expect(r.review_status).toBe("review_required");
    });
  });
});

describe("applyConceptAssumptions — error handling", () => {
  it("returns inserted=0 and confidenceScore=0 when Supabase insert fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "DB error" } });
    const result = await applyConceptAssumptions({
      jobId: "j5", runId: "r5", floorAreaM2: 100, existingLabels: new Set(),
    });
    expect(result.inserted).toBe(0);
    expect(result.confidenceScore).toBe(0);
  });

  it("still returns skipped count on insert error", async () => {
    mockInsert.mockResolvedValue({ error: { message: "DB error" } });
    const existingLabels = new Set(["Window — Bed 1 (assumed)"]);
    const result = await applyConceptAssumptions({
      jobId: "j6", runId: "r6", floorAreaM2: 100, existingLabels,
    });
    expect(result.skipped).toBe(1);
  });
});

describe("applyConceptAssumptions — floor area defaults", () => {
  it("uses 120m² default when floorAreaM2 is null", async () => {
    await applyConceptAssumptions({
      jobId: "j7", runId: "r7", floorAreaM2: null, existingLabels: new Set(),
    });
    const rows: Array<{ label: string; extracted_value: string }> = mockInsert.mock.calls[0]?.[0] ?? [];
    const foundation = rows.find((r) => r.label === "Foundation — Raft slab (assumed)");
    // 120 * 0.13 = 15.6 → Math.round = 16
    expect(foundation?.extracted_value).toBe("16");
  });
});
