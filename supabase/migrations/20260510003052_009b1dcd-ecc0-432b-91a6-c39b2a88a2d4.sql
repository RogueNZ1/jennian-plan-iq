
-- ============= ENUMS =============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner','admin','estimator','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('invited','active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= USER ROLES (separate from profiles) =============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helpers (SECURITY DEFINER to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'))
$$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin','estimator'))
$$;

-- user_roles policies
DROP POLICY IF EXISTS "Users view own roles"   ON public.user_roles;
DROP POLICY IF EXISTS "Admins view all roles"  ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles"    ON public.user_roles;

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- ============= PROFILES — extra fields =============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS status         public.profile_status NOT NULL DEFAULT 'invited',
  ADD COLUMN IF NOT EXISTS invited_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at     timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at  timestamptz;

-- Backfill existing profiles to active
UPDATE public.profiles SET status = 'active' WHERE status = 'invited' AND created_at < now() - interval '1 minute';

-- Updated handle_new_user — also stores email + status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    CASE WHEN NEW.email_confirmed_at IS NOT NULL
         THEN 'active'::public.profile_status
         ELSE 'invited'::public.profile_status END
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profile policies — admins manage everyone
DROP POLICY IF EXISTS "Admins view all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;

CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin_or_owner(auth.uid()));

-- ============= AUDIT LOGS =============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id text,
  previous_value jsonb,
  new_value jsonb,
  ip_address text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view audit logs"     ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated insert audit" ON public.audit_logs;

CREATE POLICY "Admins view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Authenticated insert audit" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = actor_user_id);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx      ON public.audit_logs (actor_user_id);

-- ============= REPLACE OLD TABLE POLICIES =============
DROP POLICY IF EXISTS "Users manage own jobs"          ON public.jobs;
DROP POLICY IF EXISTS "Users manage own quantities"    ON public.extracted_quantities;
DROP POLICY IF EXISTS "Users manage own files"         ON public.uploaded_files;
DROP POLICY IF EXISTS "Users manage own overrides"     ON public.quantity_overrides;
DROP POLICY IF EXISTS "Users manage own export logs"   ON public.export_logs;

-- jobs --
CREATE POLICY "Read jobs" ON public.jobs FOR SELECT
  USING (
    auth.uid() = created_by
    OR public.is_admin_or_owner(auth.uid())
    OR (public.has_role(auth.uid(),'viewer') AND status IN ('approved','exported'))
  );
CREATE POLICY "Insert jobs (writers)" ON public.jobs FOR INSERT
  WITH CHECK (auth.uid() = created_by AND public.can_write(auth.uid()));
CREATE POLICY "Update own jobs or admin" ON public.jobs FOR UPDATE
  USING (
    (auth.uid() = created_by AND public.can_write(auth.uid()))
    OR public.is_admin_or_owner(auth.uid())
  );
CREATE POLICY "Delete jobs admin only" ON public.jobs FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- uploaded_files --
CREATE POLICY "Read files for accessible jobs" ON public.uploaded_files FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = uploaded_files.job_id
    AND (j.created_by = auth.uid()
         OR public.is_admin_or_owner(auth.uid())
         OR (public.has_role(auth.uid(),'viewer') AND j.status IN ('approved','exported')))));
CREATE POLICY "Insert files (writers)" ON public.uploaded_files FOR INSERT
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id = uploaded_files.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
CREATE POLICY "Delete files admin only" ON public.uploaded_files FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- extracted_quantities --
CREATE POLICY "Read quantities" ON public.extracted_quantities FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = extracted_quantities.job_id
    AND (j.created_by = auth.uid()
         OR public.is_admin_or_owner(auth.uid())
         OR (public.has_role(auth.uid(),'viewer') AND j.status IN ('approved','exported')))));
CREATE POLICY "Insert quantities (writers)" ON public.extracted_quantities FOR INSERT
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id = extracted_quantities.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
CREATE POLICY "Update quantities (writers)" ON public.extracted_quantities FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id = extracted_quantities.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
CREATE POLICY "Delete quantities admin" ON public.extracted_quantities FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- quantity_overrides --
CREATE POLICY "Read overrides" ON public.quantity_overrides FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.extracted_quantities q
    JOIN public.jobs j ON j.id = q.job_id
    WHERE q.id = quantity_overrides.quantity_id
    AND (j.created_by = auth.uid()
         OR public.is_admin_or_owner(auth.uid())
         OR (public.has_role(auth.uid(),'viewer') AND j.status IN ('approved','exported')))));
CREATE POLICY "Insert overrides (writers)" ON public.quantity_overrides FOR INSERT
  WITH CHECK (auth.uid() = edited_by AND public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.extracted_quantities q
    JOIN public.jobs j ON j.id = q.job_id
    WHERE q.id = quantity_overrides.quantity_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));

-- export_logs (only admin/owner can record exports) --
CREATE POLICY "Read exports admin or own" ON public.export_logs FOR SELECT
  USING (public.is_admin_or_owner(auth.uid())
         OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = export_logs.job_id AND j.created_by = auth.uid()));
CREATE POLICY "Insert exports admin only" ON public.export_logs FOR INSERT
  WITH CHECK (public.is_admin_or_owner(auth.uid()) AND auth.uid() = exported_by);

-- ============= STORAGE BUCKETS =============
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan_pdfs','plan_pdfs',false),
       ('specification_pdfs','specification_pdfs',false),
       ('exports','exports',false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage object policies (private, role-aware)
DROP POLICY IF EXISTS "Auth read plan/spec files"       ON storage.objects;
DROP POLICY IF EXISTS "Writers upload plan/spec files"  ON storage.objects;
DROP POLICY IF EXISTS "Admins delete private files"     ON storage.objects;
DROP POLICY IF EXISTS "Writers read exports"            ON storage.objects;
DROP POLICY IF EXISTS "Admins write exports"            ON storage.objects;

CREATE POLICY "Auth read plan/spec files" ON storage.objects
  FOR SELECT USING (
    bucket_id IN ('plan_pdfs','specification_pdfs')
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Writers upload plan/spec files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id IN ('plan_pdfs','specification_pdfs')
    AND public.can_write(auth.uid())
  );

CREATE POLICY "Admins delete private files" ON storage.objects
  FOR DELETE USING (
    bucket_id IN ('plan_pdfs','specification_pdfs','exports','job-files')
    AND public.is_admin_or_owner(auth.uid())
  );

CREATE POLICY "Writers read exports" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'exports'
    AND public.can_write(auth.uid())
  );

CREATE POLICY "Admins write exports" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'exports'
    AND public.is_admin_or_owner(auth.uid())
  );
