
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_owner(uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write(uuid)                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_owner(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write(uuid)                         TO authenticated;
