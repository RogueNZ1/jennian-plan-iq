// @vitest-environment node
/**
 * LIVE — invite policy ground truth (11 Jun 2026).
 *
 * The owner-only invite gate (src/lib/invite-gate.ts) assumes one fact about
 * the LIVE database: haydon.christian@jennian.co.nz holds the `owner` role and
 * nobody else does. This test verifies that against the real project and
 * reports the pending invitation queue, so the policy isn't trusted blind.
 *
 * PRIVACY: live-results is a public branch — emails other than Haydon's
 * (already public in the repo source) are masked to 3 chars of local part.
 */
import { describe, it, expect } from "vitest";
import { supabase } from "../../src/integrations/supabase/client";

const LIVE = process.env.LIVE_VALIDATE === "1" && !!process.env.SUPABASE_URL;
const HAYDON = "haydon.christian@jennian.co.nz";
const maskEmail = (e: string | null | undefined) => {
  if (!e) return "∅";
  if (e.toLowerCase() === HAYDON) return e;
  const [local, domain] = e.split("@");
  return `${(local ?? "").slice(0, 3)}…@${domain ?? "?"}`;
};

type AdminUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

async function listAuthUsers(): Promise<AdminUser[]> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`admin/users → HTTP ${res.status}`);
  const body = (await res.json()) as { users?: AdminUser[] } | AdminUser[];
  return Array.isArray(body) ? body : (body.users ?? []);
}

describe.skipIf(!LIVE)("LIVE invite policy ground truth", () => {
  it("haydon.christian@jennian.co.nz is the sole owner-role holder", async () => {
    const users = await listAuthUsers();
    const byId = new Map(users.map((u) => [u.id, u]));
    console.log(`[invites] auth users: ${users.length}`);

    const { data: roleRows, error } = await supabase.from("user_roles").select("user_id, role");
    expect(error).toBeNull();
    const owners = (roleRows ?? []).filter((r) => r.role === "owner");
    const ownerEmails = owners.map((o) => byId.get(o.user_id)?.email?.toLowerCase() ?? `?${o.user_id.slice(0, 8)}`);
    console.log(`[invites] owner-role holders (${owners.length}):`, ownerEmails.map(maskEmail).join(", ") || "(none)");

    const tally = (roleRows ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.role] = (acc[r.role] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[invites] role tally:`, JSON.stringify(tally));

    // The gate's ground truth — fail loudly if it ever drifts.
    expect(ownerEmails).toEqual([HAYDON]);
  });

  it("pending invitation queue (report)", async () => {
    const { data, error } = await supabase
      .from("user_invitations")
      .select("email, role, branch, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(25);
    expect(error).toBeNull();
    const rows = data ?? [];
    console.log(`[invites] invitation rows (latest ${rows.length}):`);
    for (const r of rows) {
      console.log(
        `[invites]   ${maskEmail(r.email)} role=${r.role} branch=${r.branch ?? "—"} status=${r.status} updated=${String(r.updated_at).slice(0, 10)}`,
      );
    }
  });
});
