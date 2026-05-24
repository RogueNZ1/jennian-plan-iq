// !! DO NOT CHANGE THIS MODEL !!
// claude-opus-4-5 handles architectural vision reliably.
// Do NOT switch to any OpenAI model — they do not work for NZ plan reading.
export const ANTHROPIC_MODEL = "claude-opus-4-5";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  return key;
}

export async function callVisionModel(
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

  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const content = json.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
  if (!content) {
    console.error("[callVisionModel] Empty response. Full body:", JSON.stringify(json).slice(0, 500));
    return "";
  }
  return content;
}

function extractJson(text: string): string {
  let cleaned = text.replace(/```(?:json|JSON)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
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

export function safeParseJson<T>(raw: string): T | null {
  const cleaned = extractJson(raw);
  try { return JSON.parse(cleaned) as T; } catch {
    const repaired = tryRepairTruncatedJson(cleaned);
    if (repaired) { try { return JSON.parse(repaired) as T; } catch { /* fall through */ } }
    return null;
  }
}
