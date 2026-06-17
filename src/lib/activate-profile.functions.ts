import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

    const now = new Date().toISOString();
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        status: "active",
        accepted_at: now,
        last_login_at: now,
        updated_at: now,
      })
      .eq("id", user.id);
    if (profileErr) throw new Error(`Account activation failed: ${profileErr.message}`);

    await admin.from("audit_logs").insert({
      action: "profile_activated",
      table_name: "profiles",
      record_id: user.id,
      actor_user_id: user.id,
      metadata: { email: user.email ?? null },
    });

    return { ok: true };
  });
