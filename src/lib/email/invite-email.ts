/**
 * Jennian IQ invitation email — pure renderer.
 *
 * Mirrors the app's visual identity exactly (src/styles.css tokens → hex):
 *   primary red   oklch(0.55 0.22 27)  → #D40C1A
 *   sidebar dark  oklch(0.21 0.01 260) → #16181D
 *   sidebar fg    oklch(0.92 .005 260) → #E3E5E8
 *   foreground    oklch(0.18 0.01 260) → #0F1216
 *   muted fg      oklch(0.5  0.01 260) → #606369
 *
 * The hero artwork is the site's HouseFrame drafting elevation, rendered to
 * /email/houseframe-dark.png (committed under public/, served by the app
 * itself so the email's imagery is literally the imagery off the site).
 *
 * Table-based, fully inlined, MSO-conditional button — renders in Gmail,
 * Outlook (desktop + web), Apple Mail. No external CSS, no JS, no webfonts.
 *
 * SECURITY: every user-supplied field is HTML-escaped here. Never bypass
 * renderInviteEmail() to interpolate raw strings into the markup.
 */

export type InviteEmailParams = {
  recipientEmail: string;
  /** First name if known — greeting falls back gracefully. */
  firstName?: string | null;
  /** Human role label, e.g. "Estimator". */
  roleLabel: string;
  branch?: string | null;
  /** Optional personal note from the inviter (escaped, newlines preserved). */
  welcomeMessage?: string | null;
  inviterName?: string;
  /** Absolute activation URL (token link). */
  actionUrl: string;
  /** Base URL that hosts /email/houseframe-dark.png. No trailing slash. */
  assetBaseUrl?: string;
  expiresHours?: number;
  year?: number;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const RED = "#D40C1A";
const RED_BRIGHT = "#E62C2C";
const DARK = "#16181D";
const DARK_FG = "#E3E5E8";
const INK = "#0F1216";
const BODY_TEXT = "#3F444B";
const MUTED = "#606369";
const FAINT = "#9AA0A8";
const BORDER = "#E3E5E8";
const CARD_BG = "#FAFAFB";
const TINT_BG = "#F8EFEE";
const FONT = "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape + convert newlines to <br/> for the personal note. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

export function renderInviteEmail(p: InviteEmailParams): RenderedEmail {
  const inviter = escapeHtml(p.inviterName ?? "Haydon Christian");
  const first = p.firstName?.trim() ? escapeHtml(p.firstName.trim()) : null;
  const role = escapeHtml(p.roleLabel);
  const branch = p.branch?.trim() ? escapeHtml(p.branch.trim()) : null;
  const note = p.welcomeMessage?.trim() ? escapeMultiline(p.welcomeMessage.trim()) : null;
  const email = escapeHtml(p.recipientEmail);
  const url = escapeHtml(p.actionUrl);
  const assets = (p.assetBaseUrl ?? "https://www.jennianiq.nz").replace(/\/+$/, "");
  const art = escapeHtml(`${assets}/email/houseframe-dark.png`);
  const hours = p.expiresHours ?? 24;
  const year = p.year ?? new Date().getFullYear();

  const subject = `${p.inviterName ?? "Haydon Christian"} has invited you to Jennian IQ`;
  const preheader = `Your Jennian IQ account is ready — set your password to activate it. The link expires in ${hours} hours.`;
  const headline = first
    ? `${first}, you&#39;re invited to Jennian&nbsp;IQ.`
    : `You&#39;re invited to Jennian&nbsp;IQ.`;

  const detailRow = (label: string, value: string) => `
            <tr>
              <td style="padding:9px 18px 9px 18px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};width:120px;">${label}</td>
              <td style="padding:9px 18px 9px 0;border-top:1px solid ${BORDER};font-family:${FONT};font-size:13.5px;font-weight:500;color:${INK};">${value}</td>
            </tr>`;

  const detailsRows = [
    detailRow("Role", role),
    branch ? detailRow("Branch", branch) : "",
    detailRow("Invited by", inviter),
  ].join("");

  const noteBlock = note
    ? `
        <tr>
          <td style="padding:0 36px 26px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TINT_BG};border-left:3px solid ${RED};border-radius:0 8px 8px 0;">
              <tr>
                <td style="padding:14px 18px;font-family:${FONT};">
                  <div style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${RED};font-weight:600;padding-bottom:6px;">A note from ${inviter}</div>
                  <div style="font-size:13.5px;line-height:21px;color:${BODY_TEXT};">${note}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Jennian IQ — Invitation</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F2F3F5;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F3F5;">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">

          <!-- ── Dark brand header ─────────────────────────────────── -->
          <tr>
            <td style="background:${DARK};padding:26px 36px 18px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="width:40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td align="center" valign="middle" style="width:40px;height:40px;background:${RED};border-radius:8px;font-family:${FONT};font-size:18px;font-weight:700;color:#FFFFFF;">J</td>
                    </tr></table>
                  </td>
                  <td valign="middle" style="padding-left:13px;font-family:${FONT};">
                    <div style="font-size:17px;font-weight:600;letter-spacing:-0.2px;color:#FFFFFF;line-height:20px;">Jennian IQ</div>
                    <div style="font-size:10px;letter-spacing:2.2px;text-transform:uppercase;color:${RED_BRIGHT};font-weight:600;padding-top:3px;">Jennian Homes Manawat&#363;</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── HouseFrame drafting art (site imagery) ────────────── -->
          <tr>
            <td style="background:${DARK};line-height:0;">
              <img src="${art}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
            </td>
          </tr>

          <!-- ── Body ──────────────────────────────────────────────── -->
          <tr>
            <td style="padding:34px 36px 8px 36px;font-family:${FONT};">
              <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${RED};font-weight:600;">Account invitation</div>
              <div style="padding-top:10px;font-size:22px;font-weight:600;letter-spacing:-0.3px;color:${INK};line-height:29px;">${headline}</div>
              <div style="padding-top:12px;font-size:14px;line-height:22px;color:${BODY_TEXT};">
                ${inviter} has invited you to join <strong style="color:${INK};">Jennian&nbsp;IQ</strong> — the plan takeoff and quantity intelligence platform built by Jennian Homes Manawat&#363;. Your account is ready; set a password to activate it.
              </div>
            </td>
          </tr>

          <!-- ── Details card ──────────────────────────────────────── -->
          <tr>
            <td style="padding:22px 36px 24px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;">
                <tr><td colspan="2" style="padding:11px 18px 2px 18px;font-family:${FONT};font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${FAINT};">Your access</td></tr>
                ${detailsRows}
                <tr><td colspan="2" style="padding:4px;"></td></tr>
              </table>
            </td>
          </tr>
${noteBlock}
          <!-- ── CTA ───────────────────────────────────────────────── -->
          <tr>
            <td align="center" style="padding:2px 36px 10px 36px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:280px;" arcsize="17%" fillcolor="${RED}" stroke="f">
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">Activate your account</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${url}" target="_blank" style="display:inline-block;background:${RED};color:#FFFFFF;font-family:${FONT};font-size:14.5px;font-weight:600;line-height:20px;padding:13px 38px;border-radius:8px;text-decoration:none;">Activate your account</a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 36px 0 36px;font-family:${FONT};font-size:12.5px;color:${MUTED};">
              This link is unique to you and expires in ${hours}&nbsp;hours.
            </td>
          </tr>

          <!-- ── Fallback URL ──────────────────────────────────────── -->
          <tr>
            <td style="padding:22px 36px 30px 36px;font-family:${FONT};font-size:11.5px;line-height:17px;color:${FAINT};">
              Button not working? Copy this link into your browser:<br/>
              <a href="${url}" target="_blank" style="color:${RED};text-decoration:underline;word-break:break-all;">${url}</a>
            </td>
          </tr>

          <!-- ── Footer ────────────────────────────────────────────── -->
          <tr>
            <td style="background:${CARD_BG};border-top:1px solid ${BORDER};padding:22px 36px;font-family:${FONT};" align="center">
              <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${FAINT};">Plans &middot; Quantities &middot; Pricing &middot; Procurement</div>
              <div style="padding-top:10px;font-size:11.5px;color:${FAINT};">&copy; ${year} Jennian Homes Manawat&#363; &middot; Palmerston North, New Zealand</div>
              <div style="padding-top:8px;font-size:11.5px;line-height:17px;color:${FAINT};">
                You&#39;re receiving this because ${inviter} invited ${email} to Jennian&nbsp;IQ.<br/>Not expecting it? You can safely ignore this email.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    first ? `${first}, you're invited to Jennian IQ.` : `You're invited to Jennian IQ.`,
    ``,
    `${p.inviterName ?? "Haydon Christian"} has invited you to join Jennian IQ — the plan takeoff and quantity intelligence platform built by Jennian Homes Manawatū.`,
    ``,
    `Role: ${p.roleLabel}`,
    ...(p.branch?.trim() ? [`Branch: ${p.branch.trim()}`] : []),
    `Invited by: ${p.inviterName ?? "Haydon Christian"}`,
    ...(p.welcomeMessage?.trim()
      ? [``, `Note from ${p.inviterName ?? "Haydon Christian"}: ${p.welcomeMessage.trim()}`]
      : []),
    ``,
    `Activate your account (expires in ${hours} hours):`,
    p.actionUrl,
    ``,
    `© ${year} Jennian Homes Manawatū · Palmerston North, New Zealand`,
    `You're receiving this because ${p.inviterName ?? "Haydon Christian"} invited ${p.recipientEmail} to Jennian IQ. Not expecting it? You can safely ignore this email.`,
  ].join("\n");

  return { subject, html, text };
}
