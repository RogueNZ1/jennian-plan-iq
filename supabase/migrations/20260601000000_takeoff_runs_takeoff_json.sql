-- Convergence Slice 4 — additive, non-breaking schema change.
--
-- Adds a single NULLABLE JSONB column to takeoff_runs to hold the canonical enriched
-- TakeoffData (per-field { value, source, confidence, discrepancy_flags } + global notes) —
-- the QS source of record agreed in CONVERGENCE_DESIGN.md §8. It is a DEDICATED column,
-- NOT overloaded into the existing `summary` (which stays the run-status object).
--
-- Scope of THIS migration: the column exists, full stop.
--   * Nothing WRITES it yet  — run.ts will, in Slice 5.
--   * Nothing READS it yet   — buildQSExportData will, in Slice 6.
--   * Existing rows get NULL  — no default, so pre-convergence runs are unaffected and
--     every job still loads/opens exactly as before.
--
-- Safety: additive only. No NOT NULL, no default, no constraint changes, no touching any
-- existing column. IF NOT EXISTS makes it idempotent (safe to re-run).
--
-- Reverse (down): DROP COLUMN IF EXISTS public.takeoff_runs.takeoff_json;

ALTER TABLE public.takeoff_runs
  ADD COLUMN IF NOT EXISTS takeoff_json JSONB;

COMMENT ON COLUMN public.takeoff_runs.takeoff_json IS
  'Convergence: canonical enriched TakeoffData (per-field value/source/confidence/discrepancy_flags + global notes). Nullable; written by run.ts (Slice 5), read by buildQSExportData (Slice 6). NULL for pre-convergence rows.';
