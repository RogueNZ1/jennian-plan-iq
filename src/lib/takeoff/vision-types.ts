/**
 * Shared types for Phase B Vision Takeoff. Client-safe.
 */
export type VisionConfidence = "high" | "medium" | "low";

export type VisionAreaBox = {
  total_area_m2: number | null;
  area_over_frame_m2: number | null;
  coverage_area_m2: number | null;
  cladding_area_m2: number | null;
  porch_area_m2: number | null;
  perimeter_m: number | null;
};

export type VisionBaseGeometry = {
  external_perimeter_m: number | null;
  internal_wall_length_m: number | null;
  garage_area_m2: number | null;
  living_area_excluding_garage_m2: number | null;
};

export type VisionRoom = {
  name: string;
  dimensions_mm: { width: number | null; length: number | null };
  area_m2: number | null;
};

export type VisionWindow = {
  label: string;
  width_mm: number | null;
  height_mm: number | null;
  room: string | null;
  confidence: VisionConfidence;
  source_evidence: string;
};

export type VisionDoorType =
  | "internal" | "external" | "sliding" | "garage" | "robe" | "unknown";

export type VisionDoor = {
  type: VisionDoorType;
  width_mm: number | null;
  height_mm: number | null;
  room: string | null;
  confidence: VisionConfidence;
  source_evidence: string;
};

export type VisionWallLengths = {
  external_wall_length_m: number | null;
  internal_wall_length_m: number | null;
  wet_area_wall_length_m: number | null;
  garage_internal_wall_length_m: number | null;
  robe_wall_length_m: number | null;
};

export type VisionCladding = {
  type: string | null;
  cladding_area_m2: number | null;
  brick_length_m: number | null;
  notes: string | null;
};

export type VisionRoofing = {
  roof_pitch_degrees: number | null;
  roof_area_m2: number | null;
  notes: string | null;
};

export type VisionPageResult = {
  page_type:
    | "dimension_floorplan" | "floorplan" | "site_plan" | "elevations"
    | "sections" | "roof_plan" | "electrical_plan" | "plumbing_plan" | "unknown";
  scale_text: string | null;
  scale_confidence: VisionConfidence;
  area_box: VisionAreaBox;
  base_geometry: VisionBaseGeometry;
  rooms: VisionRoom[];
  windows: VisionWindow[];
  doors: VisionDoor[];
  wall_lengths: VisionWallLengths;
  cladding: VisionCladding;
  roofing: VisionRoofing;
  warnings: string[];
  confidence_summary: VisionConfidence;
};

export type VisionRunPageOutcome = {
  fileId: string;
  fileName: string;
  pageNumber: number;
  storagePath: string;
  status:
    | "ok"
    | "model_unreadable"
    | "error"
    | "skipped_non_floorplan"
    | "geometry_skipped_wrong_page_type";
  errorMessage?: string;
  result?: VisionPageResult;
  quantitiesInserted: number;
  quantitiesRefreshed: number;
  openingsInserted: number;
  openingsRefreshed: number;
  measurementsInserted: number;
  measurementsRefreshed: number;
  moduleItemsInserted: number;
  moduleItemsRefreshed: number;
  reviewRequiredCount: number;
  warnings: string[];
  /** Phase A classifier verdict for this page, if pre-filtered client-side. */
  clientPageType?: string | null;
  /** Vision model's reported page type, if it returned. */
  visionPageType?: string | null;
  resolutionWidthPx?: number | null;
  resolutionHeightPx?: number | null;
};

/**
 * Returned by runVisionTakeoff when the entire handler fails before any page
 * can be processed (e.g. missing API key, unhandled top-level exception).
 * Per-page failures are always surfaced via VisionRunSummary.errors instead.
 */
export type VisionTakeoffError = {
  ok: false;
  error: {
    operation: string;
    message: string;
    technical?: string;
  };
};

export type VisionRunSummary = {
  kind: "vision_takeoff";
  ranAt: string;
  pagesRendered: number;
  pagesSentToVision: number;
  pagesSkipped: number;
  pagesProcessed: number;
  workingPlanReviewed: boolean;
  areaPerimeterValuesFound: number;
  windowItemsFound: number;
  doorItemsFound: number;
  wallLengthsFound: number;
  moduleDraftItemsCreated: number;
  reviewRequiredItems: number;
  visionQuantitiesCreated: number;
  visionMeasurementsCreated: number;
  visionOpeningsCreated: number;
  visionModuleItemsCreated: number;
  warningCount: number;
  errorCount: number;
  confidenceCounts: { high: number; medium: number; low: number };
  flattenedPlanDetected: boolean;
  visionReviewRequired: boolean;
  failedPages: number;
  processedPages: number;
  pageCap: number;
  warnings: string[];
  errors: string[];
  pages: VisionRunPageOutcome[];
};

/**
 * Normalises any unknown thrown/returned value into a structured error object
 * safe for display in VisionTakeoffPanel. Never throws.
 */
export function normaliseVisionError(err: unknown): {
  operation: string;
  message: string;
  technical?: string;
} {
  const fallback = {
    operation: "unknown",
    message: "Vision Takeoff encountered an unexpected error.",
  } as const;

  if (err == null) return fallback;

  if (err instanceof Error) {
    const raw = err.message;
    const msg =
      !raw || raw === "[object Response]" || /^\[object /.test(raw)
        ? "Vision Takeoff could not connect to the server. Please refresh the page and try again."
        : raw;
    return { operation: "client_error", message: msg, technical: err.stack?.slice(0, 500) };
  }

  // Response object (browser Fetch API)
  if (typeof Response !== "undefined" && err instanceof Response) {
    return {
      operation: "server_response",
      message: `Vision Takeoff failed (HTTP ${err.status}).`,
      technical: `HTTP ${err.status} ${err.statusText}`.trim(),
    };
  }

  if (typeof err === "string") {
    const trimmed = err.trim();
    const msg =
      trimmed && trimmed !== "[object Object]" && trimmed !== "[object Response]"
        ? trimmed
        : "Vision Takeoff encountered an unexpected error.";
    return { operation: "unknown", message: msg };
  }

  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;

    // { ok: false, error: { operation, message, technical? } }
    if (obj.error !== null && obj.error !== undefined && typeof obj.error === "object") {
      const inner = obj.error as Record<string, unknown>;
      if (typeof inner.message === "string") {
        return {
          operation: typeof inner.operation === "string" ? inner.operation : "unknown",
          message: inner.message || "Vision Takeoff failed.",
          technical: typeof inner.technical === "string" ? inner.technical : undefined,
        };
      }
    }

    // { ok: false, error: "some string" }
    if (typeof obj.error === "string") {
      return { operation: "unknown", message: obj.error || "Vision Takeoff failed." };
    }

    // { message: "..." }
    if (typeof obj.message === "string") {
      return { operation: "unknown", message: obj.message || "Vision Takeoff failed." };
    }

    // { status: 500, statusText: "..." }
    if (typeof obj.status === "number") {
      return {
        operation: "server_response",
        message: `Vision Takeoff failed (HTTP ${obj.status}${obj.statusText ? `: ${obj.statusText}` : ""}).`,
        technical: `HTTP ${obj.status} ${obj.statusText ?? ""}`.trim(),
      };
    }

    // Unknown object shape — include a JSON summary for diagnostics
    let technical: string | undefined;
    try {
      technical = JSON.stringify(err).slice(0, 300);
    } catch {
      technical = String(err);
    }
    return {
      operation: "unknown",
      message: "Vision Takeoff could not complete. Unexpected server response.",
      technical,
    };
  }

  return { ...fallback, technical: String(err) };
}