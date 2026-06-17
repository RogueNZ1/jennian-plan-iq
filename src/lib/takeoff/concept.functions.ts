/**
 * Concept pipeline server functions — scale extraction, plan check, and takeoffs.
 *
 * Server-only: reads ANTHROPIC_API_KEY from process.env.
 * All three functions call the Anthropic Messages API directly.
 */
import { createServerFn } from "@tanstack/react-start";

// !! DO NOT CHANGE THIS MODEL !!
// claude-opus-4-5 handles architectural vision reliably.
// Do NOT switch to any OpenAI model — they do not work for NZ plan reading.
const ANTHROPIC_MODEL = "claude-opus-4-5";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  return key;
}

// NOTE: This retry block + callVisionModel are a duplicate of the ones in
// anthropic-client.ts (see F-019). Kept in sync deliberately, not merged.
const RETRYABLE_HTTP = new Set([429, 529]);
const MAX_ATTEMPTS = 3; // 1 initial attempt + up to 2 retries
const RETRY_BASE_MS = 500;

class TransientApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TransientApiError";
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function callVisionModel(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  return callVisionModelWithImages(apiKey, systemPrompt, userText, [imageBase64]);
}

async function callVisionModelWithImages(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  imageBase64s: string[],
): Promise<string> {
  // Bounded retry (F-001 resilience): a transient 429/529 shouldn't kill a real
  // job. Retry up to MAX_ATTEMPTS with exponential backoff, then fail loud.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callVisionModelOnce(apiKey, systemPrompt, userText, imageBase64s);
    } catch (err) {
      if (!(err instanceof TransientApiError) || attempt === MAX_ATTEMPTS) throw err;
      const backoffMs = RETRY_BASE_MS * 2 ** (attempt - 1); // 500ms, then 1000ms
      console.warn(
        `[callVisionModel] transient error (HTTP ${err.status}) — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoffMs}ms`,
      );
      await sleep(backoffMs);
    }
  }
  // The loop always returns or throws; this only satisfies the type checker.
  throw new Error("[callVisionModel] retries exhausted");
}

async function callVisionModelOnce(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  imageBase64s: string[],
): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      // Deterministic decoding (F-001): pin temperature so the same plan yields the
      // same read. This copy feeds extractScaleFactor → scale → geometry, which the
      // harness must snapshot; leaving it stochastic would poison the fixture.
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...imageBase64s.map((imageBase64) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: "image/jpeg" as const,
                data: imageBase64,
              },
            })),
          ],
        },
      ],
    }),
  });

  // 429 (rate-limited) and 529 (overloaded) are transient → retried by the caller.
  if (RETRYABLE_HTTP.has(res.status)) {
    throw new TransientApiError(
      res.status === 429 ? "AI rate-limited." : "Anthropic API overloaded.",
      res.status,
    );
  }
  if (res.status === 402) throw new Error("Anthropic API credits exhausted. Contact support.");
  if (res.status === 401) throw new Error("ANTHROPIC_API_KEY is invalid or not authorised.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
  }

  // Anthropic response: { content: [{ type: "text", text: "..." }] }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const content =
    json.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? "";
  if (!content) {
    console.error(
      "[callVisionModel] Empty response. Full body:",
      JSON.stringify(json).slice(0, 500),
    );
    return "";
  }
  return content;
}

