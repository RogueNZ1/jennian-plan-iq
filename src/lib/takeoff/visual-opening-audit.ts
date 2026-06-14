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
    const confidence = CONF.has(r.confidence as VisualOpeningConfidence)
      ? (r.confidence as VisualOpeningConfidence)
      : "low";
    return {
      id: cleanString(r.id) ?? `O${index + 1}`,
      type,
      room: cleanString(r.room),
      label: cleanString(r.label),
      height_m: num(r.height_m),
      width_m: num(r.width_m),
      x: clamp01(r.x),
      y: clamp01(r.y),
      confidence,
      evidence: cleanString(r.evidence) ?? "",
      flags: cleanFlags(r.flags),
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
