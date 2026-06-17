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

async function requireOwner(admin: SupabaseClient, accessToken: string | undefined): Promise<User> {
  if (!accessToken) throw new Error("Not signed in - refresh and try again.");
  const { data, error } = await admin.auth.getUser(accessToken);
  const caller = data?.user;
  if (error || !caller) throw new Error("Your session has expired - sign in again.");

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
  if (!verdict.allowed)
    throw new Error(verdict.reason.replace(/invitations?/gi, "user management"));
  return caller;
}

type SetUserStatusInput = {
  accessToken: string;
  targetUserId: string;
  status: "active" | "suspended";
};

export const setUserStatusFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as SetUserStatusInput)
  .handler(async ({ data }): Promise<{ ok: true; message: string }> => {
    const admin = getAdminClient();
    const caller = await requireOwner(admin, data.accessToken);
    const targetId = data.targetUserId?.trim();
    if (!targetId) throw new Error("No user specified.");
    if (targetId === caller.id) throw new Error("You can't disable your own account.");

    const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(targetId);
    if (targetErr || !targetUser?.user) throw new Error("Auth user not found.");

    const { data: targetRoleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);
    if (roleErr) throw new Error(`Could not verify target roles: ${roleErr.message}`);
    const targetIsOwner = (targetRoleRows ?? []).some(
      (r) => (r as { role: string }).role === "owner",
    );
    if (targetIsOwner) throw new Error("The Owner account can't be disabled here.");

    const now = new Date().toISOString();
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        status: data.status,
        updated_at: now,
      })
      .eq("id", targetId);
    if (profileErr) throw new Error(`Could not update the profile: ${profileErr.message}`);

    const { error: authErr } = await admin.auth.admin.updateUserById(targetId, {
      ban_duration: data.status === "suspended" ? "876000h" : "none",
    });
    if (authErr) throw new Error(`Could not update auth access: ${authErr.message}`);

    const email = targetUser.user.email ?? null;
    await admin.from("audit_logs").insert({
      action: data.status === "suspended" ? "user_disabled" : "user_enabled",
      table_name: "profiles",
      record_id: targetId,
      actor_user_id: caller.id,
      metadata: {
        email,
        status: data.status,
        roles: (targetRoleRows ?? []).map((r) => (r as { role: string }).role),
        auth_ban: data.status === "suspended" ? "876000h" : "none",
      },
    });

    return {
      ok: true,
      message:
        data.status === "suspended"
          ? `${email ?? "User"} has been disabled.`
          : `${email ?? "User"} has been enabled.`,
    };
  });
