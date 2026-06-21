import { expect } from "vitest";

// Business/product rail for signed golden-job witnesses.
// This is an aggregate area tolerance, not a per-opening matching tolerance.
export const GOLDEN_AGGREGATE_OPENING_AREA_TOLERANCE_M2 = 2;

export function expectGoldenAggregateAreaClose(
  label: string,
  got: number | null | undefined,
  witness: number,
) {
  expect(got, `${label} should be computed`).not.toBeNull();
  expect(got, `${label} should be computed`).not.toBeUndefined();
  if (got == null) return;

  expect(Math.abs(got - witness), `${label} aggregate delta`).toBeLessThanOrEqual(
    GOLDEN_AGGREGATE_OPENING_AREA_TOLERANCE_M2,
  );
}
