import { expect } from "vitest";

// Aggregate opening-area gates are intentionally materiality-level only, not per-opening tests.
// 0.5m2 is tight enough to catch a missing small opening without treating normal
// worksheet/extraction noise as a product failure. Row identity still has to be
// proven separately; this rail must never hide unsupported candidates.
export const GOLDEN_AGGREGATE_OPENING_AREA_TOLERANCE_M2 = 0.5;

export function expectGoldenAggregateAreaClose(
  label: string,
  got: number | null | undefined,
  witness: number,
  toleranceM2: number = GOLDEN_AGGREGATE_OPENING_AREA_TOLERANCE_M2,
) {
  expect(got, `${label} should be computed`).not.toBeNull();
  expect(got, `${label} should be computed`).not.toBeUndefined();
  if (got == null) return;

  expect(Math.abs(got - witness), `${label} aggregate delta`).toBeLessThanOrEqual(toleranceM2);
}
