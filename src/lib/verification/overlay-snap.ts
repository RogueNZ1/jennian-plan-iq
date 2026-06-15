export type SnapPoint = { x: number; y: number; snapped: boolean };

export type SnapOptions = {
  radius?: number;
  minRun?: number;
  stride?: number;
  maxRun?: number;
};

function luminance(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
}

function isPlanInk(data: Uint8ClampedArray, width: number, x: number, y: number): boolean {
  const i = (y * width + x) * 4;
  if (data[i + 3] < 40) return false;
  return luminance(data, width, x, y) < 135;
}

function runLength(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  max = 34,
): number {
  let count = 1;
  for (const dir of [-1, 1]) {
    for (let step = 1; step <= max; step++) {
      const nx = x + dx * step * dir;
      const ny = y + dy * step * dir;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) break;
      if (!isPlanInk(data, width, nx, ny)) break;
      count++;
    }
  }
  return count;
}

export function snapPointToPlanInk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  options: SnapOptions = {},
): SnapPoint {
  const radius = options.radius ?? Math.max(70, Math.min(width, height) * 0.055);
  const minRun = options.minRun ?? 10;
  const stride = options.stride ?? 2;
  const maxRun = options.maxRun ?? 100;
  const cx = Math.round(x);
  const cy = Math.round(y);
  let best: { x: number; y: number; score: number; run: number } | null = null;

  for (let yy = Math.max(0, cy - radius); yy <= Math.min(height - 1, cy + radius); yy += stride) {
    for (let xx = Math.max(0, cx - radius); xx <= Math.min(width - 1, cx + radius); xx += stride) {
      if (!isPlanInk(data, width, xx, yy)) continue;
      const dist = Math.hypot(xx - x, yy - y);
      if (dist > radius) continue;
      const horizontalRun = runLength(data, width, height, xx, yy, 1, 0, maxRun);
      const verticalRun = runLength(data, width, height, xx, yy, 0, 1, maxRun);
      const run = Math.max(horizontalRun, verticalRun);
      if (run < minRun) continue;
      const score = run * 2 - dist * 0.12;
      if (!best || score > best.score) best = { x: xx, y: yy, score, run };
    }
  }

  if (!best) return { x, y, snapped: false };
  return { x: best.x, y: best.y, snapped: true };
}
