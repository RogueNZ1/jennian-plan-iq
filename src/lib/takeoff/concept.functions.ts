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

async function callVisionModel(
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

  if (res.status === 429) throw new Error("AI rate-limited. Please try again in a moment.");
  if (res.status === 402 || res.status === 529) throw new Error("Anthropic API credits exhausted or overloaded. Contact support.");
  if (res.status === 401) throw new Error("ANTHROPIC_API_KEY is invalid or not authorised.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
  }

  // Anthropic response: { content: [{ type: "text", text: "..." }] }
  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const content = json.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
  if (!content) {
    console.error("[callVisionModel] Empty response. Full body:", JSON.stringify(json).slice(0, 500));
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
  cleaned = cleaned
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return cleaned;
}

function tryRepairTruncatedJson(text: string): string | null {
  let s = text;
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}") { if (stack[stack.length - 1] === "{") stack.pop(); }
    else if (ch === "]") { if (stack[stack.length - 1] === "[") stack.pop(); }
  }
  if (inString) s += '"';
  s = s.replace(/,\s*$/, "");
  while (stack.length) {
    const open = stack.pop();
    s += open === "{" ? "}" : "]";
  }
  try { JSON.parse(s); return s; } catch { return null; }
}

function safeParseJson<T>(raw: string): T | null {
  const cleaned = extractJson(raw);
  try { return JSON.parse(cleaned) as T; } catch {
    const repaired = tryRepairTruncatedJson(cleaned);
    if (repaired) { try { return JSON.parse(repaired) as T; } catch { /* fall through */ } }
    return null;
  }
}

// ── Scale Extraction ──────────────────────────────────────────────────────────

const PAPER_WIDTH_MM: Record<string, number> = {
  A0: 1189, A1: 841, A2: 594, A3: 420, A4: 297,
};

export type ScaleResult = {
  scaleFactor: number | null;
  confidence: "high" | "low";
  rationale: string;
};

