import type { EnrichedTakeoff } from "./enriched-takeoff";
import type { OpeningEvidenceCandidate, OpeningEvidenceItem } from "./opening-evidence";

export type ExtractedQuantityCategory =
  | "exterior_perimeter"
  | "interior_door"
  | "exterior_door"
  | "garage_door"
  | "window"
  | "opening"
  | "wall_area"
  | "roof_area"
  | "other";

export type ExtractedQuantityStatus =
  | "extracted"
  | "needs_review"
  | "missing_evidence"
  | "conflict"
  | "ignored";

export type ExtractedQuantitySource =
  | "vector_geometry"
  | "pdf_text"
  | "floorplan_symbol"
  | "door_schedule"
  | "window_schedule"
  | "visual_detection"
  | "ai_check"
  | "human_correction"
  | "derived";

export type ExtractedQuantityEvidence = {
  sheetId?: string;
  page?: number;
  bbox?: [number, number, number, number];
  text?: string;
  scale?: string;
  witnessIds?: string[];
  sourceFileName?: string;
};

export type ExtractedQuantityWarning =
  | "height_not_extracted"
  | "width_not_extracted"
  | "area_not_calculated"
  | "assumed_height_rejected"
  | "visual_marker_missing"
  | "ai_check_missing"
  | "ai_check_conflict"
  | "possible_duplicate"
  | "possible_false_positive"
  | "possible_missing_item"
  | "stale_rerun_projection"
  | "source_conflict";

export type ExtractedQuantity = {
  id: string;
  jobId: string;
  runId?: string;
  category: ExtractedQuantityCategory;
  label?: string;
  count?: number;
  widthMm?: number | null;
  heightMm?: number | null;
  lengthMm?: number | null;
  areaM2?: number | null;
  source: ExtractedQuantitySource;
  evidence: ExtractedQuantityEvidence[];
  status: ExtractedQuantityStatus;
  confidence: number;
  warnings: ExtractedQuantityWarning[];
  createdAt: string;
  updatedAt: string;
};

export type ExtractedQuantityLedgerInput = {
  enriched: EnrichedTakeoff;
  jobId?: string;
  runId?: string;
  now?: string;
};

type DoorCountsAuto = NonNullable<EnrichedTakeoff["door_counts_auto"]>;

function confidenceScore(confidence: "high" | "mid" | "medium" | "low" | null | undefined) {
  if (confidence === "high") return 95;
  if (confidence === "mid" || confidence === "medium") return 70;
  if (confidence === "low") return 35;
  return 50;
}

function evidenceText(item: OpeningEvidenceItem): string {
  const bits = [
    item.source,
    item.role,
    item.width_m != null ? `width ${Math.round(item.width_m * 1000)}mm` : null,
    item.height_m != null ? `height ${Math.round(item.height_m * 1000)}mm` : null,
    item.area_m2 != null ? `area ${item.area_m2}m2` : null,
    item.room ? `near ${item.room}` : null,
    item.wall_face_id ? `wall ${item.wall_face_id}` : null,
    item.note ?? null,
  ].filter(Boolean);
  return bits.join("; ");
}

function evidenceRefs(candidate: OpeningEvidenceCandidate): ExtractedQuantityEvidence[] {
  const evidence = candidate.evidence.map((item) => ({
    text: evidenceText(item),
    witnessIds: item.wall_face_id ? [item.wall_face_id] : undefined,
  }));
  return evidence.length ? evidence : [{ text: `Opening evidence ${candidate.id}` }];
}

function hasAssumedHeight(candidate: OpeningEvidenceCandidate): boolean {
  return (
    candidate.evidence.some((item) => item.source === "asserted" && item.role === "height") ||
    candidate.review_flags.some((flag) => /height assumed|assumed standard/i.test(flag))
  );
}

function openingWarnings(candidate: OpeningEvidenceCandidate): ExtractedQuantityWarning[] {
  const warnings = new Set<ExtractedQuantityWarning>();
  if (candidate.width_m == null) warnings.add("width_not_extracted");
  if (candidate.height_m == null) warnings.add("height_not_extracted");
  if (hasAssumedHeight(candidate)) warnings.add("assumed_height_rejected");
  if (openingArea(candidate) == null) warnings.add("area_not_calculated");
  if (candidate.conflicts.length > 0) warnings.add("source_conflict");
  return [...warnings];
}

function openingStatus(candidate: OpeningEvidenceCandidate): ExtractedQuantityStatus {
  if (candidate.width_m == null || candidate.height_m == null) return "missing_evidence";
  if (hasAssumedHeight(candidate)) return "needs_review";
  if (candidate.conflicts.length > 0 || candidate.status === "conflict") return "conflict";
  if (!candidate.priced || candidate.status !== "priced") return "needs_review";
  return "extracted";
}

