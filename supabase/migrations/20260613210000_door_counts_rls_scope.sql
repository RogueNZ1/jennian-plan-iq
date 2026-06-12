-- door_counts RLS — close the blanket policy (audit finding C1, 13 Jun 2026).
--
-- The original migration (20260519000000_door_counts.sql) shipped
-- `using (true) with check (true)` for all authenticated users — the ONLY job-child
-- table not scoped to the job. Every sibling (module_runs, module_items,
-- uploaded_files, opening_schedule, …) uses the layered pattern:
--   read   → job creator OR admin/owner OR (viewer AND job approved/exported)
--   write  → can_write AND (job creator OR admin/owner)
--   delete → admin/owner only
-- This migration makes door_counts identical to module_runs. No data change.

DROP POLICY IF EXISTS "Authenticated users can manage door counts" ON public.door_counts;

CREATE POLICY "Read door counts"
  ON public.door_counts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = door_counts.job_id
      AND (j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (public.has_role(auth.uid(), 'viewer'::app_role)
            AND j.status IN ('approved','exported')))
  ));

CREATE POLICY "Insert door counts (writers)"
  ON public.door_counts FOR INSERT
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = door_counts.job_id
      AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));

CREATE POLICY "Update door counts (writers)"
  ON public.door_counts FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = door_counts.job_id
      AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));

CREATE POLICY "Delete door counts admin"
  ON public.door_counts FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));
