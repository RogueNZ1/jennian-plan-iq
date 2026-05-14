/**
 * Concept pipeline server functions — scale extraction, plan check, and takeoffs.
 *
 * Server-only: reads LOVABLE_API_KEY from process.env.
 * All three functions call the Lovable AI gateway (OpenAI-compatible endpoint)
 * with the same LOVABLE_API_KEY credential used by the existing Vision Takeoff.
 */
import { createServerFn } from "@tanstack/react-start";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "openai/gpt-4o";

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

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("AI returned an empty response.");
  return content;
}

function stripFences(text: string): string {
  const t = text.trim();
  if (t.startsWith("```")) {
    const inner = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    return inner.trim();
  }
  return t;
}

// ── Scale Extraction ──────────────────────────────────────────────────────────

export type ScaleResult = {
  scaleFactor: number | null;
  confidence: "high" | "low";
  rationale: string;
};

export const extractScaleFactor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string })
  .handler(async ({ data }): Promise<ScaleResult> => {
    const apiKey = getApiKey();
    const system = `You are a plan reading assistant for a New Zealand residential builder.
Your job is to extract the printed scale from an architectural plan image.

Look for:
- A printed scale bar or scale ratio (e.g. "1:100", "Scale 1:75", "NTS")
- Annotated dimensions on the plan (millimetres are standard in NZ)
- Any textual scale reference in the title block

Return a JSON object with exactly these keys:
{
  "scaleFactor": <number or null>,  // pixels per millimetre, or null if cannot determine
  "confidence": "high" | "low",
  "rationale": "<brief explanation of what you found>"
}

To calculate scaleFactor: if you can identify that a specific pixel distance corresponds to a known real-world distance, divide pixels by millimetres.
If you can only read the scale ratio (e.g. 1:100) but cannot measure pixel distance, return scaleFactor: null with rationale explaining the ratio found.
If nothing is found, return scaleFactor: null, confidence: "low".

Return ONLY the JSON object. No markdown fences.`;

    const raw = await callVisionModel(
      apiKey,
      system,
      "Extract the scale factor from this architectural plan.",
      data.imageBase64,
    );

    try {
      const parsed = JSON.parse(stripFences(raw)) as ScaleResult;
      return {
        scaleFactor: parsed.scaleFactor ?? null,
        confidence: parsed.confidence === "high" ? "high" : "low",
        rationale: parsed.rationale ?? "No rationale provided.",
      };
    } catch {
      return { scaleFactor: null, confidence: "low", rationale: "Could not parse AI response." };
    }
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
      const parsed = JSON.parse(stripFences(raw)) as { issues?: PlanIssue[] };
      const issues = (parsed.issues ?? []).map((issue) => ({
        severity: (["error", "warning", "info"].includes(issue.severity) ? issue.severity : "info") as PlanIssue["severity"],
        description: issue.description ?? "",
        location: issue.location,
      }));
      return { issues };
    } catch {
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

Standard NZ residential construction categories to extract:
- floor_area_m2: Total habitable floor area (exclude garage)
- garage_area_m2: Garage area (null if no garage)
- alfresco_area_m2: Outdoor covered area / deck / alfresco (null if none)
- external_wall_lm: External wall perimeter in linear metres
- internal_wall_lm: Internal wall total length in linear metres
- roof_area_m2: Roof area (estimate from floor area + eaves if visible)
- window_count: Total number of windows
- external_door_count: External entry/exit doors (not including garage door)
- internal_door_count: Internal room doors
- bathroom_count: Full bathrooms (bath or shower + toilet)
- ensuite_count: Ensuites
- laundry_count: Laundry rooms (usually 1)
- kitchen_count: Kitchens (usually 1)
- ceiling_height_m: Standard ceiling height in metres (2.4m if not shown)
- foundation_type: Note if shown on plan (e.g. "slab on grade", "pile"), otherwise null

Return a JSON object with exactly these keys. Use null for any value you cannot determine with reasonable confidence. Include all caveats and assumptions in the "notes" field.

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
      "Extract quantity takeoffs from this floor plan.",
      data.imageBase64,
    );

    try {
      const parsed = JSON.parse(stripFences(raw)) as Partial<TakeoffData>;
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
      return empty;
    }
  });