function extractJson(text: string): string {
  // Strip ALL markdown fences anywhere in the text.
  let cleaned = text.replace(/```(?:json|JSON)?/g, "").trim();
  // Extract the JSON object from first { to last }.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  // Repair trailing commas and control characters.
  // eslint-disable-next-line no-control-regex -- deliberate control-character sanitizer for AI JSON output
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return cleaned;
}

function tryRepairTruncatedJson(text: string): string | null {
  let s = text;
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}") {
      if (stack[stack.length - 1] === "{") stack.pop();
    } else if (ch === "]") {
      if (stack[stack.length - 1] === "[") stack.pop();
    }
  }
  if (inString) s += '"';
  s = s.replace(/,\s*$/, "");
  while (stack.length) {
    const open = stack.pop();
    s += open === "{" ? "}" : "]";
  }
  try {
    JSON.parse(s);
    return s;
  } catch {
    return null;
  }
}

function safeParseJson<T>(raw: string): T | null {
  const cleaned = extractJson(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const repaired = tryRepairTruncatedJson(cleaned);
    if (repaired) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

// ── Scale Extraction ──────────────────────────────────────────────────────────

const PAPER_WIDTH_MM: Record<string, number> = {
  A0: 1189,
  A1: 841,
  A2: 594,
  A3: 420,
  A4: 297,
};

export type ScaleResult = {
  scaleFactor: number | null;
  scaleRatio: number | null;
  scaleText: string | null;
  paperSize: string | null;
  confidence: "high" | "low";
  rationale: string;
};

export function parsePrintedScaleRatio(text: string | null | undefined): number | null {
  const m = /(?:scale\s*[:–-]?\s*)?1\s*[:/]\s*(\d{2,4})/i.exec(text ?? "");
  if (!m) return null;
  const den = Number(m[1]);
  return Number.isFinite(den) && den >= 10 && den <= 5000 ? den : null;
}

export const extractScaleFactor = createServerFn({ method: "POST" })
  .inputValidator(
    (input: unknown) => input as { imageBase64: string; imageWidth: number; imageHeight: number },
  )
  .handler(async ({ data }): Promise<ScaleResult> => {
    const apiKey = getApiKey();
    const system = `Return ONLY valid JSON. No markdown, no prose.
You are a plan reading assistant for a New Zealand residential builder.
Extract the printed scale from an architectural plan image.

PRIORITY ORDER — stop at the first method that succeeds:

1. Title block text (highest priority): Look in the bottom-right corner and border area for text like:
   "1:100 @ A3", "Scale 1:50", "1:75 @ A1", "SCALE 1:100", "Drawn to scale: 1:100", etc.
   Common NZ drawing scales: 1:50, 1:75, 1:100, 1:200.
   Common paper sizes: A4, A3, A2, A1, A0.
   If you find this, return scaleRatio (the denominator, e.g. 100 for "1:100") and paperSize (e.g. "A3").

2. Dimension annotation measurement: Find a dimension line with a known mm value visible on the plan.
   Count the pixel length of that line and compute scaleFactor = pixels / mm.

3. Scale bar: If a graphical scale bar is present, use it to derive scaleFactor in pixels per mm.

Return a JSON object with exactly these keys:
{
  "scaleRatio": <number or null>,
  "paperSize": <string or null>,
  "scaleFactor": <number or null>,
  "confidence": "high" | "low",
  "rationale": "<brief explanation of exactly what text/annotation you found>"
}

If you found a title block scale like "1:100 @ A3", set scaleRatio=100, paperSize="A3", scaleFactor=null.
If you measured from annotations, set scaleFactor to the calculated value, scaleRatio=null.
If you found nothing at all, return all nulls with confidence="low".

Return ONLY the JSON object. No markdown fences.`;

    let raw: string;
    try {
      raw = await callVisionModel(
        apiKey,
        system,
        "Extract the printed scale from this architectural plan. Check the title block in the bottom-right corner first.",
        data.imageBase64,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[extractScaleFactor] AI call failed:", msg);
      throw new Error(`AI error — ${msg}`);
    }

    if (!raw.trim()) {
      return {
        scaleFactor: null,
        scaleRatio: null,
        scaleText: null,
        paperSize: null,
        confidence: "low",
        rationale: "AI returned an empty response.",
      };
    }

    const parsedMaybe = safeParseJson<{
      scaleRatio?: number | null;
      paperSize?: string | null;
      scaleFactor?: number | null;
      confidence?: string;
      rationale?: string;
    }>(raw);
    if (!parsedMaybe) {
      console.error("[extractScaleFactor] Could not parse AI response:", raw.slice(0, 300));
      return {
        scaleFactor: null,
        scaleRatio: null,
        scaleText: null,
        paperSize: null,
        confidence: "low",
        rationale: `AI returned an unparseable response: ${raw.slice(0, 160)}`,
      };
    }
    const parsed = parsedMaybe;

    let scaleFactor = parsed.scaleFactor ?? null;
    const scaleRatio =
      parsed.scaleRatio ?? parsePrintedScaleRatio(parsed.rationale) ?? parsePrintedScaleRatio(raw);
    const paperSize = parsed.paperSize ? String(parsed.paperSize).toUpperCase().trim() : null;
    const scaleText = scaleRatio ? `1:${scaleRatio}${paperSize ? ` @ ${paperSize}` : ""}` : null;
    const confidence = parsed.confidence === "high" ? "high" : "low";

    if (scaleFactor === null && scaleRatio && paperSize) {
      const paperWidthMm = PAPER_WIDTH_MM[paperSize];
      if (paperWidthMm) {
        const imgWidth = Math.max(data.imageWidth, data.imageHeight);
        scaleFactor = imgWidth / (paperWidthMm * scaleRatio);
      }
    }

    return {
      scaleFactor,
      scaleRatio,
      scaleText,
      paperSize,
      confidence: scaleFactor !== null || scaleRatio !== null ? "high" : confidence,
      rationale:
        scaleFactor === null && scaleRatio
          ? `Found "${scaleText}" on the plan. Pixel calibration will use visible plan annotations because paper size was not usable here. ${parsed.rationale ?? ""}`.trim()
          : (parsed.rationale ?? "AI did not return a scale or rationale."),
    };
  });

// ── Plan Check ────────────────────────────────────────────────────────────────

export type PlanIssue = {
  severity: "error" | "warning" | "info";
  description: string;
  location?: string;
};

export type CheckResult = { issues: PlanIssue[] };

export const checkPlanIssues = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string })
  .handler(async ({ data }): Promise<CheckResult> => {
    const apiKey = getApiKey();
    const system = `Return ONLY valid JSON. No markdown, no prose.
You are a plan checker for a New Zealand residential building plan.
Review the supplied floor plan image and identify any issues that could affect quantity takeoffs or costing.

Check for:
- Rooms without dimension annotations
- Rooms with no label/name
- Wall lengths that appear inconsistent
- Missing or unclear wet area locations (bathroom, laundry, kitchen)
- Missing garage or entry area if this appears to be a full house plan
- Unclear or ambiguous floor plan features

Return a JSON object:
{
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "description": "<clear description of the issue>",
      "location": "<optional — e.g. 'Bedroom 2', 'North wall', 'Garage'>"
    }
  ]
}

