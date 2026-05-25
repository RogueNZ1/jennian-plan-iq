/**
 * Invite server function — sends Supabase auth invite emails and tracks status.
 *
 * Server-only: uses SUPABASE_SERVICE_KEY (service role) to bypass RLS.
 * Called from /users to send or resend invitations.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  // Support both naming conventions found in .env
  const url =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase admin credentials: need SUPABASE_URL + SUPABASE_SERVICE_KEY (or _ROLE_KEY).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type SendInviteInput = {
  /** ID of the row already inserted in user_invitations */
  invitationId: string;
  email: string;
  role: string;
  branch: string | null;
  firstName: string | null;
  lastName: string | null;
  welcomeMessage: string | null;
};

type SendInviteResult = {
  ok: boolean;
  /** Supabase auth user id if created or found */
  userId: string | null;
  /** Human-readable message for toast */
  message: string;
};

export const sendInvitationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as SendInviteInput)
  .handler(async ({ data }): Promise<SendInviteResult> => {
    const admin = getAdminClient();

    const appUrl =
      process.env.SITE_URL ??
      process.env.VITE_SITE_URL ??
      "https://jennian-iq.pages.dev";

    // ── 1. Send Supabase auth invite email ────────────────────────────────────
    const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(
      data.email,
      {
        data: {
          role: data.role,
          branch: data.branch,
          first_name: data.firstName,
          last_name: data.lastName,
          full_name: [data.firstName, data.lastName].filter(Boolean).join(" ") || null,
        },
        redirectTo: `${appUrl}/auth/set-password`,
      },
    );

    let userId: string | null = authData?.user?.id ?? null;

    if (authError) {
      // "User already registered" means they've fully signed up — no invite needed
      const alreadyActive =
        authError.message?.toLowerCase().includes("already been registered") ||
        authError.message?.toLowerCase().includes("already registered") ||
        authError.message?.toLowerCase().includes("user already exists");

      if (!alreadyActive) {
        throw new Error(`Supabase invite failed: ${authError.message}`);
      }

      // Find the existing user so we can still update the invitation row
      const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const found = listData?.users?.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
      userId = found?.id ?? null;
    }

    // ── 2. Update invitation row to status = 'invited' ─────────────────────────
    const { error: updateError } = await admin
      .from("user_invitations")
      .update({
        status: "invited",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.invitationId);

    if (updateError) {
      // Non-fatal — log but don't fail the whole operation
      console.warn(`[invite] Could not update invitation status: ${updateError.message}`);
    }

    return {
      ok: true,
      userId,
      message: authError
        ? `${data.email} already has an account — invitation recorded.`
        : `Invitation email sent to ${data.email}.`,
    };
  });
