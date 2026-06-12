/**
 * Stage 4 — Site plan extraction.
 * Reads concrete/paving areas, driveway area, total coverage, and perimeter
 * from a site plan sheet.
 */
import { createServerFn } from "@tanstack/react-start";

export interface ConcreteArea {
  label: string;
  areaM2: number;
}

export interface SitePlanData {
  concreteAreas: ConcreteArea[];
  totalConcreteM2: number;
  drivewayConcretM2: number | null;
  patioConcreteM2: number | null;
  totalCoverageM2: number | null;
  perimeterM: number | null;
}

const SYSTEM_PROMPT = `Return ONLY valid JSON. No markdown, no prose.
You are reading a site plan for a New Zealand residential dwelling.

Extract the following:

1. CONCRETE AREAS — Find all areas labelled with "m2 Concrete", "m² Concrete", or similar.
   Examples: "80m2 Concrete", "132m2 Concrete", "13m2 Concrete", "17m² conc".
   For each area found return the numeric value and any nearby label text.
   Label text examples: "Driveway", "Patio", "Path", "Entry", "Terrace", or empty string if no label.
   The area value is in m² (square metres).

2. TOTAL CONCRETE — Sum of all concrete areas found (in m²).
   If you cannot find individual areas, look for a "TOTAL CONCRETE" or "Total Conc" summary line.

3. DRIVEWAY CONCRETE — The concrete area specifically labelled as driveway or access.
   Return null if no driveway is specifically identified.

4. PATIO/PATHS CONCRETE — The concrete area for paths, patio, alfresco slab, or terrace.
   If multiple patio/path areas exist, sum them. Return null if none identified.

5. COVERAGE AREA — Look for a box or table on the site plan with a "COVERAGE AREA" row.
   This is typically in m². Return null if not found.

6. PERIMETER — Look for a "PERIMETER" value in any summary box or table on the site plan.
   This is the external perimeter of the house footprint in metres. Return null if not found.

Return exactly this JSON structure:
{
  "concreteAreas": [{ "label": string, "areaM2": number }],
  "totalConcreteM2": number,
  "drivewayConcretM2": number | null,
  "patioConcreteM2": number | null,
  "totalCoverageM2": number | null,
  "perimeterM": number | null
}

If no concrete areas are found at all, return totalConcreteM2: 0 and an empty concreteAreas array.`;

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

export const extractSitePlanFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { imageBase64: string })
  .handler(async ({ data }): Promise<SitePlanData> => {
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
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "This is a site plan for a New Zealand residential dwelling. Extract all concrete areas with their labels, driveway and patio areas, total coverage area, and perimeter as JSON.",
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

    const parsed = safeParseJson<SitePlanData>(raw);
    if (!parsed) {
      console.error("[extractSitePlan] JSON parse failed:", raw.slice(0, 500));
      return {
        concreteAreas: [],
        totalConcreteM2: 0,
        drivewayConcretM2: null,
        patioConcreteM2: null,
        totalCoverageM2: null,
        perimeterM: null,
      };
    }

    const areas: ConcreteArea[] = (Array.isArray(parsed.concreteAreas) ? parsed.concreteAreas : [])
      .filter((a) => typeof a === "object" && a !== null)
      .map((a) => ({
        label: typeof a.label === "string" ? a.label : "",
        areaM2: typeof a.areaM2 === "number" ? a.areaM2 : 0,
      }));

    const totalConcreteM2 =
      typeof parsed.totalConcreteM2 === "number"
        ? parsed.totalConcreteM2
        : areas.reduce((s, a) => s + a.areaM2, 0);

    return {
      concreteAreas: areas,
      totalConcreteM2,
      drivewayConcretM2:
        typeof parsed.drivewayConcretM2 === "number" ? parsed.drivewayConcretM2 : null,
      patioConcreteM2: typeof parsed.patioConcreteM2 === "number" ? parsed.patioConcreteM2 : null,
      totalCoverageM2: typeof parsed.totalCoverageM2 === "number" ? parsed.totalCoverageM2 : null,
      perimeterM: typeof parsed.perimeterM === "number" ? parsed.perimeterM : null,
    };
  });
