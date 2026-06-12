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

// Transient API errors (rate-limit / overloaded) are retried with short backoff
// before failing loud; all other errors (auth, credits, parse) are not retried.
const RETRYABLE_HTTP = new Set([429, 529]);
const MAX_ATTEMPTS = 3; // 1 initial attempt + up to 2 retries
const RETRY_BASE_MS = 500;

class TransientApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TransientApiError";
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function callVisionModel(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
): Promise<string> {
  // Bounded retry (F-001 resilience): a transient 429/529 shouldn't kill a real
  // job. Retry up to MAX_ATTEMPTS with exponential backoff, then fail loud.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callVisionModelOnce(apiKey, systemPrompt, userText, imageBase64);
    } catch (err) {
      if (!(err instanceof TransientApiError) || attempt === MAX_ATTEMPTS) throw err;
      const backoffMs = RETRY_BASE_MS * 2 ** (attempt - 1); // 500ms, then 1000ms
      console.warn(
        `[callVisionModel] transient error (HTTP ${err.status}) — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoffMs}ms`,
      );
      await sleep(backoffMs);
    }
  }
  // The loop always returns or throws; this only satisfies the type checker.
  throw new Error("[callVisionModel] retries exhausted");
}

async function callVisionModelOnce(
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
      // Deterministic decoding (F-001): pin temperature so the same plan yields the
      // same read. The reproducibility harness snapshots this output; stochastic
      // sampling would make the golden fixture unreproducible.
      temperature: 0,
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

  // 429 (rate-limited) and 529 (overloaded) are transient → retried by the caller.
  if (RETRYABLE_HTTP.has(res.status)) {
    throw new TransientApiError(
      res.status === 429 ? "AI rate-limited." : "Anthropic API overloaded.",
      res.status,
    );
  }
  if (res.status === 402) throw new Error("Anthropic API credits exhausted. Contact support.");
  if (res.status === 401) throw new Error("ANTHROPIC_API_KEY is invalid or not authorised.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const content =
    json.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("") ?? "";
  if (!content) {
    console.error(
      "[callVisionModel] Empty response. Full body:",
      JSON.stringify(json).slice(0, 500),
    );
    return "";
  }
  return content;
}

function extractJson(text: string): string {
  let cleaned = text.replace(/```(?:json|JSON)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  // eslint-disable-next-line no-control-regex -- deliberate control-character sanitizer for AI JSON output
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return cleaned;
}

function tryRepairTruncatedJson(text: string): string | null {
  let s = text;
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}") {
      if (stack[stack.length - 1] === "{") stack.pop();
    } else if (ch === "]") {
      if (stack[stack.length - 1] === "[") stack.pop();
    }
  }
  if (inString) s += '"';
  s = s.replace(/,\s*$/, "");
  while (stack.length) {
    const open = stack.pop();
    s += open === "{" ? "}" : "]";
  }
  try {
    JSON.parse(s);
    return s;
  } catch {
    return null;
  }
}

export function safeParseJson<T>(raw: string): T | null {
  const cleaned = extractJson(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const repaired = tryRepairTruncatedJson(cleaned);
    if (repaired) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}
