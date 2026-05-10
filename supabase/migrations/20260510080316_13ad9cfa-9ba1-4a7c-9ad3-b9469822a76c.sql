
-- Vision Takeoff: rendered page images registry
CREATE TABLE public.vision_takeoff_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  page_type text,
  render_resolution integer NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'plan_pdfs',
  storage_path text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, file_id, page_number)
);

CREATE INDEX idx_vision_takeoff_pages_job ON public.vision_takeoff_pages(job_id);

ALTER TABLE public.vision_takeoff_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read vision pages"
  ON public.vision_takeoff_pages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = vision_takeoff_pages.job_id
      AND (j.created_by = auth.uid()
           OR public.is_admin_or_owner(auth.uid())
           OR (public.has_role(auth.uid(),'viewer'::app_role)
               AND j.status = ANY (ARRAY['approved'::job_status,'exported'::job_status])))
  ));

CREATE POLICY "Insert vision pages (writers)"
  ON public.vision_takeoff_pages FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = vision_takeoff_pages.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

CREATE POLICY "Update vision pages (writers)"
  ON public.vision_takeoff_pages FOR UPDATE
  USING (
    public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = vision_takeoff_pages.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

CREATE POLICY "Delete vision pages admin"
  ON public.vision_takeoff_pages FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));
