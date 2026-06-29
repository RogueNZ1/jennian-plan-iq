import type { PlanText, PlanWindowCode, PlanRoom } from "./plan-text";

export type FloorPlanLabelRecoveryStatus = "extracted" | "review";

export type FloorPlanLabelRecoveryAssignment = {
  id: string;
  status: FloorPlanLabelRecoveryStatus;
  room: string | null;
  text: string;
  page?: number;
  bbox: [number, number, number, number];
  widthMm: number;
  heightMm: number;
  areaM2: number;
  confidence: "medium" | "low";
  reason: string;
  reviewFlags: string[];
};

const NON_WINDOW_ROOMS = /^(HWC|LINEN|STORE|WIR|ROBE|PANTRY|ENTRY)\b/i;
const LABEL_HALF_WIDTH_PT = 18;
const LABEL_HALF_HEIGHT_PT = 7;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dimensionText(code: PlanWindowCode): string {
  return `${code.heightMm} x ${code.widthMm}`;
}

function labelBbox(code: PlanWindowCode): [number, number, number, number] {
  return [
    round2(code.x - LABEL_HALF_WIDTH_PT),
    round2(code.y - LABEL_HALF_HEIGHT_PT),
    round2(code.x + LABEL_HALF_WIDTH_PT),
    round2(code.y + LABEL_HALF_HEIGHT_PT),
  ];
}

function cleanDimensionBand(code: PlanWindowCode): boolean {
  const min = Math.min(code.heightMm, code.widthMm);
  const max = Math.max(code.heightMm, code.widthMm);
  return min >= 800 && max <= 2400 && code.heightMm <= 1800;
}

function roomCandidates(code: PlanWindowCode, rooms: readonly PlanRoom[]) {
  return rooms
    .filter((room) => !NON_WINDOW_ROOMS.test(room.name))
    .map((room) => ({
      room,
      distance: Math.hypot(room.x - code.x, room.y - code.y),
    }))
    .sort((a, b) => a.distance - b.distance);
}

function uniqueRoomAssignment(candidates: ReturnType<typeof roomCandidates>): boolean {
  const best = candidates[0];
  if (!best || best.distance > 130) return false;
  const second = candidates[1];
  if (!second) return true;
  const gap = second.distance - best.distance;
  const ratio = best.distance / second.distance;
  return (best.distance <= 90 && gap >= 25) || ratio <= 0.7;
}

function nearDraftingIssue(code: PlanWindowCode, planText: PlanText): string | null {
  const issue = (planText.draftingIssues ?? [])
    .map((candidate) => ({
      candidate,
      distance: Math.hypot(candidate.x - code.x, candidate.y - code.y),
    }))
    .filter((candidate) => candidate.distance <= 110)
    .sort((a, b) => a.distance - b.distance)[0]?.candidate;
  return issue?.text ?? null;
}

function reviewReason(args: {
  code: PlanWindowCode;
  planText: PlanText;
  candidates: ReturnType<typeof roomCandidates>;
}): string | null {
  const issueText = nearDraftingIssue(args.code, args.planText);
  if (issueText) {
    return `near malformed/contaminated drafting label "${issueText}"`;
  }
  if (!cleanDimensionBand(args.code)) {
    return "dimension band is large, narrow, or door-like; keep for review";
  }
  if (!uniqueRoomAssignment(args.candidates)) {
    return "room/order assignment is ambiguous";
  }
  return null;
}

export function recoverFloorPlanLabelAssignments(args: {
  planText: PlanText | null | undefined;
  page?: number | null;
}): FloorPlanLabelRecoveryAssignment[] {
  const planText = args.planText;
  if (!planText?.windowCodes.length) return [];

  return planText.windowCodes.map((code, index) => {
    const candidates = roomCandidates(code, planText.rooms);
    const best = candidates[0]?.room ?? null;
    const reason = reviewReason({ code, planText, candidates });
    const widthM = code.widthMm / 1000;
    const heightM = code.heightMm / 1000;
    const areaM2 = round2(widthM * heightM);
    const status: FloorPlanLabelRecoveryStatus = reason ? "review" : "extracted";
    const text = dimensionText(code);
    return {
      id: `floorplan-label-${index + 1}`,
      status,
      room: best?.name ?? null,
      text,
      ...(args.page != null ? { page: args.page } : {}),
      bbox: labelBbox(code),
      widthMm: code.widthMm,
      heightMm: code.heightMm,
      areaM2,
      confidence: status === "extracted" ? "medium" : "low",
      reason:
        status === "extracted"
          ? `clean floor-plan opening label ${text} assigned to ${best?.name ?? "unknown"} by unique room proximity/order`
          : `floor-plan opening label ${text} retained for review: ${reason}`,
      reviewFlags:
        status === "extracted"
          ? []
          : [
              `Floor-plan opening label ${text} is not clean enough for automatic recovery: ${reason}.`,
            ],
    };
  });
}
