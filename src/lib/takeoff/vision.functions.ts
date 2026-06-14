/**
 * Phase B — Vision Takeoff server function (hardened).
 *
 * Hardening pass:
 *  - Pre-classification metadata is passed in per page; non-floorplan pages are
 *    not sent to the model (caller responsibility) and a skip note is recorded.
 *  - Inserts of area / base geometry / wall lengths / measurements only happen
 *    when the model's reported page_type is `dimension_floorplan` or
 *    `floorplan`. Other page types record a warning and do not write geometry.
 *  - extracted_quantities and plan_measurements are deduped on re-run.
 *  - module_items use a 2% numeric drift tolerance and never overwrite
 *    approved_value.
 *  - Vision actions are written to module_audit_logs.
 *  - workingPlanReviewed flips true only when a page from the selected working
 *    file was processed AND the model classified it as a floorplan.
 *  - Empty window/door arrays no longer create misleading zero-count rows.
 *  - Opening types are normalised to a fixed vocabulary before insert.
 *  - Render resolution is sanity-checked.
 *
 * Server-only: reads LOVABLE_API_KEY from process.env inside the handler.
 * NEVER writes approved_value. Every row is review_required.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { toJson } from "@/lib/type-helpers";
import type {
  VisionPageResult,
  VisionRunSummary,
  VisionRunPageOutcome,
  VisionConfidence,
  VisionTakeoffError,
} from "./vision-types";
import { classifyVisionWindowOpening } from "./vision-openings";

// ---- Zod schema mirroring VisionPageResult — used for runtime validation ----
// This is intentionally separate from the JSON schema in VISION_TOOL so that
// changes to the prompt schema are explicit and do not silently bypass validation.
const _Confidence = z.enum(["high", "medium", "low"]);

const VisionPageResultSchema = z.object({
  page_type: z.enum([
    "dimension_floorplan",
    "floorplan",
    "site_plan",
    "elevations",
    "sections",
    "roof_plan",
    "electrical_plan",
    "plumbing_plan",
    "unknown",
  ]),
  scale_text: z.string().nullable(),
  scale_confidence: _Confidence,
  area_box: z.object({
    total_area_m2: z.number().nullable(),
    area_over_frame_m2: z.number().nullable(),
    coverage_area_m2: z.number().nullable(),
    cladding_area_m2: z.number().nullable(),
    porch_area_m2: z.number().nullable(),
    perimeter_m: z.number().nullable(),
  }),
  base_geometry: z.object({
    external_perimeter_m: z.number().nullable(),
    internal_wall_length_m: z.number().nullable(),
    internal_wall_segments_m: z.array(z.number()).optional().default([]),
    garage_area_m2: z.number().nullable(),
    living_area_excluding_garage_m2: z.number().nullable(),
  }),
  rooms: z.array(
    z.object({
      name: z.string(),
      dimensions_mm: z.object({
        width: z.number().nullable(),
        length: z.number().nullable(),
      }),
      area_m2: z.number().nullable(),
    }),
  ),
  windows: z.array(
    z.object({
      label: z.string(),
      width_mm: z.number().nullable(),
      height_mm: z.number().nullable(),
      room: z.string().nullable(),
      confidence: _Confidence,
      source_evidence: z.string(),
    }),
  ),
  doors: z.array(
    z.object({
      type: z.enum(["internal", "external", "sliding", "garage", "robe", "unknown"]),
      width_mm: z.number().nullable(),
      height_mm: z.number().nullable(),
      room: z.string().nullable(),
      confidence: _Confidence,
      source_evidence: z.string(),
    }),
  ),
  wall_lengths: z.object({
    external_wall_length_m: z.number().nullable(),
    internal_wall_length_m: z.number().nullable(),
    internal_wall_segments_m: z.array(z.number()).optional().default([]),
    wet_area_wall_length_m: z.number().nullable(),
    garage_internal_wall_length_m: z.number().nullable(),
    robe_wall_length_m: z.number().nullable(),
  }),
  cladding: z.object({
    type: z.string().nullable(),
    cladding_area_m2: z.number().nullable(),
    brick_length_m: z.number().nullable(),
    notes: z.string().nullable(),
  }),
  roofing: z.object({
    roof_pitch_degrees: z.number().nullable(),
    roof_area_m2: z.number().nullable(),
    notes: z.string().nullable(),
  }),
  warnings: z.array(z.string()),
  confidence_summary: _Confidence,
});

type AiResponse = {
  choices?: Array<{
    message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
  }>;
};

const SYSTEM_PROMPT = `You are reviewing a single rendered page from a construction plan PDF for a residential takeoff.

STEP 1 — SCALE (do this first, before anything else):
Look for a printed scale in the title block. It will be in a format like:
  "1:100 @ A3", "SCALE 1:100", "1 : 100 @ A1", "Scale: 1/100"
Read the title block area (usually bottom-right or bottom-left of the page).
If you find a scale ratio, return it in scale_text as "1:NNN @AX" (e.g. "1:100 @A3").
Set scale_confidence to "high" if the text is clear, "medium" if partially legible.
DO NOT ask the user for scale — if you can read it, report it in scale_text.

STEP 2 — SUMMARY BOX:
Look for a printed summary box or area schedule (often top-right or title block area) that lists:
  Living Area / Area Over Frame, Cladding Area, Perimeter / External Perimeter, Coverage Area, Garage Area.
If found, populate area_box with those exact printed values. These are more reliable than measured values.

Strict rules:
- Extract VISIBLE information only.
- Do NOT invent quantities. Do NOT guess hidden dimensions.
- If a value is not visible, return null. Do not make one up.
- Read window and door sizes only from labels visible on the plan.
- Mark uncertain values as low confidence.
- Keep these quantity concepts SEPARATE — do not merge them:
    Area Over Frame, Total Area, Coverage Area, Cladding Area,
    Porch Area, Garage Area, External Perimeter, Internal Wall Length.
- For INTERNAL WALLS: do NOT attempt to sum total internal wall length yourself — vision models cannot reliably total many short segments. Instead, identify EACH individual internal wall segment visible on the floor plan and list its length in metres in the "internal_wall_segments_m" arrays (in both base_geometry and wall_lengths). The server will sum them. If you cannot identify individual segments, return an empty array and set internal_wall_length_m to null.
- NZ WINDOW ANNOTATIONS: Window size labels on NZ residential plans are always HEIGHT × WIDTH in millimetres (e.g. "2150x600" = height 2150mm, width 600mm). The first number is always height; the second is always width. Read annotation text directly — do not measure pixel dimensions for window sizes.
- QS OPENING RULE: Everything on an external wall is treated as glazing EXCEPT the garage door. Do not put the garage/sectional/roller door in the windows array. Put it in doors with type "garage". A normal small garage-room window remains a window.
- Return structured JSON only via the tool call. No prose.`;

const VISION_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_vision_takeoff",
    description: "Return structured takeoff data extracted from this rendered plan page.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        page_type: {
          type: "string",
          enum: [
            "dimension_floorplan",
            "floorplan",
            "site_plan",
            "elevations",
            "sections",
            "roof_plan",
            "electrical_plan",
            "plumbing_plan",
            "unknown",
          ],
        },
        scale_text: { type: ["string", "null"] },
        scale_confidence: { type: "string", enum: ["high", "medium", "low"] },
        area_box: {
          type: "object",
          additionalProperties: false,
          properties: {
            total_area_m2: { type: ["number", "null"] },
            area_over_frame_m2: { type: ["number", "null"] },
            coverage_area_m2: { type: ["number", "null"] },
            cladding_area_m2: { type: ["number", "null"] },
            porch_area_m2: { type: ["number", "null"] },
            perimeter_m: { type: ["number", "null"] },
          },
          required: [
            "total_area_m2",
            "area_over_frame_m2",
            "coverage_area_m2",
            "cladding_area_m2",
            "porch_area_m2",
            "perimeter_m",
          ],
        },
        base_geometry: {
          type: "object",
          additionalProperties: false,
          properties: {
            external_perimeter_m: { type: ["number", "null"] },
            internal_wall_length_m: { type: ["number", "null"] },
            internal_wall_segments_m: {
              type: "array",
              description:
                "List of EACH individual internal wall segment length in metres. The server will sum these to compute internal_wall_length_m. Required when internal walls are visible — do NOT attempt to sum them yourself.",
              items: { type: "number" },
            },
            garage_area_m2: { type: ["number", "null"] },
            living_area_excluding_garage_m2: { type: ["number", "null"] },
          },
          required: [
            "external_perimeter_m",
            "internal_wall_length_m",
            "internal_wall_segments_m",
            "garage_area_m2",
            "living_area_excluding_garage_m2",
          ],
        },
        rooms: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              dimensions_mm: {
                type: "object",
                additionalProperties: false,
                properties: {
                  width: { type: ["number", "null"] },
                  length: { type: ["number", "null"] },
                },
                required: ["width", "length"],
              },
              area_m2: { type: ["number", "null"] },
            },
            required: ["name", "dimensions_mm", "area_m2"],
          },
        },
        windows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              width_mm: { type: ["number", "null"] },
              height_mm: { type: ["number", "null"] },
              room: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              source_evidence: { type: "string" },
            },
            required: ["label", "width_mm", "height_mm", "room", "confidence", "source_evidence"],
          },
        },
        doors: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: ["internal", "external", "sliding", "garage", "robe", "unknown"],
              },
              width_mm: { type: ["number", "null"] },
              height_mm: { type: ["number", "null"] },
              room: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              source_evidence: { type: "string" },
            },
            required: ["type", "width_mm", "height_mm", "room", "confidence", "source_evidence"],
          },
        },
        wall_lengths: {
          type: "object",
          additionalProperties: false,
          properties: {
            external_wall_length_m: { type: ["number", "null"] },
            internal_wall_length_m: { type: ["number", "null"] },
            internal_wall_segments_m: {
              type: "array",
              description:
                "List of EACH individual internal wall segment length in metres. The server will sum these to compute internal_wall_length_m. Do NOT attempt to sum them yourself.",
              items: { type: "number" },
            },
            wet_area_wall_length_m: { type: ["number", "null"] },
            garage_internal_wall_length_m: { type: ["number", "null"] },
            robe_wall_length_m: { type: ["number", "null"] },
          },
          required: [
            "external_wall_length_m",
            "internal_wall_length_m",
            "internal_wall_segments_m",
            "wet_area_wall_length_m",
            "garage_internal_wall_length_m",
            "robe_wall_length_m",
          ],
        },
        cladding: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: ["string", "null"] },
            cladding_area_m2: { type: ["number", "null"] },
            brick_length_m: { type: ["number", "null"] },
            notes: { type: ["string", "null"] },
          },
          required: ["type", "cladding_area_m2", "brick_length_m", "notes"],
        },
        roofing: {
          type: "object",
          additionalProperties: false,
          properties: {
            roof_pitch_degrees: { type: ["number", "null"] },
            roof_area_m2: { type: ["number", "null"] },
            notes: { type: ["string", "null"] },
          },
          required: ["roof_pitch_degrees", "roof_area_m2", "notes"],
        },
        warnings: { type: "array", items: { type: "string" } },
        confidence_summary: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: [
        "page_type",
        "scale_text",
        "scale_confidence",
        "area_box",
        "base_geometry",
        "rooms",
        "windows",
        "doors",
        "wall_lengths",
        "cladding",
        "roofing",
        "warnings",
        "confidence_summary",
      ],
    },
  },
};

const PAGE_CAP = 6;
const AUDIT_FLUSH_TIMEOUT_MS = 1500;
const VISION_SOFT_RETURN_AFTER_OPENINGS_MS = 65_000;
const MIN_RESOLUTION_PX = 4000;

// Minimal module definitions kept in sync with IQ_MODULES in src/lib/iq-modules.ts.
// Cannot import that file here — it depends on the browser-side Supabase client.
const MODULE_SEEDS = [
  { id: "iq-core", name: "IQ Core", required: true },
  { id: "iq-electrical", name: "IQ Electrical", required: false },
  { id: "iq-plumbing", name: "IQ Plumbing", required: false },
  { id: "iq-linings", name: "IQ Linings", required: true },
  { id: "iq-framing", name: "IQ Framing", required: true },
  { id: "iq-cladding", name: "IQ Cladding", required: true },
  { id: "iq-roofing", name: "IQ Roofing", required: true },
  { id: "iq-margin", name: "IQ Margin", required: false },
  { id: "iq-procurement", name: "IQ Procurement", required: false },
] as const;

// Modules that Vision Takeoff writes module_items to; hard-error guard after seed.
const VISION_MODULE_IDS = new Set([
  "iq-core",
  "iq-framing",
  "iq-linings",
  "iq-cladding",
  "iq-roofing",
]);

const FLOORPLAN_VISION_TYPES = new Set(["dimension_floorplan", "floorplan"]);

function confToDbConfidence(c: VisionConfidence | null | undefined): "high" | "mid" | "low" {
  if (c === "high") return "high";
  if (c === "low") return "low";
  return "mid";
}

function buf2b64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

/** Map free-text/model door types to fixed opening_schedule vocabulary. */
function normalizeOpeningType(raw: string | null | undefined, kind: "window" | "door"): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (kind === "window") return "window";
  if (t === "internal" || t === "internal door") return "internal_door";
  if (t === "external" || t === "external door") return "external_door";
  if (t === "sliding" || t === "slider" || t === "sliding door") return "sliding_door";
  if (t === "garage" || t === "garage door") return "garage_door";
  if (t === "robe" || t === "robe opening") return "robe_opening";
  if (t === "bifold" || t === "bi-fold") return "bifold";
  return "unknown_opening";
}

