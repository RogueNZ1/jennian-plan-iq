import { callVisionModel, getAnthropicApiKey, safeParseJson } from './anthropic-client';
import { detectBuilder, UNKNOWN_BUILDER } from './builder-config';
import type { PlanContext, SheetType } from './plan-context';

const VALID_SHEET_TYPES = new Set<SheetType>([
  'floor_plan', 'dimension_plan', 'elevation', 'site_plan',
  'concept_impression', 'electrical', 'unknown',
]);

interface ReconResponse {
  builderName: string | null;
  sheetType: string;
  scaleString: string | null;
  scaleFactor: number | null;
  dimensionFormat: 'HEIGHT_x_WIDTH' | 'WIDTH_x_HEIGHT' | null;
  studHeightMm: number | null;
  livingAreaM2: number | null;
  perimeterM: number | null;
}

const SYSTEM_PROMPT = `Return ONLY valid JSON. No markdown, no prose.
You are reading a New Zealand residential building plan to identify its type and conventions.
Extract the following from the title block, notes panel, and any legend:

1. BUILDER NAME: Look for builder/designer name (e.g. "Jennian Homes", "G.J. Gardner", "Sentinel Homes"). Return null if not found.

2. SHEET TYPE: Classify this sheet as one of:
   - "floor_plan" — shows room layout with wall outlines
   - "dimension_plan" — shows dimensions/measurements overlaid on floor plan
   - "elevation" — shows external wall face view
   - "site_plan" — shows the section/lot from above
   - "concept_impression" — artist's impression, no dimensions, rough sketch
   - "electrical" — shows electrical/lighting layout
   - "unknown"

3. SCALE: Look for scale notation (e.g. "1:100 @ A3", "Scale 1:100"). Return the string as found, and the numeric denominator (e.g. 100).

4. DIMENSION FORMAT: Look for any note that states how window/opening dimensions are written.
   - If you find text like "Window sizes are HEIGHT x WIDTH" or similar → return "HEIGHT_x_WIDTH" and source "stated_on_plan"
   - If you find "WIDTH x HEIGHT" → return "WIDTH_x_HEIGHT" and source "stated_on_plan"
   - If no such note exists → return null for both (the system will apply a default)

5. STUD HEIGHT: Look for any note stating standard stud/wall height in mm (e.g. "Standard stud height: 2410mm", "2400mm high stud throughout"). Return the number in mm, or null.

6. SUMMARY BOX: Look for a summary/statistics box that lists:
   - Living area / floor area in m²
   - Perimeter in m
   Return these numbers if found, null otherwise.

Return this exact JSON structure:
{
  "builderName": string | null,
  "sheetType": "floor_plan" | "dimension_plan" | "elevation" | "site_plan" | "concept_impression" | "electrical" | "unknown",
  "scaleString": string | null,
  "scaleFactor": number | null,
  "dimensionFormat": "HEIGHT_x_WIDTH" | "WIDTH_x_HEIGHT" | null,
  "studHeightMm": number | null,
  "livingAreaM2": number | null,
  "perimeterM": number | null
}`;

export async function recognisePlan(
  planImageBase64: string,
  _filename: string,
): Promise<PlanContext> {
  const fallback: PlanContext = {
    builder: UNKNOWN_BUILDER,
    scaleString: null,
    scaleFactor: null,
    dimensionFormat: 'HEIGHT_x_WIDTH',
    dimensionFormatSource: 'nz_default',
    studHeightMm: 2400,
    studHeightSource: 'nz_default',
    sheetType: 'unknown',
    livingAreaM2: null,
    perimeterM: null,
  };

  let raw: string;
  try {
    const apiKey = getAnthropicApiKey();
    raw = await callVisionModel(
      apiKey,
      SYSTEM_PROMPT,
      "Identify the plan type, builder, scale, and conventions from this building plan image.",
      planImageBase64,
    );
  } catch (err) {
    console.error("[recognisePlan] AI call failed:", err instanceof Error ? err.message : String(err));
    return fallback;
  }

  const parsed = safeParseJson<Partial<ReconResponse>>(raw);
  if (!parsed) {
    console.error("[recognisePlan] JSON parse failed. Raw:", raw.slice(0, 300));
    return fallback;
  }

  const builder = detectBuilder(parsed.builderName ?? '');
  const rawSheetType = parsed.sheetType ?? 'unknown';
  const sheetType: SheetType = VALID_SHEET_TYPES.has(rawSheetType as SheetType)
    ? (rawSheetType as SheetType)
    : 'unknown';

  const statedFormat = parsed.dimensionFormat ?? null;
  const dimensionFormat = statedFormat ?? builder.defaultDimensionFormat;
  const dimensionFormatSource = statedFormat
    ? 'stated_on_plan'
    : builder.name !== 'Unknown'
    ? 'builder_default'
    : 'nz_default';

  const statedStudHeight = parsed.studHeightMm ?? null;
  const studHeightMm = statedStudHeight ?? builder.defaultStudHeightMm;
  const studHeightSource = statedStudHeight
    ? 'stated_on_plan'
    : builder.name !== 'Unknown'
    ? 'builder_default'
    : 'nz_default';

  return {
    builder,
    scaleString: parsed.scaleString ?? null,
    scaleFactor: parsed.scaleFactor ?? null,
    dimensionFormat,
    dimensionFormatSource,
    studHeightMm,
    studHeightSource,
    sheetType,
    livingAreaM2: parsed.livingAreaM2 ?? null,
    perimeterM: parsed.perimeterM ?? null,
  };
}
