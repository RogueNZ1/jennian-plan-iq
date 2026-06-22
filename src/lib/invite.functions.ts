/**
 * Invite server function — Owner-only, branded email, www.jennianiq.nz links.
 *
 * Server-only: uses SUPABASE_SERVICE_KEY (service role) to bypass RLS.
 * Called from /users to send or resend invitations.
 *
 * Flow (v2, 11 Jun 2026):
 *  1. AUTHORISE — the caller's Supabase access token is verified server-side;
 *     the caller must hold the `owner` role AND be on the invite allowlist
 *     (src/lib/invite-gate.ts). Nobody else can send invites, regardless of UI.
 *  2. RECORD — the user_invitations row is created/updated HERE (service role),
 *     so the client never needs table write access for inviting.
 *  3. SEND — if RESEND_API_KEY is configured: generate the invite token via
 *     admin.generateLink and email the BRANDED template (invite-email.ts) from
 *     iq@jennian.co.nz via Resend. The activation link points straight at
 *     SITE_URL (www.jennianiq.nz) using the token_hash flow — no supabase.co
 *     URL in front of the user, no redirect-allowlist dependency.
 *     Fallback (no Resend key): Supabase's own invite mailer, default template.
 *  4. AUDIT — invite_sent / invite_resent rows written with the real actor.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { renderInviteEmail } from "@/lib/email/invite-email";
import { evaluateInviteAuthorization } from "@/lib/invite-gate";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  estimator: "Estimator",
  viewer: "Viewer",
};

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

/** Public site base — link target for all invite emails. */
function siteUrl(): string {
  return (env("SITE_URL", "VITE_SITE_URL") ?? "https://www.jennianiq.nz").replace(/\/+$/, "");
}

/** Verify the caller's token and enforce the owner-only invite policy. */
async function requireInviter(
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
  if (!verdict.allowed) throw new Error(verdict.reason);
  return caller;
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("INVITE_FROM") ?? "Jennian IQ <invites@jennianiq.nz>",
      to: [to],
      reply_to: env("INVITE_REPLY_TO") ?? "haydon.christian@jennian.co.nz",
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend rejected the email (${res.status}): ${body.slice(0, 200)}`);
  }
}

type SendInviteInput = {
  /** Caller's Supabase access token — REQUIRED for authorisation. */
  accessToken: string;
  /** Existing user_invitations row id (resend). Omit to create a new invite. */
  invitationId?: string;
  email: string;
  role: string;
  branch: string | null;
  firstName: string | null;
  lastName: string | null;
  welcomeMessage: string | null;
};

type SendInviteResult = {
  ok: boolean;
  userId: string | null;
  invitationId: string | null;
  message: string;
};

type InvitationRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  branch: string | null;
  welcome_message: string | null;
};

type ExistingProfileState = {
  id: string;
  status: "invited" | "active" | "suspended";
} | null;

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function readProfileState(
  admin: SupabaseClient,
  userId: string | null | undefined,
): Promise<ExistingProfileState> {
  if (!userId) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not read existing profile: ${error.message}`);
  return data as ExistingProfileState;
}

