/**
 * persist-takeoff — Convergence Slice 5 persistence adapter.
 *
 * Writes the canonical enriched TakeoffData to `takeoff_runs.takeoff_json` (the QS source of
 * record, CONVERGENCE_DESIGN.md §8), ALONGSIDE the existing relational rows — it does NOT
 * touch or replace them (extracted_quantities / opening_schedule / module_items persist
 * exactly as they do today).
 *
 * GRACEFUL by design: any failure — a serialise error, an oversize payload, the column being
 * absent (until the Slice 4 migration is applied), or any network/DB error — is logged and
 * SKIPPED. It never throws, so a takeoff_json failure can never break the job save. This is
 * what makes it safe to ship the write code before the migration is applied to prod: until
 * then the write simply no-ops.
 *
 * Decoupled from the heavy generated SupabaseClient generic via a minimal structural writer
 * interface, so it is trivially mockable and does not depend on the takeoff_json column being
 * present in the generated types yet.
 */
import type { Json } from "@/integrations/supabase/types";
import type { EnrichedTakeoff } from "./enriched-takeoff";

/** A takeoff_json is a few KB; this guards a runaway payload from ever being written. */
export const MAX_TAKEOFF_JSON_BYTES = 1_000_000;

/** The minimal slice of the Supabase client this adapter needs (for testability). */
export interface TakeoffJsonWriter {
  from(table: "takeoff_runs"): {
    update(values: { takeoff_json: Json }): {
      eq(column: "id", value: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export type PersistTakeoffJsonResult = { written: boolean; error: string | null };

/**
 * Serialise the enriched takeoff to a plain JSON value, guarding size (and, via JSON.stringify,
 * circular references). Throws on failure — the caller catches and skips.
 */
export function serializeEnrichedTakeoff(enriched: EnrichedTakeoff): Json {
  const text = JSON.stringify(enriched); // throws on circular refs → caught by the caller
  if (text.length > MAX_TAKEOFF_JSON_BYTES) {
    throw new Error(`takeoff_json too large (${text.length} > ${MAX_TAKEOFF_JSON_BYTES} bytes)`);
  }
  return JSON.parse(text) as Json;
}

/**
 * Write `enriched` to takeoff_runs.takeoff_json for the given run. Returns whether the write
 * landed; NEVER throws. On any failure it logs and returns { written: false } so the calling
 * job save proceeds untouched.
 */
export async function persistEnrichedTakeoff(
  client: TakeoffJsonWriter,
  runId: string,
  enriched: EnrichedTakeoff,
): Promise<PersistTakeoffJsonResult> {
  try {
    const payload = serializeEnrichedTakeoff(enriched);
    const { error } = await client
      .from("takeoff_runs")
      .update({ takeoff_json: payload })
      .eq("id", runId);
    if (error) {
      console.warn(
        "[persist-takeoff] takeoff_json write failed — skipped (job save unaffected):",
        error.message,
      );
      return { written: false, error: error.message };
    }
    return { written: true, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      "[persist-takeoff] takeoff_json serialise/write threw — skipped (job save unaffected):",
      msg,
    );
    return { written: false, error: msg };
  }
}
