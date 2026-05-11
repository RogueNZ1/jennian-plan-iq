-- Add measurement provenance source column to module_items.
--
-- Values:
--   calibrated_geometry  — traced on plan with confirmed calibration (most trusted)
--   ai_annotation        — AI read from a printed dimension or text annotation
--   ai_inferred          — AI inferred from visual geometry (least trusted, review required)
--   manual_override      — user typed a value directly in the module editor
--
-- Nullable for backward compatibility with rows created before this migration.

ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IN ('calibrated_geometry','ai_annotation','ai_inferred','manual_override'));

COMMENT ON COLUMN public.module_items.source IS
  'Provenance of the extracted_value: calibrated_geometry | ai_annotation | ai_inferred | manual_override';
