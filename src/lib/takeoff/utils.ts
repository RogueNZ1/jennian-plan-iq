/** Round to 2 decimal places; passes null through unchanged. */
export function round2(n: number | null): number | null {
  return n !== null ? Math.round(n * 100) / 100 : null;
}