Severity: "error" = missing critical info; "warning" = inconsistent/ambiguous; "info" = minor observation.
If the plan looks complete and has no issues, return an empty issues array — do NOT add a "no issues found" entry.
Return ONLY the JSON object. No markdown fences.`;

    const raw = await callVisionModel(
      apiKey,
      system,
      "Check this floor plan for any issues that would affect quantity takeoffs.",
      data.imageBase64,
    );

    if (!raw.trim()) {
      return {
        issues: [
          { severity: "warning", description: "AI returned an empty response for plan check." },
        ],
      };
    }

    const parsed = safeParseJson<{ issues?: PlanIssue[] }>(raw);
    if (!parsed) {
      console.error("[checkPlanIssues] JSON parse failed. Raw response:", raw.slice(0, 1000));
      return {
        issues: [
          {
            severity: "warning",
            description: "Could not parse plan check response. Proceed with caution.",
          },
        ],
      };
    }
    const issues = (parsed.issues ?? []).map((issue) => ({
      severity: (["error", "warning", "info"].includes(issue.severity)
        ? issue.severity
        : "info") as PlanIssue["severity"],
      description: issue.description ?? "",
      location: issue.location,
    }));
    return { issues };
  });

// ── Takeoff Extraction ────────────────────────────────────────────────────────

export type { WindowsByRoom, DoorBreakdown, TakeoffData } from "./takeoff-types";
import type { WindowsByRoom, DoorBreakdown, TakeoffData } from "./takeoff-types";
import type { PlanContext } from "./plan-context";
import { recognisePlan } from "./recognise-plan";
import { extractAnnotations } from "./extract-annotations";
import { classifyAnnotations } from "./classify-annotations";
import { readWindowSchedule, type WindowScheduleData } from "./extract-window-schedule";
import { normaliseVisualOpeningAudit, type VisualOpeningAudit } from "./visual-opening-audit";

export type ConceptTakeoffResult = {
  takeoffData: TakeoffData;
  planContext: PlanContext;
  /** Set when the uploaded sheet is not a floor plan — takeoffData will be empty. */
  sheetError?: string;
};

export const recognisePlanFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string; filename: string })
  .handler(async ({ data }): Promise<PlanContext> => {
    return recognisePlan(data.imageBase64, data.filename);
  });

/**
 * Phase 2b — read the Door & Window Schedule page (W01…Wnn + H × W). Thin wrapper
 * over the pure readWindowSchedule so the schedule can be threaded alongside the
 * primary floor plan, mirroring extractElevationsFn/extractSitePlanFn. Fails soft to
 * an empty schedule so a missing/garbled schedule page never blocks the takeoff.
 */
export const extractWindowScheduleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string; builderName?: string })
  .handler(async ({ data }): Promise<WindowScheduleData> => {
    try {
      return await readWindowSchedule(data.imageBase64, {
        apiKey: getApiKey(),
        builderName: data.builderName,
      });
    } catch (err) {
      console.error(
        "[extractWindowScheduleFn] failed:",
        err instanceof Error ? err.message : String(err),
      );
      return { windows: [] };
    }
  });

/**
 * Visual QS pass â€” audit-only first read of external-wall openings.
 *
 * This does NOT drive pricing/export yet. It gives the estimator a human-like overlay:
 * walk the outside wall, number every visible opening, classify it, and record the printed
 * size label if readable. Existing deterministic/vector/geometry passes remain the pricing
 * path until this visual layer is benchmarked.
 */
export const extractVisualOpeningAuditFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: unknown) =>
      input as {
        imageBase64: string;
        pageNumber?: number | null;
        elevationImageBase64?: string | null;
      },
  )
  .handler(async ({ data }): Promise<VisualOpeningAudit> => {
    const apiKey = getApiKey();
    const system = `Return ONLY valid JSON. No markdown, no prose.
