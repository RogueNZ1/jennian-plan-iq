import { classifyGarageDoorAnnotation } from "./classify";
import type { VisionConfidence, VisionDoor, VisionWindow } from "./vision-types";

type DbConfidence = "high" | "mid" | "low";

export type VisionOpeningClassification = {
  openingType: "window" | "garage_door" | "unknown_opening";
  widthMm: number;
  heightMm: number | null;
  confidence: DbConfidence;
  notes: string | null;
  counterKey: "windowItemsFound" | "doorItemsFound";
  logLabel: string;
};

export type VisionDoorOpeningClassification = VisionOpeningClassification & {
  room: string | null;
  sourceEvidence: string;
};

function confToDbConfidence(c: VisionConfidence | null | undefined): DbConfidence {
  if (c === "high") return "high";
  if (c === "low") return "low";
  return "mid";
}

function hasGarageContext(w: VisionWindow): boolean {
  const text = [w.label, w.room, w.source_evidence].filter(Boolean).join(" ").toLowerCase();
  return /\b(garage|sectional|roller\s*door|garage\s*door)\b/.test(text);
}

function hasExplicitGarageDoorContext(w: VisionWindow): boolean {
  const text = [w.label, w.room, w.source_evidence].filter(Boolean).join(" ").toLowerCase();
  return /\b(sectional|roller\s*door|garage\s*door)\b/.test(text);
}

function isImplausibleGlazing(w: VisionWindow): boolean {
  const width = w.width_mm ?? 0;
  const height = w.height_mm ?? 0;
  return width > 5400 || height > 2600 || (width >= 2300 && height > 2400);
}

export function classifyVisionWindowOpening(w: VisionWindow): VisionOpeningClassification | null {
  if (w.width_mm == null) return null;

  const garageContext = hasGarageContext(w);
  const dimensionText = w.height_mm != null ? `${w.height_mm} x ${w.width_mm}` : String(w.width_mm);
  const garageDoor = garageContext ? classifyGarageDoorAnnotation(dimensionText) : null;

  if (garageDoor && (hasExplicitGarageDoorContext(w) || garageContext)) {
    return {
      openingType: "garage_door",
      widthMm: garageDoor.widthMm,
      heightMm: garageDoor.heightMm,
      confidence: confToDbConfidence(w.confidence),
      notes: w.label ? `${w.label} · classified as garage door` : "classified as garage door",
      counterKey: "doorItemsFound",
      logLabel: `Garage door ${garageDoor.widthMm}x${garageDoor.heightMm}`,
    };
  }

  if (garageContext && isImplausibleGlazing(w)) {
    return {
      openingType: "unknown_opening",
      widthMm: w.width_mm,
      heightMm: w.height_mm,
      confidence: "low",
      notes: w.label
        ? `${w.label} · garage-context opening excluded from glazing; verify garage door size`
        : "garage-context opening excluded from glazing; verify garage door size",
      counterKey: "doorItemsFound",
      logLabel: `Garage-context review opening ${w.width_mm}x${w.height_mm ?? "?"}`,
    };
  }

  return {
    openingType: "window",
    widthMm: w.width_mm,
    heightMm: w.height_mm,
    confidence: confToDbConfidence(w.confidence),
    notes: w.label || null,
    counterKey: "windowItemsFound",
    logLabel: `Window ${w.width_mm}x${w.height_mm ?? "?"}`,
  };
}

export function classifyVisionDoorOpening(d: VisionDoor): VisionDoorOpeningClassification | null {
  if (d.width_mm == null) return null;

  if (d.type === "garage") {
    const dimensionText =
      d.height_mm != null ? `${d.height_mm} x ${d.width_mm}` : String(d.width_mm);
    const garageDoor = classifyGarageDoorAnnotation(dimensionText);
    const widthMm = garageDoor?.widthMm ?? d.width_mm;
    const heightMm = garageDoor?.heightMm ?? d.height_mm;
    return {
      openingType: "garage_door",
      widthMm,
      heightMm,
      room: d.room ?? "Garage",
      confidence: confToDbConfidence(d.confidence),
      sourceEvidence: d.source_evidence || "garage door",
      notes: "garage door",
      counterKey: "doorItemsFound",
      logLabel: `Garage door ${widthMm}x${heightMm ?? "?"}`,
    };
  }

  if (d.type === "external" || d.type === "sliding") {
    return {
      openingType: "window",
      widthMm: d.width_mm,
      heightMm: d.height_mm,
      room: d.room,
      confidence: confToDbConfidence(d.confidence),
      sourceEvidence: d.source_evidence || `${d.type} door`,
      notes: `${d.type} door treated as glazing`,
      counterKey: "windowItemsFound",
      logLabel: `External glazing ${d.width_mm}x${d.height_mm ?? "?"}`,
    };
  }

  return null;
}
