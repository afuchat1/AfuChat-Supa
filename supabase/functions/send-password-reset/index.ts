/**
 * Supabase auth "Send Email" hook for AfuChat.
 *
 * Wired in the Supabase auth config as `hook_send_email_uri`. Supabase
 * calls this on every user-facing email event (signup confirmation,
 * password recovery, magic link, email change, reauthentication, invite)
 * with the OTP/token already generated. We render an HTML email and
 * hand it off to Resend.
 *
 * History: this used to import from `https://deno.land/std@0.168.0/...`
 * which the current Supabase Edge Runtime can no longer load, so the
 * function returned BOOT_ERROR and registrations failed with
 * "Service currently unavailable due to hook". The rewrite below uses
 * only `Deno.serve` and the Web Crypto API — no third-party imports —
 * so it boots reliably.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const HOOK_SECRET = Deno.env.get("HOOK_SECRET") ?? "";

interface EmailHookPayload {
  user: {
    email: string;
    id?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
    subject?: string;
    hashed_token?: string;
  };
}

/**
 * Verify the Supabase webhook signature.
 *
 * Supabase sends two header families depending on age of the project:
 * - Modern: `webhook-id`, `webhook-timestamp`, `webhook-signature`
 *   where `webhook-signature` is `v1,<base64(hmac_sha256(id.timestamp.body))>`
 *   using the secret as raw bytes (the `v1,whsec_…` prefix is stripped from
 *   the secret on the dashboard before storing).
 * - Legacy: `x-supabase-webhook-signature` set to the raw base64 HMAC of
 *   the body alone.
 *
 * We accept either, and we no-op when no secret is configured (useful for
 * local testing).
 */
async function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
): Promise<boolean> {
  if (!HOOK_SECRET) return true;

  const enc = new TextEncoder();
  // Supabase Studio exposes the secret as `v1,whsec_<base64>`. Strip the
  // prefix if it's there and base64-decode; otherwise treat as raw text.
  let keyBytes: Uint8Array;
  const cleaned = HOOK_SECRET.replace(/^v1,/, "").replace(/^whsec_/, "");
  try {
    const bin = atob(cleaned);
    keyBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) keyBytes[i] = bin.charCodeAt(i);
  } catch {
    keyBytes = enc.encode(HOOK_SECRET);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  // Modern Standard Webhooks header set.
  const wId = headers.get("webhook-id");
  const wTs = headers.get("webhook-timestamp");
  const wSig = headers.get("webhook-signature");
  if (wId && wTs && wSig) {
    const signedPayload = `${wId}.${wTs}.${rawBody}`;
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      enc.encode(signedPayload),
    );
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    // wSig may contain multiple space-separated `v1,<sig>` entries.
    for (const part of wSig.split(" ")) {
      const [, sig] = part.split(",", 2);
      if (sig && sig === expected) return true;
    }
    return false;
  }

  // Legacy header.
  const legacy = headers.get("x-supabase-webhook-signature");
  if (legacy) {
    const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    return legacy === expected;
  }

  // No signature at all → reject when a secret is configured.
  return false;
}

const FOOTER_HTML = `
<tr><td style="padding:28px 28px 20px;border-top:1px solid #eee;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="text-align:center;padding-bottom:16px;">
<a href="https://afuchat.com" style="color:#00BCD4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Website</a>
<span style="color:#ddd;">|</span>
<a href="https://afuchat.com/help" style="color:#00BCD4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Help Center</a>
<span style="color:#ddd;">|</span>
<a href="https://afuchat.com/privacy" style="color:#00BCD4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Privacy</a>
<span style="color:#ddd;">|</span>
<a href="https://afuchat.com/terms" style="color:#00BCD4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Terms</a>
</td></tr>
<tr><td style="text-align:center;padding-bottom:6px;">
<p style="color:#999;font-size:12px;margin:0;line-height:1.6;">Need help? Contact us at <a href="mailto:support@afuchat.com" style="color:#00BCD4;text-decoration:none;">support@afuchat.com</a></p>
</td></tr>
<tr><td style="text-align:center;padding-bottom:4px;">
<p style="color:#bbb;font-size:11px;margin:0;line-height:1.6;">
<strong>AfuChat Technologies Ltd</strong><br>
Kitooro, Entebbe, Uganda<br>
<a href="https://afuchat.com" style="color:#aaa;text-decoration:none;">www.afuchat.com</a>
</p>
</td></tr>
<tr><td style="text-align:center;">
<p style="color:#ccc;font-size:10px;margin:0;line-height:1.5;padding-top:8px;">
You're receiving this email because you have an account with AfuChat.<br>
&copy; ${new Date().getFullYear()} AfuChat Technologies Ltd. All rights reserved.
</p>
</td></tr>
</table>
</td></tr>`;

