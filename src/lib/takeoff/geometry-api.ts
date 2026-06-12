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

/**
 * Phase 4, Slice 2 — additive opening reads on the measured floor-plan page. Openings
 * (windows/doors) are dimensioned as a "datum × width" pair; the engine finds the
 * shared head/mount datum by repetition and returns each opening's WIDTH as its raw
 * printed token (so the app re-parses it through the shared parseDimsMm), plus the
 * distinct positioned W-code count.
 *
 *  - `window_count`: distinct W-codes on the floor-plan page. The only vector window
 *    count available on a no-schedule template (Harrison).
 *  - `widths_raw`: each opening width as its raw printed token ("4,800", "1030").
 *  - `datum_mm`: the detected head/mount datum (for transparency; not a window height).
 *
 * No per-job literals — the datum is found by repetition within a structural
 * mounting-height band, never matched to a number.
 */
export type VectorOpenings = {
  window_count: number | null;
  widths_raw: string[];
  datum_mm: number | null;
  page: number;
};

/**
 * Phase 4, Slice 3 — the entry door: asserted HEIGHT, data-driven-or-unresolved WIDTH.
 * Two probes proved the frame-to-frame width is not recoverable as a positioned dim-pair
 * (Step 0) nor as a clean drawn primitive (Step 1): the entry is drawn as a ~900mm leaf
 * in a porch hatch, the ~1400 frame is annotation-only on one template and absent on the
 * other.
 *
 *  - `height_mm`: always the building STANDARD (2.1m). Height is genuinely uniform across
 *    entry doors AND unreliable to read (datum confusion), so asserting it generalises;
 *    it dissolves the orientation problem and reconciles the two jobs' transposed QS
 *    columns. The app FLAGS it as a standard assumption so a human can confirm.
 *  - `width_mm`: the printed "Frame to Frame NNNN" when the plan annotates one
 *    (`width_source: "vector_text"`, data-driven, e.g. Harrison 1430); otherwise `null`
 *    with `width_source: "unresolved"` — the width is NEVER asserted to a standard, because
 *    entry-door widths genuinely vary (1200/1400/1600/sliders) so a measured value is never
 *    invented HERE, at the geometry layer — the width stays null/unresolved. Downstream,
 *    derive-fields applies a flagged last-resort assumed width (ASSUMED_OPENING_WIDTH_M) only
 *    when the plan width could not be read, so the glass/joinery total stays complete; that
 *    assumption is surfaced as a review flag for confirmation, never presented as a measurement.
 *  - `label`: the entry-type room token that anchored it (e.g. "ENTRY", "PORCH").
 */
export type VectorEntrance = {
  type: "entry";
  width_mm: number | null;
  width_source: "vector_text" | "unresolved";
  height_mm: number;
  height_source: "standard_assumed";
  label: string;
  page: number;
};

/**
 * Route 2 — a non-window opening recovered from its label-anchored single-width callout on a
 * no-schedule floor plan (sectional door / ranchslider / garage window / PA door / entry).
 * WIDTH only (the printed callout); heights/glaze are asserted app-side. Present only on the
 * no-schedule path (the engine returns it when its W-code/datum opening reader found nothing).
 */
export type VectorSymbolOpening = {
  type: "sectional_door" | "slider" | "garage_window" | "pa_door" | "entrance";
  width_mm: number;
  width_source: "callout";
  label_dist_mm: number;
  /** The room/living label the callout anchored to (e.g. "DINING") — rooms the opening to its
   * real room instead of a fixed default, so it lands in the right QS slot. Optional (older engines). */
  room_label?: string;
  /** A real extracted height for the opening, when a newer engine reads one (e.g. a H-callout
   * or elevation read). Optional: absent on all current engines. When present it ALWAYS wins
   * over the app-side asserted standard — see resolveOpeningHeightM. */
  height_mm?: number | null;
  page: number;
};

export type VectorAnnotations = {
  /** The measured floor-plan page carries a real text layer (not a scan). */
  vector_usable: boolean;
  garage: VectorGarage | null;
  schedule: VectorSchedule | null;
  /** Phase 4, Slice 2 — opening widths + W-code count. Optional: absent on older engines. */
  openings?: VectorOpenings | null;
  /** Phase 4, Slice 3 — asserted entry door. Optional: absent on older engines. */
  entrance?: VectorEntrance | null;
  /** Route 2 — label-anchored single-width openings (no-schedule path). Optional/null otherwise. */
  symbol_openings?: VectorSymbolOpening[] | null;
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
  // One POST attempt at a given page (or auto-detect when undefined). The FormData body is
  // single-use, so it is rebuilt per attempt.
  const attempt = async (p: number | undefined): Promise<GeometryApiResult | null> => {
    try {
      const form = new FormData();
      form.append("file", pdfFile, filename);
      const url =
        p != null && p >= 0
          ? `${GEOMETRY_API_BASE}/measure?page=${p}`
          : `${GEOMETRY_API_BASE}/measure`;
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) {
        // The demo-week lesson (12 Jun): a 401 here ran SILENT for two days because the
        // status was swallowed — geometry just "wasn't there". Behaviour is unchanged
        // (still null → downstream geometry_status flag fires), but the REASON now lands
        // in the console: auth-class failures name the fix.
        console.warn(
          res.status === 401 || res.status === 403
            ? `[geometry] HTTP ${res.status} — auth rejected. Check GEOMETRY_API_KEY binding (Pages secret / Railway env).`
            : `[geometry] HTTP ${res.status} — measure failed for this attempt.`,
        );
        return null;
      }
      const data = (await res.json()) as GeometryApiResult;
      if (!data.success) {
        console.warn("[geometry] engine responded success:false — measurement rejected.");
        return null;
      }
      return data;
    } catch (e) {
      console.warn(
        "[geometry] request failed (network/parse):",
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  };

  const pinned = page != null && page >= 0 ? page : undefined;
  let data = await attempt(pinned);
  if (!data && pinned != null) {
    // The pinned page failed (out of range, scale not detected on that sheet, a transient
    // engine error, …). Degrade to auto-detect rather than nulling geometry entirely. This
    // stays OBSERVABLE: the engine echoes the page it actually used as `page_used`, and the
    // caller's reconcileGeometryPage(pinned, page_used) raises a confidence flag whenever
    // auto-detect lands on a DIFFERENT page — so a wrong auto-detect can't masquerade as a
    // confirmed pinned-page measurement.
    console.warn(
      `[geometry] page=${pinned} failed; retrying with auto-detect (flagged if it lands on a different page).`,
    );
    data = await attempt(undefined);
  }
  return data;
}
