/**
 * Centralised type-narrowing helpers used to bridge the gap between
 * generated Supabase types and the project's narrower local types.
 *
 * These exist so the cast lives in ONE place rather than being scattered as
 * `as unknown as X` throughout the codebase. They do not perform runtime
 * validation — they are documented escape hatches.
 */
/**
 * Local mirror of the Supabase-generated `Json` column type. Duplicated here
 * (instead of imported) so this module has ZERO dependencies on
 * `@/integrations/supabase/*` and remains a pure, side-effect-free utility.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Cast a plain object/array into the database's `Json` column type. */
export function toJson<T>(val: T): Json {
  return val as unknown as Json;
}

/**
 * Narrow a Supabase row (or array of rows) to a local type whose string
 * fields are tighter unions than the generated `string` types.
 * Use only after verifying the column constraints upstream.
 */
export function narrowRow<T>(row: unknown): T {
  return row as T;
}
