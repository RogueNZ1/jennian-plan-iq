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
  // Bounded retry (F-001 resilience): a transient 429/529 shouldn't kill a real
  // job. Retry up to MAX_ATTEMPTS with exponential backoff, then fail loud.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callVisionModelOnce(apiKey, systemPrompt, userText, imageBase64);
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
  imageBase64: string,
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
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
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
  confidence: "high" | "low";
  rationale: string;
};

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
      return { scaleFactor: null, confidence: "low", rationale: "AI returned an empty response." };
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
        confidence: "low",
        rationale: `AI returned an unparseable response: ${raw.slice(0, 160)}`,
      };
    }
    const parsed = parsedMaybe;

    let scaleFactor = parsed.scaleFactor ?? null;
    const confidence = parsed.confidence === "high" ? "high" : "low";

    if (scaleFactor === null && parsed.scaleRatio && parsed.paperSize) {
      const paperKey = String(parsed.paperSize).toUpperCase().trim();
      const paperWidthMm = PAPER_WIDTH_MM[paperKey];
      if (paperWidthMm) {
        const imgWidth = Math.max(data.imageWidth, data.imageHeight);
        scaleFactor = imgWidth / (paperWidthMm * parsed.scaleRatio);
      }
    }

    return {
      scaleFactor,
      confidence: scaleFactor !== null ? "high" : confidence,
      rationale:
        scaleFactor === null && parsed.scaleRatio && parsed.paperSize
          ? `Found "1:${parsed.scaleRatio} @ ${parsed.paperSize}" but paper size not in A0–A4. ${parsed.rationale ?? ""}`.trim()
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