export const extractScaleFactor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string; imageWidth: number; imageHeight: number })
  .handler(async ({ data }): Promise<ScaleResult> => {
    const apiKey = getApiKey();
    const system = `You are a plan reading assistant for a New Zealand residential builder.
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
        apiKey, system,
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
      scaleRatio?: number | null; paperSize?: string | null;
      scaleFactor?: number | null; confidence?: string; rationale?: string;
    }>(raw);
    if (!parsedMaybe) {
      console.error("[extractScaleFactor] Could not parse AI response:", raw.slice(0, 300));
      return { scaleFactor: null, confidence: "low", rationale: `AI returned an unparseable response: ${raw.slice(0, 160)}` };
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
          : parsed.rationale ?? "AI did not return a scale or rationale.",
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
    const system = `You are a plan checker for a New Zealand residential builder (Jennian Homes Manawatū).
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
If the plan looks complete, return an empty issues array.
Return ONLY the JSON object. No markdown fences.`;

    const raw = await callVisionModel(
      apiKey, system,
      "Check this floor plan for any issues that would affect quantity takeoffs.",
      data.imageBase64,
    );

    if (!raw.trim()) {
      return { issues: [{ severity: "warning", description: "AI returned an empty response for plan check." }] };
    }

    const parsed = safeParseJson<{ issues?: PlanIssue[] }>(raw);
    if (!parsed) {
      console.error("[checkPlanIssues] JSON parse failed. Raw response:", raw.slice(0, 1000));
      return { issues: [{ severity: "warning", description: "Could not parse plan check response. Proceed with caution." }] };
    }
    const issues = (parsed.issues ?? []).map((issue) => ({
      severity: (["error", "warning", "info"].includes(issue.severity) ? issue.severity : "info") as PlanIssue["severity"],
      description: issue.description ?? "",
      location: issue.location,
    }));
    return { issues };
  });

// ── Takeoff Extraction ────────────────────────────────────────────────────────

export type WindowsByRoom = {
  [room: string]: { qty: number; height_m: number; width_m: number };
};

export type DoorBreakdown = {
  standard: number;
  cavity_sliders: number;
  double_doors: number;
  barn_sliders: number;
};

export type TakeoffData = {
  floor_area_m2: number | null;
  garage_area_m2: number | null;
  alfresco_area_m2: number | null;
  external_wall_lm: number | null;
  internal_wall_lm: number | null;
  roof_area_m2: number | null;
  window_count: number | null;
  external_door_count: number | null;
  internal_door_count: number | null;
  bathroom_count: number | null;
  ensuite_count: number | null;
  laundry_count: number | null;
  kitchen_count: number | null;
  ceiling_height_m: number | null;
  foundation_type: string | null;
  windows_by_room: WindowsByRoom | null;
  door_breakdown: DoorBreakdown | null;
  garage_door_size: string | null;
  notes: string;
};

export const extractConceptTakeoffs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string; scaleFactor: number | null })
  .handler(async ({ data }): Promise<TakeoffData> => {
    const apiKey = getApiKey();
    const scaleNote = data.scaleFactor
      ? `The plan scale factor is ${data.scaleFactor.toFixed(4)} pixels per millimetre. Use this to convert pixel measurements to real-world dimensions where needed.`
      : "No reliable scale factor was determined. Extract areas and counts from visible dimension annotations. State assumptions in the notes field.";

    const system = `You are a quantity surveyor's assistant for Jennian Homes Manawatū (NZ residential builder).
Extract quantity takeoff data from the supplied floor plan image.

${scaleNote}

━━━ RULE 1 — SCALE READING AND WINDOW DIMENSION VERIFICATION ━━━
First, find and read the scale from the title block (e.g. "1:100 @ A3", "1:50 @ A1").
For each window annotation (e.g. "2150x600"), measure the actual pixel dimensions of that window opening on the plan image.
Using the scale ratio, convert pixel measurements to real-world mm.
Match the two annotation numbers against the measured horizontal vs vertical pixel extents to determine which number is width and which is height.
Output width_m and height_m based on this geometric verification.
If scale cannot be read or verification is inconclusive, output the annotation numbers with a note "scale verification failed — check manually".

━━━ RULE 2 — FLOOR AREA — ALWAYS USE OVER FRAME ━━━
Read floor area ONLY from the summary box value labelled "LIVING AREA", "AREA OVER FRAME", or "FLOOR AREA OVER FRAME".
Never use "AREA OVER FOUNDATION" or "COVERAGE AREA" — these are always larger and incorrect for QS purposes.

━━━ RULE 3 — DOOR COUNTING ━━━
Count every door on the plan by type:
- Swing door with a quarter-circle arc = standard hinged
- Two doors meeting in the middle with two arcs = double door
- Door shown as dashed rectangle sliding into wall cavity with no arc = cavity slider
- Door positioned alongside a wall = barn slider
Count ALL instances across the entire plan. Double doors are common in living areas and between garage and house. Do not miss any.

━━━ RULE 4 — GARAGE DOOR CLASSIFICATION ━━━
For garage doors, read the width dimension from the plan. Classify as follows:
- Width ≥4500mm → 4.8×2.1 insulated
- Width 2600–2800mm → 2.7×2.1 insulated
- Width 2300–2500mm → 2.4×2.1 insulated
Height is always 2.1m regardless of what the plan shows. Never use the raw measured height for garage doors.
Return garage_door_size as the classified string (e.g. "4.8x2.1") not the raw annotation.

━━━ RULE 5 — MISSING DIMENSIONS ━━━
If a window height or width cannot be read from the plan annotation, output the string "NOT FOUND" for that value.
Never guess, estimate, or use a default value.

━━━ RULE 6 — ROOMS WITH NO WINDOWS ━━━
If a room has no windows, still include it in windows_by_room with qty=0, width_m=0, height_m=0 so the QS knows to zero those cells.

━━━ STANDARD QUANTITIES ━━━
- floor_area_m2: From "LIVING AREA" / "AREA OVER FRAME" / "FLOOR AREA OVER FRAME" only (Rule 2)
- garage_area_m2: Garage floor area (null if no garage)
- alfresco_area_m2: Outdoor covered area / deck / alfresco
- external_wall_lm: External wall perimeter in linear metres
- internal_wall_lm: Internal wall total length in linear metres
- roof_area_m2: Roof area (estimate from floor area + eaves if not shown)
- window_count: Total number of windows
- external_door_count: External entry/exit doors (not including garage door)
- internal_door_count: Total internal room doors (must match sum of door_breakdown types)
- bathroom_count: Full bathrooms
- ensuite_count: Ensuites
- laundry_count: Laundry rooms
- kitchen_count: Kitchens
- ceiling_height_m: Ceiling height in metres (null if not annotated — do not assume)
- foundation_type: e.g. "slab on grade", "pile" (null if not shown)
- windows_by_room: Object keyed by room name — include ALL rooms, even those with qty=0 (Rule 6)
- door_breakdown: { standard, cavity_sliders, double_doors, barn_sliders } — counts per Rule 3
- garage_door_size: Classified size string per Rule 4 (e.g. "4.8x2.1"), null if no garage door
- notes: List which values came from a summary box vs estimated vs not found; note any assumptions

Return ONLY a JSON object with exactly these keys. Use null for any value you cannot determine. No markdown fences.`;

    const empty: TakeoffData = {
      floor_area_m2: null, garage_area_m2: null, alfresco_area_m2: null,
      external_wall_lm: null, internal_wall_lm: null, roof_area_m2: null,
      window_count: null, external_door_count: null, internal_door_count: null,
      bathroom_count: null, ensuite_count: null, laundry_count: null,
      kitchen_count: null, ceiling_height_m: null, foundation_type: null,
      windows_by_room: null, door_breakdown: null, garage_door_size: null,
      notes: "Failed to parse AI response.",
    };

    const raw = await callVisionModel(
      apiKey, system,
      "Extract quantity takeoffs from this floor plan. Check for pre-calculated area schedules and window/door schedules first — read those values directly.",
      data.imageBase64,
    );

    const parsed = safeParseJson<Partial<TakeoffData>>(raw);
    if (!parsed) {
      console.error("[extractConceptTakeoffs] JSON parse failed. Raw response:", raw.slice(0, 500));
      return empty;
    }
    return {
      floor_area_m2: parsed.floor_area_m2 ?? null,
      garage_area_m2: parsed.garage_area_m2 ?? null,
      alfresco_area_m2: parsed.alfresco_area_m2 ?? null,
      external_wall_lm: parsed.external_wall_lm ?? null,
      internal_wall_lm: parsed.internal_wall_lm ?? null,
      roof_area_m2: parsed.roof_area_m2 ?? null,
      window_count: parsed.window_count ?? null,
      external_door_count: parsed.external_door_count ?? null,
      internal_door_count: parsed.internal_door_count ?? null,
      bathroom_count: parsed.bathroom_count ?? null,
      ensuite_count: parsed.ensuite_count ?? null,
      laundry_count: parsed.laundry_count ?? null,
      kitchen_count: parsed.kitchen_count ?? null,
      ceiling_height_m: parsed.ceiling_height_m ?? null,
      foundation_type: parsed.foundation_type ?? null,
      windows_by_room: parsed.windows_by_room ?? null,
      door_breakdown: parsed.door_breakdown ?? null,
      garage_door_size: parsed.garage_door_size ?? null,
      notes: parsed.notes ?? "",
    };
  });
