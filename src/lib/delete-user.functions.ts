/**
 * Delete-user server function — Owner-only, true deletion.
 *
 * Why this exists: the old /users "Remove user" button ran a client-side
 * `supabase.from("user_roles").delete()`. Under RLS that returns success even
 * when it deletes ZERO rows (policy filters the row out, or the protect_sole_owner
 * trigger aborts) — so the UI said "User access removed" while nothing changed.
 * And even when it worked it only dropped a role row + suspended the profile; the
 * auth account lived on. This replaces both: a service-role delete that REALLY
 * removes the account, gated to the Owner, so there's no silent no-op.
 *
 * Mirrors invite.functions.ts exactly:
 *  1. AUTHORISE — verify the caller's token server-side; must hold `owner` AND be
 *     on the invite allowlist (reuses invite-gate — same people who can invite can
 *     remove). Nobody else gets past it, regardless of UI state.
 *  2. GUARD — never let the Owner delete themselves, and never delete the sole
 *     owner (defence-in-depth alongside the DB protect_sole_owner trigger).
 *  3. DELETE — auth user via admin API (RLS does not apply to the service role, so
 *     no silent zero-row failure). FK cascades drop user_roles; the profile row is
 *     explicitly removed too in case it isn't cascaded.
 *  4. AUDIT — user_deleted row written with the real actor.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { evaluateInviteAuthorization } from "@/lib/invite-gate";

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

function getAdminClient(): SupabaseClient {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");
  if (!url || !key) {
    throw new Error(
      "Missing Supabase admin credentials: need SUPABASE_URL + SUPABASE_SERVICE_KEY (or _ROLE_KEY).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verify the caller's token and enforce the owner-only policy (shared with invites). */
async function requireOwner(
  admin: SupabaseClient,
  accessToken: string | undefined,
): Promise<User> {
  if (!accessToken) throw new Error("Not signed in — refresh and try again.");
  const { data, error } = await admin.auth.getUser(accessToken);
  const caller = data?.user;
  if (error || !caller) throw new Error("Your session has expired — sign in again.");

  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  if (roleErr) throw new Error(`Could not verify your role: ${roleErr.message}`);

  const verdict = evaluateInviteAuthorization({
    callerEmail: caller.email,
    callerRoles: (roleRows ?? []).map((r) => (r as { role: string }).role),
    allowlistEnv: process.env.INVITE_ALLOWLIST,
  });
  if (!verdict.allowed) throw new Error(verdict.reason.replace(/invitations?/gi, "user management"));
  return caller;
}

type DeleteUserInput = {
  /** Caller's Supabase access token — REQUIRED for authorisation. */
  accessToken: string;
  /** The auth user id to delete. */
  targetUserId: string;
};

type DeleteUserResult = {
  ok: boolean;
  deletedUserId: string;
  message: string;
};

export const deleteUserFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as DeleteUserInput)
  .handler(async ({ data }): Promise<DeleteUserResult> => {
    const admin = getAdminClient();
    const caller = await requireOwner(admin, data.accessToken);

    const targetId = data.targetUserId?.trim();
    if (!targetId) throw new Error("No user specified.");

    // ── Guards (defence-in-depth; the DB trigger also protects the sole owner) ──
    if (targetId === caller.id) {
      throw new Error("You can't delete your own account.");
    }
    const { data: targetRoleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);
    const targetIsOwner = (targetRoleRows ?? []).some(
      (r) => (r as { role: string }).role === "owner",
    );
    if (targetIsOwner) {
      throw new Error("That account holds the Owner role and can't be deleted here.");
    }

    // Capture identity for the audit trail before the row disappears.
    const { data: targetUser } = await admin.auth.admin.getUserById(targetId);
    const targetEmail = targetUser?.user?.email ?? null;

    // ── Delete (service role — RLS does not apply, so no silent zero-row no-op) ──
    // Drop the profile first (it may not be FK-cascaded from auth.users), then the
    // auth account. user_roles IS cascaded (ON DELETE CASCADE on auth.users).
    const { error: profErr } = await admin.from("profiles").delete().eq("id", targetId);
    if (profErr) throw new Error(`Could not remove the user's profile: ${profErr.message}`);

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) throw new Error(`Could not delete the account: ${delErr.message}`);

    // Belt-and-braces: ensure no role rows linger if the cascade didn't fire.
    await admin.from("user_roles").delete().eq("user_id", targetId);

    // ── Audit ───────────────────────────────────────────────────────────────────
    await admin.from("audit_logs").insert({
      action: "user_deleted",
      table_name: "profiles",
      record_id: targetId,
      actor_user_id: caller.id,
      metadata: { email: targetEmail },
    });

    return {
      ok: true,
      deletedUserId: targetId,
      message: targetEmail ? `${targetEmail} has been deleted.` : "User deleted.",
    };
  });