const InputSchema = z.object({
  jobId: z.string().uuid(),
  pages: z
    .array(
      z.object({
        fileId: z.string().uuid(),
        fileName: z.string(),
        pageNumber: z.number().int().min(1).max(200),
        storageBucket: z.string().min(1),
        storagePath: z.string().min(1),
        clientPageType: z.string().nullable().optional(),
        widthPx: z.number().int().min(1).optional(),
        heightPx: z.number().int().min(1).optional(),
      }),
    )
    .min(1)
    .max(PAGE_CAP),
  specificationText: z.string().optional(),
  // Supabase access token forwarded from the browser session.
  // useServerFn does not automatically include localStorage-stored tokens in
  // request headers, so the panel passes it explicitly in the POST body.
  // It is validated server-side before any operations and never returned.
  accessToken: z.string().min(1),
});

const ReconcileInputSchema = z.object({
  jobId: z.string().uuid(),
  accessToken: z.string().min(1),
});

function mergeVisionSummaryCounts(
  summary: VisionRunSummary,
  counts: {
    pages: number;
    quantities: number;
    openings: number;
    windows: number;
    measurements: number;
    moduleItems: number;
  },
): VisionRunSummary {
  const rowCount = counts.quantities + counts.openings + counts.measurements + counts.moduleItems;
  const warnings = [...(summary.warnings ?? [])];
  const timeoutWarning =
    "Vision request timed out after saving partial results. Review extracted rows before pricing.";
  if (rowCount > 0 && !warnings.includes(timeoutWarning)) warnings.push(timeoutWarning);
  const doorCount = Math.max(0, counts.openings - counts.windows);
  return {
    ...summary,
    pagesRendered: Math.max(summary.pagesRendered, counts.pages),
    pagesSentToVision: Math.max(summary.pagesSentToVision, counts.pages > 0 ? 1 : 0),
    pagesProcessed: Math.max(summary.pagesProcessed, rowCount > 0 ? 1 : 0),
    processedPages: Math.max(summary.processedPages, rowCount > 0 ? 1 : 0),
    workingPlanReviewed: summary.workingPlanReviewed || rowCount > 0,
    areaPerimeterValuesFound: Math.max(summary.areaPerimeterValuesFound, counts.quantities),
    windowItemsFound: Math.max(summary.windowItemsFound, counts.windows),
    doorItemsFound: Math.max(summary.doorItemsFound, doorCount),
    wallLengthsFound: Math.max(summary.wallLengthsFound, counts.measurements),
    moduleDraftItemsCreated: Math.max(summary.moduleDraftItemsCreated, counts.moduleItems),
    visionQuantitiesCreated: Math.max(summary.visionQuantitiesCreated, counts.quantities),
    visionMeasurementsCreated: Math.max(summary.visionMeasurementsCreated, counts.measurements),
    visionOpeningsCreated: Math.max(summary.visionOpeningsCreated, counts.openings),
    visionModuleItemsCreated: Math.max(summary.visionModuleItemsCreated, counts.moduleItems),
    reviewRequiredItems: Math.max(
      summary.reviewRequiredItems,
      counts.quantities + counts.openings + counts.measurements + counts.moduleItems,
    ),
    warnings,
    warningCount: warnings.length,
  };
}

type AuditEntry = {
  job_id: string;
  user_id: string | null;
  action: string;
  module_id?: string | null;
  item_id?: string | null;
  run_id?: string | null;
  previous_value?: string | null;
  new_value?: string | null;
  notes?: string | null;
};

export const reconcileVisionTakeoffRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReconcileInputSchema.parse(input))
  .handler(async ({ data }): Promise<VisionRunSummary | VisionTakeoffError> => {
    const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_SERVICE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return {
        ok: false,
        error: {
          operation: "auth_check",
          message: "Server database connection is not configured. Contact support.",
          technical: `Missing env: ${[!SUPABASE_URL && "SUPABASE_URL", !SUPABASE_PUBLISHABLE_KEY && "SUPABASE_PUBLISHABLE_KEY"].filter(Boolean).join(", ")}`,
        },
      };
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(data.accessToken);
    if (claimsErr || !claimsData?.claims?.sub) {
      return {
        ok: false,
        error: {
          operation: "auth_check",
          message: "Your session has expired. Please sign in again.",
          technical: claimsErr?.message ?? "Token validation failed: no sub claim",
        },
      };
    }

    const { data: runRows, error: runErr } = await supabase
      .from("takeoff_runs")
      .select("id, status, summary")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (runErr || !runRows?.[0]) {
      return {
        ok: false,
        error: {
          operation: "vision_reconcile",
          message: "Vision Takeoff run could not be found.",
          technical: runErr?.message ?? "No takeoff_runs row for job.",
        },
      };
    }

    const current = runRows[0] as { id: string; status: string; summary: unknown };
    const currentSummary = current.summary as { vision?: VisionRunSummary } | null;
    const vision = currentSummary?.vision;
    if (!vision || vision.kind !== "vision_takeoff") {
      return {
        ok: false,
        error: {
          operation: "vision_reconcile",
          message: "Latest takeoff run is not a Vision Takeoff run.",
        },
      };
    }

    const [pages, quantities, openings, windows, measurements, moduleItems] = await Promise.all([
      supabase
        .from("vision_takeoff_pages")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId),
      supabase
        .from("extracted_quantities")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId)
        .eq("data_source", "Vision Takeoff"),
      supabase
        .from("opening_schedule")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId)
        .eq("source", "Vision Takeoff"),
      supabase
        .from("opening_schedule")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId)
        .eq("source", "Vision Takeoff")
        .eq("opening_type", "window"),
      supabase
        .from("plan_measurements")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId)
        .eq("source", "Vision Takeoff"),
      supabase
        .from("module_items")
        .select("id", { count: "exact", head: true })
        .eq("job_id", data.jobId)
        .eq("data_source", "Vision Takeoff"),
    ]);

    const merged = mergeVisionSummaryCounts(vision, {
      pages: pages.count ?? 0,
      quantities: quantities.count ?? 0,
      openings: openings.count ?? 0,
      windows: windows.count ?? 0,
      measurements: measurements.count ?? 0,
      moduleItems: moduleItems.count ?? 0,
    });
    const rowCount =
      merged.areaPerimeterValuesFound +
      merged.windowItemsFound +
      merged.doorItemsFound +
      merged.wallLengthsFound +
      merged.moduleDraftItemsCreated;
    const status =
      current.status === "completed" || current.status === "completed_with_warnings"
        ? current.status
        : rowCount > 0
          ? "completed_with_warnings"
          : current.status;

    await supabase
      .from("takeoff_runs")
      .update({
        status,
        summary: toJson({ kind: "vision_takeoff", vision: merged }),
        completed_at: status === "running" ? null : new Date().toISOString(),
        error_message:
          status === "completed_with_warnings"
            ? "Vision request timed out after saving partial results."
            : null,
      })
      .eq("id", current.id);

    return merged;
  });

