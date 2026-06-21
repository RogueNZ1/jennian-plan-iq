export type GarageDoorSizeM = {
  a: number;
  b: number;
};

function toMetres(value: number): number {
  return value > 20 ? value / 1000 : value;
}

function formatMetres(value: number): string {
  return String(Number(value.toFixed(3)));
}

export function parseGarageDoorSizeM(label: string | null | undefined): GarageDoorSizeM | null {
  if (!label) return null;
  const matches = label.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const rawA = Number(matches[0]);
  const rawB = Number(matches[1]);
  if (!Number.isFinite(rawA) || !Number.isFinite(rawB)) return null;

  return { a: toMetres(rawA), b: toMetres(rawB) };
}

export function normaliseGarageDoorSizeLabel(label: string | null | undefined): string | null {
  const size = parseGarageDoorSizeM(label);
  return size ? `${formatMetres(size.a)}x${formatMetres(size.b)}` : (label ?? null);
}
