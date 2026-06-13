/**
 * Stage 3 - Elevation extraction.
 * Reads cladding, roof type/pitch, wall height, window counts per face,
 * external openings, gable ends, and garage door presence from an elevation sheet.
 */
import { createServerFn } from "@tanstack/react-start";

export type ElevationOpeningType =
  | "window"
  | "slider"
  | "external_door"
  | "garage_door"
  | "unknown";

export interface ElevationOpeningCandidate {
  face: string;
  type: ElevationOpeningType;
  label: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  cladding: string | null;
  confidence: "high" | "medium" | "low";
  notes: string[];
}

export interface ElevationData {
  claddingTypes: string[];
  /** 1 = brick/masonry only, 2 = weatherboard/panel only, 3 = mixed, null = unknown */
  claddingTypeCode: number | null;
  roofType: string | null;
  roofPitchDegrees: number | null;
  wallHeightMm: number | null;
  studHeightMm: number | null;
  facesPresent: string[];
  windowCountPerFace: Record<string, number>;
  externalDoorCount: number;
  gableEndCount: number;
  garageDoorsPresent: boolean;
  /**
   * Per-face opening evidence from elevations. Additive: older saved runs may not
   * have this field, so consumers must fall back to the summary counts above.
   */
  elevationOpenings?: ElevationOpeningCandidate[];
}

const SYSTEM_PROMPT = `Return ONLY valid JSON. No markdown, no prose.
You are reading an elevation drawing for a New Zealand residential dwelling.

Extract the following:

1. CLADDING - Look for text labelling cladding types on any elevation face.
   Examples: "CLADDING 1 brick", "CLADDING 2 LINEA", "70 series clay brick veneer",
   "James Hardie Linea Oblique", "Corrugate Colorsteel", "Maxiclad", "Monotek".
   Return all cladding types mentioned as an array of strings (empty array if none found).
   Also return a numeric code:
     1 = brick or masonry only (all faces brick/block/stone)
     2 = weatherboard, panel, or sheet only (no brick)
     3 = mixed (at least one brick face AND at least one non-brick face)
     null = could not determine

2. ROOF - Look for roof type and pitch annotation.
   Examples: "ROOF 25 deg METAL TILES", "Pressed metal Gerard Shake",
   "Longrun Corrugate Colorsteel endura 0.4 BMT roofing @ 25 deg pitch",
   "Metal tiles @ 25 deg", "Corrugated iron @ 12 deg".
   Return type string (e.g. "Metal tiles") and pitch in degrees as a number.

3. WALL HEIGHT - Look for any dimension showing wall height or stud height.
   Examples: "2400 STUD", "2570 STUD", "2.4m wall height".
   Return in mm (e.g. 2400). wallHeightMm = the overall wall dimension shown.
   studHeightMm = explicitly labelled stud height if stated separately.

4. ELEVATION FACES - List which elevation faces are shown.
   Examples: "NORTH WESTERN ELEVATION", "Elevation A", "SOUTH ELEVATION".
   Return as an array of strings using whatever label appears on the drawing.

5. WINDOW COUNT - For each elevation face shown, count the number of window openings visible.
   Include highlight windows, raking windows, and any glazed area that is clearly a window.
   Return as { "face label": count }.

6. EXTERNAL OPENING LEDGER - For each elevation face, list every visible external-wall
   opening as an item in elevationOpenings.
   - Include windows, sliders/stackers, ranch sliders, entry doors, PA doors, laundry doors,
     garage windows, and garage doors.
   - Set type to "garage_door" ONLY for the solid sectional/roller garage door opening.
   - Everything else in an external wall is a QS glazed opening.
   - Copy visible W/D labels where present (for example W01, D03); otherwise label=null.
   - Extract widthMm and heightMm only when dimensions are printed or unambiguous; otherwise null.
   - Use quantity > 1 only for repeated identical openings on the same face.
   - Put the cladding label for the face/opening where visible; otherwise null.
   - Use confidence high only when the opening and type are clear on the drawing.

7. EXTERNAL DOORS - Count external door openings visible across all elevations.
   Do not count garage door openings here.

8. GABLE ENDS - Count how many gable end triangles are visible across all elevations.

9. GARAGE DOORS - Are any garage door openings visible? true or false.

Return exactly this JSON structure:
{
  "claddingTypes": string[],
  "claddingTypeCode": 1 | 2 | 3 | null,
  "roofType": string | null,
  "roofPitchDegrees": number | null,
  "wallHeightMm": number | null,
  "studHeightMm": number | null,
  "facesPresent": string[],
  "windowCountPerFace": { [face: string]: number },
  "externalDoorCount": number,
  "gableEndCount": number,
  "garageDoorsPresent": boolean,
  "elevationOpenings": Array<{
    "face": string,
    "type": "window" | "slider" | "external_door" | "garage_door" | "unknown",
    "label": string | null,
    "widthMm": number | null,
    "heightMm": number | null,
    "quantity": number,
    "cladding": string | null,
    "confidence": "high" | "medium" | "low",
    "notes": string[]
  }>
}`;