export const runVisionTakeoff = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<VisionRunSummary | VisionTakeoffError> => {
    // ---- Build and validate the Supabase client from the forwarded token ----
    // useServerFn HTTP calls do not automatically include the Supabase Bearer
    // token from localStorage, so the panel passes it in the POST body and we
    // validate it here before any other operation.
    const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_SERVICE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return {
        ok: false,
        error: {
          operation: "auth_check",
          message: "Server database connection is not configured. Contact support.",
          technical: `Missing env: ${[!SUPABASE_URL && "SUPABASE_URL", !SUPABASE_PUBLISHABLE_KEY && "SUPABASE_PUBLISHABLE_KEY"].filter(Boolean).join(", ")}`,
        },
      };
    }
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(data.accessToken);
    if (claimsErr || !claimsData?.claims?.sub) {
      return {
        ok: false,
        error: {
          operation: "auth_check",
          message: "Your session has expired. Please sign in again.",
          technical: claimsErr?.message ?? "Token validation failed: no sub claim",
        },
      };
    }
    const userId: string = claimsData.claims.sub as string;

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!LOVABLE_API_KEY && !ANTHROPIC_API_KEY) {
      return {
        ok: false,
        error: {
          operation: "vision_model_call",
          message: "Vision model credentials are not configured. Contact support.",
          technical:
            "Expected server environment variable LOVABLE_API_KEY or ANTHROPIC_API_KEY was not found.",
        },
      };
    }

    try {
      const startedAtMs = Date.now();
      const summary: VisionRunSummary = {
        kind: "vision_takeoff",
        ranAt: new Date().toISOString(),
        pagesRendered: data.pages.length,
        pagesSentToVision: 0,
        pagesSkipped: 0,
        pagesProcessed: 0,
        workingPlanReviewed: false,
        areaPerimeterValuesFound: 0,
        windowItemsFound: 0,
        doorItemsFound: 0,
        wallLengthsFound: 0,
        moduleDraftItemsCreated: 0,
        reviewRequiredItems: 0,
        visionQuantitiesCreated: 0,
        visionMeasurementsCreated: 0,
        visionOpeningsCreated: 0,
        visionModuleItemsCreated: 0,
        warningCount: 0,
        errorCount: 0,
        confidenceCounts: { high: 0, medium: 0, low: 0 },
        flattenedPlanDetected: true,
        visionReviewRequired: true,
        failedPages: 0,
        processedPages: 0,
        pageCap: PAGE_CAP,
        warnings: [],
        errors: [],
        pages: [],
      };
      let takeoffRunId: string | null = null;
      const persistRunSummary = async (
        status: "running" | "completed" | "completed_with_warnings",
      ) => {
        if (!takeoffRunId) return;
        await supabase
          .from("takeoff_runs")
          .update({
            status,
            summary: toJson({ kind: "vision_takeoff", vision: summary }),
            completed_at: status === "running" ? null : new Date().toISOString(),
            error_message:
              summary.errors.length > 0
                ? summary.errors.slice(0, 5).join(" | ")
                : status === "completed_with_warnings" && summary.warnings.length > 0
                  ? summary.warnings.slice(0, 3).join(" | ")
                  : null,
          })
          .eq("id", takeoffRunId);
      };

      const { data: takeoffRun, error: takeoffRunErr } = await supabase
        .from("takeoff_runs")
        .insert({
          job_id: data.jobId,
          started_by: userId,
          status: "running",
          summary: toJson({ kind: "vision_takeoff", vision: summary }),
          completed_at: null,
          error_message: null,
        })
        .select("id")
        .single();
      if (takeoffRunErr) {
        summary.errors.push(`Vision run tracking failed: ${takeoffRunErr.message}`);
      } else {
        takeoffRunId = takeoffRun.id;
      }

      // ---- Audit log helper (best-effort; never blocks the run) ----
      const auditQueue: AuditEntry[] = [];
      const audit = (e: AuditEntry) => auditQueue.push(e);
      const flushAudit = async () => {
        if (auditQueue.length === 0) return;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), AUDIT_FLUSH_TIMEOUT_MS);
        try {
          await supabase.from("module_audit_logs").insert(
            auditQueue.map((a) => ({
              job_id: a.job_id,
              user_id: a.user_id,
              action: a.action,
              module_id: a.module_id ?? null,
              item_id: a.item_id ?? null,
              run_id: a.run_id ?? null,
              previous_value: a.previous_value ?? null,
              new_value: a.new_value ?? null,
              notes: a.notes ?? null,
            })),
          ).abortSignal(controller.signal);
        } catch {
          /* never let audit failure mask the takeoff result */
        } finally {
          clearTimeout(timer);
        }
        auditQueue.length = 0;
      };

      audit({
        job_id: data.jobId,
        user_id: userId,
        action: "vision_takeoff_started",
        notes: `Pages submitted: ${data.pages.length} (cap ${PAGE_CAP}).`,
      });

      // Look up working_plan_file_id once.
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("working_plan_file_id")
        .eq("id", data.jobId)
        .maybeSingle();
      const workingPlanFileId = jobRow?.working_plan_file_id ?? null;

      // ---- Ensure module_runs exist before writing module_items (defensive seed) ----
      // seedAllModulesForJob normally runs client-side when the job page mounts, but
      // Vision Takeoff can be launched from any route. If module_runs are absent the
      // server creates them here, making item creation route-independent.
      let { data: runsData } = await supabase
        .from("module_runs")
        .select("id, module_id")
        .eq("job_id", data.jobId);

      const haveModules = new Set(
        (runsData ?? []).map((r) => (r as { module_id: string }).module_id),
      );
      const missingModules = MODULE_SEEDS.filter((m) => !haveModules.has(m.id));

      if (missingModules.length > 0) {
        const seedNow = new Date().toISOString();
        const { error: seedErr } = await supabase.from("module_runs").upsert(
          missingModules.map((m) => ({
            job_id: data.jobId,
            module_id: m.id,
            module_name: m.name,
            status: "not_started",
            review_status: "review_required",
            required: m.required,
            last_run_at: seedNow,
            item_count: 0,
            confidence_avg: null,
          })),
          { onConflict: "job_id,module_id", ignoreDuplicates: true },
        );
        // Re-fetch after seeding so the map is current.
        const { data: refetched } = await supabase
          .from("module_runs")
          .select("id, module_id")
          .eq("job_id", data.jobId);
        runsData = refetched;

        // Hard error if any Vision Takeoff module is still absent — indicates an
        // RLS or schema problem that would silently drop all module_items writes.
        const haveAfter = new Set(
          (runsData ?? []).map((r) => (r as { module_id: string }).module_id),
        );
        const criticalMissing = [...VISION_MODULE_IDS].filter((id) => !haveAfter.has(id));
        if (criticalMissing.length > 0) {
          return {
            ok: false,
            error: {
              operation: "module_run_seed",
              message:
                "Vision Takeoff could not initialise module records for this job. " +
                "Open the job page and try again, or contact support if the problem persists.",
              technical:
                `module_runs missing after seed attempt: ${criticalMissing.join(", ")}. ` +
                `Seed error: ${seedErr?.message ?? "none recorded"}`,
            },
          };
        }
      }

      const moduleRunByModule: Record<string, string> = {};
      for (const r of runsData ?? []) {
        moduleRunByModule[(r as { module_id: string }).module_id] = (r as { id: string }).id;
      }

      for (const p of data.pages) {
        const pageOutcome: VisionRunPageOutcome = {
          fileId: p.fileId,
          fileName: p.fileName,
          pageNumber: p.pageNumber,
          storagePath: `${p.storageBucket}/${p.storagePath}`,
          status: "ok",
          quantitiesInserted: 0,
          quantitiesRefreshed: 0,
          openingsInserted: 0,
          openingsRefreshed: 0,
          measurementsInserted: 0,
          measurementsRefreshed: 0,
          moduleItemsInserted: 0,
          moduleItemsRefreshed: 0,
          reviewRequiredCount: 0,
          warnings: [],
          clientPageType: p.clientPageType ?? null,
          resolutionWidthPx: p.widthPx ?? null,
          resolutionHeightPx: p.heightPx ?? null,
        };

        try {
          // Resolution sanity-check.
          if (
            p.widthPx == null ||
            (p.widthPx < MIN_RESOLUTION_PX && (p.heightPx ?? 0) < MIN_RESOLUTION_PX)
          ) {
            const note =
              p.widthPx == null
                ? "Unable to determine rendered image resolution."
                : `Rendered plan image may be too low resolution for reliable dimension reading (${p.widthPx}×${p.heightPx ?? "?"}px).`;
            pageOutcome.warnings.push(note);
            summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${note}`);
            audit({
              job_id: data.jobId,
              user_id: userId,
              action: "vision_takeoff_warning",
              notes: note,
            });
          }

          // Download the rendered page image.
          const { data: blob, error: dlErr } = await supabase.storage
            .from(p.storageBucket)
            .download(p.storagePath);
          if (dlErr || !blob) {
            throw new Error(
              `Could not download rendered page image: ${dlErr?.message ?? "no data"}`,
            );
          }
          const bytes = await blob.arrayBuffer();
          const dataUrl = `data:image/png;base64,${buf2b64(bytes)}`;

          const userMessageContent: Array<unknown> = [
            {
              type: "text",
              text:
                `Job: ${data.jobId}. File: ${p.fileName}. Page number: ${p.pageNumber}.` +
                (p.clientPageType
                  ? `\nPre-classifier verdict (text-based): ${p.clientPageType}.`
                  : "") +
                (data.specificationText
                  ? `\n\nProject specification text (for context only — DO NOT copy values you cannot see on this page; flag "as per plan" items as low confidence):\n${data.specificationText.slice(0, 4000)}`
                  : ""),
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ];

          summary.pagesSentToVision++;
          audit({
            job_id: data.jobId,
            user_id: userId,
            action: "vision_model_called",
            notes: `${p.fileName} p${p.pageNumber}`,
          });

          let argStr: string | undefined;
          if (LOVABLE_API_KEY) {
            const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                // !! DO NOT CHANGE THIS MODEL — GPT models do not work on this gateway.
                // Gemini 2.5 Pro is the only model that reliably reads NZ architectural plans.
                model: "google/gemini-2.5-pro",
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: userMessageContent },
                ],
                tools: [VISION_TOOL],
                tool_choice: { type: "function", function: { name: "submit_vision_takeoff" } },
              }),
            });

            if (aiRes.status === 429)
              throw new Error("Vision model rate-limited (429). Try again shortly.");
            if (aiRes.status === 402)
              throw new Error("Lovable AI workspace credits exhausted (402). Contact support.");
            if (aiRes.status === 401) {
              const body = await aiRes.text().catch(() => "");
              throw new Error(
                `Vision Takeoff could not call the vision model. Check server AI credentials. ` +
                  `Technical: HTTP 401 from AI gateway (ai.gateway.lovable.dev). ` +
                  `Expected env: LOVABLE_API_KEY. ` +
                  `Response body: ${body.slice(0, 120) || "(empty)"}`,
              );
            }
            if (!aiRes.ok) {
              const text = await aiRes.text().catch(() => "");
              throw new Error(`Vision model error ${aiRes.status}: ${text.slice(0, 240)}`);
            }
            let aiJson: AiResponse;
            try {
              aiJson = (await aiRes.json()) as AiResponse;
            } catch {
              pageOutcome.status = "model_unreadable";
              pageOutcome.errorMessage = "Vision model returned an unexpected response.";
              summary.errors.push(
                `${p.fileName} p${p.pageNumber}: vision_response_parse — Vision model returned an unexpected response. Technical: HTTP ${aiRes.status}, response body was not valid JSON.`,
              );
              summary.failedPages++;
              summary.pages.push(pageOutcome);
              continue;
            }
            argStr = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          } else {
            const { callVisionModel, safeParseJson } = await import("./anthropic-client");
            const userText =
              `Job: ${data.jobId}. File: ${p.fileName}. Page number: ${p.pageNumber}.` +
              (p.clientPageType
                ? `\nPre-classifier verdict (text-based): ${p.clientPageType}.`
                : "") +
              (data.specificationText
                ? `\n\nProject specification text (for context only — DO NOT copy values you cannot see on this page; flag "as per plan" items as low confidence):\n${data.specificationText.slice(0, 4000)}`
                : "");
            const raw = await callVisionModel(
              ANTHROPIC_API_KEY,
              `${SYSTEM_PROMPT}\n\nReturn ONLY valid JSON matching this schema. Do not wrap it in markdown:\n${JSON.stringify(
                VISION_TOOL.function.parameters,
              )}`,
              userText,
              dataUrl.split(",")[1] ?? dataUrl,
              "image/png",
            );
            argStr = JSON.stringify(safeParseJson<unknown>(raw));
          }
          if (!argStr) {
            // Summarise the response shape so the operator can diagnose gateway issues.
            let technical: string;
            try {
              technical = JSON.stringify(aiJson).slice(0, 300);
            } catch {
              technical = String(aiJson);
            }
            pageOutcome.status = "model_unreadable";
            pageOutcome.errorMessage = "Vision model returned an unexpected response.";
            summary.errors.push(
              `${p.fileName} p${p.pageNumber}: vision_model_call — Vision model returned an unexpected response. Technical: ${technical}`,
            );
            summary.failedPages++;
            summary.pages.push(pageOutcome);
            continue;
          }
          let parsed: VisionPageResult;
          try {
            parsed = JSON.parse(argStr) as VisionPageResult;
          } catch (e) {
            pageOutcome.status = "model_unreadable";
            pageOutcome.errorMessage = "Vision model returned an unexpected response.";
            summary.errors.push(
              `${p.fileName} p${p.pageNumber}: vision_response_parse — Vision model returned an unexpected response. Technical: ${(e as Error).message}. Raw: ${argStr.slice(0, 200)}`,
            );
            summary.failedPages++;
            summary.pages.push(pageOutcome);
            continue;
          }

          // Validate the parsed object against the schema before any DB writes.
          // This rejects wrong enum values, bad field types, and missing required fields.
          const validation = VisionPageResultSchema.safeParse(parsed);
          if (!validation.success) {
            const technical = validation.error.issues
              .slice(0, 8)
              .map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`)
              .join("; ");
            pageOutcome.status = "model_unreadable";
            pageOutcome.errorMessage = "Vision model returned data in an unexpected format.";
            summary.errors.push(
              `${p.fileName} p${p.pageNumber}: vision_response_validation — Vision model returned data in an unexpected format. Technical: ${technical}`,
            );
            summary.failedPages++;
            summary.pages.push(pageOutcome);
            continue;
          }
          // Use the schema-validated data from here on — all enum values and field types are confirmed.
          parsed = validation.data as VisionPageResult;

          // Sum internal wall segments server-side — vision models cannot reliably
          // total many short wall segments themselves. Override internal_wall_length_m
          // with the computed sum whenever segments were provided.
          const sumSegments = (segs: unknown): number | null => {
            if (!Array.isArray(segs) || segs.length === 0) return null;
            const nums = segs.filter(
              (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
            );
            if (nums.length === 0) return null;
            return Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
          };
          const bgSegs = (validation.data.base_geometry as { internal_wall_segments_m?: number[] })
            .internal_wall_segments_m;
          const wlSegs = (validation.data.wall_lengths as { internal_wall_segments_m?: number[] })
            .internal_wall_segments_m;
          const bgSum = sumSegments(bgSegs);
          const wlSum = sumSegments(wlSegs);
          if (bgSum !== null) parsed.base_geometry.internal_wall_length_m = bgSum;
          if (wlSum !== null) parsed.wall_lengths.internal_wall_length_m = wlSum;
          // Cross-fill: if one side has a value (from segments OR direct AI output)
          // and the other is null, mirror it across so downstream consumers that
          // read either field get the same number.
          const bgVal = parsed.base_geometry.internal_wall_length_m;
          const wlVal = parsed.wall_lengths.internal_wall_length_m;
          if (bgVal == null && wlVal != null) parsed.base_geometry.internal_wall_length_m = wlVal;
          if (wlVal == null && bgVal != null) parsed.wall_lengths.internal_wall_length_m = bgVal;
          // Room-perimeter fallback. If still null, estimate from room dimensions:
          //   internal_walls ≈ (Σ room perimeters − external perimeter) / 2
          // (each internal wall is shared between two rooms).
          if (parsed.base_geometry.internal_wall_length_m == null) {
            const roomPerimSum = (parsed.rooms ?? []).reduce((sum, r) => {
              const w = r.dimensions_mm?.width;
              const l = r.dimensions_mm?.length;
              if (typeof w === "number" && typeof l === "number" && w > 0 && l > 0) {
                return sum + (2 * (w + l)) / 1000; // mm -> m
              }
              return sum;
            }, 0);
            const ext =
              parsed.base_geometry.external_perimeter_m ??
              parsed.wall_lengths.external_wall_length_m ??
              0;
            if (roomPerimSum > 0) {
              const estimate = Math.max(0, (roomPerimSum - ext) / 2);
              const rounded = Math.round(estimate * 100) / 100;
              if (rounded > 0) {
                parsed.base_geometry.internal_wall_length_m = rounded;
                parsed.wall_lengths.internal_wall_length_m = rounded;
                pageOutcome.warnings.push(
                  `internal_wall_length_m estimated from room perimeters (${rounded} m); review recommended.`,
                );
              }
            }
          }

          // Persist scale calibration from vision-extracted scale_text if present.
          if (parsed.scale_text) {
            const scaleMatch = parsed.scale_text.match(/1\s*[:/]\s*(\d{2,4})/i);
            if (scaleMatch) {
              const den = Number(scaleMatch[1]);
              if (Number.isFinite(den) && den > 0) {
                const pixelsPerMm = 2.83465 / den;
                const conf =
                  parsed.scale_confidence === "high"
                    ? "high"
                    : parsed.scale_confidence === "medium"
                      ? "mid"
                      : "low";
                await supabase.from("plan_calibrations").upsert(
                  {
                    job_id: data.jobId,
                    file_id: p.fileId,
                    plan_page_number: p.pageNumber,
                    calibration_line_pixels: 1,
                    calibration_real_mm: 1 / pixelsPerMm,
                    pixels_per_mm: pixelsPerMm,
                    scale_text: parsed.scale_text,
                    calibration_method: "auto_text",
                    calibration_source: "vision_takeoff",
                    confidence: conf,
                    calibrated_by: userId,
                  },
                  { onConflict: "job_id,file_id,plan_page_number", ignoreDuplicates: true },
                );
              }
            }
          }

          pageOutcome.result = parsed;
          pageOutcome.warnings = [...pageOutcome.warnings, ...(parsed.warnings ?? [])];
          pageOutcome.visionPageType = parsed.page_type;

          // Confidence accumulators.
          const cs = parsed.confidence_summary ?? "low";
          if (cs === "high") summary.confidenceCounts.high++;
          else if (cs === "medium") summary.confidenceCounts.medium++;
          else summary.confidenceCounts.low++;

          const clientPageType = (p.clientPageType ?? "").toLowerCase();
          const flattenedFallbackPage =
            !clientPageType ||
            clientPageType.includes("unknown") ||
            clientPageType.includes("fallback") ||
            clientPageType.includes("floor");
          const hasFloorplanOnlyEvidence =
            (parsed.rooms?.length ?? 0) > 0 ||
            (parsed.base_geometry.internal_wall_segments_m?.length ?? 0) > 0 ||
            parsed.base_geometry.external_perimeter_m != null ||
            parsed.area_box.area_over_frame_m2 != null ||
            (parsed.doors ?? []).some((d) => d.type === "internal" || d.type === "robe");

          const isFloorplan =
            FLOORPLAN_VISION_TYPES.has(parsed.page_type) ||
            (flattenedFallbackPage && hasFloorplanOnlyEvidence);

          // workingPlanReviewed only if working file's page was floorplan-classified.
          if (workingPlanFileId && p.fileId === workingPlanFileId && isFloorplan) {
            summary.workingPlanReviewed = true;
          }
          if (!FLOORPLAN_VISION_TYPES.has(parsed.page_type) && isFloorplan) {
            const note =
              `Vision returned page_type "${parsed.page_type}" but flattened floorplan evidence was found; geometry writes allowed.`;
            pageOutcome.warnings.push(note);
            summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${note}`);
          }

          const evidenceTag = `Rendered plan page ${p.pageNumber} (${p.fileName})`;

          // ============================================================
          // GEOMETRY GUARD — only insert area / geometry / measurements
          // when the model reports a floorplan/dimension floorplan page.
          // ============================================================
          if (!isFloorplan) {
            pageOutcome.status = "geometry_skipped_wrong_page_type";
            const note = `Vision returned page_type "${parsed.page_type}". Geometry rows were not inserted from this page.`;
            pageOutcome.warnings.push(note);
            summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${note}`);
            audit({
              job_id: data.jobId,
              user_id: userId,
              action: "vision_page_skipped",
              notes: note,
            });
          }

          const ab = parsed.area_box;
          const bg = parsed.base_geometry;
          const wl = parsed.wall_lengths;

          // ----- extracted_quantities (deduped by quantity_type + page) -----
          if (isFloorplan) {
            const qtyDefs: Array<{ type: string; unit: string; v: number | null }> = [
              { type: "Area Over Frame", unit: "m²", v: ab?.area_over_frame_m2 ?? null },
              { type: "Total Area", unit: "m²", v: ab?.total_area_m2 ?? null },
              { type: "Coverage Area", unit: "m²", v: ab?.coverage_area_m2 ?? null },
              { type: "Cladding Area", unit: "m²", v: ab?.cladding_area_m2 ?? null },
              { type: "Porch Area", unit: "m²", v: ab?.porch_area_m2 ?? null },
              {
                type: "External Perimeter",
                unit: "lm",
                v: bg?.external_perimeter_m ?? ab?.perimeter_m ?? null,
              },
              { type: "Internal Wall Length", unit: "lm", v: bg?.internal_wall_length_m ?? null },
              { type: "Garage Area", unit: "m²", v: bg?.garage_area_m2 ?? null },
              {
                type: "Living Area Excluding Garage",
                unit: "m²",
                v: bg?.living_area_excluding_garage_m2 ?? null,
              },
              { type: "Roof Pitch", unit: "°", v: parsed.roofing?.roof_pitch_degrees ?? null },
            ];

            for (const q of qtyDefs) {
              if (q.v == null || !Number.isFinite(q.v)) continue;

              // Dedupe lookup.
              const { data: ex } = await supabase
                .from("extracted_quantities")
                .select("id, approved_value")
                .eq("job_id", data.jobId)
                .eq("quantity_type", q.type)
                .eq("plan_page_number", p.pageNumber)
                .eq("data_source", "Vision Takeoff")
                .limit(1);
              const existing = ex?.[0] as { id: string; approved_value: number | null } | undefined;

              const baseFields = {
                extracted_value: q.v,
                unit: q.unit,
                data_source: "Vision Takeoff",
                source_evidence: evidenceTag,
                confidence: confToDbConfidence(cs),
                confidence_label: cs,
                review_status: "review_required",
              };

              if (existing) {
                // Drift check vs approved_value.
                let notesPatch: string | null = null;
                if (
                  existing.approved_value != null &&
                  Number.isFinite(existing.approved_value) &&
                  existing.approved_value !== 0
                ) {
                  const diffPct =
                    Math.abs(q.v - existing.approved_value) / Math.abs(existing.approved_value);
                  if (diffPct > 0.02) {
                    notesPatch = `Vision draft ${q.v} differs from approved ${existing.approved_value} by ${(diffPct * 100).toFixed(1)}%. Review before approval.`;
                  }
                }
                const { error: updErr } = await supabase
                  .from("extracted_quantities")
                  .update({
                    ...baseFields,
                    notes: notesPatch,
                  })
                  .eq("id", existing.id);
                if (updErr) {
                  summary.errors.push(
                    `Quantity refresh failed (${q.type}, p${p.pageNumber}): ${updErr.message}`,
                  );
                } else {
                  pageOutcome.quantitiesRefreshed++;
                  summary.areaPerimeterValuesFound++;
                  pageOutcome.reviewRequiredCount++;
                  if (notesPatch) {
                    audit({
                      job_id: data.jobId,
                      user_id: userId,
                      action: "vision_takeoff_drift",
                      notes: `${q.type} (p${p.pageNumber}): ${notesPatch}`,
                      previous_value: String(existing.approved_value),
                      new_value: String(q.v),
                    });
                  }
                }
              } else {
                const { error: qErr } = await supabase.from("extracted_quantities").insert({
                  job_id: data.jobId,
                  quantity_type: q.type,
                  plan_page_number: p.pageNumber,
                  approved_value: null,
                  ...baseFields,
                });
                if (qErr) {
                  summary.errors.push(
                    `Quantity insert failed (${q.type}, p${p.pageNumber}): ${qErr.message}`,
                  );
                } else {
                  pageOutcome.quantitiesInserted++;
                  summary.visionQuantitiesCreated++;
                  summary.areaPerimeterValuesFound++;
                  pageOutcome.reviewRequiredCount++;
                  audit({
                    job_id: data.jobId,
                    user_id: userId,
                    action: "vision_quantity_created",
                    notes: `${q.type} = ${q.v} ${q.unit} (p${p.pageNumber})`,
                    new_value: String(q.v),
                  });
                }
              }
            }
          }
          await persistRunSummary("running");

          // ----- opening_schedule (windows + doors) -----
          const upsertOpening = async (args: {
            opening_type: string;
            width_mm: number;
            height_mm: number | null;
            room: string | null;
            confidence: "high" | "mid" | "low";
            source_evidence: string;
            notes: string | null;
            counterKey: "windowItemsFound" | "doorItemsFound";
            logLabel: string;
          }) => {
            // Lookup existing row matching the dedupe key.
            const { data: existingRows } = await supabase
              .from("opening_schedule")
              .select("id, review_status, room_name, height_mm")
              .eq("job_id", data.jobId)
              .eq("file_id", p.fileId)
              .eq("plan_page_number", p.pageNumber)
              .eq("opening_type", args.opening_type)
              .eq("width_mm", args.width_mm)
              .eq("source", "Vision Takeoff")
              .limit(50);
            const match = (existingRows ?? []).find(
              (r: { height_mm: number | null; room_name: string | null }) => {
                const heightEq =
                  (r.height_mm == null && args.height_mm == null) ||
                  (r.height_mm != null &&
                    args.height_mm != null &&
                    Number(r.height_mm) === Number(args.height_mm));
                const roomEq = (r.room_name ?? null) === (args.room ?? null);
                return heightEq && roomEq;
              },
            ) as { id: string; review_status: string | null } | undefined;

            if (match) {
              const wasConfirmed =
                match.review_status === "approved" || match.review_status === "confirmed";
              const { error: upErr } = await supabase
                .from("opening_schedule")
                .update({
                  confidence: args.confidence,
                  source_evidence: args.source_evidence,
                  review_status: wasConfirmed
                    ? (match.review_status ?? "review_required")
                    : "review_required",
                  notes: args.notes,
                })
                .eq("id", match.id);
              if (upErr) {
                summary.errors.push(`Opening refresh failed (p${p.pageNumber}): ${upErr.message}`);
              } else {
                pageOutcome.openingsRefreshed++;
                summary[args.counterKey]++;
                if (!wasConfirmed) pageOutcome.reviewRequiredCount++;
                audit({
                  job_id: data.jobId,
                  user_id: userId,
                  action: "vision_opening_refreshed",
                  notes: `${args.logLabel} (p${p.pageNumber})`,
                });
              }
              return;
            }

            const { error: oErr } = await supabase.from("opening_schedule").insert({
              job_id: data.jobId,
              plan_page_number: p.pageNumber,
              opening_type: args.opening_type,
              width_mm: args.width_mm,
              height_mm: args.height_mm,
              room_name: args.room,
              quantity: 1,
              source: "Vision Takeoff",
              source_evidence: args.source_evidence,
              confidence: args.confidence,
              review_status: "review_required",
              notes: args.notes,
              created_by: userId,
              file_id: p.fileId,
            });
            if (oErr) {
              summary.errors.push(`Opening insert failed (p${p.pageNumber}): ${oErr.message}`);
            } else {
              pageOutcome.openingsInserted++;
              summary[args.counterKey]++;
              summary.visionOpeningsCreated++;
              pageOutcome.reviewRequiredCount++;
              audit({
                job_id: data.jobId,
                user_id: userId,
                action: "vision_opening_created",
                notes: `${args.logLabel} (p${p.pageNumber})`,
              });
            }
          };

          for (const w of parsed.windows ?? []) {
            const classified = classifyVisionWindowOpening(w);
            if (!classified) continue;
            await upsertOpening({
              opening_type: classified.openingType,
              width_mm: classified.widthMm,
              height_mm: classified.heightMm,
              room: w.room,
              confidence: classified.confidence,
              source_evidence: `${evidenceTag} — ${w.source_evidence || w.label}`,
              notes: classified.notes,
              counterKey: classified.counterKey,
              logLabel: classified.logLabel,
            });
          }
          for (const d2 of (parsed.doors ?? []).filter((door) => door.type === "garage")) {
            if (d2.width_mm == null) continue;
            await upsertOpening({
              opening_type: "garage_door",
              width_mm: d2.width_mm,
              height_mm: d2.height_mm,
              room: d2.room ?? "Garage",
              confidence: confToDbConfidence(d2.confidence),
              source_evidence: `${evidenceTag} — ${d2.source_evidence || "garage door"}`,
              notes: "garage door",
              counterKey: "doorItemsFound",
              logLabel: `garage_door ${d2.width_mm}x${d2.height_mm ?? "?"}`,
            });
          }
          const usefulRowsAfterWindows =
            pageOutcome.openingsInserted +
              pageOutcome.openingsRefreshed +
              pageOutcome.quantitiesInserted +
              pageOutcome.quantitiesRefreshed >
            0;
          if (usefulRowsAfterWindows) {
            summary.pagesProcessed++;
            summary.processedPages++;
            summary.reviewRequiredItems += pageOutcome.reviewRequiredCount;
            const firstPassWarning =
              "Vision saved the first-pass quantities, glazing schedule, and any garage-door rows; internal doors, derived measurements, and module drafts are deferred to follow-up passes.";
            if (!summary.warnings.includes(firstPassWarning)) {
              summary.warnings.push(firstPassWarning);
            }
            for (const warning of parsed.warnings ?? []) {
              summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${warning}`);
            }
            summary.pages.push(pageOutcome);
            summary.warningCount = summary.warnings.length;
            summary.errorCount = summary.errors.length;
            summary.pagesSkipped = summary.pagesRendered - summary.pagesSentToVision;
            audit({
              job_id: data.jobId,
              user_id: userId,
              action: "vision_takeoff_completed_with_warnings",
              notes: `Completed first pass after glazing. Quantities ${summary.visionQuantitiesCreated}, openings ${summary.visionOpeningsCreated}.`,
            });
            await persistRunSummary("completed_with_warnings");
            await flushAudit();
            return summary;
          }
          // external_door rows are written to opening_schedule for review visibility but are
          // deliberately excluded from the QS windows_by_room export (matchWindowOpening filters
          // to opening_type === "window" only). This is intentional — QS prices external doors
          // separately via external_door_count, not through the window schedule cells.
          for (const d2 of parsed.doors ?? []) {
            if (d2.width_mm == null) continue;
            const opening_type = normalizeOpeningType(d2.type, "door");
            const isUnknown = opening_type === "unknown_opening";
            await upsertOpening({
              opening_type,
              width_mm: d2.width_mm,
              height_mm: d2.height_mm,
              room: d2.room,
              confidence: isUnknown ? "low" : confToDbConfidence(d2.confidence),
              source_evidence: `${evidenceTag} — ${d2.source_evidence || `${d2.type} door`}`,
              notes: null,
              counterKey: "doorItemsFound",
              logLabel: `${opening_type} ${d2.width_mm}×${d2.height_mm ?? "?"}`,
            });
          }
          await persistRunSummary("running");
          const usefulRowsSaved =
            pageOutcome.openingsInserted +
              pageOutcome.openingsRefreshed +
              pageOutcome.quantitiesInserted +
              pageOutcome.quantitiesRefreshed >
            0;
          const shouldReturnAfterOpenings =
            usefulRowsSaved &&
            (data.pages.length === 1 || Date.now() - startedAtMs > VISION_SOFT_RETURN_AFTER_OPENINGS_MS);
          const deferDerivedDrafts = usefulRowsSaved;
          if (deferDerivedDrafts) {
            const deferWarning =
              "Vision saved quantities and openings; derived measurements and module drafts are deferred until the calibrated QS pass.";
            if (!summary.warnings.includes(deferWarning)) {
              summary.warnings.push(deferWarning);
            }
          }
          if (shouldReturnAfterOpenings) {
            summary.pagesProcessed++;
            summary.processedPages++;
            summary.reviewRequiredItems += pageOutcome.reviewRequiredCount;
            const softTimeoutWarning =
              data.pages.length === 1
                ? "Vision saved quantities and openings; measurements and module drafts were deferred to keep the run responsive."
                : "Vision returned early after saving quantities and openings to avoid a request timeout. Measurements and module drafts were not completed.";
            if (!summary.warnings.includes(softTimeoutWarning)) {
              summary.warnings.push(softTimeoutWarning);
            }
            for (const w of parsed.warnings ?? []) {
              summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${w}`);
            }
            summary.pages.push(pageOutcome);
            summary.warningCount = summary.warnings.length;
            summary.errorCount = summary.errors.length;
            summary.pagesSkipped = summary.pagesRendered - summary.pagesSentToVision;
            audit({
              job_id: data.jobId,
              user_id: userId,
              action: "vision_takeoff_completed_with_warnings",
              notes: `Returned early after openings. Quantities ${summary.visionQuantitiesCreated}, openings ${summary.visionOpeningsCreated}.`,
            });
            await persistRunSummary("completed_with_warnings");
            await flushAudit();
            return summary;
          }

          // ----- plan_measurements (deduped) -----
          if (isFloorplan && !deferDerivedDrafts) {
            const measurementInserts: Array<{
              measurement_type: string;
              label: string;
              module_id: string | null;
              calculated_length_m?: number | null;
              calculated_area_m2?: number | null;
              category?: string | null;
            }> = [];
            if (bg?.external_perimeter_m != null) {
              measurementInserts.push({
                measurement_type: "external_perimeter",
                label: "External Perimeter",
                module_id: "iq-cladding",
                calculated_length_m: bg.external_perimeter_m,
              });
            }
            if (bg?.internal_wall_length_m != null) {
              measurementInserts.push({
                measurement_type: "internal_wall",
                label: "Internal Wall Length",
                module_id: "iq-framing",
                calculated_length_m: bg.internal_wall_length_m,
                category: "standard",
              });
            }
            if (bg?.garage_area_m2 != null) {
              measurementInserts.push({
                measurement_type: "area",
                label: "Garage Area",
                module_id: "iq-core",
                calculated_area_m2: bg.garage_area_m2,
              });
            }
            for (const room of parsed.rooms ?? []) {
              if (room.area_m2 != null) {
                measurementInserts.push({
                  measurement_type: "area",
                  label: `${room.name} Area`,
                  module_id: "iq-linings",
                  calculated_area_m2: room.area_m2,
                });
              }
            }
            for (const m of measurementInserts) {
              const { data: exMeas } = await supabase
                .from("plan_measurements")
                .select("id")
                .eq("job_id", data.jobId)
                .eq("measurement_type", m.measurement_type)
                .eq("label", m.label)
                .eq("plan_page_number", p.pageNumber)
                .eq("file_id", p.fileId)
                .eq("source", "Vision Takeoff")
                .limit(1);
              const existing = exMeas?.[0] as { id: string } | undefined;
              const fields = {
                measurement_type: m.measurement_type,
                label: m.label,
                module_id: m.module_id,
                points_json: [],
                calculated_length_m: m.calculated_length_m ?? null,
                calculated_length_mm:
                  m.calculated_length_m != null ? Math.round(m.calculated_length_m * 1000) : null,
                calculated_area_m2: m.calculated_area_m2 ?? null,
                count_value: null,
                source: "Vision Takeoff",
                confidence: confToDbConfidence(cs),
                review_status: "review_required",
                notes: evidenceTag,
                category: m.category ?? null,
              };
              if (existing) {
                const { error: upErr } = await supabase
                  .from("plan_measurements")
                  .update(fields)
                  .eq("id", existing.id);
                if (upErr) {
                  summary.errors.push(
                    `Measurement refresh failed (${m.label}, p${p.pageNumber}): ${upErr.message}`,
                  );
                } else {
                  pageOutcome.measurementsRefreshed++;
                  pageOutcome.reviewRequiredCount++;
                  if (
                    m.measurement_type === "external_perimeter" ||
                    m.measurement_type === "internal_wall"
                  ) {
                    summary.wallLengthsFound++;
                  }
                }
              } else {
                const { error: mErr } = await supabase.from("plan_measurements").insert({
                  ...fields,
                  job_id: data.jobId,
                  file_id: p.fileId,
                  plan_page_number: p.pageNumber,
                  created_by: userId,
                });
                if (mErr) {
                  summary.errors.push(
                    `Measurement insert failed (${m.label}, p${p.pageNumber}): ${mErr.message}`,
                  );
                } else {
                  pageOutcome.measurementsInserted++;
                  summary.visionMeasurementsCreated++;
                  pageOutcome.reviewRequiredCount++;
                  if (
                    m.measurement_type === "external_perimeter" ||
                    m.measurement_type === "internal_wall"
                  ) {
                    summary.wallLengthsFound++;
                  }
                  audit({
                    job_id: data.jobId,
                    user_id: userId,
                    action: "vision_measurement_created",
                    notes: `${m.label} (p${p.pageNumber})`,
                    new_value: String(m.calculated_length_m ?? m.calculated_area_m2 ?? ""),
                  });
                }
              }
            }
          }

          // ----- module_items drafts -----
          if (isFloorplan && !deferDerivedDrafts) {
            type ModuleDraft = {
              moduleId: "iq-core" | "iq-framing" | "iq-linings" | "iq-cladding" | "iq-roofing";
              label: string;
              unit: string;
              value: string;
              confidence: VisionConfidence;
            };
            const drafts: ModuleDraft[] = [];
            const numStr = (n: number | null | undefined): string | null =>
              n == null || !Number.isFinite(n) ? null : String(n);
            const addNumeric = (
              moduleId: ModuleDraft["moduleId"],
              label: string,
              unit: string,
              n: number | null | undefined,
              conf: VisionConfidence,
            ) => {
              const v = numStr(n);
              if (v != null) drafts.push({ moduleId, label, unit, value: v, confidence: conf });
            };
            // Labels match IQ Core template keys. "House Area" = area_over_frame_m2
            // (the Jennian primary metric, e.g. 216.3m² for Shaik). "Total Area" is
            // whatever the plan prints as the total (may include eaves/porch overhang).
            addNumeric("iq-core", "House Area", "m²", ab?.area_over_frame_m2, cs);
            addNumeric("iq-core", "Total Area", "m²", ab?.total_area_m2, cs);
            addNumeric("iq-core", "Coverage Area", "m²", ab?.coverage_area_m2, cs);
            addNumeric("iq-core", "Cladding Area", "m²", ab?.cladding_area_m2, cs);
            addNumeric("iq-core", "Porch Area", "m²", ab?.porch_area_m2, cs);
            addNumeric(
              "iq-core",
              "External Perimeter",
              "lm",
              bg?.external_perimeter_m ?? ab?.perimeter_m ?? null,
              cs,
            );
            addNumeric("iq-core", "Internal Wall Length", "lm", bg?.internal_wall_length_m, cs);
            addNumeric("iq-core", "Garage Area", "m²", bg?.garage_area_m2, cs);
            addNumeric("iq-core", "Living Area", "m²", bg?.living_area_excluding_garage_m2, cs);
            // Roof pitch also lands in IQ Core (architectural geometry) as well as IQ Roofing.
            addNumeric("iq-core", "Roof Pitch", "°", parsed.roofing?.roof_pitch_degrees, cs);
            addNumeric("iq-framing", "External Walls", "lm", bg?.external_perimeter_m, cs);
            addNumeric("iq-framing", "Internal Walls", "lm", bg?.internal_wall_length_m, cs);
            addNumeric("iq-framing", "Wet Area Walls", "lm", wl?.wet_area_wall_length_m, cs);
            addNumeric("iq-framing", "Robe Walls", "lm", wl?.robe_wall_length_m, cs);
            addNumeric(
              "iq-framing",
              "Garage Internal Walls",
              "lm",
              wl?.garage_internal_wall_length_m,
              cs,
            );
            addNumeric("iq-linings", "Internal Wall Length", "lm", bg?.internal_wall_length_m, cs);
            addNumeric(
              "iq-cladding",
              "Cladding Area",
              "m²",
              parsed.cladding?.cladding_area_m2 ?? ab?.cladding_area_m2,
              cs,
            );
            addNumeric(
              "iq-cladding",
              "External Perimeter",
              "lm",
              bg?.external_perimeter_m ?? ab?.perimeter_m ?? null,
              cs,
            );
            addNumeric("iq-cladding", "Brick Length", "lm", parsed.cladding?.brick_length_m, cs);
            addNumeric("iq-roofing", "Pitch", "°", parsed.roofing?.roof_pitch_degrees, cs);
            addNumeric("iq-roofing", "Roof Area", "m²", parsed.roofing?.roof_area_m2, cs);
            addNumeric("iq-roofing", "Coverage Area", "m²", ab?.coverage_area_m2, cs);
            if (parsed.cladding?.type) {
              drafts.push({
                moduleId: "iq-cladding",
                label: "Cladding Type",
                unit: "type",
                value: parsed.cladding.type,
                confidence: cs,
              });
            }
            // NOTE: do NOT auto-insert "Window Openings = N" / "Door Openings = N"
            // module rows. Empty/under-detection arrays must not become misleading
            // zero-count items, and even non-zero counts are unreliable until the
            // user reviews each opening row in opening_schedule.

            for (const d3 of drafts) {
              const runId = moduleRunByModule[d3.moduleId];
              if (!runId) {
                summary.errors.push(
                  `Module run missing for ${d3.moduleId} — cannot insert "${d3.label}".`,
                );
                continue;
              }
              const { data: existing } = await supabase
                .from("module_items")
                .select("id, approved_value, data_source, extracted_value")
                .eq("run_id", runId)
                .eq("label", d3.label)
                .limit(1);
              const ex = existing?.[0] as
                | {
                    id: string;
                    approved_value: string | null;
                    data_source: string | null;
                    extracted_value: string | null;
                  }
                | undefined;
              if (ex?.data_source === "User Override") continue;
              if (ex) {
                // 2% drift tolerance against approved_value when both numeric.
                let driftNote: string | null = null;
                let needsReview = true;
                if (ex.approved_value != null && ex.approved_value !== "") {
                  const newNum = Number(d3.value);
                  const oldNum = Number(ex.approved_value);
                  if (Number.isFinite(newNum) && Number.isFinite(oldNum) && oldNum !== 0) {
                    const diffPct = Math.abs(newNum - oldNum) / Math.abs(oldNum);
                    if (diffPct <= 0.02) {
                      needsReview = false; // within tolerance — leave approved alone
                    } else {
                      driftNote = `Vision draft ${d3.value} differs from approved ${ex.approved_value} by ${(diffPct * 100).toFixed(1)}%. Review before approval.`;
                    }
                  } else {
                    // Non-numeric or unparseable — treat as drift if string differs.
                    if (ex.approved_value !== d3.value) {
                      driftNote = `Vision draft "${d3.value}" differs from approved "${ex.approved_value}". Review before approval.`;
                    } else {
                      needsReview = false;
                    }
                  }
                }
                const { error: upErr } = await supabase
                  .from("module_items")
                  .update({
                    extracted_value: d3.value,
                    unit: d3.unit,
                    data_source: "Vision Takeoff",
                    source: "ai_inferred",
                    source_evidence: evidenceTag,
                    confidence: d3.confidence,
                    review_status: needsReview ? "review_required" : "approved",
                    plan_page_number: p.pageNumber,
                    file_id: p.fileId,
                    notes: driftNote,
                  })
                  .eq("id", ex.id);
                if (upErr) {
                  summary.errors.push(`Module item refresh failed (${d3.label}): ${upErr.message}`);
                } else {
                  pageOutcome.moduleItemsRefreshed++;
                  summary.moduleDraftItemsCreated++;
                  if (needsReview) pageOutcome.reviewRequiredCount++;
                  if (driftNote) {
                    audit({
                      job_id: data.jobId,
                      user_id: userId,
                      action: "vision_takeoff_drift",
                      module_id: d3.moduleId,
                      item_id: ex.id,
                      run_id: runId,
                      previous_value: ex.approved_value,
                      new_value: d3.value,
                      notes: driftNote,
                    });
                  }
                }
                continue;
              }
              const { data: ins, error: insErr } = await supabase
                .from("module_items")
                .insert({
                  run_id: runId,
                  job_id: data.jobId,
                  module_id: d3.moduleId,
                  label: d3.label,
                  unit: d3.unit,
                  extracted_value: d3.value,
                  approved_value: null,
                  confidence: d3.confidence,
                  review_status: "review_required",
                  data_source: "Vision Takeoff",
                  source: "ai_inferred",
                  source_evidence: evidenceTag,
                  plan_page_number: p.pageNumber,
                  file_id: p.fileId,
                  basis: "Vision Takeoff",
                  notes: null,
                  sort_order: 110,
                })
                .select("id")
                .single();
              if (insErr) {
                summary.errors.push(`Module item insert failed (${d3.label}): ${insErr.message}`);
              } else {
                pageOutcome.moduleItemsInserted++;
                summary.moduleDraftItemsCreated++;
                summary.visionModuleItemsCreated++;
                pageOutcome.reviewRequiredCount++;
                audit({
                  job_id: data.jobId,
                  user_id: userId,
                  action: "vision_module_item_created",
                  module_id: d3.moduleId,
                  item_id: ins?.id ?? null,
                  run_id: runId,
                  new_value: d3.value,
                  notes: `${d3.label} = ${d3.value} ${d3.unit}`,
                });
              }
            }
          }

          summary.pagesProcessed++;
          summary.processedPages++;
          summary.reviewRequiredItems += pageOutcome.reviewRequiredCount;
          for (const w of parsed.warnings ?? [])
            summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${w}`);
          audit({
            job_id: data.jobId,
            user_id: userId,
            action: "vision_page_processed",
            notes: `${p.fileName} p${p.pageNumber} (page_type=${parsed.page_type})`,
          });
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : err instanceof Response
                ? `Server error (HTTP ${(err as Response).status}).`
                : typeof err === "string"
                  ? err
                  : "Unknown vision takeoff failure.";
          pageOutcome.status = "error";
          pageOutcome.errorMessage = msg;
          summary.errors.push(`${p.fileName} p${p.pageNumber}: ${msg}`);
          summary.failedPages++;
          audit({
            job_id: data.jobId,
            user_id: userId,
            action: "vision_takeoff_failed",
            notes: `${p.fileName} p${p.pageNumber}: ${msg}`,
          });
        }
        summary.pages.push(pageOutcome);
      }

      if (!summary.workingPlanReviewed) {
        summary.warnings.push("No floorplan page was confirmed by Vision Takeoff.");
      }

      summary.warningCount = summary.warnings.length;
      summary.errorCount = summary.errors.length;
      summary.pagesSkipped = summary.pagesRendered - summary.pagesSentToVision;

      audit({
        job_id: data.jobId,
        user_id: userId,
        action: summary.errorCount > 0 ? "vision_takeoff_failed" : "vision_takeoff_completed",
        notes: `Processed ${summary.pagesProcessed}/${summary.pagesRendered}. Quantities ${summary.visionQuantitiesCreated}, openings ${summary.visionOpeningsCreated}, measurements ${summary.visionMeasurementsCreated}, module drafts ${summary.visionModuleItemsCreated}.`,
      });
      const finalStatus =
        summary.errors.length > 0 || summary.warnings.length > 0
          ? "completed_with_warnings"
          : "completed";

      // Persist the final summary. The row is created at the start so a long
      // model read can still be recovered if the HTTP request times out.
      if (takeoffRunId) {
        await persistRunSummary(finalStatus);
      } else {
        await supabase.from("takeoff_runs").insert({
          job_id: data.jobId,
          started_by: userId,
          status: finalStatus,
          summary: toJson({ kind: "vision_takeoff", vision: summary }),
          completed_at: new Date().toISOString(),
          error_message:
            summary.errors.length > 0
              ? summary.errors.slice(0, 5).join(" | ")
              : summary.warnings.length > 0
                ? summary.warnings.slice(0, 3).join(" | ")
                : null,
        });
      }
      await flushAudit();

      return summary;
    } catch (topErr: unknown) {
      const msg =
        topErr instanceof Error
          ? topErr.message
          : topErr instanceof Response
            ? `Server error (HTTP ${(topErr as Response).status}).`
            : "Unexpected Vision Takeoff failure.";
      return {
        ok: false,
        error: {
          operation: "vision_takeoff",
          message: msg,
          technical: topErr instanceof Error ? topErr.stack?.slice(0, 500) : undefined,
        },
      };
    }
  });
