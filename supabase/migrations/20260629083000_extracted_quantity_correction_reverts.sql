CREATE OR REPLACE FUNCTION public.guard_extracted_quantity_correction_revert_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.run_id IS DISTINCT FROM OLD.run_id
    OR NEW.extracted_quantity_id IS DISTINCT FROM OLD.extracted_quantity_id
    OR NEW.visual_anchor_id IS DISTINCT FROM OLD.visual_anchor_id
    OR NEW.action IS DISTINCT FROM OLD.action
    OR NEW.field IS DISTINCT FROM OLD.field
    OR NEW.before_json IS DISTINCT FROM OLD.before_json
    OR NEW.after_json IS DISTINCT FROM OLD.after_json
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.evidence_refs_json IS DISTINCT FROM OLD.evidence_refs_json
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.supersedes_correction_id IS DISTINCT FROM OLD.supersedes_correction_id
  THEN
    RAISE EXCEPTION 'extracted_quantity_corrections are append-only; only revert metadata may change';
  END IF;

  IF OLD.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'extracted_quantity_corrections revert metadata cannot be changed after revert';
  END IF;

  IF NEW.reverted_at IS NULL
    OR NEW.reverted_by IS NULL
    OR NEW.revert_reason IS NULL
    OR length(trim(NEW.revert_reason)) = 0
  THEN
    RAISE EXCEPTION 'reverting an extracted quantity correction requires reverted_at, reverted_by, and revert_reason';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS extracted_quantity_corrections_revert_guard
  ON public.extracted_quantity_corrections;
CREATE TRIGGER extracted_quantity_corrections_revert_guard
  BEFORE UPDATE ON public.extracted_quantity_corrections
  FOR EACH ROW EXECUTE FUNCTION public.guard_extracted_quantity_correction_revert_update();

DROP POLICY IF EXISTS "Revert extracted quantity corrections"
  ON public.extracted_quantity_corrections;
CREATE POLICY "Revert extracted quantity corrections"
  ON public.extracted_quantity_corrections FOR UPDATE
  USING (
    reverted_at IS NULL
    AND public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = extracted_quantity_corrections.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  )
  WITH CHECK (
    auth.uid() = reverted_by
    AND reverted_at IS NOT NULL
    AND revert_reason IS NOT NULL
    AND length(trim(revert_reason)) > 0
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = extracted_quantity_corrections.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );
