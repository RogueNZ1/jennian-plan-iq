import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AppRole = "owner" | "admin" | "estimator" | "project_manager" | "viewer";

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

type ActivateProfileInput = { accessToken: string };

type InvitationActivation = {
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
  branch: string | null;
};

function fullNameFromInvite(
  invite: Pick<InvitationActivation, "first_name" | "last_name">,
): string | null {
  return [invite.first_name, invite.last_name].filter(Boolean).join(" ") || null;
}

export const activateProfileFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as ActivateProfileInput)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const admin = getAdminClient();
    if (!data.accessToken) throw new Error("Not signed in - refresh and try again.");

    const { data: authData, error: authErr } = await admin.auth.getUser(data.accessToken);
    const user = authData?.user;
    if (authErr || !user) throw new Error("Your invite session has expired.");

    const { data: profile, error: profileReadErr } = await admin
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileReadErr) throw new Error(`Could not verify profile: ${profileReadErr.message}`);
    if (profile?.status === "suspended") throw new Error("This account has been disabled.");

    const { data: invite, error: inviteErr } = await admin
      .from("user_invitations")
      .select("first_name, last_name, role, branch")
      .ilike("email", user.email ?? "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inviteErr) throw new Error(`Could not read invitation: ${inviteErr.message}`);

    const now = new Date().toISOString();
    const invited = invite as InvitationActivation | null;
    const invitedName = invited ? fullNameFromInvite(invited) : null;
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        ...(invitedName ? { full_name: invitedName } : {}),
        ...(invited?.branch ? { branch: invited.branch } : {}),
        status: "active",
        accepted_at: now,
        last_login_at: now,
        updated_at: now,
      })
      .eq("id", user.id);
    if (profileErr) throw new Error(`Account activation failed: ${profileErr.message}`);

    if (invited?.role) {
      const { error: clearRoleErr } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", user.id)
        .neq("role", "owner");
      if (clearRoleErr) throw new Error(`Could not clear stale roles: ${clearRoleErr.message}`);

      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert(
          { user_id: user.id, role: invited.role },
          { onConflict: "user_id,role", ignoreDuplicates: false },
        );
      if (roleErr) throw new Error(`Could not assign invited role: ${roleErr.message}`);
    }

    await admin.from("audit_logs").insert({
      action: "profile_activated",
      table_name: "profiles",
      record_id: user.id,
      actor_user_id: user.id,
      metadata: { email: user.email ?? null, role: invited?.role ?? null },
    });

    return { ok: true };
  });
