/* ============================================================
   mailer.js — transactional email

   Resend is used when RESEND_API_KEY is set. Without it, mail is
   logged to the server console instead of failing: that keeps
   local development working, and if the key is ever missing in
   production the reset link is still recoverable from the logs
   rather than the request erroring out on the user.
   ============================================================ */

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "Piptest <noreply@send.piptest.com>";
/* Replies to automated mail should reach a human. Without this they bounce
   off a no-reply address and the person assumes nobody is listening. */
const REPLY_TO = process.env.MAIL_REPLY_TO || "";
export const MAIL_ENABLED = !!KEY;

export async function sendMail({ to, subject, html, text }) {
  if (!KEY) {
    console.log("─".repeat(60));
    console.log(`MAIL NOT CONFIGURED — would have sent to ${to}`);
    console.log(`Subject: ${subject}`);
    if (REPLY_TO) console.log(`Reply-To: ${REPLY_TO}`);
    console.log(text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    console.log("─".repeat(60));
    return { ok: false, reason: "not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [to], subject, html, text,
        ...(REPLY_TO ? { reply_to: [REPLY_TO] } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("resend error", res.status, body.slice(0, 300));
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("resend threw:", e.message);
    return { ok: false, reason: "network" };
  }
}

/* ---------- templates ----------
   Inline styles and a table-free layout, because email clients
   strip stylesheets and Outlook renders flexbox unpredictably.
   Every message also carries a plain-text alternative. */

const shell = (title, body) => `
<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f9;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="font-size:22px;font-weight:700;letter-spacing:-.02em;margin-bottom:24px;">
      <span style="color:#0E1D4B;">pip</span><span style="color:#1370FD;">test</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e3e7ed;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 14px;font-size:19px;color:#0d1117;letter-spacing:-.02em;">${title}</h1>
      ${body}
    </div>
    <p style="margin:22px 0 0;font-size:12px;color:#8792a2;line-height:1.6;">
      Piptest is a practice tool. Simulated results are not a prediction of live performance.
    </p>
  </div>
</body></html>`;

export function resetEmail({ name, url, minutes }) {
  const html = shell("Reset your password", `
    <p style="margin:0 0 18px;font-size:14px;color:#404a58;line-height:1.65;">
      Hi ${escapeHtml(name)} — someone asked to reset the password on your Piptest account.
      Use the button below and you'll be back in shortly.
    </p>
    <a href="${url}" style="display:inline-block;background:#2563EB;color:#ffffff;
       text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">
      Choose a new password
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#5c6672;line-height:1.65;">
      This link works once and expires in ${minutes} minutes.
    </p>
    <p style="margin:14px 0 0;font-size:13px;color:#5c6672;line-height:1.65;">
      If this wasn't you, ignore this email — nothing has changed and your password still works.
    </p>
    <p style="margin:20px 0 0;font-size:11.5px;color:#98a2b3;word-break:break-all;line-height:1.6;">
      If the button doesn't work, paste this into your browser:<br />${url}
    </p>`);

  const text = `Hi ${name},

Someone asked to reset the password on your Piptest account.

Open this link to choose a new one:
${url}

The link works once and expires in ${minutes} minutes.

If this wasn't you, ignore this email — nothing has changed.`;

  return { subject: "Reset your Piptest password", html, text };
}

export function passwordChangedEmail({ name }) {
  const html = shell("Your password was changed", `
    <p style="margin:0 0 16px;font-size:14px;color:#404a58;line-height:1.65;">
      Hi ${escapeHtml(name)} — the password on your Piptest account has just been changed,
      and every device has been signed out.
    </p>
    <p style="margin:0;font-size:13px;color:#5c6672;line-height:1.65;">
      If that wasn't you, reset your password immediately and let us know.
    </p>`);
  const text = `Hi ${name},

The password on your Piptest account was just changed and every device has been signed out.

If that wasn't you, reset your password immediately.`;
  return { subject: "Your Piptest password was changed", html, text };
}

const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
