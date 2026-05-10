-- Fix: add UPDATE policy for rendered plan page images stored in plan_pdfs.
--
-- renderAndUploadPlanPage calls storage.upload({ upsert: true }). On first render
-- this performs an INSERT on storage.objects (covered by the existing INSERT
-- policy). On any subsequent render of the same page the file already exists,
-- so Supabase Storage performs an UPDATE instead.
--
-- Without an UPDATE policy the upsert fails with:
--   "new row violates row-level security policy"
--
-- This policy mirrors the existing INSERT policy: writers (owner/admin/estimator)
-- may overwrite rendered images.  The plan_pdfs bucket is private (not public),
-- so rendered images remain inaccessible to unauthenticated requests.

-- Inline the can_write check so this migration is self-contained even if
-- migration 003052 has not yet been applied to the target instance.
DROP POLICY IF EXISTS "Writers update plan_pdfs objects" ON storage.objects;
CREATE POLICY "Writers update plan_pdfs objects" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'plan_pdfs'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'estimator')
    )
  );
