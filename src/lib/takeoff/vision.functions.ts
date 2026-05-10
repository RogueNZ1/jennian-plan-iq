/**
 * Phase B — Vision Takeoff server function.
 *
 * Receives one (or more) rendered plan-page image paths, sends each to the
 * Lovable AI Gateway with a strict construction-takeoff prompt, parses the
 * structured JSON tool call, and inserts source-backed draft rows into
 * extracted_quantities, opening_schedule, plan_measurements, and module_items.
 *
 * Server-only: reads SUPABASE_SERVICE_ROLE_KEY and LOVABLE_API_KEY from
 * `process.env` inside the handler.
 *
 * NEVER writes approved_value. Every row is review_required.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  VisionPageResult,
  VisionRunSummary,
  VisionRunPageOutcome,
  VisionConfidence,
} from "./vision-types";

const SYSTEM_PROMPT = `You are reviewing a single rendered page from a construction plan PDF for a residential takeoff.

Strict rules:
- Extract VISIBLE information only.
- Do NOT invent quantities. Do NOT guess hidden dimensions.
- If a value is not visible, return null. Do not make one up.
- Use printed dimensions and any printed scale where available.
- Use the visible Area / Perimeter box if present.
- Read window and door sizes only from labels visible on the plan.
- Mark uncertain values as low confidence.
- Keep these quantity concepts SEPARATE — do not merge them:
    Area Over Frame, Total Area, Coverage Area, Cladding Area,
    Porch Area, Garage Area, External Perimeter, Internal Wall Length.
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
          enum: ["dimension_floorplan","floorplan","site_plan","elevations","sections","roof_plan","electrical_plan","plumbing_plan","unknown"],
        },
        scale_text: { type: ["string","null"] },
        scale_confidence: { type: "string", enum: ["high","medium","low"] },
        area_box: {
          type: "object",
          additionalProperties: false,
          properties: {
            total_area_m2: { type: ["number","null"] },
            area_over_frame_m2: { type: ["number","null"] },
            coverage_area_m2: { type: ["number","null"] },
            cladding_area_m2: { type: ["number","null"] },
            porch_area_m2: { type: ["number","null"] },
            perimeter_m: { type: ["number","null"] },
          },
          required: ["total_area_m2","area_over_frame_m2","coverage_area_m2","cladding_area_m2","porch_area_m2","perimeter_m"],
        },
        base_geometry: {
          type: "object",
          additionalProperties: false,
          properties: {
            external_perimeter_m: { type: ["number","null"] },
            internal_wall_length_m: { type: ["number","null"] },
            garage_area_m2: { type: ["number","null"] },
            living_area_excluding_garage_m2: { type: ["number","null"] },
          },
          required: ["external_perimeter_m","internal_wall_length_m","garage_area_m2","living_area_excluding_garage_m2"],
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
                  width: { type: ["number","null"] },
                  length: { type: ["number","null"] },
                },
                required: ["width","length"],
              },
              area_m2: { type: ["number","null"] },
            },
            required: ["name","dimensions_mm","area_m2"],
          },
        },
        windows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              width_mm: { type: ["number","null"] },
              height_mm: { type: ["number","null"] },
              room: { type: ["string","null"] },
              confidence: { type: "string", enum: ["high","medium","low"] },
              source_evidence: { type: "string" },
            },
            required: ["label","width_mm","height_mm","room","confidence","source_evidence"],
          },
        },
        doors: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string", enum: ["internal","external","sliding","garage","robe","unknown"] },
              width_mm: { type: ["number","null"] },
              height_mm: { type: ["number","null"] },
              room: { type: ["string","null"] },
              confidence: { type: "string", enum: ["high","medium","low"] },
              source_evidence: { type: "string" },
            },
            required: ["type","width_mm","height_mm","room","confidence","source_evidence"],
          },
        },
        wall_lengths: {
          type: "object",
          additionalProperties: false,
          properties: {
            external_wall_length_m: { type: ["number","null"] },
            internal_wall_length_m: { type: ["number","null"] },
            wet_area_wall_length_m: { type: ["number","null"] },
            garage_internal_wall_length_m: { type: ["number","null"] },
            robe_wall_length_m: { type: ["number","null"] },
          },
          required: ["external_wall_length_m","internal_wall_length_m","wet_area_wall_length_m","garage_internal_wall_length_m","robe_wall_length_m"],
        },
        cladding: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: ["string","null"] },
            cladding_area_m2: { type: ["number","null"] },
            brick_length_m: { type: ["number","null"] },
            notes: { type: ["string","null"] },
          },
          required: ["type","cladding_area_m2","brick_length_m","notes"],
        },
        roofing: {
          type: "object",
          additionalProperties: false,
          properties: {
            roof_pitch_degrees: { type: ["number","null"] },
            roof_area_m2: { type: ["number","null"] },
            notes: { type: ["string","null"] },
          },
          required: ["roof_pitch_degrees","roof_area_m2","notes"],
        },
        warnings: { type: "array", items: { type: "string" } },
        confidence_summary: { type: "string", enum: ["high","medium","low"] },
      },
      required: [
        "page_type","scale_text","scale_confidence","area_box","base_geometry",
        "rooms","windows","doors","wall_lengths","cladding","roofing","warnings",
        "confidence_summary",
      ],
    },
  },
};

function confToDbConfidence(c: VisionConfidence | null | undefined): "high" | "mid" | "low" {
  if (c === "high") return "high";
  if (c === "low") return "low";
  return "mid";
}

function buf2b64(buf: ArrayBuffer): string {
  // Worker / Node env both support Buffer with nodejs_compat.
  return Buffer.from(buf).toString("base64");
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
      }),
    )
    .min(1)
    .max(8),
  specificationText: z.string().optional(),
});

export const runVisionTakeoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<VisionRunSummary> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured.");
    }

    const summary: VisionRunSummary = {
      ranAt: new Date().toISOString(),
      pagesProcessed: 0,
      workingPlanReviewed: false,
      areaPerimeterValuesFound: 0,
      windowItemsFound: 0,
      doorItemsFound: 0,
      wallLengthsFound: 0,
      moduleDraftItemsCreated: 0,
      reviewRequiredItems: 0,
      warnings: [],
      errors: [],
      pages: [],
    };

    // Look up working_plan_file_id once for "Working Plan Reviewed" card.
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("working_plan_file_id")
      .eq("id", data.jobId)
      .maybeSingle();
    const workingPlanFileId = jobRow?.working_plan_file_id ?? null;

    // Pre-load the module_runs map (needed to insert module_items).
    const { data: runs } = await supabase
      .from("module_runs")
      .select("id, module_id")
      .eq("job_id", data.jobId);
    const moduleRunByModule: Record<string, string> = {};
    for (const r of runs ?? []) {
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
        openingsInserted: 0,
        measurementsInserted: 0,
        moduleItemsInserted: 0,
        reviewRequiredCount: 0,
        warnings: [],
      };

      try {
        // Download the rendered page image (admin client bypasses RLS for server I/O).
        const { data: blob, error: dlErr } = await supabase.storage
          .from(p.storageBucket)
          .download(p.storagePath);
        if (dlErr || !blob) {
          throw new Error(`Could not download rendered page image: ${dlErr?.message ?? "no data"}`);
        }
        const bytes = await blob.arrayBuffer();
        const dataUrl = `data:image/png;base64,${buf2b64(bytes)}`;

        const userMessageContent: Array<unknown> = [
          {
            type: "text",
            text:
              `Job: ${data.jobId}. File: ${p.fileName}. Page number: ${p.pageNumber}.` +
              (data.specificationText
                ? `\n\nProject specification text (for context only — DO NOT copy values you cannot see on this page):\n${data.specificationText.slice(0, 4000)}`
                : ""),
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ];

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessageContent },
            ],
            tools: [VISION_TOOL],
            tool_choice: { type: "function", function: { name: "submit_vision_takeoff" } },
          }),
        });

        if (aiRes.status === 429) throw new Error("Vision model rate-limited (429). Try again shortly.");
        if (aiRes.status === 402) throw new Error("Lovable AI workspace credits exhausted (402).");
        if (!aiRes.ok) {
          const text = await aiRes.text().catch(() => "");
          throw new Error(`Vision model error ${aiRes.status}: ${text.slice(0, 240)}`);
        }
        const aiJson = (await aiRes.json()) as {
          choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
        };
        const argStr = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (!argStr) {
          pageOutcome.status = "model_unreadable";
          pageOutcome.errorMessage = "Model did not return structured takeoff JSON.";
          summary.warnings.push(
            `${p.fileName} p${p.pageNumber}: vision model did not return structured JSON.`,
          );
          summary.pages.push(pageOutcome);
          continue;
        }
        let parsed: VisionPageResult;
        try {
          parsed = JSON.parse(argStr) as VisionPageResult;
        } catch (e) {
          pageOutcome.status = "model_unreadable";
          pageOutcome.errorMessage = `Could not parse model JSON: ${(e as Error).message}`;
          summary.warnings.push(
            `${p.fileName} p${p.pageNumber}: could not parse vision model JSON.`,
          );
          summary.pages.push(pageOutcome);
          continue;
        }
        pageOutcome.result = parsed;
        pageOutcome.warnings = parsed.warnings ?? [];
        if (workingPlanFileId && p.fileId === workingPlanFileId) {
          summary.workingPlanReviewed = true;
        }

        // ---- Insert extracted_quantities (numeric values only) ----
        const evidenceTag = `Rendered plan page ${p.pageNumber} (${p.fileName})`;
        const qtyRows: Array<{
          quantity_type: string;
          unit: string;
          extracted_value: number;
          confidence: VisionConfidence;
          evidence: string;
        }> = [];
        const ab = parsed.area_box;
        const bg = parsed.base_geometry;
        const wl = parsed.wall_lengths;
        const pushQty = (
          quantity_type: string, unit: string,
          v: number | null, conf: VisionConfidence, ev: string,
        ) => {
          if (v == null || !Number.isFinite(v)) return;
          qtyRows.push({ quantity_type, unit, extracted_value: v, confidence: conf, evidence: ev });
        };
        const c = parsed.confidence_summary ?? "low";
        pushQty("Area Over Frame", "m²", ab?.area_over_frame_m2 ?? null, c, evidenceTag);
        pushQty("Total Area", "m²", ab?.total_area_m2 ?? null, c, evidenceTag);
        pushQty("Coverage Area", "m²", ab?.coverage_area_m2 ?? null, c, evidenceTag);
        pushQty("Cladding Area", "m²", ab?.cladding_area_m2 ?? null, c, evidenceTag);
        pushQty("Porch Area", "m²", ab?.porch_area_m2 ?? null, c, evidenceTag);
        pushQty(
          "External Perimeter", "lm",
          bg?.external_perimeter_m ?? ab?.perimeter_m ?? null,
          c, evidenceTag,
        );
        pushQty("Internal Wall Length", "lm", bg?.internal_wall_length_m ?? null, c, evidenceTag);
        pushQty("Garage Area", "m²", bg?.garage_area_m2 ?? null, c, evidenceTag);
        pushQty("Living Area Excluding Garage", "m²", bg?.living_area_excluding_garage_m2 ?? null, c, evidenceTag);
        pushQty("Roof Pitch", "°", parsed.roofing?.roof_pitch_degrees ?? null, c, evidenceTag);

        for (const q of qtyRows) {
          const { error: qErr } = await supabase.from("extracted_quantities").insert({
            job_id: data.jobId,
            quantity_type: q.quantity_type,
            unit: q.unit,
            extracted_value: q.extracted_value,
            approved_value: null,
            confidence: confToDbConfidence(q.confidence),
            data_source: "Vision Takeoff",
            source_evidence: q.evidence,
            plan_page_number: p.pageNumber,
            confidence_label: q.confidence,
            review_status: "review_required",
          });
          if (qErr) {
            summary.errors.push(
              `Quantity insert failed (${q.quantity_type}, p${p.pageNumber}): ${qErr.message}`,
            );
          } else {
            pageOutcome.quantitiesInserted++;
            summary.areaPerimeterValuesFound++;
            pageOutcome.reviewRequiredCount++;
          }
        }

        // ---- Insert opening_schedule rows ----
        for (const w of parsed.windows ?? []) {
          if (w.width_mm == null) continue;
          const { error: oErr } = await supabase.from("opening_schedule").insert({
            job_id: data.jobId,
            plan_page_number: p.pageNumber,
            opening_type: "window",
            width_mm: w.width_mm,
            height_mm: w.height_mm,
            room_name: w.room,
            quantity: 1,
            source: "Vision Takeoff",
            source_evidence: `${evidenceTag} — ${w.source_evidence || w.label}`,
            confidence: confToDbConfidence(w.confidence),
            review_status: "review_required",
            notes: w.label || null,
            created_by: userId,
            file_id: p.fileId,
          });
          if (oErr) {
            summary.errors.push(`Window insert failed (p${p.pageNumber}): ${oErr.message}`);
          } else {
            pageOutcome.openingsInserted++;
            summary.windowItemsFound++;
            pageOutcome.reviewRequiredCount++;
          }
        }
        for (const d2 of parsed.doors ?? []) {
          if (d2.width_mm == null) continue;
          const opening_type =
            d2.type === "garage" ? "garage_door" :
            d2.type === "sliding" ? "sliding_door" :
            d2.type === "external" ? "external_door" :
            d2.type === "robe" ? "robe_opening" :
            d2.type === "internal" ? "internal_door" :
            "unknown_opening";
          const { error: oErr } = await supabase.from("opening_schedule").insert({
            job_id: data.jobId,
            plan_page_number: p.pageNumber,
            opening_type,
            width_mm: d2.width_mm,
            height_mm: d2.height_mm,
            room_name: d2.room,
            quantity: 1,
            source: "Vision Takeoff",
            source_evidence: `${evidenceTag} — ${d2.source_evidence || `${d2.type} door`}`,
            confidence: confToDbConfidence(d2.confidence),
            review_status: "review_required",
            notes: null,
            created_by: userId,
            file_id: p.fileId,
          });
          if (oErr) {
            summary.errors.push(`Door insert failed (p${p.pageNumber}): ${oErr.message}`);
          } else {
            pageOutcome.openingsInserted++;
            summary.doorItemsFound++;
            pageOutcome.reviewRequiredCount++;
          }
        }

        // ---- Insert plan_measurements (calculated values) ----
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
          const { error: mErr } = await supabase.from("plan_measurements").insert({
            job_id: data.jobId,
            file_id: p.fileId,
            plan_page_number: p.pageNumber,
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
            confidence: confToDbConfidence(c),
            review_status: "review_required",
            notes: evidenceTag,
            category: m.category ?? null,
            created_by: userId,
          });
          if (mErr) {
            summary.errors.push(`Measurement insert failed (${m.label}, p${p.pageNumber}): ${mErr.message}`);
          } else {
            pageOutcome.measurementsInserted++;
            pageOutcome.reviewRequiredCount++;
            if (m.measurement_type === "external_perimeter" || m.measurement_type === "internal_wall") {
              summary.wallLengthsFound++;
            }
          }
        }

        // ---- Insert module_items drafts (only modules from the spec brief) ----
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
          moduleId: ModuleDraft["moduleId"], label: string, unit: string,
          n: number | null | undefined, conf: VisionConfidence,
        ) => {
          const v = numStr(n);
          if (v != null) drafts.push({ moduleId, label, unit, value: v, confidence: conf });
        };
        addNumeric("iq-core", "Total Area", "m²", ab?.total_area_m2, c);
        addNumeric("iq-core", "Area Over Frame", "m²", ab?.area_over_frame_m2, c);
        addNumeric("iq-core", "Coverage Area", "m²", ab?.coverage_area_m2, c);
        addNumeric("iq-core", "Cladding Area", "m²", ab?.cladding_area_m2, c);
        addNumeric("iq-core", "Porch Area", "m²", ab?.porch_area_m2, c);
        addNumeric("iq-core", "External Perimeter", "lm",
          bg?.external_perimeter_m ?? ab?.perimeter_m ?? null, c);
        addNumeric("iq-core", "Internal Wall Length", "lm", bg?.internal_wall_length_m, c);
        addNumeric("iq-core", "Garage Area", "m²", bg?.garage_area_m2, c);
        addNumeric("iq-core", "Living Area Excluding Garage", "m²", bg?.living_area_excluding_garage_m2, c);
        addNumeric("iq-framing", "External Walls", "lm", bg?.external_perimeter_m, c);
        addNumeric("iq-framing", "Internal Walls", "lm", bg?.internal_wall_length_m, c);
        addNumeric("iq-framing", "Wet Area Walls", "lm", wl?.wet_area_wall_length_m, c);
        addNumeric("iq-framing", "Robe Walls", "lm", wl?.robe_wall_length_m, c);
        addNumeric("iq-framing", "Garage Internal Walls", "lm", wl?.garage_internal_wall_length_m, c);
        addNumeric("iq-linings", "Internal Wall Length", "lm", bg?.internal_wall_length_m, c);
        addNumeric("iq-cladding", "Cladding Area", "m²", parsed.cladding?.cladding_area_m2 ?? ab?.cladding_area_m2, c);
        addNumeric("iq-cladding", "External Perimeter", "lm",
          bg?.external_perimeter_m ?? ab?.perimeter_m ?? null, c);
        addNumeric("iq-cladding", "Brick Length", "lm", parsed.cladding?.brick_length_m, c);
        addNumeric("iq-roofing", "Pitch", "°", parsed.roofing?.roof_pitch_degrees, c);
        addNumeric("iq-roofing", "Roof Area", "m²", parsed.roofing?.roof_area_m2, c);
        addNumeric("iq-roofing", "Coverage Area", "m²", ab?.coverage_area_m2, c);
        if (parsed.cladding?.type) {
          drafts.push({
            moduleId: "iq-cladding",
            label: "Cladding Type",
            unit: "type",
            value: parsed.cladding.type,
            confidence: c,
          });
        }

        // Aggregate window count for IQ Framing.
        const windowCount = (parsed.windows ?? []).length;
        if (windowCount > 0) {
          drafts.push({
            moduleId: "iq-framing",
            label: "Window Openings",
            unit: "qty",
            value: String(windowCount),
            confidence: "low",
          });
        }
        const doorCount = (parsed.doors ?? []).length;
        if (doorCount > 0) {
          drafts.push({
            moduleId: "iq-framing",
            label: "Door Openings",
            unit: "qty",
            value: String(doorCount),
            confidence: "low",
          });
        }

        for (const d3 of drafts) {
          const runId = moduleRunByModule[d3.moduleId];
          if (!runId) {
            summary.errors.push(
              `Module run missing for ${d3.moduleId} — cannot insert "${d3.label}".`,
            );
            continue;
          }
          // Upsert-style: skip if same label exists with a User Override.
          const { data: existing } = await supabase
            .from("module_items")
            .select("id, approved_value, data_source")
            .eq("run_id", runId)
            .eq("label", d3.label)
            .limit(1);
          const ex = existing?.[0] as
            | { id: string; approved_value: string | null; data_source: string | null }
            | undefined;
          if (ex?.data_source === "User Override") continue;
          if (ex) {
            // Refresh draft (do not touch approved_value).
            const { error: upErr } = await supabase.from("module_items").update({
              extracted_value: d3.value,
              unit: d3.unit,
              data_source: "Vision Takeoff",
              source_evidence: evidenceTag,
              confidence: d3.confidence,
              review_status: "review_required",
              plan_page_number: p.pageNumber,
              file_id: p.fileId,
              notes:
                ex.approved_value != null && ex.approved_value !== ""
                  ? `Vision Takeoff value "${d3.value}" differs from approved "${ex.approved_value}". Review before approval.`
                  : null,
            }).eq("id", ex.id);
            if (upErr) {
              summary.errors.push(`Module item refresh failed (${d3.label}): ${upErr.message}`);
            } else {
              pageOutcome.moduleItemsInserted++;
              summary.moduleDraftItemsCreated++;
              pageOutcome.reviewRequiredCount++;
            }
            continue;
          }
          const { error: insErr } = await supabase.from("module_items").insert({
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
            source_evidence: evidenceTag,
            plan_page_number: p.pageNumber,
            file_id: p.fileId,
            basis: "Vision Takeoff",
            notes: null,
            sort_order: 110,
          });
          if (insErr) {
            summary.errors.push(`Module item insert failed (${d3.label}): ${insErr.message}`);
          } else {
            pageOutcome.moduleItemsInserted++;
            summary.moduleDraftItemsCreated++;
            pageOutcome.reviewRequiredCount++;
          }
        }

        summary.pagesProcessed++;
        summary.reviewRequiredItems += pageOutcome.reviewRequiredCount;
        for (const w of parsed.warnings ?? []) summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${w}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown vision takeoff failure.";
        pageOutcome.status = "error";
        pageOutcome.errorMessage = msg;
        summary.errors.push(`${p.fileName} p${p.pageNumber}: ${msg}`);
      }
      summary.pages.push(pageOutcome);
    }

    // Persist a takeoff_runs row tagged as Vision Takeoff so the UI can pick it up.
    await supabase.from("takeoff_runs").insert({
      job_id: data.jobId,
      started_by: userId,
      status: summary.errors.length > 0 ? "completed_with_warnings" : "completed",
      summary: { kind: "vision_takeoff", vision: summary } as unknown as never,
      completed_at: new Date().toISOString(),
      error_message: summary.errors.length > 0 ? summary.errors.slice(0, 5).join(" | ") : null,
    });

    return summary;
  });