You are acting as a senior New Zealand residential Quantity Surveyor reading a FLOOR PLAN image by eye.

TASK:
Walk around the EXTERNAL WALL perimeter of the dwelling and identify every external-wall opening.
This is an AUDIT pass. Do not invent hidden openings. Use what is visible on the floor plan.

INPUT IMAGES:
- Image 1 is always the floor plan. Use it for opening existence and x/y marker coordinates.
- Image 2, when supplied, is the elevations sheet. Use it as a second source for visual
  confirmation and dimensions of large sliders, garage windows, entry doors, PA doors, and garage
  doors that are visible on the floor plan but not clearly labelled there.
- Never return an opening that exists only on the elevation and cannot be matched to a visible
  external-wall opening on the floor plan. If the elevation confirms the size but the floor-plan
  marker is approximate, keep the opening, set confidence="low", and add flags.

QS RULE:
Every opening on an external wall is a QS opening / glazing item EXCEPT the sectional/roller garage door.
Count windows, sliders, entry doors, PA doors, garage windows, and other external doors.
Classify the sectional/roller garage door separately as "garage_door".

IMPORTANT REJECTIONS:
- Do NOT count room dimensions as windows.
- Do NOT count WIR/WIC room sizes as windows.
- Do NOT count internal doors.
- Do NOT count skylights or roof-window notes as external-wall openings unless the opening is physically in an external wall elevation.
- Do NOT count furniture, beds, bathroom fixtures, cupboards, wardrobes, or roof-access boxes.
- Do NOT split a single physical framed opening into multiple openings because of panes/mullions.
- Do NOT count a garage label like "B85 Vehicle" as a garage door size.

READING:
- Prefer printed opening labels like "2110x700", "2110x2200", "1100x600".
- The label format is HEIGHT x WIDTH in mm unless noted otherwise.
- Convert readable labels to metres: 2110x700 => height_m 2.11, width_m 0.7.
- A usable size label must be exactly two plausible mm numbers separated by x or ×.
- Drafting/text labels can be wrong, overprinted, or concatenated. If text looks jammed
  together, has more than two dimension numbers, has an impossible fragment, or looks like
  "1300x175036001300x1750", do NOT trim digits or invent a nearby plausible dimension.
  Set unknown dimension(s) to null and add flag "malformed dimension label" unless
  Image 2/elevations or a real schedule clearly confirms the same physical opening and size.
  When elevations/schedule clearly resolve the bad floor-plan label, return the confirmed
  size, keep confidence high/medium according to the evidence, and explain the recovery in
  evidence instead of adding a blocking malformed-label flag.
- If a size label is not readable, set height_m and width_m to null and add a flag.
- For the sectional/roller garage door, read the label physically attached to the driveway-side garage opening.
- Do NOT use nearby level/height markers, wall heights, roof notes, cladding dimensions, or room dimensions as the garage-door size.
- If multiple labels are near the garage, the real garage-door label is the one spanning the garage opening on the external wall, not the garage room size.

MARKER POSITION - CRITICAL FOR PRINTED QS CHECK:
The x/y point is where the printed blue/black circle will be drawn. It must overlap the ACTUAL
PHYSICAL OPENING SYMBOL in the external wall.

For every opening:
- Return normalized image coordinates from 0 to 1: x=0 left edge, x=1 right edge, y=0 top edge, y=1 bottom edge.
- Put x/y on the black window/door/opening line itself, preferably the centre of the framed gap/opening.
- For a window: point to the centre of the window symbol in the wall, not the nearby W-code or size text.
- For a slider: point to the centre of the sliding-door opening line in the wall, not the room label or deck note.
- For a PA/external door: point to the external-wall door leaf/opening on the perimeter wall.
- For the garage door: point to the centre of the large driveway-side garage opening line.

SELF-CHECK BEFORE RETURNING EACH x/y:
Imagine a small 8-pixel circle printed at the coordinate. If that circle would not touch the
actual opening line/gap on the wall, move the coordinate until it does.

