/**
 * Phase 2b — Door & Window Schedule extraction.
 *
 * Reads the dedicated schedule sheet (e.g. Jennian A501 "Door & Window Schedule"),
 * which lists every window with its ID (W01, W02, …) and printed HEIGHT × WIDTH.
 * This is the *authoritative* window list — the floor-plan callouts are partial and
 * split across pages, so the schedule is the canonical source for count + dimensions.
 *
 * Split like pdf-page-classify (Phase 2a): the pure parse/normalise logic lives here
 * and is unit-testable without the network; the thin createServerFn wrapper lives in
 * concept.functions.ts. The AI call (readWindowSchedule) is a plain async fn so the
 * node test harness can invoke it directly with a key from the environment.
 */

// !! DO NOT CHANGE THIS MODEL !! claude-opus-4-5 reads NZ schedules reliably.
const ANTHROPIC_MODEL = "claude-opus-4-5";

export interface ScheduleWindow {
  /** Schedule ID exactly as printed, e.g. "W01". */
  id: string;
  /** Glazed-pane height in mm (the unit's own opening height, NOT the head/mounting datum), or null if unreadable. */
  heightMm: number | null;
  /** Width in mm (the second number), or null if unreadable. */
  widthMm: number | null;
  /** Optional override when a rejected height was recovered from another deterministic source. */
  heightSource?: "vector" | "asserted";
  /** Per-row review flags carried through to the canonical opening row. */
  flags?: string[];
}

export interface WindowScheduleData {
  windows: ScheduleWindow[];
}

export const EMPTY_WINDOW_SCHEDULE: WindowScheduleData = { windows: [] };

export const WINDOW_SCHEDULE_SYSTEM_PROMPT = `Return ONLY valid JSON. No markdown, no prose.
You are reading a "Door & Window Schedule" sheet for a New Zealand residential dwelling.

The schedule lists each joinery item as a small elevation drawing with an ID label and
its size printed in millimetres in the format HEIGHT × WIDTH (NZ convention).

YOUR TASK — read and return only, do not interpret or calculate:

1. WINDOWS: Return every WINDOW entry. Window IDs are typically "W01", "W02", … "W13".
   For each window return:
   - id: the exact ID label as printed (e.g. "W01")
   - heightMm: the GLAZED PANE height in mm — the window unit's own opening height
     (the FIRST number of the unit's HEIGHT × WIDTH size, the dimension printed
     against the joinery unit itself)
   - widthMm: the width in mm (the SECOND number of that pair)
   If a dimension is genuinely unreadable, return null for that number — do NOT guess.

   CRITICAL — height is the WINDOW's own height, not its mounting height:
   - An elevation may also print a MOUNTING / HEAD datum — the floor-to-top-of-joinery
     installation height (a tall figure, often ~2.0–2.2 m, frequently shared by many
     windows because they all hang from the same head line). That datum is NOT the
     window's size. Do NOT return it as heightMm.
   - When a unit shows BOTH a tall head/mounting datum AND a shorter pane height (e.g.
     a head datum stacked above a sill height that together equal the mounting figure),
     return the SHORTER glazed-pane height — the size of the window opening itself.
   - A window's HEIGHT × WIDTH size pair is the joinery unit's own dimensions; the head
     datum is a separate installation reference. Read the unit size.

RULES:
- Include EVERY window ID shown, even if its dimensions repeat another window's.
- Do NOT include door entries (IDs like "D01", "GD", garage doors, entry doors).
- Do NOT deduplicate by size — two windows may share a size and are still two windows.
- Read the printed numbers. Do not measure pixels or substitute defaults.

Return exactly this JSON structure:
{
  "windows": [
    { "id": "W01", "heightMm": <number or null>, "widthMm": <number or null> }
  ]
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

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[, ]/g, ""), 10);
    return isNaN(n) ? null : n;
  }
  return null;
};

/**
 * Pure: turn the raw AI JSON string into a clean WindowScheduleData.
 * Keeps only entries with a window-style ID (W + digits), normalises numbers, and
 * de-duplicates by ID (the schedule may print an ID twice across columns).
 */
export function normaliseWindowSchedule(raw: string): WindowScheduleData {
  let parsed: { windows?: Array<{ id?: unknown; heightMm?: unknown; widthMm?: unknown }> } | null;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { windows: [] };
  }
  if (!parsed || !Array.isArray(parsed.windows)) return { windows: [] };

  const seen = new Set<string>();
  const windows: ScheduleWindow[] = [];
  for (const w of parsed.windows) {
    const id = String(w?.id ?? "")
      .trim()
      .toUpperCase();
    // Window IDs only: W followed by digits (W1, W01, W13). Excludes D01/GD/etc.
    if (!/^W\d{1,3}$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    windows.push({ id, heightMm: toNum(w?.heightMm), widthMm: toNum(w?.widthMm) });
  }
  // Stable order by numeric ID so W01..W13 read predictably.
  windows.sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
  return { windows };
}

/**
 * AI vision call: read a rendered schedule-page image and return the window list.
 * Plain async (no createServerFn) so it is callable from the node test harness.
 * Fails soft to an empty schedule — a takeoff must not be blocked by a missing
 * schedule page, and the floor-plan callouts remain as a fallback window source.
 */
export async function readWindowSchedule(
  imageBase64: string,
  opts: { apiKey: string; builderName?: string },
): Promise<WindowScheduleData> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      temperature: 0,
      system: WINDOW_SCHEDULE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is the Door & Window Schedule sheet for a ${opts.builderName ?? "Jennian Homes"} dwelling in New Zealand. Return every window entry (ID + HEIGHT × WIDTH in mm) as JSON.`,
            },
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
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
  return normaliseWindowSchedule(raw);
}