function extractJson(text: string): string {
  let cleaned = text.replace(/```(?:json|JSON)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  // eslint-disable-next-line no-control-regex -- deliberate control-character sanitizer for AI JSON output
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return cleaned;
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(extractJson(raw)) as T;
  } catch {
    return null;
  }
}

function normaliseOpeningType(value: unknown): ElevationOpeningType {
  if (value === "window" || value === "slider" || value === "external_door") return value;
  if (value === "garage_door") return value;
  return "unknown";
}

function normaliseConfidence(value: unknown): ElevationOpeningCandidate["confidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function finitePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normaliseElevationOpenings(value: unknown): ElevationOpeningCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => ({
      face: typeof item.face === "string" && item.face.trim() ? item.face.trim() : "Unknown face",
      type: normaliseOpeningType(item.type),
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : null,
      widthMm: finitePositiveNumber(item.widthMm),
      heightMm: finitePositiveNumber(item.heightMm),
      quantity:
        typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0
          ? Math.max(1, Math.round(item.quantity))
          : 1,
      cladding:
        typeof item.cladding === "string" && item.cladding.trim() ? item.cladding.trim() : null,
      confidence: normaliseConfidence(item.confidence),
      notes: Array.isArray(item.notes)
        ? item.notes.filter(
            (note): note is string => typeof note === "string" && note.trim().length > 0,
          )
        : [],
    }));
}

export const extractElevationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string; builderName: string })
  .handler(async ({ data }): Promise<ElevationData> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is an elevation sheet for a ${data.builderName} residential dwelling in New Zealand. Extract cladding types, roof information, wall heights, per-face external opening evidence, external doors, gable ends, and garage door presence as JSON.`,
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: data.imageBase64 },
              },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("AI rate-limited. Please try again.");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw =
      json.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? "";

    const parsed = safeParseJson<ElevationData>(raw);
    if (!parsed) {
      console.error("[extractElevations] JSON parse failed:", raw.slice(0, 500));
      return {
        claddingTypes: [],
        claddingTypeCode: null,
        roofType: null,
        roofPitchDegrees: null,
        wallHeightMm: null,
        studHeightMm: null,
        facesPresent: [],
        windowCountPerFace: {},
        externalDoorCount: 0,
        gableEndCount: 0,
        garageDoorsPresent: false,
        elevationOpenings: [],
      };
    }

    return {
      claddingTypes: Array.isArray(parsed.claddingTypes) ? parsed.claddingTypes : [],
      claddingTypeCode:
        typeof parsed.claddingTypeCode === "number" ? parsed.claddingTypeCode : null,
      roofType: typeof parsed.roofType === "string" ? parsed.roofType : null,
      roofPitchDegrees:
        typeof parsed.roofPitchDegrees === "number" ? parsed.roofPitchDegrees : null,
      wallHeightMm: typeof parsed.wallHeightMm === "number" ? parsed.wallHeightMm : null,
      studHeightMm: typeof parsed.studHeightMm === "number" ? parsed.studHeightMm : null,
      facesPresent: Array.isArray(parsed.facesPresent) ? parsed.facesPresent : [],
      windowCountPerFace:
        parsed.windowCountPerFace && typeof parsed.windowCountPerFace === "object"
          ? (parsed.windowCountPerFace as Record<string, number>)
          : {},
      externalDoorCount:
        typeof parsed.externalDoorCount === "number" ? parsed.externalDoorCount : 0,
      gableEndCount: typeof parsed.gableEndCount === "number" ? parsed.gableEndCount : 0,
      garageDoorsPresent:
        typeof parsed.garageDoorsPresent === "boolean" ? parsed.garageDoorsPresent : false,
      elevationOpenings: normaliseElevationOpenings(parsed.elevationOpenings),
    };
  });
