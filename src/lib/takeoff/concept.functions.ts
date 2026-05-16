/**
 * Concept pipeline server functions — scale extraction, plan check, and takeoffs.
 *
 * Server-only: reads LOVABLE_API_KEY from process.env.
 * All three functions call the Lovable AI gateway (OpenAI-compatible endpoint)
 * with the same LOVABLE_API_KEY credential used by the existing Vision Takeoff.
 */
import { createServerFn } from "@tanstack/react-start";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Gemini 2.5 Pro reads architectural title blocks (small text in plan borders)
// noticeably better than GPT-4o in our testing.
const AI_MODEL = "google/gemini-2.5-pro";

function getApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured.");
  return key;
}

async function callVisionModel(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (res.status === 429) throw new Error("AI rate-limited. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI workspace credits exhausted. Contact support.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI model error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  // OpenAI-compatible format (gpt-4o, etc.) vs Gemini native format.
  // Gemini can split a single response across multiple parts — concatenate all of them.
  const content =
    json.choices?.[0]?.message?.content ??
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";
  if (!content) {
    console.error("[callVisionModel] Empty response. Full body:", JSON.stringify(json).slice(0, 500));
    throw new Error("AI returned an empty response.");
  }
  return content;
}

function extractJson(text: string): string {
  const t = text.trim();
  // Strip a leading markdown fence (```json or ```) if present
  const fenced = t.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  // Find the first { and last } to extract the JSON object even if Gemini
  // adds preamble text or a trailing explanation around the JSON block.
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start !== -1 && end > start) return fenced.slice(start, end + 1);
  return fenced;
}

// ── Scale Extraction ──────────────────────────────────────────────────────────

// Landscape width in mm for each A-series paper size.
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
  "scaleRatio": <number or null>,   // denominator X of 1:X (e.g. 100), from title block text
  "paperSize": <string or null>,    // e.g. "A3", "A1" — only if found in title block text
  "scaleFactor": <number or null>,  // pixels per mm — only populate if you measured from annotations or scale bar
  "confidence": "high" | "low",
  "rationale": "<brief explanation of exactly what text/annotation you found>"
}

If you found a title block scale like "1:100 @ A3", set scaleRatio=100, paperSize="A3", scaleFactor=null (the server will compute it from image size).
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
      throw new Error(`AI gateway error — ${msg}`);
    }

    let parsed: {
        scaleRatio?: number | null;
        paperSize?: string | null;
        scaleFactor?: number | null;
        confidence?: string;
        rationale?: string;
    };
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      console.error("[extractScaleFactor] Could not parse AI response:", raw.slice(0, 300));
      return {
        scaleFactor: null,
        confidence: "low",
        rationale: `AI returned an unparseable response: ${raw.slice(0, 160)}`,
      };
    }

      let scaleFactor = parsed.scaleFactor ?? null;
      const confidence = parsed.confidence === "high" ? "high" : "low";

      // Derive scaleFactor from title block ratio + paper size + image dimensions.
      if (scaleFactor === null && parsed.scaleRatio && parsed.paperSize) {
        const paperKey = String(parsed.paperSize).toUpperCase().trim();
        const paperWidthMm = PAPER_WIDTH_MM[paperKey];
        if (paperWidthMm) {
          const imgWidth = Math.max(data.imageWidth, data.imageHeight); // use longer edge (landscape)
          scaleFactor = imgWidth / (paperWidthMm * parsed.scaleRatio);
        }
      }

      return {
        scaleFactor,
        confidence: scaleFactor !== null ? "high" : confidence,
        rationale:
          scaleFactor === null && parsed.scaleRatio && parsed.paperSize
            ? `Found "1:${parsed.scaleRatio} @ ${parsed.paperSize}" but paper size "${parsed.paperSize}" is not in the A0–A4 range — cannot derive pixels/mm. ${parsed.rationale ?? ""}`.trim()
            : parsed.rationale ?? "AI did not return a scale or rationale.",
      };
  });

// ── Plan Check ────────────────────────────────────────────────────────────────

export type PlanIssue = {
  severity: "error" | "warning" | "info";
  description: string;
  location?: string;
};

export type CheckResult = {
  issues: PlanIssue[];
};