function openingArea(candidate: OpeningEvidenceCandidate): number | null {
  if (openingStatus(candidate) !== "extracted") return null;
  if (candidate.width_m == null || candidate.height_m == null) return null;
  return candidate.area_m2 ?? Math.round(candidate.width_m * candidate.height_m * 100) / 100;
}

function openingCategory(candidate: OpeningEvidenceCandidate): ExtractedQuantityCategory {
  if (candidate.type === "sectional_door") return "garage_door";
  if (candidate.type === "pa_door" || candidate.type === "entrance") return "exterior_door";
  if (
    candidate.type === "window" ||
    candidate.type === "slider" ||
    candidate.type === "garage_window"
  ) {
    return "window";
  }
  return "opening";
}

function openingSource(candidate: OpeningEvidenceCandidate): ExtractedQuantitySource {
  const source = candidate.evidence[0]?.source;
  if (source === "floorplan_gap") return "vector_geometry";
  if (source === "floorplan_text") return "pdf_text";
  if (source === "schedule") return "window_schedule";
  if (source === "vision") return "visual_detection";
  if (source === "manual") return "human_correction";
  return "floorplan_symbol";
}

function openingConfidence(candidate: OpeningEvidenceCandidate): number {
  const scores = candidate.evidence.map((item) => confidenceScore(item.confidence));
  return scores.length ? Math.min(...scores) : 50;
}

function doorRows(args: {
  counts: DoorCountsAuto;
  jobId: string;
  runId?: string;
  timestamp: string;
}): ExtractedQuantity[] {
  const rows: Array<[string, string, number]> = [
    ["interior-door-standard", "Interior doors - standard", args.counts.singles],
    ["interior-door-double", "Interior doors - double", args.counts.doubles],
    ["interior-door-cavity", "Interior doors - cavity sliders", args.counts.cavitySliders],
    ["interior-door-barn", "Interior doors - barn sliders", args.counts.barn],
  ];
  return rows
    .filter(([, , count]) => count > 0)
    .map(([id, label, count]) => ({
      id,
      jobId: args.jobId,
      ...(args.runId ? { runId: args.runId } : {}),
      category: "interior_door",
      label,
      count,
      areaM2: null,
      source: "vector_geometry",
      evidence: [{ text: "deterministic interior-door engine confirmed count" }],
      status: "extracted",
      confidence: 95,
      warnings: [],
      createdAt: args.timestamp,
      updatedAt: args.timestamp,
    }));
}

export function buildExtractedQuantityLedger(
  input: ExtractedQuantityLedgerInput,
): ExtractedQuantity[] {
  const { enriched } = input;
  const jobId = input.jobId ?? "unpersisted";
  const timestamp = input.now ?? "1970-01-01T00:00:00.000Z";
  const run = input.runId ? { runId: input.runId } : {};
  const rows: ExtractedQuantity[] = [];
  const perimeter = enriched.external_wall_lm.value;

  rows.push({
    id: "external-perimeter",
    jobId,
    ...run,
    category: "exterior_perimeter",
    label: "Exterior perimeter",
    count: 1,
    lengthMm: perimeter == null ? null : Math.round(perimeter * 1000),
    areaM2: null,
    source: "vector_geometry",
    evidence: [{ text: "EnrichedTakeoff.external_wall_lm" }],
    status: perimeter == null ? "missing_evidence" : "extracted",
    confidence: confidenceScore(enriched.external_wall_lm.confidence),
    warnings: perimeter == null ? ["source_conflict"] : [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (enriched.door_counts_auto) {
    rows.push(
      ...doorRows({
        counts: enriched.door_counts_auto,
        jobId,
        runId: input.runId,
        timestamp,
      }),
    );
  }

  for (const candidate of enriched.opening_evidence ?? []) {
    const status = openingStatus(candidate);
    rows.push({
      id: `opening-${candidate.id}`,
      jobId,
      ...run,
      category: openingCategory(candidate),
      label: `Opening ${candidate.id}${candidate.room ? ` - ${candidate.room}` : ""}`,
      count: 1,
      widthMm: candidate.width_m == null ? null : Math.round(candidate.width_m * 1000),
      heightMm:
        candidate.height_m == null || hasAssumedHeight(candidate)
          ? null
          : Math.round(candidate.height_m * 1000),
      areaM2: openingArea(candidate),
      source: openingSource(candidate),
      evidence: evidenceRefs(candidate),
      status,
      confidence: openingConfidence(candidate),
      warnings: openingWarnings(candidate),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return rows;
}
