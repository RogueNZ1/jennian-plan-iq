import type { Opening, OpeningSource } from "./takeoff-types";
import type { PlanText } from "./plan-text";
import type { FloorPlanGapCandidate } from "./floor-plan-gaps";
import type { FloorPlanGapElevationMatch } from "./elevation-gap-match";
import type { FloorPlanTextDimensionMatch } from "./floor-plan-text-height-witness";
import { recoverFloorPlanLabelAssignments } from "./floor-plan-label-recovery";
import type { HeldBlockedOpening, QuarantinedOpening } from "./opening-pricing-adjudication";
import type { VisualOpeningAudit } from "./visual-opening-audit";

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

export type OpeningEvidenceStatus =
  | "extracted"
  | "priced"
  | "held_blocked"
  | "incomplete"
  | "review"
  | "conflict";

export type OpeningEvidenceItem = {
  source: OpeningEvidenceSource;
  role: OpeningEvidenceRole;
  confidence: "high" | "medium" | "low";
  width_m?: number | null;
  height_m?: number | null;
  area_m2?: number | null;
  room?: string | null;
  wall_face_id?: string;
  envelope_side?: FloorPlanGapCandidate["envelopeSide"];
  room_side?: "north" | "south" | "east" | "west" | null;
  alternate_rooms?: string[];
  page?: number;
  bbox?: [number, number, number, number];
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

function visualReviewType(
  type: VisualOpeningAudit["openings"][number]["type"],
  room: string | null | undefined,
): Opening["type"] | "unknown" {
  if (type === "uncertain") return "unknown";
  if (type === "garage_door") return "sectional_door";
  if (type === "external_door")
    return /entry|entrance|foyer/i.test(room ?? "") ? "entrance" : "pa_door";
  return type;
}

function sameOpeningEvidence(
  opening: Opening,
  visual: VisualOpeningAudit["openings"][number],
): boolean {
  if (visual.recoveryProof?.kind !== "physical_elevation") return false;
  const sameWidth = Math.abs(opening.width_m * 1000 - visual.recoveryProof.floorWidthMm) <= 10;
  const sameHeight =
    Math.abs(opening.height_m * 1000 - visual.recoveryProof.elevationHeightMm) <= 10;
  const sameRoom =
    (opening.room ?? "").trim().toLowerCase() === (visual.room ?? "").trim().toLowerCase();
  return sameWidth && sameHeight && sameRoom;
}

export function buildOpeningEvidenceLedger(args: {
  openings: readonly Opening[] | null | undefined;
  heldBlockedOpenings?: readonly HeldBlockedOpening[] | null;
  quarantinedOpenings?: readonly QuarantinedOpening[] | null;
  visualOpeningAudit?: VisualOpeningAudit | null;
  planText?: PlanText | null;
  planPage?: number | null;
  floorPlanGaps?: readonly FloorPlanGapCandidate[] | null;
  floorPlanGapElevationMatches?: ReadonlyMap<string, FloorPlanGapElevationMatch> | null;
  floorPlanTextDimensionMatches?: ReadonlyMap<string, FloorPlanTextDimensionMatch> | null;
  promotedFloorPlanGapOpenings?: ReadonlyMap<string, Opening> | null;
}): OpeningEvidenceCandidate[] {
  const ledger: OpeningEvidenceCandidate[] = [];
  const representedOpenings: Opening[] = [
    ...(args.openings ?? []),
    ...(args.heldBlockedOpenings ?? []).map((held) => held.opening),
    ...(args.quarantinedOpenings ?? []).map((quarantined) => quarantined.opening),
  ];

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

  for (const [index, held] of (args.heldBlockedOpenings ?? []).entries()) {
    const opening = held.opening;
    const primarySource = evidenceSourceForOpening(opening.source);
    ledger.push({
      id: `held-blocked-opening-${index + 1}`,
      status: "held_blocked",
      priced: false,
      type: opening.type,
      room: opening.room,
      width_m: opening.width_m,
      height_m: opening.height_m,
      area_m2: opening.area_m2,
      evidence: [
        {
          source: primarySource,
          role: evidenceRoleForOpening(opening.source),
          confidence: opening.confidence,
          width_m: opening.width_m,
          height_m: opening.height_m,
          area_m2: opening.area_m2,
          room: opening.room,
          note: `${opening.type} opening has complete dimensions but is held out of pricing from ${primarySource}`,
        },
      ],
      review_flags: [...(opening.flags ?? []), held.flag],
      conflicts: [held.reason],
    });
  }

  for (const [index, quarantined] of (args.quarantinedOpenings ?? []).entries()) {
    const opening = quarantined.opening;
    const primarySource = evidenceSourceForOpening(opening.source);
    ledger.push({
      id: `quarantined-opening-${index + 1}`,
      status: "review",
      priced: false,
      type: opening.type,
      room: opening.room,
      width_m: opening.width_m,
      height_m: opening.height_m,
      area_m2: opening.area_m2,
      evidence: [
        {
          source: primarySource,
          role: evidenceRoleForOpening(opening.source),
          confidence: opening.confidence,
          width_m: opening.width_m,
          height_m: opening.height_m,
          area_m2: opening.area_m2,
          room: opening.room,
          note: `${opening.type} opening held out of pricing from ${primarySource}`,
        },
      ],
      review_flags: opening.flags ?? [],
      conflicts: quarantined.reasons,
    });
  }

  for (const [index, item] of (args.visualOpeningAudit?.openings ?? []).entries()) {
    if (representedOpenings.some((opening) => sameOpeningEvidence(opening, item))) continue;
    const widthM = item.width_m != null ? Math.round(item.width_m * 100) / 100 : null;
    const heightM = item.height_m != null ? Math.round(item.height_m * 100) / 100 : null;
    const areaM2 =
      widthM != null && heightM != null ? Math.round(widthM * heightM * 100) / 100 : null;
    ledger.push({
      id: `visual-opening-${index + 1}`,
      status: "review",
      priced: false,
      type: visualReviewType(item.type, item.room),
      room: item.room,
      width_m: widthM,
      height_m: heightM,
      area_m2: areaM2,
      evidence: [
        {
          source: "vision",
          role: item.width_m != null && item.height_m != null ? "dimension" : "candidate",
          confidence: item.confidence,
          width_m: widthM,
          height_m: heightM,
          area_m2: areaM2,
          room: item.room,
          text: item.label ?? undefined,
          note: item.evidence || "visual opening candidate retained for review only",
        },
      ],
      review_flags: [
        ...item.flags,
        "Visual opening is evidence only; it is not priced until deterministic geometry/schedule proof promotes it.",
      ],
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

  for (const assignment of recoverFloorPlanLabelAssignments({
    planText: args.planText,
    page: args.planPage,
  })) {
    const widthM = Math.round((assignment.widthMm / 1000) * 100) / 100;
    const heightM = Math.round((assignment.heightMm / 1000) * 100) / 100;
    const areaM2 = assignment.status === "extracted" ? assignment.areaM2 : null;

    ledger.push({
      id: assignment.id,
      status: assignment.status,
      priced: false,
      type: "window",
      room: assignment.room,
      width_m: widthM,
      height_m: heightM,
      area_m2: areaM2,
      evidence: [
        {
          source: "floorplan_text",
          role: "dimension",
          confidence: assignment.confidence,
          width_m: widthM,
          height_m: heightM,
          area_m2: areaM2,
          room: assignment.room,
          ...(assignment.page != null ? { page: assignment.page } : {}),
          bbox: assignment.bbox,
          text: assignment.text,
          note: assignment.reason,
        },
      ],
      review_flags:
        assignment.status === "extracted"
          ? [
              `Clean floor-plan W x H label ${assignment.text} auto-recovered as evidence-only opening; not a pricing write.`,
            ]
          : assignment.reviewFlags,
      conflicts: [],
    });
  }

  for (const [index, gap] of (args.floorPlanGaps ?? []).entries()) {
    const widthM = Math.round((gap.widthMm / 1000) * 100) / 100;
    const elevationMatch = args.floorPlanGapElevationMatches?.get(gap.id) ?? null;
    const textDimensionMatch = args.floorPlanTextDimensionMatches?.get(gap.id) ?? null;
    const promotedOpening = args.promotedFloorPlanGapOpenings?.get(gap.id) ?? null;
    const heightM =
      elevationMatch != null
        ? Math.round((elevationMatch.heightMm / 1000) * 100) / 100
        : textDimensionMatch != null
          ? Math.round((textDimensionMatch.heightMm / 1000) * 100) / 100
          : null;
    const textAreaM2 =
      textDimensionMatch != null && heightM != null
        ? Math.round(widthM * heightM * 100) / 100
        : null;
    const evidence: OpeningEvidenceItem[] = [
      {
        source: "floorplan_gap",
        role: "width",
        confidence: gap.confidence,
        width_m: widthM,
        room: gap.roomLabel ?? null,
        wall_face_id: gap.wallFaceId,
        ...(gap.page != null ? { page: gap.page } : {}),
        ...(gap.bbox ? { bbox: gap.bbox } : {}),
        envelope_side: gap.envelopeSide,
        room_side: gap.roomSide ?? null,
        alternate_rooms: gap.alternateRoomLabels ?? [],
        note: gap.note,
      },
    ];

    if (elevationMatch) {
      evidence.push({
        source: "elevation_measurement",
        role: "height",
        confidence: elevationMatch.confidence,
        width_m: Math.round((elevationMatch.widthMm / 1000) * 100) / 100,
        height_m: heightM,
        room: gap.roomLabel ?? null,
        wall_face_id: gap.wallFaceId,
        envelope_side: gap.envelopeSide,
        room_side: gap.roomSide ?? null,
        alternate_rooms: gap.alternateRoomLabels ?? [],
        note: elevationMatch.note,
      });
    }

    if (textDimensionMatch) {
      evidence.push({
        source: "floorplan_text",
        role: "height",
        confidence: "medium",
        width_m: Math.round((textDimensionMatch.matchedWidthMm / 1000) * 100) / 100,
        height_m: heightM,
        area_m2: textAreaM2,
        room: gap.roomLabel ?? null,
        wall_face_id: gap.wallFaceId,
        page: textDimensionMatch.page,
        text: textDimensionMatch.text,
        envelope_side: gap.envelopeSide,
        room_side: gap.roomSide ?? null,
        alternate_rooms: gap.alternateRoomLabels ?? [],
        note:
          `height_source pdf_text_dimension; height_witness_text "${textDimensionMatch.text}"; ` +
          `width_match_delta_mm ${textDimensionMatch.widthMatchDeltaMm}; ` +
          `${textDimensionMatch.note}`,
      });
    }

    const elevationSupportText = elevationMatch
      ? elevationMatch.faceCheck === "matched"
        ? elevationMatch.measurementCheck === "confirmed"
          ? `elevation ${elevationMatch.face} confirms width within ${elevationMatch.widthDeltaMm}mm and supports height ${elevationMatch.heightMm}mm; `
          : `elevation ${elevationMatch.face} has similar width/height evidence, but its width delta is ${elevationMatch.widthDeltaMm}mm outside the 50mm confirmation tolerance; `
        : `elevation ${elevationMatch.face} has matching width/height evidence, but its face is not matched to the floor-plan wall; `
      : "";
    const textDimensionSupportText = textDimensionMatch
      ? `floor-plan text dimension ${textDimensionMatch.text} matches the measured gap width within ${textDimensionMatch.widthMatchDeltaMm}mm and supplies height ${textDimensionMatch.heightMm}mm; glass area ${textAreaM2 ?? "unknown"}m2 is from witnessed width+height only and is not a pricing write; `
      : "";
    const status: OpeningEvidenceStatus = promotedOpening
      ? "priced"
      : textDimensionMatch
        ? "extracted"
        : "review";

    ledger.push({
      id: `floorplan-gap-${index + 1}`,
      status,
      priced: promotedOpening != null,
      type: promotedOpening?.type ?? (textDimensionMatch ? "window" : "unknown"),
      room: gap.roomLabel ?? null,
      width_m: widthM,
      height_m: heightM,
      area_m2: promotedOpening?.area_m2 ?? textAreaM2,
      evidence,
      review_flags: promotedOpening
        ? [
            `Measured floor-plan wall gap ${gap.widthMm}mm${
              gap.roomLabel ? ` near ${gap.roomLabel}` : ""
            } on ${gap.envelopeSide} wall face ${gap.wallFaceId}; elevation ${elevationMatch?.face ?? "unknown"} supports ${elevationMatch?.widthMm ?? gap.widthMm}x${elevationMatch?.heightMm ?? Math.round(promotedOpening.height_m * 1000)}mm; promoted into QS openings as ${promotedOpening.type} (${promotedOpening.area_m2}m2).`,
          ]
        : [
            `Measured floor-plan wall gap ${gap.widthMm}mm${
              gap.roomLabel ? ` near ${gap.roomLabel}` : ""
            } on ${gap.envelopeSide} wall face ${gap.wallFaceId}; ${
              gap.routing.ambiguous ? `${gap.routing.reason}; ` : ""
            }${elevationSupportText}${textDimensionSupportText}not priced until height/type/face are confirmed by text, elevation, schedule, or review.`,
          ],
      conflicts: gap.routing.ambiguous ? (gap.alternateRoomLabels ?? []) : [],
    });
  }

  return ledger;
}
