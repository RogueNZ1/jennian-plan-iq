-- Owner-only invitations (11 Jun 2026)
--
-- Policy decision (Haydon): ONLY the Owner sends Jennian IQ invitations.
-- The send path is now entirely server-side (sendInvitationFn, service role,
-- gated by invite-gate.ts: owner role + email allowlist). These RLS changes
-- are defense-in-depth — they stop a direct PostgREST call with an admin JWT
-- from writing invitation rows the UI no longer writes.
--
-- READ stays admin-or-owner so admins can still see the pending list on /users.
-- user_roles was already owner-only ("Owner manages roles", 20260510003913).

DROP POLICY IF EXISTS "Admins create invitations" ON public.user_invitations;
CREATE POLICY "Owner creates invitations"
  ON public.user_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    AND auth.uid() = invited_by
  );

DROP POLICY IF EXISTS "Admins update invitations" ON public.user_invitations;
CREATE POLICY "Owner updates invitations"
  ON public.user_invitations
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Admins delete invitations" ON public.user_invitations;
CREATE POLICY "Owner deletes invitations"
  ON public.user_invitations
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));
