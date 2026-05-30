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
};

export function overallConfidence(c: GeometryConfidence): "high" | "medium" | "low" {
  if (c.floor_area === "low" || c.perimeter === "low") return "low";
  if (c.floor_area === "high" && c.perimeter === "high") return "high";
  return "medium";
}

export async function measurePlanGeometry(
  pdfFile: File | Blob,
  filename = "plan.pdf",
): Promise<GeometryApiResult | null> {
  try {
    const form = new FormData();
    form.append("file", pdfFile, filename);
    const res = await fetch(`${GEOMETRY_API_BASE}/measure`, {
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
