import type { Opening, OpeningType } from "./takeoff-types";
import type { OpeningEvidenceCandidate } from "./opening-evidence";
import {
  BLOCKED_OPENING_REVIEW_ONLY_NOTE,
  BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX,
} from "../opening-review-guards";

type OpeningScheduleInsert = {
  job_id: string;
  file_id: string | null;
  plan_page_number: number;
  opening_type: string;
  width_mm: number;
  height_mm: number | null;
  room_name: string | null;
  quantity: number;
  source: string;
  source_evidence: string | null;
  confidence: string;
  review_status: string;
  notes: string | null;
  created_by: string;
};

type ProjectionError = { message: string } | null;
type ProjectionFilter<T> = {
  eq(
    column: string,
    value: string,
  ): {
    eq(
      column: string,
      value: string,
    ): {
      neq(column: string, value: string): PromiseLike<T>;
    };
  };
};

export interface OpeningScheduleProjectionClient {
  from(table: "opening_schedule"): {
    select(
      columns: string,
    ): ProjectionFilter<{ data: OpeningScheduleInsert[] | null; error: ProjectionError }>;
    delete(): ProjectionFilter<{ error: ProjectionError }>;
    insert(rows: OpeningScheduleInsert[]): PromiseLike<{ error: ProjectionError }>;
  };
}

export type OpeningScheduleProjectionResult = {
  written: boolean;
  inserted: number;
  error: string | null;
};

export const IQ_TAKEOFF_OPENING_SOURCE = "IQ Takeoff";

function openingTypeForSchedule(type: OpeningType): string {
  switch (type) {
    case "sectional_door":
      return "garage_door";
    case "pa_door":
    case "entrance":
      return "external_door";
    case "garage_window":
      return "window";
    default:
      return type;
  }
}

function evidenceTypeForSchedule(type: OpeningEvidenceCandidate["type"]): string | null {
  if (!type || type === "unknown") return null;
  return openingTypeForSchedule(type);
}

function confidenceForSchedule(confidence: Opening["confidence"]): string {
  return confidence === "medium" ? "mid" : confidence;
}

export function openingToScheduleInsert(args: {
  jobId: string;
  createdBy: string;
  opening: Opening;
}): OpeningScheduleInsert | null {
  const widthMm = Math.round(args.opening.width_m * 1000);
  const heightMm = Math.round(args.opening.height_m * 1000);
  if (!Number.isFinite(widthMm) || widthMm <= 0) return null;
  if (!Number.isFinite(heightMm) || heightMm <= 0) return null;

  return {
    job_id: args.jobId,
    file_id: null,
    plan_page_number: 1,
    opening_type: openingTypeForSchedule(args.opening.type),
    width_mm: widthMm,
    height_mm: heightMm,
    room_name: args.opening.room,
    quantity: 1,
    source: IQ_TAKEOFF_OPENING_SOURCE,
    source_evidence: `${args.opening.source} canonical opening (${args.opening.type})`,
    confidence: confidenceForSchedule(args.opening.confidence),
    review_status: "review_required",
    notes: (args.opening.flags ?? []).join(" | ") || null,
    created_by: args.createdBy,
  };
}

export function buildOpeningScheduleProjectionRows(args: {
  jobId: string;
  createdBy: string;
  openings: readonly Opening[] | null | undefined;
  openingEvidence?: readonly OpeningEvidenceCandidate[] | null | undefined;
  pricingBlocked?: boolean;
}): OpeningScheduleInsert[] {
  if (args.pricingBlocked) {
    return (args.openingEvidence ?? [])
      .map((candidate) => evidenceCandidateToScheduleInsert({ ...args, candidate }))
      .filter((row): row is OpeningScheduleInsert => row != null);
  }

  const openingRows = (args.openings ?? [])
    .map((opening) => openingToScheduleInsert({ ...args, opening }))
    .filter((row): row is OpeningScheduleInsert => row != null);
  return openingRows;
}

