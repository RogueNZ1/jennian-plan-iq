-- Grant owner role to Haydon (the sole permanent owner)
INSERT INTO public.user_roles (user_id, role)
VALUES ('c4359ff7-3e19-4684-93a6-d4a0bfb7515d', 'owner')
ON CONFLICT (user_id, role) DO NOTHING;

-- Mark profile as active
UPDATE public.profiles
SET status = 'active', accepted_at = COALESCE(accepted_at, now())
WHERE id = 'c4359ff7-3e19-4684-93a6-d4a0bfb7515d';

-- Safeguard: only Haydon can ever hold the owner role, and his owner role is immutable
CREATE OR REPLACE FUNCTION public.protect_sole_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_uid CONSTANT uuid := 'c4359ff7-3e19-4684-93a6-d4a0bfb7515d';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' AND NEW.user_id <> owner_uid THEN
      RAISE EXCEPTION 'Only the designated owner account may hold the owner role.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id = owner_uid AND OLD.role = 'owner'
       AND (NEW.user_id <> owner_uid OR NEW.role <> 'owner') THEN
      RAISE EXCEPTION 'The owner role for the designated owner cannot be modified.';
    END IF;
    IF NEW.role = 'owner' AND NEW.user_id <> owner_uid THEN
      RAISE EXCEPTION 'Only the designated owner account may hold the owner role.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id = owner_uid AND OLD.role = 'owner' THEN
      RAISE EXCEPTION 'The designated owner role cannot be removed.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS protect_sole_owner_trg ON public.user_roles;
CREATE TRIGGER protect_sole_owner_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_sole_owner();

-- Tighten RLS: only the owner (not other admins) can manage roles
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Owner manages roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'owner'))
WITH CHECK (has_role(auth.uid(), 'owner'));