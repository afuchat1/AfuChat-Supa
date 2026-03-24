import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac, timingSafeEqual } from "https://deno.land/std@0.168.0/node/crypto.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const HOOK_SECRET = Deno.env.get("HOOK_SECRET") ?? "";

interface EmailHookPayload {
  user: {
    email: string;
    id: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
    subject?: string;
    hashed_token?: string;
  };
}

function verifyWebhookSignature(payload: string, signature: string | null): boolean {
  if (!HOOK_SECRET) return true;
  if (!signature) return false;
  const hmac = createHmac("sha256", HOOK_SECRET);
  hmac.update(payload);
  const expected = hmac.digest("base64");
  const expectedBuf = new TextEncoder().encode(expected);
  const signatureBuf = new TextEncoder().encode(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

function buildEmailHtml(actionType: string, token: string, email: string): { subject: string; html: string } {
  switch (actionType) {
    case "recovery":
      return {
        subject: "Reset Your AfuChat Password",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#00C2CB 0%,#00A5AD 100%);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.3px;">AfuChat</h1>
</td></tr>
<tr><td style="padding:32px 28px;">
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Reset Your Password</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Use the verification code below to reset your password in the AfuChat app.</p>
<div style="background:#f8f9fa;border:2px dashed #00C2CB;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
<span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a;font-family:'Courier New',monospace;">${token}</span>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
</td></tr>
<tr><td style="padding:20px 28px 24px;border-top:1px solid #f0f0f0;text-align:center;">
<p style="color:#bbb;font-size:12px;margin:0;">This email was sent by AfuChat. Please do not reply.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
      };

    case "signup":
    case "confirmation":
      return {
        subject: "Welcome to AfuChat — Confirm Your Email",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#00C2CB 0%,#00A5AD 100%);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.3px;">AfuChat</h1>
</td></tr>
<tr><td style="padding:32px 28px;">
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Confirm Your Email</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Your verification code is:</p>
<div style="background:#f8f9fa;border:2px dashed #00C2CB;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
<span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a;font-family:'Courier New',monospace;">${token}</span>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour.</p>
</td></tr>
<tr><td style="padding:20px 28px 24px;border-top:1px solid #f0f0f0;text-align:center;">
<p style="color:#bbb;font-size:12px;margin:0;">This email was sent by AfuChat. Please do not reply.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
      };

    case "magic_link":
      return {
        subject: "Your AfuChat Login Code",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#00C2CB 0%,#00A5AD 100%);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.3px;">AfuChat</h1>
</td></tr>
<tr><td style="padding:32px 28px;">
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Your Login Code</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Enter this code to sign in:</p>
<div style="background:#f8f9fa;border:2px dashed #00C2CB;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
<span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a;font-family:'Courier New',monospace;">${token}</span>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
</td></tr>
<tr><td style="padding:20px 28px 24px;border-top:1px solid #f0f0f0;text-align:center;">
<p style="color:#bbb;font-size:12px;margin:0;">This email was sent by AfuChat. Please do not reply.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
      };

    case "email_change":
      return {
        subject: "Confirm Your Email Change — AfuChat",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#00C2CB 0%,#00A5AD 100%);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.3px;">AfuChat</h1>
</td></tr>
<tr><td style="padding:32px 28px;">
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Confirm Email Change</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Use this code to confirm your new email address:</p>
<div style="background:#f8f9fa;border:2px dashed #00C2CB;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
<span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a;font-family:'Courier New',monospace;">${token}</span>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request this change, please secure your account.</p>
</td></tr>
<tr><td style="padding:20px 28px 24px;border-top:1px solid #f0f0f0;text-align:center;">
<p style="color:#bbb;font-size:12px;margin:0;">This email was sent by AfuChat. Please do not reply.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
      };

    default:
      return {
        subject: "AfuChat Verification Code",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#00C2CB 0%,#00A5AD 100%);padding:32px 24px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.3px;">AfuChat</h1>
</td></tr>
<tr><td style="padding:32px 28px;">
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 12px;font-weight:600;">Verification Code</h2>
<p style="color:#666;font-size:15px;line-height:1.5;margin:0 0 24px;">Your code is:</p>
<div style="background:#f8f9fa;border:2px dashed #00C2CB;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
<span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#1a1a1a;font-family:'Courier New',monospace;">${token}</span>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This code expires in 1 hour.</p>
</td></tr>
<tr><td style="padding:20px 28px 24px;border-top:1px solid #f0f0f0;text-align:center;">
<p style="color:#bbb;font-size:12px;margin:0;">This email was sent by AfuChat. Please do not reply.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
      };
  }
}

serve(async (req) => {
  try {
    const rawBody = await req.text();

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signature = req.headers.get("x-supabase-webhook-signature");
    if (!verifyWebhookSignature(rawBody, signature)) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: EmailHookPayload = JSON.parse(rawBody);
    const { user, email_data } = payload;

    if (!user?.email || !email_data?.token) {
      console.error("Missing required fields:", { hasEmail: !!user?.email, hasToken: !!email_data?.token });
      return new Response(JSON.stringify({ error: "Missing email or token" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendResult);
      return new Response(JSON.stringify({ error: "Failed to send email", details: resendResult }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Email sent via Resend: type=${actionType}, to=${user.email}, id=${resendResult.id}`);

    return new Response(JSON.stringify({ success: true, id: resendResult.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-password-reset error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
