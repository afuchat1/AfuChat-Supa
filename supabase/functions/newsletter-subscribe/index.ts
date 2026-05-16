import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function sendWelcomeEmail(email: string): Promise<void> {
  if (!RESEND_API_KEY) return;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#00BCD4 0%,#00ACC1 100%);padding:32px 24px;text-align:center;">
  <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">AfuChat</h1>
  <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">The all-in-one super app</p>
</td></tr>
<tr><td style="padding:36px 32px;">
  <h2 style="color:#1a1a1a;font-size:22px;margin:0 0 12px;font-weight:700;">You're on the list!</h2>
  <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 20px;">Thanks for subscribing to AfuChat updates. You'll be the first to hear about new features, improvements, and announcements.</p>
  <div style="background:#f0fffe;border:1px solid #d0f0f0;border-radius:12px;padding:20px;margin:0 0 28px;">
    <p style="color:#00838f;font-size:14px;margin:0;line-height:1.6;font-weight:500;">While you wait, why not try the app? AfuChat is available for Android and on the web — completely free.</p>
  </div>
  <div style="text-align:center;margin:0 0 24px;">
    <a href="https://play.google.com/store/apps/details?id=com.afuchat.app"
       style="display:inline-block;background:#00BCD4;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;margin:0 8px 8px 0;">
      Get on Android
    </a>
    <a href="https://afuchat.com"
       style="display:inline-block;background:#0A1A2E;color:#00BCD4;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;border:1px solid #00BCD4;">
      Open Web App
    </a>
  </div>
  <p style="color:#999;font-size:12px;line-height:1.6;margin:0;text-align:center;">
    You subscribed with this email address. To unsubscribe, reply with "unsubscribe" or email
    <a href="mailto:support@afuchat.com" style="color:#00BCD4;text-decoration:none;">support@afuchat.com</a>.
  </p>
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #eee;text-align:center;">
  <p style="color:#bbb;font-size:11px;margin:0;line-height:1.6;">
    <strong style="color:#999;">AfuChat Technologies Limited</strong><br>
    Entebbe, Uganda &middot; <a href="https://afuchat.com" style="color:#aaa;text-decoration:none;">afuchat.com</a><br>
    &copy; ${new Date().getFullYear()} AfuChat Technologies Limited. All rights reserved.
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AfuChat <noreply@afuchat.com>",
      to: [email],
      subject: "You're subscribed to AfuChat updates!",
      html,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email ?? "").toString().trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Please enter a valid email address." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { persistSession: false },
    });

    // Upsert — duplicate emails are silently ignored
    const { error: dbError } = await admin
      .from("newsletter_subscribers")
      .upsert(
        { email, subscribed_at: new Date().toISOString(), active: true },
        { onConflict: "email", ignoreDuplicates: true },
      );

    if (dbError) {
      console.error("DB error:", dbError);
      return new Response(JSON.stringify({ error: "Could not save subscription. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget welcome email
    sendWelcomeEmail(email).catch((e) => console.error("Welcome email failed:", e));

    return new Response(
      JSON.stringify({ success: true, message: "Subscribed! Check your inbox for a welcome email." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("newsletter-subscribe error:", err);
    return new Response(JSON.stringify({ error: "Unexpected error. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
