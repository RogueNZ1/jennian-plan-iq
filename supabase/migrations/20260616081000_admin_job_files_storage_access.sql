-- Admins can read and manage original uploaded job files.
-- Earlier role-aware storage policies covered plan_pdfs/specification_pdfs/exports,
-- but left the legacy job-files bucket constrained to the path owner.
DROP POLICY IF EXISTS "Admins manage job-files objects" ON storage.objects;

CREATE POLICY "Admins manage job-files objects"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'job-files'
  AND public.is_admin_or_owner(auth.uid())
)
WITH CHECK (
  bucket_id = 'job-files'
  AND public.is_admin_or_owner(auth.uid())
);
