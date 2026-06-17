export type VisualOpeningType =
  | "window"
  | "slider"
  | "external_door"
  | "garage_door"
  | "garage_window"
  | "pa_door"
  | "uncertain";

export type VisualOpeningConfidence = "high" | "medium" | "low";

export type VisualOpeningAuditItem = {
  id: string;
  type: VisualOpeningType;
  room: string | null;
  label: string | null;
  height_m: number | null;
  width_m: number | null;
  /** Approximate centre of the opening on the rendered floor-plan image, 0..1. */
  x: number;
  y: number;
  confidence: VisualOpeningConfidence;
  evidence: string;
  flags: string[];
};

export type VisualOpeningAuditSummary = {
  totalOpenings: number;
  qsGlazedOpenings: number;
  garageDoors: number;
  uncertain: number;
};

export type VisualOpeningAudit = {
  pageNumber: number | null;
  method: "visual_qs";
  openings: VisualOpeningAuditItem[];
  warnings: string[];
  summary: VisualOpeningAuditSummary;
};

const TYPES = new Set<VisualOpeningType>([
  "window",
  "slider",
  "external_door",
  "garage_door",
  "garage_window",
  "pa_door",
  "uncertain",
]);
const CONF = new Set<VisualOpeningConfidence>(["high", "medium", "low"]);

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clamp01(v: unknown): number {
  const n = num(v);
  if (n == null) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function cleanFlags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(cleanString).filter((s): s is string => !!s);
}

function uniqueFlags(flags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const flag of flags) {
    const key = flag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(flag);
  }
  return out;
}

function markerPositionIsUnconfirmed(evidence: string, flags: readonly string[]): boolean {
  const text = [evidence, ...flags].join(" ").toLowerCase();
  return /\b(marker|position|coordinate|point)\b/.test(text) &&
    /\b(approx|approximate|uncertain|not confirmed|not on physical|near label|beside label|room centre|room center|schedule|table)\b/.test(
      text,
    )
    ? true
    : false;
}

function parseMm(v: string): number | null {
  const n = Number(v.replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function dimensionLabelLooksMalformed(label: string | null): boolean {
  if (!label) return false;
  const compact = label.replace(/\s+/g, "");
  if (!/[xX×*]/.test(compact)) return false;
  if (/\d[\d,]{2,5}[xX×*]\d{6,}/.test(compact)) return true;

  const numbers = compact.match(/\d[\d,]{2,}/g) ?? [];
  if (numbers.length > 2) return true;

  const pair = compact.match(/(\d[\d,]{1,5})[xX×*](\d[\d,]{1,5})/);
  if (!pair) return true;

  const first = parseMm(pair[1]);
  const second = parseMm(pair[2]);
  if (first == null || second == null) return true;

  return first < 300 || second < 300 || first > 6000 || second > 6000;
}

function hasConfirmingDimensionSource(evidence: string, flags: readonly string[]): boolean {
  const text = [evidence, ...flags].join(" ").toLowerCase();
  return /\b(elevation|schedule|manual|measured|confirmed|cross[- ]?check)\b/.test(text);
}

function hasAssumedDimensionSource(evidence: string, flags: readonly string[]): boolean {
  const text = [evidence, ...flags].join(" ").toLowerCase();
  return /\b(assumed|standard)\b/.test(text);
}

export function summariseVisualOpeningAudit(
  openings: readonly VisualOpeningAuditItem[],
): VisualOpeningAuditSummary {
  return {
    totalOpenings: openings.length,
    qsGlazedOpenings: openings.filter((o) => o.type !== "garage_door").length,
    garageDoors: openings.filter((o) => o.type === "garage_door").length,
    uncertain: openings.filter((o) => o.type === "uncertain" || o.confidence === "low").length,
  };
}

export function normaliseVisualOpeningAudit(
  raw: unknown,
  pageNumber: number | null = null,
): VisualOpeningAudit {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawOpenings = Array.isArray(source.openings) ? source.openings : [];
  const openings: VisualOpeningAuditItem[] = rawOpenings.map((item, index) => {
    const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const type = TYPES.has(r.type as VisualOpeningType)
      ? (r.type as VisualOpeningType)
      : "uncertain";
    const rawConfidence = CONF.has(r.confidence as VisualOpeningConfidence)
      ? (r.confidence as VisualOpeningConfidence)
      : "low";
    const evidence = cleanString(r.evidence) ?? "";
    const flags = cleanFlags(r.flags);
    const markerUnconfirmed = markerPositionIsUnconfirmed(evidence, flags);
    const label = cleanString(r.label);
    const malformedLabel = dimensionLabelLooksMalformed(label);
    const hasConfirmedSource = hasConfirmingDimensionSource(evidence, flags);
    const hasAssumedSource = hasAssumedDimensionSource(evidence, flags);
    const unresolvedMalformedLabel = malformedLabel && !hasConfirmedSource;
    const hasUsableFallback = hasConfirmedSource || hasAssumedSource;
    const confidence = markerUnconfirmed || unresolvedMalformedLabel ? "low" : rawConfidence;
    const height = malformedLabel && !hasUsableFallback ? null : num(r.height_m);
    const width = malformedLabel && !hasUsableFallback ? null : num(r.width_m);
    return {
      id: cleanString(r.id) ?? `O${index + 1}`,
      type,
      room: cleanString(r.room),
      label,
      height_m: height,
      width_m: width,
      x: clamp01(r.x),
      y: clamp01(r.y),
      confidence,
      evidence,
      flags: uniqueFlags([
        ...flags,
        ...(markerUnconfirmed ? ["marker not confirmed on physical opening"] : []),
        ...(unresolvedMalformedLabel
          ? ["malformed dimension label - verify against elevations/schedule"]
          : []),
      ]),
    };
  });

  return {
    pageNumber: num(source.pageNumber) ?? pageNumber,
    method: "visual_qs",
    openings,
    warnings: cleanFlags(source.warnings),
    summary: summariseVisualOpeningAudit(openings),
  };
}
