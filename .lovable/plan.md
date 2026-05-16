## Problem

`src/lib/takeoff/concept.functions.ts` throws `LOVABLE_API_KEY is not configured` because `process.env.LOVABLE_API_KEY` is `undefined` in the server runtime — even though the Cloud > Secrets panel shows an entry from May 10, 2026.

`LOVABLE_API_KEY` is a **managed** secret provisioned by the Lovable AI Gateway, not a user secret. The panel row can exist while the runtime binding is missing or stale. The application code is correct (it reads the env var inside `.handler()`, which is the right pattern for TanStack server functions).

## Fix

Rotate the managed key via the AI Gateway. This regenerates the credential and re-injects it into the Worker runtime in a single step.

### Steps

1. Run `ai_gateway--rotate_lovable_api_key` — regenerates `LOVABLE_API_KEY` and updates the server runtime binding.
2. Verify by re-running the failing flow (Upload → continue from page selection). The server function should now reach `https://ai.gateway.lovable.dev/v1/chat/completions` and return a scale result.
3. If the error persists after rotation, check `stack_modern--server-function-logs` for the actual server-side error (rotation issue vs. gateway 402/429 vs. network).

### No code changes required

The existing `getApiKey()` helper in `concept.functions.ts` is correct:
- Reads `process.env.LOVABLE_API_KEY` inside the handler (not module scope) ✓
- Throws a clear error when missing ✓
- Uses the correct gateway URL and OpenAI-compatible payload ✓

### What NOT to do

- Don't add the key via `secrets--add_secret` — `LOVABLE_API_KEY` is managed and that tool can't write it.
- Don't edit `.env` — managed secrets aren't sourced from there in the Worker runtime.
- Don't change the code to read from a different env var name — the name is correct.

### Why rotation works

The rotate tool talks to the AI Gateway control plane, which (a) issues a fresh credential and (b) writes it into the project's runtime environment binding. This resolves the "panel row exists but runtime is empty" mismatch.
