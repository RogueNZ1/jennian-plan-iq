import { callVisionModel, getAnthropicApiKey, safeParseJson } from './anthropic-client';
import type { PlanContext } from './plan-context';

export interface RawAnnotation {
  /** The exact text found on the plan, e.g. "1300x1800" */
  text: string;
  /** Room label this annotation is nearest to, as written on the plan */
  nearestRoomLabel: string | null;
  /** Whether this annotation appears to be near a wall opening (window/door gap) */
  nearOpening: boolean;
}

export interface RawAnnotations {
  openingAnnotations: RawAnnotation[];
  roomLabels: string[];
  areaSummary: {
    livingAreaM2: number | null;
    garageAreaM2: number | null;
    alfrescoAreaM2: number | null;
    coverageAreaM2: number | null;
    perimeterM: number | null;
  };
  garageDoorAnnotations: string[];
  internalDoorAnnotations: Array<{ text: string; nearestRoomLabel: string | null }>;
}

const EMPTY_ANNOTATIONS: RawAnnotations = {
  openingAnnotations: [],
  roomLabels: [],
  areaSummary: {
    livingAreaM2: null,
    garageAreaM2: null,
    alfrescoAreaM2: null,
    coverageAreaM2: null,
    perimeterM: null,
  },
  garageDoorAnnotations: [],
  internalDoorAnnotations: [],
};

function buildSystemPrompt(context: PlanContext): string {
  const formatLabel = context.dimensionFormat === 'HEIGHT_x_WIDTH' ? 'HEIGHT × WIDTH' : 'WIDTH × HEIGHT';
  const formatSource = context.dimensionFormatSource === 'stated_on_plan'
    ? 'This format was explicitly stated in the plan notes.'
    : `This is the standard NZ convention for ${context.builder.name}.`;
  const firstLabel = context.dimensionFormat === 'HEIGHT_x_WIDTH' ? 'height' : 'width';
  const secondLabel = context.dimensionFormat === 'HEIGHT_x_WIDTH' ? 'width' : 'height';

  return `Return ONLY valid JSON. No markdown, no prose.
You are reading a ${context.builder.name} floor plan at scale ${context.scaleString ?? 'unknown'}.

CRITICAL READING RULE: Window and opening dimension annotations on this plan are written in the format: ${formatLabel} in millimetres.
${formatSource}

Examples of what to read (do NOT measure pixels — read the printed text):
- "2150x600" → first number is ${firstLabel} (2150mm), second is ${secondLabel} (600mm)
- "1300x1800" → first number is ${firstLabel} (1300mm), second is ${secondLabel} (1800mm)
- "1300x1500" → first number is ${firstLabel} (1300mm), second is ${secondLabel} (1500mm)

Large second numbers (1500, 1800, 2100) are normal — they are wide windows. Do NOT substitute a smaller default.

YOUR TASK — read and return only, do not interpret:

1. OPENING ANNOTATIONS: For every window or door-sized opening in a wall, return:
   - The exact dimension text printed next to it (e.g. "1300x1800")
   - The nearest room label as written on the plan
   - Whether it appears to be a window opening (true) or door opening (false)

2. ROOM LABELS: List every room label text exactly as written (e.g. "MASTER BED", "BED 2", "KITCHEN")

3. AREA SUMMARY: Read numbers from any summary/statistics box

4. GARAGE DOOR: Return dimension text near the garage door opening

5. INTERNAL DOOR ANNOTATIONS: For each internal door, return the door leaf size if annotated (e.g. "810", "760", "1620"), and the nearest room label.
   Do NOT classify door types. Do NOT calculate anything. Read and return only.

Return this JSON structure:
{
  "openingAnnotations": [
    { "text": "<exact annotation text>", "nearestRoomLabel": "<room label or null>", "nearOpening": true }
  ],
  "roomLabels": ["<label>"],
  "areaSummary": {
    "livingAreaM2": <number or null>,
    "garageAreaM2": <number or null>,
    "alfrescoAreaM2": <number or null>,
    "coverageAreaM2": <number or null>,
    "perimeterM": <number or null>
  },
  "garageDoorAnnotations": ["<text>"],
  "internalDoorAnnotations": [
    { "text": "<text>", "nearestRoomLabel": "<label or null>" }
  ]
}`;
}

export async function extractAnnotations(
  planImageBase64: string,
  context: PlanContext,
): Promise<RawAnnotations> {
  let raw: string;
  try {
    const apiKey = getAnthropicApiKey();
    raw = await callVisionModel(
      apiKey,
      buildSystemPrompt(context),
      "Read and return every dimension annotation, room label, and area summary from this floor plan. Do not interpret — only read and return.",
      planImageBase64,
    );
  } catch (err) {
    console.error("[extractAnnotations] AI call failed:", err instanceof Error ? err.message : String(err));
    return EMPTY_ANNOTATIONS;
  }

  const parsed = safeParseJson<Partial<RawAnnotations>>(raw);
  if (!parsed) {
    console.error("[extractAnnotations] JSON parse failed. Raw:", raw.slice(0, 300));
    return EMPTY_ANNOTATIONS;
  }

  return {
    openingAnnotations: (parsed.openingAnnotations ?? []).map((a) => ({
      text: String(a.text ?? ""),
      nearestRoomLabel: a.nearestRoomLabel ?? null,
      nearOpening: Boolean(a.nearOpening),
    })),
    roomLabels: (parsed.roomLabels ?? []).map(String),
    areaSummary: {
      livingAreaM2: parsed.areaSummary?.livingAreaM2 ?? null,
      garageAreaM2: parsed.areaSummary?.garageAreaM2 ?? null,
      alfrescoAreaM2: parsed.areaSummary?.alfrescoAreaM2 ?? null,
      coverageAreaM2: parsed.areaSummary?.coverageAreaM2 ?? null,
      perimeterM: parsed.areaSummary?.perimeterM ?? null,
    },
    garageDoorAnnotations: (parsed.garageDoorAnnotations ?? []).map(String),
    internalDoorAnnotations: (parsed.internalDoorAnnotations ?? []).map((d) => ({
      text: String(d.text ?? ""),
      nearestRoomLabel: d.nearestRoomLabel ?? null,
    })),
  };
}
