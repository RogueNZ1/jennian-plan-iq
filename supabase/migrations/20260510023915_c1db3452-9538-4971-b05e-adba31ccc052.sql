-- 1. Extend app_role enum with project_manager
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'project_manager';

-- 2. Add branch column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS branch text;

-- 3. User invitations table (pending invites that haven't completed signup yet)
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  role public.app_role NOT NULL DEFAULT 'viewer',
  branch text,
  welcome_message text,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One pending invite per email
CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_email_pending_idx
  ON public.user_invitations (lower(email))
  WHERE status = 'pending';

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read invitations" ON public.user_invitations;
CREATE POLICY "Admins read invitations"
  ON public.user_invitations
  FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins create invitations" ON public.user_invitations;
CREATE POLICY "Admins create invitations"
  ON public.user_invitations
  FOR INSERT
  WITH CHECK (
    public.is_admin_or_owner(auth.uid())
    AND auth.uid() = invited_by
  );

DROP POLICY IF EXISTS "Admins update invitations" ON public.user_invitations;
CREATE POLICY "Admins update invitations"
  ON public.user_invitations
  FOR UPDATE
  USING (public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins delete invitations" ON public.user_invitations;
CREATE POLICY "Admins delete invitations"
  ON public.user_invitations
  FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- updated_at trigger
DROP TRIGGER IF EXISTS user_invitations_set_updated_at ON public.user_invitations;
CREATE TRIGGER user_invitations_set_updated_at
  BEFORE UPDATE ON public.user_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();