DO NOT place x/y on:
- room labels or room centres,
- printed size labels,
- W-codes,
- furniture,
- deck/paving notes,
- schedule/title-block/table text,
- dimension strings or wall height notes.

If you can identify an opening but cannot confidently locate its exact physical wall position:
- still return your best x/y,
- set confidence="low",
- add flag "marker position approximate",
- add flag "marker not confirmed on physical opening".

The evidence field must describe BOTH the size/read evidence and the marker placement, e.g.
"printed 1800x600 beside Bed 1 north wall; marker placed on north-wall window line".

RETURN EXACT JSON SHAPE:
{
  "pageNumber": <number or null>,
  "openings": [
    {
      "id": "O1",
      "type": "window" | "slider" | "external_door" | "garage_door" | "garage_window" | "pa_door" | "uncertain",
      "room": "<nearest room name or null>",
      "label": "<printed label such as 2110x700, or null>",
      "height_m": <number or null>,
      "width_m": <number or null>,
      "x": <0..1 number>,
      "y": <0..1 number>,
      "confidence": "high" | "medium" | "low",
      "evidence": "<short reason, e.g. 'printed 2110x700 on Bed 3 west wall'>",
      "flags": ["<short issue>", "..."]
    }
  ],
  "warnings": ["<whole-plan issue>", "..."]
}

Return openings in walk-around order around the outside perimeter, clockwise if possible.
If no floor plan is visible, return openings=[] with a warning.
Return ONLY the JSON object.`;

    try {
      const images = data.elevationImageBase64
        ? [data.imageBase64, data.elevationImageBase64]
        : [data.imageBase64];
      const raw = await callVisionModelWithImages(
        apiKey,
        system,
        `Run the Visual QS external-opening audit on this floor plan page. Page number: ${data.pageNumber ?? "unknown"}. ${
          data.elevationImageBase64
            ? "A second image is supplied: use the elevations only to confirm dimensions for openings visible on the floor plan."
            : "No elevation image is supplied."
        }`,
        images,
      );
      if (!raw.trim()) {
        return normaliseVisualOpeningAudit(
          { openings: [], warnings: ["Visual QS audit returned an empty response."] },
          data.pageNumber ?? null,
        );
      }
      const parsed = safeParseJson<unknown>(raw);
      if (!parsed) {
        console.error("[extractVisualOpeningAuditFn] JSON parse failed. Raw:", raw.slice(0, 1000));
        return normaliseVisualOpeningAudit(
          { openings: [], warnings: ["Visual QS audit response could not be parsed."] },
          data.pageNumber ?? null,
        );
      }
      return normaliseVisualOpeningAudit(parsed, data.pageNumber ?? null);
    } catch (err) {
      console.error(
        "[extractVisualOpeningAuditFn] failed:",
        err instanceof Error ? err.message : String(err),
      );
      return normaliseVisualOpeningAudit(
        {
          openings: [],
          warnings: [`Visual QS audit failed: ${err instanceof Error ? err.message : String(err)}`],
        },
        data.pageNumber ?? null,
      );
    }
  });

export const extractConceptTakeoffs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string; filename: string })
  .handler(async ({ data }): Promise<ConceptTakeoffResult> => {
    // Pass 0 — plan reconnaissance
    const context = await recognisePlan(data.imageBase64, data.filename);

    const emptyTakeoff: TakeoffData = {
      floor_area_m2: null,
      garage_area_m2: null,
      alfresco_area_m2: null,
      external_wall_lm: null,
      internal_wall_lm: null,
      roof_area_m2: null,
      window_count: null,
      external_door_count: null,
      internal_door_count: null,
      bathroom_count: null,
      ensuite_count: null,
      laundry_count: null,
      kitchen_count: null,
      ceiling_height_m: null,
      foundation_type: null,
      windows_by_room: null,
      door_breakdown: null,
      garage_door_size: null,
      notes: "Sheet type not suitable for takeoff.",
    };

    // Only floor and dimension plans contain extractable takeoff data
    if (context.sheetType !== "floor_plan" && context.sheetType !== "dimension_plan") {
      console.warn(`[extractConceptTakeoffs] Skipping — sheetType=${context.sheetType}`);
      const label = context.sheetType.replace(/_/g, " ");
      return {
        takeoffData: { ...emptyTakeoff },
        planContext: context,
        sheetError: `This looks like a ${label}. Please upload the floor plan sheet to run a takeoff.`,
      };
    }

    // Pass 1 — raw annotation extraction
    const rawAnnotations = await extractAnnotations(data.imageBase64, context);

    // Pass 2 — deterministic classification (no AI call)
    const takeoffData = classifyAnnotations(rawAnnotations, context);

    return { takeoffData, planContext: context };
  });
