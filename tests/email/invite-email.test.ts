// @vitest-environment node
/**
 * Invite email + authorization gate — offline unit tests.
 *
 * Locks the three things Haydon asked for (11 Jun 2026):
 *  1. branded, structured email using the site's imagery,
 *  2. owner-only inviting (gate logic),
 *  3. links pointing at www.jennianiq.nz.
 */
import { describe, it, expect } from "vitest";
import { renderInviteEmail, escapeHtml } from "../../src/lib/email/invite-email";
import {
  evaluateInviteAuthorization,
  parseAllowlist,
  DEFAULT_INVITE_ALLOWLIST,
} from "../../src/lib/invite-gate";

const BASE = {
  recipientEmail: "tessa@jennian.co.nz",
  firstName: "Tessa",
  roleLabel: "Estimator",
  branch: "Manawatū",
  welcomeMessage: null,
  inviterName: "Haydon Christian",
  actionUrl: "https://www.jennianiq.nz/auth/set-password?token_hash=abc123&type=invite",
  assetBaseUrl: "https://www.jennianiq.nz",
  year: 2026,
};

describe("renderInviteEmail", () => {
  it("subject names the inviter and the product", () => {
    const { subject } = renderInviteEmail(BASE);
    expect(subject).toBe("Haydon Christian has invited you to Jennian IQ");
  });

  it("CTA links to www.jennianiq.nz (html + text), never supabase.co", () => {
    const { html, text } = renderInviteEmail(BASE);
    expect(html).toContain(
      "https://www.jennianiq.nz/auth/set-password?token_hash=abc123&amp;type=invite",
    );
    expect(text).toContain(
      "https://www.jennianiq.nz/auth/set-password?token_hash=abc123&type=invite",
    );
    expect(html).not.toContain("supabase.co");
    expect(text).not.toContain("supabase.co");
  });

  it("uses the site's imagery (houseframe art) served from the site itself", () => {
    const { html } = renderInviteEmail(BASE);
    expect(html).toContain("https://www.jennianiq.nz/email/houseframe-dark.png");
  });

  it("carries the brand: Jennian red, dark header, wordmark, tagline", () => {
    const { html } = renderInviteEmail(BASE);
    expect(html).toContain("#D40C1A"); // primary red
    expect(html).toContain("#16181D"); // app sidebar dark
    expect(html).toContain("Jennian");
    expect(html).toContain("Jennian Homes Manawat&#363;"); // wordmark sub-line (CSS-uppercased)
    expect(html).toContain("Plans");
    expect(html).toContain("Procurement");
  });

  it("shows role, branch, inviter and recipient email", () => {
    const { html, text } = renderInviteEmail(BASE);
    for (const out of [html, text]) {
      expect(out).toContain("Estimator");
      expect(out).toContain("Manawat\u016b");
      expect(out).toContain("Haydon Christian");
      expect(out).toContain("tessa@jennian.co.nz");
    }
  });

  it("greets by first name when present, gracefully without", () => {
    expect(renderInviteEmail(BASE).html).toContain("Tessa");
    const anon = renderInviteEmail({ ...BASE, firstName: null });
    expect(anon.html).toContain("You&#39;re invited");
  });

  it("renders the personal note when provided, escaped, with line breaks", () => {
    const { html } = renderInviteEmail({
      ...BASE,
      welcomeMessage: "Welcome aboard <Tessa>!\nSee you Monday.",
    });
    expect(html).toContain("A note from Haydon Christian");
    expect(html).toContain("Welcome aboard &lt;Tessa&gt;!");
    expect(html).toContain("<br/>See you Monday.");
    expect(html).not.toContain("<Tessa>");
  });

  it("omits the note block entirely when no message", () => {
    const { html } = renderInviteEmail({ ...BASE, welcomeMessage: "  " });
    expect(html).not.toContain("A note from");
  });

  it("escapes hostile input in every user-controlled field", () => {
    const { html } = renderInviteEmail({
      ...BASE,
      firstName: `<script>alert(1)</script>`,
      roleLabel: `"><img src=x>`,
      branch: `'; DROP TABLE--`,
      recipientEmail: `a&b@x.nz`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a&amp;b@x.nz");
  });

  it("states the expiry window", () => {
    expect(renderInviteEmail(BASE).html).toContain("24 hours");
    expect(renderInviteEmail({ ...BASE, expiresHours: 48 }).text).toContain("48 hours");
  });

  it("escapeHtml covers the five metacharacters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("invite authorization gate (owner-only)", () => {
  const HAYDON = "haydon.christian@jennian.co.nz";

  it("allows Haydon when he holds the owner role", () => {
    expect(evaluateInviteAuthorization({ callerEmail: HAYDON, callerRoles: ["owner"] })).toEqual({
      allowed: true,
    });
  });

  it("blocks an admin — role alone is not enough", () => {
    const r = evaluateInviteAuthorization({
      callerEmail: "someone@jennian.co.nz",
      callerRoles: ["admin"],
    });
    expect(r.allowed).toBe(false);
  });

  it("blocks an owner-role holder who is NOT on the allowlist (self-promotion defense)", () => {
    const r = evaluateInviteAuthorization({
      callerEmail: "rogue@jennian.co.nz",
      callerRoles: ["owner"],
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toContain("not authorised");
  });

  it("blocks Haydon's email WITHOUT the owner role (stolen-identity defense)", () => {
    const r = evaluateInviteAuthorization({ callerEmail: HAYDON, callerRoles: ["admin"] });
    expect(r.allowed).toBe(false);
  });

  it("is case- and whitespace-insensitive on email", () => {
    expect(
      evaluateInviteAuthorization({
        callerEmail: "  Haydon.Christian@Jennian.co.nz ",
        callerRoles: ["owner", "estimator"],
      }).allowed,
    ).toBe(true);
  });

  it("INVITE_ALLOWLIST env extends the list without a code change", () => {
    const r = evaluateInviteAuthorization({
      callerEmail: "blair@jennian.co.nz",
      callerRoles: ["owner"],
      allowlistEnv: "haydon.christian@jennian.co.nz, blair@jennian.co.nz",
    });
    expect(r.allowed).toBe(true);
  });

  it("default allowlist is exactly Haydon", () => {
    expect(DEFAULT_INVITE_ALLOWLIST).toEqual(["haydon.christian@jennian.co.nz"]);
    expect(parseAllowlist(undefined)).toEqual(["haydon.christian@jennian.co.nz"]);
    expect(parseAllowlist("")).toEqual(["haydon.christian@jennian.co.nz"]);
  });

  it("rejects a session with no email", () => {
    expect(evaluateInviteAuthorization({ callerEmail: null, callerRoles: ["owner"] }).allowed).toBe(
      false,
    );
  });
});