export const sendInvitationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as SendInviteInput)
  .handler(async ({ data }): Promise<SendInviteResult> => {
    const admin = getAdminClient();
    const caller = await requireInviter(admin, data.accessToken);

    const email = data.email.trim().toLowerCase();
    const isResend = Boolean(data.invitationId);

    // ── 1. Record the invitation (service role — client writes nothing) ──────
    let row: InvitationRow;
    if (isResend) {
      const { data: existing, error } = await admin
        .from("user_invitations")
        .select("id, email, first_name, last_name, role, branch, welcome_message")
        .eq("id", data.invitationId!)
        .maybeSingle();
      if (error || !existing) throw new Error("Invitation not found.");
      row = existing as InvitationRow;
    } else {
      const fields = {
        email,
        first_name: data.firstName,
        last_name: data.lastName,
        role: data.role,
        branch: data.branch,
        welcome_message: data.welcomeMessage,
        invited_by: caller.id,
        status: "pending",
        updated_at: new Date().toISOString(),
      };
      const { data: inserted, error: insErr } = await admin
        .from("user_invitations")
        .insert(fields)
        .select("id, email, first_name, last_name, role, branch, welcome_message")
        .single();
      if (insErr) {
        // Unique pending-per-email index → refresh the existing pending row instead.
        const { data: pending } = await admin
          .from("user_invitations")
          .select("id")
          .ilike("email", email)
          .eq("status", "pending")
          .maybeSingle();
        if (!pending) throw new Error(`Could not record invitation: ${insErr.message}`);
        const { data: updated, error: updErr } = await admin
          .from("user_invitations")
          .update(fields)
          .eq("id", (pending as { id: string }).id)
          .select("id, email, first_name, last_name, role, branch, welcome_message")
          .single();
        if (updErr || !updated) throw new Error(`Could not refresh invitation: ${updErr?.message}`);
        row = updated as InvitationRow;
      } else {
        row = inserted as InvitationRow;
      }
    }

    const metadata = {
      role: row.role,
      branch: row.branch,
      first_name: row.first_name,
      last_name: row.last_name,
      full_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
    };

    // ── 2. Send ───────────────────────────────────────────────────────────────
    let userId: string | null = null;
    let message: string;
    const branded = Boolean(process.env.RESEND_API_KEY);

    const alreadyActiveMsg = (e: string) =>
      e.toLowerCase().includes("already been registered") ||
      e.toLowerCase().includes("already registered") ||
      e.toLowerCase().includes("already exists") ||
      e.toLowerCase().includes("email_exists");

    if (branded) {
      // Branded path: mint the invite token, email our own template via Resend.
      let linkType: "invite" | "recovery" = "invite";
      let link = await admin.auth.admin.generateLink({
        type: "invite",
        email: row.email,
        options: { data: metadata },
      });

      if (link.error && alreadyActiveMsg(link.error.message ?? "")) {
        const found = await findAuthUserByEmail(admin, row.email);
        const profile = await readProfileState(admin, found?.id);
        if (found && profile?.status === "invited") {
          // The user consumed or stale-created an auth account but never completed
          // Jennian IQ activation. Send a recovery token to the same set-password
          // screen so they can choose a password and activate the invited profile.
          link = await admin.auth.admin.generateLink({
            type: "recovery",
            email: row.email,
            options: {
              redirectTo: `${siteUrl()}/auth/set-password`,
            },
          });
          linkType = "recovery";
        } else if (found && !found.email_confirmed_at && !found.last_sign_in_at) {
          // No app profile is waiting, and the auth user has never really been used:
          // recreate it cleanly so the normal invite path can produce a fresh token.
          await admin.auth.admin.deleteUser(found.id);
          link = await admin.auth.admin.generateLink({
            type: "invite",
            email: row.email,
            options: { data: metadata },
          });
        } else if (found) {
          await admin
            .from("user_invitations")
            .update({ status: "invited", updated_at: new Date().toISOString() })
            .eq("id", row.id);
          return {
            ok: true,
            userId: found.id,
            invitationId: row.id,
            message: `${row.email} already has an active account — no email sent.`,
          };
        }
      }
      if (link.error || !link.data?.properties?.hashed_token) {
        throw new Error(
          `Could not create invite link: ${link.error?.message ?? "no token returned"}`,
        );
      }

      userId = link.data.user?.id ?? null;
      const actionUrl = `${siteUrl()}/auth/set-password?token_hash=${encodeURIComponent(
        link.data.properties.hashed_token,
      )}&type=${linkType}`;

      const rendered = renderInviteEmail({
        recipientEmail: row.email,
        firstName: row.first_name,
        roleLabel: ROLE_LABELS[row.role] ?? row.role,
        branch: row.branch,
        welcomeMessage: row.welcome_message,
        inviterName: "Haydon Christian",
        actionUrl,
        assetBaseUrl: siteUrl(),
      });
      await sendViaResend(row.email, rendered.subject, rendered.html, rendered.text);
      message = isResend
        ? `Invitation re-sent to ${row.email}.`
        : `Invitation emailed to ${row.email}.`;
    } else {
      // Fallback path: Supabase's own mailer (default template).
      const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(
        row.email,
        {
          data: metadata,
          redirectTo: `${siteUrl()}/auth/set-password`,
        },
      );
      userId = authData?.user?.id ?? null;
      if (authError && !alreadyActiveMsg(authError.message ?? "")) {
        throw new Error(`Supabase invite failed: ${authError.message}`);
      }
      message = authError
        ? `${row.email} already has an account — invitation recorded.`
        : `Invitation sent to ${row.email} (default template — add RESEND_API_KEY for the branded email).`;
    }

    // ── 3. Mark invited + audit ───────────────────────────────────────────────
    const { error: updateError } = await admin
      .from("user_invitations")
      .update({ status: "invited", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError)
      console.warn(`[invite] Could not update invitation status: ${updateError.message}`);

    await admin.from("audit_logs").insert({
      action: isResend ? "invite_resent" : "invite_sent",
      table_name: "user_invitations",
      record_id: row.id,
      actor_user_id: caller.id,
      metadata: {
        email: row.email,
        role: row.role,
        via: branded ? "resend_branded" : "supabase_default",
      },
    });

    return { ok: true, userId, invitationId: row.id, message };
  });
