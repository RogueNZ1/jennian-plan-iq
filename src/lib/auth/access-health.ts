import type { AppRole } from "@/hooks/use-roles";

export type AccessProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: "invited" | "active" | "suspended";
  accepted_at: string | null;
  last_login_at: string | null;
};

export type AccessAuthUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
};

export type AccessRole = { user_id: string; role: AppRole };

export type AccessInvite = {
  email: string;
  status: string;
  created_at: string;
};

export type AccessHealth =
  | "ok"
  | "pending_setup"
  | "missing_profile"
  | "suspended"
  | "orphan_profile";

export type AccessHealthRow = {
  userId: string;
  email: string;
  name: string;
  role: AppRole | null;
  profileStatus: AccessProfile["status"] | "missing";
  inviteStatus: string | null;
  authCreatedAt: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  lastLoginAt: string | null;
  health: AccessHealth;
  issues: string[];
};

const ROLE_ORDER: AppRole[] = ["owner", "admin", "estimator", "viewer"];

function strongestRole(rows: AccessRole[], userId: string): AppRole | null {
  const roles = rows.filter((r) => r.user_id === userId).map((r) => r.role);
  return roles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))[0] ?? null;
}

function latestInvite(invites: AccessInvite[], email: string): AccessInvite | null {
  const lower = email.toLowerCase();
  return (
    invites
      .filter((i) => i.email.toLowerCase() === lower)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

export function buildAccessHealthRows(input: {
  authUsers: AccessAuthUser[];
  profiles: AccessProfile[];
  roles: AccessRole[];
  invites: AccessInvite[];
}): AccessHealthRow[] {
  const profilesById = new Map(input.profiles.map((p) => [p.id, p]));
  const authById = new Map(input.authUsers.map((u) => [u.id, u]));
  const rows: AccessHealthRow[] = [];

  for (const auth of input.authUsers) {
    const profile = profilesById.get(auth.id) ?? null;
    const email = auth.email ?? profile?.email ?? "";
    const invite = email ? latestInvite(input.invites, email) : null;
    const issues: string[] = [];
    let health: AccessHealth = "ok";

    if (!profile) {
      health = "missing_profile";
      issues.push("Auth user has no profile row.");
    } else if (profile.status === "invited") {
      health = "pending_setup";
      issues.push("Password setup is not complete.");
    } else if (profile.status === "suspended") {
      health = "suspended";
      issues.push("User is suspended.");
    }

    if (profile?.status === "active" && auth.last_sign_in_at && !profile.last_login_at) {
      issues.push("Auth sign-in exists but profile last_login_at is empty.");
    }

    rows.push({
      userId: auth.id,
      email,
      name: profile?.full_name ?? email,
      role: strongestRole(input.roles, auth.id),
      profileStatus: profile?.status ?? "missing",
      inviteStatus: invite?.status ?? null,
      authCreatedAt: auth.created_at,
      invitedAt: auth.invited_at ?? invite?.created_at ?? null,
      acceptedAt: profile?.accepted_at ?? null,
      emailConfirmedAt: auth.email_confirmed_at,
      lastSignInAt: auth.last_sign_in_at,
      lastLoginAt: profile?.last_login_at ?? null,
      health,
      issues,
    });
  }

  for (const profile of input.profiles) {
    if (authById.has(profile.id)) continue;
    const issues = ["Profile row has no matching auth user."];
    rows.push({
      userId: profile.id,
      email: profile.email ?? "",
      name: profile.full_name ?? profile.email ?? profile.id,
      role: strongestRole(input.roles, profile.id),
      profileStatus: profile.status,
      inviteStatus: profile.email
        ? (latestInvite(input.invites, profile.email)?.status ?? null)
        : null,
      authCreatedAt: null,
      invitedAt: null,
      acceptedAt: profile.accepted_at,
      emailConfirmedAt: null,
      lastSignInAt: null,
      lastLoginAt: profile.last_login_at,
      health: "orphan_profile",
      issues,
    });
  }

  return rows.sort((a, b) => {
    const rank: Record<AccessHealth, number> = {
      missing_profile: 0,
      orphan_profile: 1,
      pending_setup: 2,
      suspended: 3,
      ok: 4,
    };
    return rank[a.health] - rank[b.health] || a.email.localeCompare(b.email);
  });
}
