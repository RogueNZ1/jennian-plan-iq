ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IN ('calibrated_geometry','ai_annotation','ai_inferred','manual_override'));

COMMENT ON COLUMN public.module_items.source IS
  'Provenance of the extracted_value: calibrated_geometry | ai_annotation | ai_inferred | manual_override';