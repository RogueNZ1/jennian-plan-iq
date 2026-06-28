import type { Opening, OpeningType } from "./takeoff-types";
import {
  visualOpeningIsNotCounted,
  type VisualOpeningAudit,
  type VisualOpeningAuditItem,
} from "./visual-opening-audit";
import { parseDimsMm } from "./classify";
import { isQsGlazedOpening } from "./derive-fields";
import { normaliseGarageDoorSizeLabel } from "./garage-door-size";
import { round2 } from "./utils";

export type VisualOpeningPromotion = {
  openings: Opening[];
  garageDoorSize: string | null;
  flags: string[];
};

const GARAGE_DOOR_MIN_HEIGHT_M = 2.0;
const GARAGE_DOOR_MAX_HEIGHT_M = 2.4;
const GARAGE_DOOR_MIN_WIDTH_M = 2.4;
const GARAGE_DOOR_MAX_WIDTH_M = 5.4;

function openingType(item: VisualOpeningAuditItem): OpeningType | null {
  switch (item.type) {
    case "window":
      return "window";
    case "slider":
      return "slider";
    case "garage_window":
      return "garage_window";
    case "garage_door":
      return "sectional_door";
    case "pa_door":
      return "pa_door";
    case "external_door":
      return /entry|entrance|foyer/i.test(item.room ?? "") ? "entrance" : "pa_door";
    default:
      return null;
  }
}

function normaliseVisualDims(item: VisualOpeningAuditItem): {
  height_m: number;
  width_m: number;
  flags: string[];
  usable: boolean;
} {
  const flags: string[] = [];
  let h = item.height_m;
  let w = item.width_m;

  if (item.type === "garage_door") {
    const labelDims = item.label ? parseDimsMm(item.label) : [];
    if (labelDims.length >= 2) {
      h = Math.min(labelDims[0], labelDims[1]) / 1000;
      w = Math.max(labelDims[0], labelDims[1]) / 1000;
    } else if (h != null && w != null && h > 0 && w > 0 && h > w) {
      [h, w] = [w, h];
    }

    if (h == null || w == null || h <= 0 || w <= 0) {
      flags.push(`${item.id}: visual garage door size unreadable; not promoted.`);
      return { height_m: 0, width_m: 0, flags, usable: false };
    }

    if (
      h < GARAGE_DOOR_MIN_HEIGHT_M ||
      h > GARAGE_DOOR_MAX_HEIGHT_M ||
      w < GARAGE_DOOR_MIN_WIDTH_M ||
      w > GARAGE_DOOR_MAX_WIDTH_M
    ) {
      flags.push(
        `${item.id}: visual garage door size ${round2(w)}m x ${round2(h)}m is outside the garage-door plausibility band; ignored so it cannot overwrite the floor-plan callout.`,
      );
      return { height_m: 0, width_m: 0, flags, usable: false };
    }

    return { height_m: round2(h) ?? h, width_m: round2(w) ?? w, flags, usable: true };
  }

  if (h == null || w == null || h <= 0 || w <= 0) {
    flags.push(`${item.id}: visual opening size unreadable; retained as review evidence only.`);
    return { height_m: 0, width_m: 0, flags, usable: false };
  }

  // Plausibility guard: sliders/windows are not 3m+ high. If one side is a normal
  // door/window height and the other is very large, treat the large side as width.
  if (h > 3 && w <= 2.7) {
    [h, w] = [w, h];
    flags.push(`${item.id}: visual dimensions swapped by plausibility check; confirm label order.`);
  }

  if (h > 2.7) {
    flags.push(
      `${item.id}: visual height ${round2(h)}m is unusually high; confirm before pricing.`,
    );
  }

  return { height_m: round2(h) ?? h, width_m: round2(w) ?? w, flags, usable: true };
}

function confidence(item: VisualOpeningAuditItem): Opening["confidence"] {
  return item.confidence === "medium" ? "medium" : item.confidence;
}

export function promoteVisualOpenings(
  audit: VisualOpeningAudit | null | undefined,
): VisualOpeningPromotion | null {
  if (!audit || audit.openings.length === 0) return null;

  const openings: Opening[] = [];
  const flags: string[] = [];
  let garageDoorSize: string | null = null;

  for (const item of audit.openings) {
    if (visualOpeningIsNotCounted(item)) {
      flags.push(`${item.id}: visual marker rejected by floor-plan validation; not promoted.`);
      continue;
    }

    const type = openingType(item);
    if (!type) {
      flags.push(`${item.id}: visual opening type uncertain; not promoted into QS openings.`);
      continue;
    }

    const dims = normaliseVisualDims(item);
    flags.push(...dims.flags);
    const geometryProven =
      type !== "sectional_door" && dims.usable && item.recoveryProof?.kind === "physical_elevation";
    if (geometryProven) {
      const area_m2 = round2(dims.height_m * dims.width_m) ?? 0;
      openings.push({
        type,
        room: item.room,
        height_m: dims.height_m,
        width_m: dims.width_m,
        glazed: isQsGlazedOpening(type),
        cladding: null,
        area_m2,
        source: "vector",
        height_source: "vector",
        confidence: confidence(item),
        flags: [
          ...item.flags,
          ...dims.flags,
          `${item.id}: visual locator promoted only after physical floor-plan width and elevation proof agreed.`,
        ],
      });
      flags.push(
        `${item.id}: visual locator promoted only after physical floor-plan width and elevation proof agreed.`,
      );
    } else {
      flags.push(
        `${item.id}: visual opening retained as evidence only; not promoted into QS openings.`,
      );
    }

    if (type === "sectional_door" && dims.usable && dims.height_m > 0 && dims.width_m > 0) {
      garageDoorSize = `${dims.width_m}×${dims.height_m}`;
    }
  }

  if (flags.length === 0 && openings.length === 0 && !garageDoorSize) return null;
  flags.unshift(
    openings.length > 0
      ? `Visual QS promoted ${openings.length} locator-backed openings only after deterministic physical/elevation proof; all other visual openings remain review evidence.`
      : "Visual QS retained external-wall openings as review evidence only; deterministic geometry, schedule, or approved measured evidence must promote priceable openings.",
  );
  return { openings, garageDoorSize: normaliseGarageDoorSizeLabel(garageDoorSize), flags };
}