function wrapEmail(
  subject: string,
  bodyContent: string,
): { subject: string; html: string } {
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#00BCD4 0%,#00ACC1 100%);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.3px;">AfuChat</h1>
</td></tr>
<tr><td style="padding:32px 28px;">
${bodyContent}
</td></tr>
${FOOTER_HTML}
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

function buildCodeBlock(token: string): string {
  return `<div style="background:#f8f9fa;border:2px dashed #00BCD4;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
<span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a;font-family:'Courier New',monospace;">${token}</span>
</div>`;
}

function buildEmailHtml(
  actionType: string,
  token: string,
  email: string,
): { subject: string; html: string } {
  switch (actionType) {
    case "recovery":
      return wrapEmail(
        "Reset Your AfuChat Password",
        `<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Reset Your Password</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Use the verification code below to reset your password in the AfuChat app.</p>
${buildCodeBlock(token)}
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>`,
      );

    case "signup":
    case "confirmation":
      return wrapEmail(
        "Welcome to AfuChat \u2014 Confirm Your Email",
        `<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Welcome to AfuChat!</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 8px;">Thank you for signing up. Please confirm your email address by entering this code in the app:</p>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0 0 20px;">Your registered email: <strong style="color:#1a1a1a;">${email}</strong></p>
${buildCodeBlock(token)}
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't create an AfuChat account, please ignore this email.</p>`,
      );

    case "magic_link":
      return wrapEmail(
        "Your AfuChat Login Code",
        `<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Your Login Code</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Enter this code in the AfuChat app to sign in:</p>
${buildCodeBlock(token)}
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request this, you can safely ignore it.</p>`,
      );

    case "email_change":
      return wrapEmail(
        "Confirm Your Email Change \u2014 AfuChat",
        `<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Confirm Email Change</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Use this code to confirm your new email address:</p>
${buildCodeBlock(token)}
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request this change, please secure your account immediately.</p>`,
      );

    case "reauthentication":
      return wrapEmail(
        "Confirm Your Identity \u2014 AfuChat",
        `<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Confirm Reauthentication</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Enter this code to confirm your identity:</p>
${buildCodeBlock(token)}
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request this, please secure your account.</p>`,
      );

    case "invite":
      return wrapEmail(
        "You've Been Invited to AfuChat",
        `<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">You're Invited!</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Someone has invited you to join AfuChat. Use this code to get started:</p>
${buildCodeBlock(token)}
<p style="color:#999;font-size:13px;line-height:1.5;margin:0 0 20px;">This code expires in 1 hour.</p>
<p style="color:#666;font-size:14px;line-height:1.5;margin:0;">Download AfuChat and connect with everyone!</p>`,
      );

    default:
      return wrapEmail(
        "AfuChat Verification Code",
        `<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Verification Code</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Your code is:</p>
${buildCodeBlock(token)}
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour.</p>`,
      );
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: JSON_HEADERS },
      );
    }

    const ok = await verifyWebhookSignature(rawBody, req.headers);
    if (!ok) {
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }

    let payload: EmailHookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const { user, email_data } = payload;
    if (!user?.email || !email_data?.token) {
      console.error("Missing required fields:", {
        hasEmail: !!user?.email,
        hasToken: !!email_data?.token,
      });
      return new Response(
        JSON.stringify({ error: "Missing email or token" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const actionType = email_data.email_action_type || "recovery";
    const { subject, html } = buildEmailHtml(actionType, email_data.token, user.email);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AfuChat <noreply@afuchat.com>",
        to: [user.email],
        subject,
        html,
      }),
    });

    const resendResult = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendResult);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendResult }),
        { status: 500, headers: JSON_HEADERS },
      );
    }

    console.log(
      `Email sent via Resend: type=${actionType}, to=${user.email}, id=${(resendResult as { id?: string })?.id}`,
    );

    return new Response(
      JSON.stringify({ success: true, id: (resendResult as { id?: string })?.id }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    console.error("send-password-reset error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
