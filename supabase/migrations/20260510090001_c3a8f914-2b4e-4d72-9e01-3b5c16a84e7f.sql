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

DROP POLICY IF EXISTS "Writers update plan_pdfs objects" ON storage.objects;
CREATE POLICY "Writers update plan_pdfs objects" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'plan_pdfs'
    AND public.can_write(auth.uid())
  );
