import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { evaluateInviteAuthorization } from "@/lib/invite-gate";
import {
  buildAccessHealthRows,
  type AccessAuthUser,
  type AccessHealthRow,
  type AccessInvite,
  type AccessProfile,
  type AccessRole,
} from "@/lib/auth/access-health";

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
  if (!verdict.allowed) throw new Error(verdict.reason);
  return caller;
}

type AccessHealthInput = { accessToken: string };

type AccessHealthResult = {
  ok: true;
  rows: AccessHealthRow[];
};

export const getUserAccessHealthFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as AccessHealthInput)
  .handler(async ({ data }): Promise<AccessHealthResult> => {
    const admin = getAdminClient();
    await requireOwner(admin, data.accessToken);

    const [{ data: authData }, { data: profiles }, { data: roles }, { data: invites }] =
      await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from("profiles").select("id, email, full_name, status, accepted_at, last_login_at"),
        admin.from("user_roles").select("user_id, role"),
        admin.from("user_invitations").select("email, status, created_at"),
      ]);

    const authUsers: AccessAuthUser[] = (authData?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? null,
      invited_at: u.invited_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));

    return {
      ok: true,
      rows: buildAccessHealthRows({
        authUsers,
        profiles: (profiles ?? []) as AccessProfile[],
        roles: (roles ?? []) as AccessRole[],
        invites: (invites ?? []) as AccessInvite[],
      }),
    };
  });

type RepairProfileInput = {
  accessToken: string;
  targetUserId: string;
  status: "active" | "invited";
};

type ExistingProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: "active" | "invited" | "suspended";
};

type LatestInvite = {
  id: string;
  role: "owner" | "admin" | "estimator" | "viewer";
} | null;

export const repairUserProfileFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as RepairProfileInput)
  .handler(async ({ data }): Promise<{ ok: true; message: string }> => {
    const admin = getAdminClient();
    const caller = await requireOwner(admin, data.accessToken);
    const targetId = data.targetUserId?.trim();
    if (!targetId) throw new Error("No user specified.");

    const { data: target, error: targetErr } = await admin.auth.admin.getUserById(targetId);
    if (targetErr || !target?.user) throw new Error("Auth user not found.");

    const now = new Date().toISOString();
    const email = target.user.email ?? null;
    const fullName =
      typeof target.user.user_metadata?.full_name === "string"
        ? target.user.user_metadata.full_name
        : (email?.split("@")[0] ?? null);

    const { data: latestInvite, error: inviteErr } = email
      ? await admin
          .from("user_invitations")
          .select("id, role")
          .ilike("email", email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    if (inviteErr) throw new Error(`Could not read latest invite: ${inviteErr.message}`);

    const { data: existingProfile, error: existingErr } = await admin
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("id", targetId)
      .maybeSingle();
    if (existingErr) throw new Error(`Could not read profile: ${existingErr.message}`);
    const existing = existingProfile as ExistingProfile | null;

    if (existing?.status === "suspended") {
      throw new Error("This account is suspended. Enable the user instead of repairing setup.");
    }

    const profilePayload = {
      email,
      full_name: existing?.full_name ?? fullName,
      status: data.status,
      accepted_at: data.status === "active" ? now : null,
      last_login_at: data.status === "active" ? now : null,
      updated_at: now,
    };
    const { error } = existing
      ? await admin.from("profiles").update(profilePayload).eq("id", targetId)
      : await admin.from("profiles").insert({
          id: targetId,
          ...profilePayload,
        });
    if (error) throw new Error(`Could not repair profile: ${error.message}`);

    const invite = latestInvite as LatestInvite;
    if (data.status === "active" && invite?.role) {
      const { error: clearRoleErr } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", targetId)
        .neq("role", "owner");
      if (clearRoleErr) throw new Error(`Could not clear stale roles: ${clearRoleErr.message}`);

      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert(
          { user_id: targetId, role: invite.role },
          { onConflict: "user_id,role", ignoreDuplicates: false },
        );
      if (roleErr) throw new Error(`Could not assign invited role: ${roleErr.message}`);

      await admin
        .from("user_invitations")
        .update({ status: "accepted", accepted_at: now, updated_at: now })
        .eq("id", invite.id);
    }

    await admin.from("audit_logs").insert({
      action: "profile_repaired",
      table_name: "profiles",
      record_id: targetId,
      actor_user_id: caller.id,
      metadata: { email, status: data.status, role: invite?.role ?? null },
    });

    return { ok: true, message: `Profile repaired for ${email ?? targetId}.` };
  });
