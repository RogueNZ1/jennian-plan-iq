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

// Haydon doctrine (2 Jul 2026): the priced quantity is m2 of glass. A printed
// W x H opening label with plausible window dimensions is green evidence even
// when its room/order assignment is uncertain - the room is a convenience
// label, not a money gate. Only is-this-actually-a-window checks may demote:
// drafting contamination, door-leaf-like dims, or implausible sizes.
function plausibleWindowDimensions(code: PlanWindowCode): boolean {
  const min = Math.min(code.heightMm, code.widthMm);
  const max = Math.max(code.heightMm, code.widthMm);
  if (min < 350 || max > 4200) return false;
  if (code.heightMm > 2400) return false;
  return true;
}

function doorLeafLike(code: PlanWindowCode): boolean {
  return (
    code.heightMm >= 1900 &&
    code.heightMm <= 2150 &&
    code.widthMm >= 700 &&
    code.widthMm <= 1000
  );
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
  if (!plausibleWindowDimensions(args.code)) {
    return "dimensions are outside the plausible window range; keep for review";
  }
  if (doorLeafLike(args.code)) {
    return "dimensions are door-leaf-like; keep for review";
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
          ? uniqueRoomAssignment(candidates)
            ? `clean floor-plan opening label ${text} assigned to ${best?.name ?? "unknown"} by unique room proximity/order`
            : `clean floor-plan opening label ${text}; nearest room ${best?.name ?? "unknown"} is a best guess - room assignment does not gate glass area`
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
