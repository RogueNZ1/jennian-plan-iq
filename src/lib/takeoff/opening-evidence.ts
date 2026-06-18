import type { Opening, OpeningSource } from "./takeoff-types";
import type { PlanText } from "./plan-text";
import type { FloorPlanGapCandidate } from "./floor-plan-gaps";

export type OpeningEvidenceSource =
  | "floorplan_gap"
  | "floorplan_text"
  | "elevation_measurement"
  | "schedule"
  | "spec"
  | "vision"
  | "vector"
  | "asserted"
  | "manual";

export type OpeningEvidenceRole =
  | "candidate"
  | "classification"
  | "width"
  | "height"
  | "dimension"
  | "conflict";

export type OpeningEvidenceStatus = "priced" | "incomplete" | "review" | "conflict";

export type OpeningEvidenceItem = {
  source: OpeningEvidenceSource;
  role: OpeningEvidenceRole;
  confidence: "high" | "medium" | "low";
  width_m?: number | null;
  height_m?: number | null;
  area_m2?: number | null;
  room?: string | null;
  wall_face_id?: string;
  room_side?: "north" | "south" | "east" | "west" | null;
  alternate_rooms?: string[];
  text?: string;
  note?: string;
};

export type OpeningEvidenceCandidate = {
  id: string;
  status: OpeningEvidenceStatus;
  priced: boolean;
  type?: Opening["type"] | "unknown";
  room?: string | null;
  width_m?: number | null;
  height_m?: number | null;
  area_m2?: number | null;
  evidence: OpeningEvidenceItem[];
  review_flags: string[];
  conflicts: string[];
};

function evidenceSourceForOpening(source: OpeningSource): OpeningEvidenceSource {
  if (source === "schedule") return "schedule";
  if (source === "callout") return "floorplan_text";
  if (source === "asserted") return "asserted";
  if (source === "vision") return "vision";
  return "vector";
}

function evidenceRoleForOpening(source: OpeningSource): OpeningEvidenceRole {
  return source === "asserted" ? "height" : "dimension";
}

export function buildOpeningEvidenceLedger(args: {
  openings: readonly Opening[] | null | undefined;
  planText?: Pick<PlanText, "draftingIssues"> | null;
  floorPlanGaps?: readonly FloorPlanGapCandidate[] | null;
}): OpeningEvidenceCandidate[] {
  const ledger: OpeningEvidenceCandidate[] = [];

  for (const [index, opening] of (args.openings ?? []).entries()) {
    const primarySource = evidenceSourceForOpening(opening.source);
    const evidence: OpeningEvidenceItem[] = [
      {
        source: primarySource,
        role: evidenceRoleForOpening(opening.source),
        confidence: opening.confidence,
        width_m: opening.width_m,
        height_m: opening.height_m,
        area_m2: opening.area_m2,
        room: opening.room,
        note: `${opening.type} opening priced from ${primarySource}`,
      },
    ];

    if (opening.height_source && opening.height_source !== opening.source) {
      evidence.push({
        source: evidenceSourceForOpening(opening.height_source),
        role: "height",
        confidence: opening.height_source === "asserted" ? "low" : opening.confidence,
        height_m: opening.height_m,
        room: opening.room,
        note: `height from ${opening.height_source}`,
      });
    }

    ledger.push({
      id: `opening-${index + 1}`,
      status: "priced",
      priced: true,
      type: opening.type,
      room: opening.room,
      width_m: opening.width_m,
      height_m: opening.height_m,
      area_m2: opening.area_m2,
      evidence,
      review_flags: opening.flags ?? [],
      conflicts: [],
    });
  }

  for (const [index, issue] of (args.planText?.draftingIssues ?? []).entries()) {
    const note =
      "malformed floor-plan text is retained as evidence but is not priced unless another source confirms the opening";
    ledger.push({
      id: `drafting-issue-${index + 1}`,
      status: "review",
      priced: false,
      type: "unknown",
      room: null,
      evidence: [
        {
          source: "floorplan_text",
          role: "conflict",
          confidence: "low",
          text: issue.text,
          note,
        },
      ],
      review_flags: [
        `Malformed dimension label "${issue.text}" found on the floor plan; do not price from that label unless another source confirms the opening size.`,
      ],
      conflicts: [issue.text],
    });
  }

  for (const [index, gap] of (args.floorPlanGaps ?? []).entries()) {
    const widthM = Math.round((gap.widthMm / 1000) * 100) / 100;
    ledger.push({
      id: `floorplan-gap-${index + 1}`,
      status: "review",
      priced: false,
      type: "unknown",
      room: gap.roomLabel ?? null,
      width_m: widthM,
      height_m: null,
      area_m2: null,
      evidence: [
        {
          source: "floorplan_gap",
          role: "width",
          confidence: gap.confidence,
          width_m: widthM,
          room: gap.roomLabel ?? null,
          wall_face_id: gap.wallFaceId,
          room_side: gap.roomSide ?? null,
          alternate_rooms: gap.alternateRoomLabels ?? [],
          note: gap.note,
        },
      ],
      review_flags: [
        `Measured floor-plan wall gap ${gap.widthMm}mm${
          gap.roomLabel ? ` near ${gap.roomLabel}` : ""
        } on wall face ${gap.wallFaceId}; ${
          gap.routing.ambiguous ? `${gap.routing.reason}; ` : ""
        }not priced until height/type are confirmed by text, elevation, schedule, or review.`,
      ],
      conflicts: gap.routing.ambiguous ? (gap.alternateRoomLabels ?? []) : [],
    });
  }

  return ledger;
}
