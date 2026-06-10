/**
 * Invite authorization gate — pure logic, no I/O.
 *
 * Policy (Haydon's instruction, 11 Jun 2026): ONLY Haydon sends invitations.
 * Enforced server-side as BOTH conditions, so neither a UI bypass nor a
 * self-granted role gets past it:
 *   1. caller holds the `owner` role, AND
 *   2. caller's email is on the allowlist (default: haydon.christian@jennian.co.nz,
 *      overridable via the INVITE_ALLOWLIST env — comma-separated — without a code change).
 *
 * The UI gate (users.tsx) is convenience; THIS is the contract.
 */

export const DEFAULT_INVITE_ALLOWLIST = ["haydon.christian@jennian.co.nz"];

export type InviteGateResult = { allowed: true } | { allowed: false; reason: string };

export function parseAllowlist(env: string | null | undefined): string[] {
  const raw = env?.trim()
    ? env.split(",")
    : DEFAULT_INVITE_ALLOWLIST;
  return raw.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function evaluateInviteAuthorization(opts: {
  callerEmail: string | null | undefined;
  callerRoles: string[];
  allowlistEnv?: string | null;
}): InviteGateResult {
  const email = opts.callerEmail?.trim().toLowerCase() ?? "";
  if (!email) return { allowed: false, reason: "Your session has no email — sign in again." };

  const isOwner = opts.callerRoles.includes("owner");
  if (!isOwner) {
    return { allowed: false, reason: "Only the Owner can send Jennian IQ invitations." };
  }

  const allowlist = parseAllowlist(opts.allowlistEnv);
  if (!allowlist.includes(email)) {
    return {
      allowed: false,
      reason: `Invitations are restricted. ${email} is not authorised to invite users.`,
    };
  }

  return { allowed: true };
}
