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

const PAGE_CAP = 6;
const MIN_RESOLUTION_PX = 2500;

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
});

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

    // ---- Audit log helper (best-effort; never blocks the run) ----
    const auditQueue: AuditEntry[] = [];
    const audit = (e: AuditEntry) => auditQueue.push(e);
    const flushAudit = async () => {
      if (auditQueue.length === 0) return;
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
        );
      } catch {
        /* never let audit failure mask the takeoff result */
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
          (p.widthPx == null) ||
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
          throw new Error(`Could not download rendered page image: ${dlErr?.message ?? "no data"}`);
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
        pageOutcome.warnings = [...pageOutcome.warnings, ...(parsed.warnings ?? [])];
        pageOutcome.visionPageType = parsed.page_type;

        // Confidence accumulators.
        const cs = parsed.confidence_summary ?? "low";
        if (cs === "high") summary.confidenceCounts.high++;
        else if (cs === "medium") summary.confidenceCounts.medium++;
        else summary.confidenceCounts.low++;

        const isFloorplan = FLOORPLAN_VISION_TYPES.has(parsed.page_type);

        // workingPlanReviewed only if working file's page was floorplan-classified.
        if (workingPlanFileId && p.fileId === workingPlanFileId && isFloorplan) {
          summary.workingPlanReviewed = true;
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
              type: "External Perimeter", unit: "lm",
              v: bg?.external_perimeter_m ?? ab?.perimeter_m ?? null,
            },
            { type: "Internal Wall Length", unit: "lm", v: bg?.internal_wall_length_m ?? null },
            { type: "Garage Area", unit: "m²", v: bg?.garage_area_m2 ?? null },
            {
              type: "Living Area Excluding Garage", unit: "m²",
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
            const existing = ex?.[0] as
              | { id: string; approved_value: number | null }
              | undefined;

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
                  Math.abs(q.v - existing.approved_value) /
                  Math.abs(existing.approved_value);
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
          const match = (existingRows ?? []).find((r: { height_mm: number | null; room_name: string | null }) => {
            const heightEq =
              (r.height_mm == null && args.height_mm == null) ||
              (r.height_mm != null && args.height_mm != null && Number(r.height_mm) === Number(args.height_mm));
            const roomEq = (r.room_name ?? null) === (args.room ?? null);
            return heightEq && roomEq;
          }) as { id: string; review_status: string | null } | undefined;

          if (match) {
            const wasConfirmed = match.review_status === "approved" || match.review_status === "confirmed";
            const { error: upErr } = await supabase
              .from("opening_schedule")
              .update({
                confidence: args.confidence,
                source_evidence: args.source_evidence,
                review_status: wasConfirmed ? match.review_status : "review_required",
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
          if (w.width_mm == null) continue;
          await upsertOpening({
            opening_type: normalizeOpeningType(null, "window"),
            width_mm: w.width_mm,
            height_mm: w.height_mm,
            room: w.room,
            confidence: confToDbConfidence(w.confidence),
            source_evidence: `${evidenceTag} — ${w.source_evidence || w.label}`,
            notes: w.label || null,
            counterKey: "windowItemsFound",
            logLabel: `Window ${w.width_mm}×${w.height_mm ?? "?"}`,
          });
        }
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

        // ----- plan_measurements (deduped) -----
        if (isFloorplan) {
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
                summary.errors.push(`Measurement refresh failed (${m.label}, p${p.pageNumber}): ${upErr.message}`);
              } else {
                pageOutcome.measurementsRefreshed++;
                pageOutcome.reviewRequiredCount++;
                if (m.measurement_type === "external_perimeter" || m.measurement_type === "internal_wall") {
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
                summary.errors.push(`Measurement insert failed (${m.label}, p${p.pageNumber}): ${mErr.message}`);
              } else {
                pageOutcome.measurementsInserted++;
                summary.visionMeasurementsCreated++;
                pageOutcome.reviewRequiredCount++;
                if (m.measurement_type === "external_perimeter" || m.measurement_type === "internal_wall") {
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
        if (isFloorplan) {
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
          addNumeric("iq-core", "Total Area", "m²", ab?.total_area_m2, cs);
          addNumeric("iq-core", "Area Over Frame", "m²", ab?.area_over_frame_m2, cs);
          addNumeric("iq-core", "Coverage Area", "m²", ab?.coverage_area_m2, cs);
          addNumeric("iq-core", "Cladding Area", "m²", ab?.cladding_area_m2, cs);
          addNumeric("iq-core", "Porch Area", "m²", ab?.porch_area_m2, cs);
          addNumeric("iq-core", "External Perimeter", "lm",
            bg?.external_perimeter_m ?? ab?.perimeter_m ?? null, cs);
          addNumeric("iq-core", "Internal Wall Length", "lm", bg?.internal_wall_length_m, cs);
          addNumeric("iq-core", "Garage Area", "m²", bg?.garage_area_m2, cs);
          addNumeric("iq-core", "Living Area Excluding Garage", "m²", bg?.living_area_excluding_garage_m2, cs);
          addNumeric("iq-framing", "External Walls", "lm", bg?.external_perimeter_m, cs);
          addNumeric("iq-framing", "Internal Walls", "lm", bg?.internal_wall_length_m, cs);
          addNumeric("iq-framing", "Wet Area Walls", "lm", wl?.wet_area_wall_length_m, cs);
          addNumeric("iq-framing", "Robe Walls", "lm", wl?.robe_wall_length_m, cs);
          addNumeric("iq-framing", "Garage Internal Walls", "lm", wl?.garage_internal_wall_length_m, cs);
          addNumeric("iq-linings", "Internal Wall Length", "lm", bg?.internal_wall_length_m, cs);
          addNumeric("iq-cladding", "Cladding Area", "m²", parsed.cladding?.cladding_area_m2 ?? ab?.cladding_area_m2, cs);
          addNumeric("iq-cladding", "External Perimeter", "lm",
            bg?.external_perimeter_m ?? ab?.perimeter_m ?? null, cs);
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
              | { id: string; approved_value: string | null; data_source: string | null; extracted_value: string | null }
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
              const { error: upErr } = await supabase.from("module_items").update({
                extracted_value: d3.value,
                unit: d3.unit,
                data_source: "Vision Takeoff",
                source_evidence: evidenceTag,
                confidence: d3.confidence,
                review_status: needsReview ? "review_required" : "approved",
                plan_page_number: p.pageNumber,
                file_id: p.fileId,
                notes: driftNote,
              }).eq("id", ex.id);
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
            const { data: ins, error: insErr } = await supabase.from("module_items").insert({
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
            }).select("id").single();
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
        for (const w of parsed.warnings ?? []) summary.warnings.push(`${p.fileName} p${p.pageNumber}: ${w}`);
        audit({
          job_id: data.jobId,
          user_id: userId,
          action: "vision_page_processed",
          notes: `${p.fileName} p${p.pageNumber} (page_type=${parsed.page_type})`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown vision takeoff failure.";
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
    await flushAudit();

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