export const checkPlanIssues = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string })
  .handler(async ({ data }): Promise<CheckResult> => {
    const apiKey = getApiKey();
    const system = `You are a plan checker for a New Zealand residential builder (Jennian Homes Manawatū).
Review the supplied floor plan image and identify any issues that could affect quantity takeoffs or costing.

Check for:
- Rooms without dimension annotations
- Rooms with no label/name
- Wall lengths that appear inconsistent (e.g. overall width doesn't match sum of room widths)
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

Severity guide:
- "error": Missing critical information (no dimensions on a room, no wet area shown, plan appears incomplete)
- "warning": Potentially inconsistent or ambiguous information
- "info": Minor observations, possible assumptions needed

If the plan looks complete and well-annotated, return an empty issues array.
Return ONLY the JSON object. No markdown fences.`;

    const raw = await callVisionModel(
      apiKey,
      system,
      "Check this floor plan for any issues that would affect quantity takeoffs.",
      data.imageBase64,
    );

    try {
      const parsed = JSON.parse(extractJson(raw)) as { issues?: PlanIssue[] };
      const issues = (parsed.issues ?? []).map((issue) => ({
        severity: (["error", "warning", "info"].includes(issue.severity) ? issue.severity : "info") as PlanIssue["severity"],
        description: issue.description ?? "",
        location: issue.location,
      }));
      return { issues };
    } catch {
      console.error("[checkPlanIssues] JSON parse failed. Raw response:", raw.slice(0, 500));
      return { issues: [{ severity: "warning", description: "Could not parse plan check response. Proceed with caution." }] };
    }
  });

// ── Takeoff Extraction ────────────────────────────────────────────────────────

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
  notes: string;
};

export const extractConceptTakeoffs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string; scaleFactor: number | null })
  .handler(async ({ data }): Promise<TakeoffData> => {
    const apiKey = getApiKey();
    const scaleNote = data.scaleFactor
      ? `The plan scale factor is ${data.scaleFactor.toFixed(4)} pixels per millimetre. Use this to convert pixel measurements to real-world dimensions where needed.`
      : "No reliable scale factor was determined. Extract areas and counts from any visible dimension annotations on the plan. State assumptions in the notes field.";

    const system = `You are a quantity surveyor's assistant for Jennian Homes Manawatū (NZ residential builder).
Extract quantity takeoff data from the supplied floor plan image.

${scaleNote}

PRIORITY — read pre-calculated summary boxes FIRST:
Many NZ residential plans include a summary table or schedule printed on the drawing, often in a border panel, title block area, or separate box. These may be labelled:
  "Area Schedule", "Room Schedule", "Floor Areas", "Living Area", "Total Floor Area",
  "Cladding Area", "Perimeter", "External Wall Length", "Roof Area", "GFA", "NFA".
If any such table exists, read the values directly from it — these are exact and should be preferred over any estimation you do from counting/measuring.

After reading any summary box, also count and extract:
- window_count: Count all window symbols visible on the plan
- external_door_count: Count external entry/exit door symbols
- internal_door_count: Count internal room door symbols
- bathroom_count, ensuite_count, laundry_count, kitchen_count: Count labelled rooms

Standard NZ residential construction categories to extract:
- floor_area_m2: Total habitable floor area (exclude garage) — read from summary if shown
- garage_area_m2: Garage area (null if no garage) — read from summary if shown
- alfresco_area_m2: Outdoor covered area / deck / alfresco — read from summary if shown
- external_wall_lm: External wall perimeter in linear metres — read from summary if shown, otherwise estimate from floor plan outline
- internal_wall_lm: Internal wall total length in linear metres
- roof_area_m2: Roof area — read from summary if shown, otherwise estimate from floor area + eaves
- window_count: Total number of windows
- external_door_count: External entry/exit doors (not including garage door)
- internal_door_count: Internal room doors
- bathroom_count: Full bathrooms (bath or shower + toilet)
- ensuite_count: Ensuites
- laundry_count: Laundry rooms
- kitchen_count: Kitchens
- ceiling_height_m: Ceiling height in metres (read from annotations or notes; default 2.4m)
- foundation_type: e.g. "slab on grade", "pile" (null if not shown)

Return a JSON object with exactly these keys. Use null for any value you cannot determine with reasonable confidence.
In the "notes" field, list which values came from a summary box vs which were estimated, and note any assumptions.

Return ONLY the JSON object. No markdown fences.`;

    const empty: TakeoffData = {
      floor_area_m2: null, garage_area_m2: null, alfresco_area_m2: null,
      external_wall_lm: null, internal_wall_lm: null, roof_area_m2: null,
      window_count: null, external_door_count: null, internal_door_count: null,
      bathroom_count: null, ensuite_count: null, laundry_count: null,
      kitchen_count: null, ceiling_height_m: null, foundation_type: null,
      notes: "Failed to parse AI response.",
    };

    const raw = await callVisionModel(
      apiKey,
      system,
      "Extract quantity takeoffs from this floor plan. Check for any pre-calculated area schedules, summary boxes or room schedules printed on the drawing first — read those values directly.",
      data.imageBase64,
    );

    try {
      const parsed = JSON.parse(extractJson(raw)) as Partial<TakeoffData>;
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
        notes: parsed.notes ?? "",
      };
    } catch {
      console.error("[extractConceptTakeoffs] JSON parse failed. Raw response:", raw.slice(0, 500));
      return empty;
    }
  });
