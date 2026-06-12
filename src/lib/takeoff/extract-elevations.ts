/**
 * Stage 3 — Elevation extraction.
 * Reads cladding, roof type/pitch, wall height, window counts per face,
 * external doors, gable ends, and garage door presence from an elevation sheet.
 */
import { createServerFn } from "@tanstack/react-start";

export interface ElevationData {
  claddingTypes: string[];
  /** 1 = brick/masonry only · 2 = weatherboard/panel only · 3 = mixed · null = unknown */
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
}

const SYSTEM_PROMPT = `Return ONLY valid JSON. No markdown, no prose.
You are reading an elevation drawing for a New Zealand residential dwelling.

Extract the following:

1. CLADDING — Look for text labelling cladding types on any elevation face.
   Examples: "CLADDING 1 brick", "CLADDING 2 LINEA", "70 series clay brick veneer",
   "James Hardie Linea Oblique", "Corrugate Colorsteel", "Maxiclad", "Monotek".
   Return all cladding types mentioned as an array of strings (empty array if none found).
   Also return a numeric code:
     1 = brick or masonry only (all faces brick/block/stone)
     2 = weatherboard, panel, or sheet only (no brick)
     3 = mixed (at least one brick face AND at least one non-brick face)
     null = could not determine

2. ROOF — Look for roof type and pitch annotation.
   Examples: "ROOF 25° METAL TILES", "Pressed metal Gerard Shake",
   "Longrun Corrugate Colorsteel endura 0.4 BMT roofing @ 25° pitch",
   "Metal tiles @ 25°", "Corrugated iron @ 12°".
   Return type string (e.g. "Metal tiles") and pitch in degrees as a number.

3. WALL HEIGHT — Look for any dimension showing wall height or stud height.
   Examples: "2400 STUD", "2570 STUD", "2.4m wall height".
   Return in mm (e.g. 2400). wallHeightMm = the overall wall dimension shown.
   studHeightMm = explicitly labelled stud height if stated separately.

4. ELEVATION FACES — List which elevation faces are shown.
   Examples: "NORTH WESTERN ELEVATION", "Elevation A", "SOUTH ELEVATION".
   Return as an array of strings using whatever label appears on the drawing.

5. WINDOW COUNT — For each elevation face shown, count the number of window openings visible.
   Include highlight windows, raking windows, and any glazed area that is clearly a window.
   Return as { "face label": count }.

6. EXTERNAL DOORS — Count external door openings visible across all elevations.
   Do not count garage door openings here.

7. GABLE ENDS — Count how many gable end triangles are visible across all elevations.

8. GARAGE DOORS — Are any garage door openings visible? true or false.

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
  "garageDoorsPresent": boolean
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
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is an elevation sheet for a ${data.builderName} residential dwelling in New Zealand. Extract cladding types, roof information, wall heights, window counts per face, external doors, gable ends, and garage door presence as JSON.`,
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
    };
  });