function evidenceCandidateToScheduleInsert(args: {
  jobId: string;
  createdBy: string;
  candidate: OpeningEvidenceCandidate;
}): OpeningScheduleInsert | null {
  const type = evidenceTypeForSchedule(args.candidate.type);
  if (!type) return null;
  const widthMm = Math.round((args.candidate.width_m ?? 0) * 1000);
  const heightMm = Math.round((args.candidate.height_m ?? 0) * 1000);
  if (!Number.isFinite(widthMm) || widthMm <= 0) return null;
  if (!Number.isFinite(heightMm) || heightMm <= 0) return null;
  const evidence = args.candidate.evidence
    .map((item) => item.note ?? `${item.source} ${item.role}`)
    .filter((note) => note.trim() !== "")
    .slice(0, 2)
    .join(" | ");
  const status = args.candidate.priced ? "priced before global block" : "not priced";
  const conflicts = args.candidate.conflicts.length
    ? `Conflicts: ${args.candidate.conflicts.join(", ")}`
    : null;
  const notes = [
    BLOCKED_OPENING_REVIEW_ONLY_NOTE,
    `Candidate ${args.candidate.id}: ${status}.`,
    ...args.candidate.review_flags,
    evidence,
    conflicts,
  ]
    .filter((line): line is string => !!line && line.trim() !== "")
    .join(" | ");

  return {
    job_id: args.jobId,
    file_id: null,
    plan_page_number: 1,
    opening_type: type,
    width_mm: widthMm,
    height_mm: heightMm,
    room_name: args.candidate.room ?? null,
    quantity: 1,
    source: IQ_TAKEOFF_OPENING_SOURCE,
    source_evidence: `${BLOCKED_OPENING_SOURCE_EVIDENCE_PREFIX} (${args.candidate.id})`,
    confidence: "low",
    review_status: "review_required",
    notes,
    created_by: args.createdBy,
  };
}

export async function projectEnrichedOpeningsToSchedule(
  client: OpeningScheduleProjectionClient,
  args: {
    jobId: string;
    createdBy: string;
    openings: readonly Opening[] | null | undefined;
    openingEvidence?: readonly OpeningEvidenceCandidate[] | null | undefined;
    pricingBlocked?: boolean;
  },
): Promise<OpeningScheduleProjectionResult> {
  const rows = buildOpeningScheduleProjectionRows(args);
  const projectionColumns = [
    "job_id",
    "file_id",
    "plan_page_number",
    "opening_type",
    "width_mm",
    "height_mm",
    "room_name",
    "quantity",
    "source",
    "source_evidence",
    "confidence",
    "review_status",
    "notes",
    "created_by",
  ].join(",");

  try {
    const existingResult = await client
      .from("opening_schedule")
      .select(projectionColumns)
      .eq("job_id", args.jobId)
      .eq("source", IQ_TAKEOFF_OPENING_SOURCE)
      .neq("review_status", "confirmed");
    if (existingResult.error) {
      return { written: false, inserted: 0, error: existingResult.error.message };
    }
    const existingRows = existingResult.data ?? [];

    const deleteResult = await client
      .from("opening_schedule")
      .delete()
      .eq("job_id", args.jobId)
      .eq("source", IQ_TAKEOFF_OPENING_SOURCE)
      .neq("review_status", "confirmed");
    if (deleteResult.error) {
      return { written: false, inserted: 0, error: deleteResult.error.message };
    }

    if (rows.length === 0) return { written: true, inserted: 0, error: null };

    const insertResult = await client.from("opening_schedule").insert(rows);
    if (insertResult.error) {
      if (existingRows.length > 0) {
        const restoreResult = await client.from("opening_schedule").insert(existingRows);
        if (restoreResult.error) {
          return {
            written: false,
            inserted: 0,
            error: `${insertResult.error.message}; restore failed: ${restoreResult.error.message}`,
          };
        }
      }
      return { written: false, inserted: 0, error: insertResult.error.message };
    }

    return { written: true, inserted: rows.length, error: null };
  } catch (e) {
    return { written: false, inserted: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
