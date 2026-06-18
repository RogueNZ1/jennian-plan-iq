import type { Opening, OpeningSource } from "./takeoff-types";
import type { PlanText } from "./plan-text";

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

  return ledger;
}
