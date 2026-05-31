/**
 * Client for the Jennian IQ Geometry Engine.
 *
 * In production, requests go through the same-origin Cloudflare Worker proxy at
 * /api/geometry/*, which injects the GEOMETRY_API_KEY before forwarding to the
 * Railway service. The API key is never sent to the browser.
 *
 * For local development, set VITE_GEOMETRY_API_BASE (e.g. http://localhost:8000)
 * to point the app at a geometry instance running locally via uvicorn. This is a
 * dev-only override: when unset (production), it defaults to the same-origin
 * proxy path and never targets the Railway prod endpoint or its secret directly.
 */

const GEOMETRY_API_BASE =
  (import.meta.env.VITE_GEOMETRY_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "/api/geometry";

export type GeometryMeasurements = {
  floor_area_m2: number | null;
  perimeter_m: number | null;
  external_wall_length_m: number | null;
  internal_wall_length_m: number | null;
  /** Confidence in the internal wall length — based on how many main rooms (bed/lounge/kitchen/garage) were found. */
  internal_wall_confidence: "high" | "medium" | "low" | null;
  garage_area_m2: number | null;
  alfresco_area_m2: number | null;
  stud_height_mm: number | null;
  bounding_box_m: { width: number; height: number } | null;
  room_count: number;
  main_room_count: number;
  rooms: Array<{ label: string; width_m: number; depth_m: number }>;
};

export type GeometryConfidence = {
  floor_area: "high" | "medium" | "low";
  perimeter: "high" | "medium" | "low";
  notes: string[];
};

/**
 * Phase 4, Slice 1 — additive vector-layer annotations read straight from the PDF's
 * text layer by the geometry engine (no render/OCR/model). Two deterministic facts:
 *
 *  - `garage`: the dimension-pair printed nearest a /garage/i label (width = larger
 *    side). Lets the app prefer a deterministic garage door width over the vision read.
 *  - `schedule`: a Door & Window Schedule's shared head/mounting datum — a single value
 *    repeated across every window column. NOT any window's glazed height; surfaced so
 *    the app can guard against reading the head datum AS a window height.
 *
 * Backward-compatible: the whole field is optional. When absent, or when
 * `vector_usable` is false, the app keeps its existing vision behaviour. No per-job
 * literals are emitted — the garage is found by label proximity, the datum by repetition.
 */
export type VectorGarage = {
  width_mm: number;
  height_mm: number;
  raw: string;
  page: number;
  distance_px: number;
};

export type VectorSchedule = {
  head_datum_mm: number;
  datum_repeat: number;
  window_count: number;
  page: number;
};

export type VectorAnnotations = {
  /** The measured floor-plan page carries a real text layer (not a scan). */
  vector_usable: boolean;
  garage: VectorGarage | null;
  schedule: VectorSchedule | null;
};

export type GeometryApiResult = {
  success: boolean;
  scale: {
    string: string | null;
    factor: number | null;
    source: string | null;
    pixels_per_mm: number | null;
  };
  measurements: GeometryMeasurements;
  confidence: GeometryConfidence;
  ocr_raw: {
    living_area_m2: number | null;
    perimeter_m: number | null;
    garage_area_m2: number | null;
    alfresco_area_m2: number | null;
    stud_height_mm: number | null;
  };
  page_used: number;
  total_pages: number;
  /**
   * Phase 4, Slice 1 — optional vector-layer reads. Absent on older engine builds
   * (and on any page without a usable text layer), in which case the app falls back
   * to its existing vision-derived garage width and schedule handling.
   */
  vector_annotations?: VectorAnnotations;
};

export function overallConfidence(c: GeometryConfidence): "high" | "medium" | "low" {
  if (c.floor_area === "low" || c.perimeter === "low") return "low";
  if (c.floor_area === "high" && c.perimeter === "high") return "high";
  return "medium";
}

export async function measurePlanGeometry(
  pdfFile: File | Blob,
  filename = "plan.pdf",
  /**
   * Phase 3 — page-of-truth reconciliation. Optional 0-based page index telling the
   * geometry engine which page to measure (the AI-classified floor plan). Omit to let
   * geometry auto-detect (the prior behaviour). The engine echoes the page it used as
   * `page_used`, so callers can confirm the request took effect.
   */
  page?: number,
): Promise<GeometryApiResult | null> {
  try {
    const form = new FormData();
    form.append("file", pdfFile, filename);
    const url =
      page != null && page >= 0
        ? `${GEOMETRY_API_BASE}/measure?page=${page}`
        : `${GEOMETRY_API_BASE}/measure`;
    const res = await fetch(url, {
      method: "POST",
      body: form,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GeometryApiResult;
    return data.success ? data : null;
  } catch {
    return null;
  }
}
