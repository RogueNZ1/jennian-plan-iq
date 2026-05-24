/**
 * Client for the Jennian IQ Geometry Engine (Railway API).
 * Called from the browser — CORS is open on the API.
 */

const GEOMETRY_API_BASE =
  (import.meta.env.VITE_GEOMETRY_API_URL as string | undefined) ||
  "https://jennian-iq-geometry-api-production.up.railway.app";

export type GeometryMeasurements = {
  floor_area_m2: number | null;
  perimeter_m: number | null;
  external_wall_length_m: number | null;
  internal_wall_length_m: number | null;
  garage_area_m2: number | null;
  alfresco_area_m2: number | null;
  stud_height_mm: number | null;
  bounding_box_m: { width: number; height: number } | null;
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
