-- Make "Disable user" a real access revocation.
--
-- RLS policies call has_role/is_admin_or_owner/can_write. These helpers must
-- fail closed unless the profile is active; otherwise a suspended user with an
-- old role row still has API access.

CREATE OR REPLACE FUNCTION public.is_active_profile(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.status = 'active'::public.profile_status
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.status = 'active'::public.profile_status
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('owner', 'admin')
      AND p.status = 'active'::public.profile_status
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('owner', 'admin', 'estimator')
      AND p.status = 'active'::public.profile_status
  )
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_security_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
    OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at
  ) THEN
    RAISE EXCEPTION 'Protected profile fields can only be changed by Jennian IQ account management.';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS prevent_profile_security_self_update_trg ON public.profiles;
CREATE TRIGGER prevent_profile_security_self_update_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_security_self_update();
