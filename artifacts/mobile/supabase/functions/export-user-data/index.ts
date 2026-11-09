// export-user-data — Supabase Edge Function (Deno)
// Collects the authenticated user's data from the DB and emails it via Resend.
//
// Secrets required (set in Supabase Dashboard → Settings → Edge Functions):
//   SUPABASE_SERVICE_ROLE_KEY — service-role key for admin DB access
//   RESEND_API_KEY            — Resend API key for sending the email
//
// Request:
//   POST /functions/v1/export-user-data
//   Authorization: Bearer <supabase_jwt>
//   Content-Type: application/json
//   Body: { types?: string[] }   e.g. ["profile","posts","messages","activity","transactions"]
//
// Response: { ok: true, email: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TYPE_LABELS: Record<string, string> = {
  profile:      "Profile Data",
  messages:     "Messages",
  posts:        "Posts & Moments",
  activity:     "Activity History",
  transactions: "Transactions",
};

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";

    if (!serviceRoleKey) return json({ error: "Service not configured" }, 503);
    if (!resendKey)       return json({ error: "Email service not configured" }, 503);

    // ── 1. Verify caller JWT ────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ error: "Authorization header required" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return json({ error: "Invalid or expired session" }, 401);

    const userId    = user.id;
    const userEmail = user.email;
    if (!userEmail) return json({ error: "No email address on this account" }, 400);

    // ── 2. Validate requested types ─────────────────────────────────────────
    let body: { types?: string[] } = {};
    try { body = await req.json(); } catch { /* no body = fine */ }

    const validTypes = new Set(["profile", "messages", "posts", "activity", "transactions"]);
    const selectedTypes: string[] = (Array.isArray(body.types) ? body.types : ["profile"])
      .filter((t: string) => validTypes.has(t));
    if (selectedTypes.length === 0) selectedTypes.push("profile");

    // ── 3. Fetch all requested data in parallel ─────────────────────────────
    const dataPackage: Record<string, unknown> = {};

    await Promise.all(selectedTypes.map(async (type) => {
      try {
        switch (type) {
          case "profile": {
            const { data } = await admin
              .from("profiles")
              .select("id, display_name, handle, bio, avatar_url, country, website_url, xp, acoin, current_grade, is_verified, is_organization_verified, created_at, last_seen")
              .eq("id", userId)
              .single();
            dataPackage.profile = data ?? {};
            break;
          }

          case "posts": {
            const { data } = await admin
              .from("posts")
              .select("id, content, post_type, visibility, article_title, image_url, view_count, created_at, post_images(image_url, display_order)")
              .eq("author_id", userId)
              .order("created_at", { ascending: false })
              .limit(500);
            dataPackage.posts = data ?? [];
            break;
          }

          case "messages": {
            const { data } = await admin
              .from("messages")
              .select("id, chat_id, encrypted_content, created_at, message_type")
              .eq("sender_id", userId)
              .order("created_at", { ascending: false })
              .limit(1000);
            dataPackage.messages = (data ?? []).map((m: Record<string, unknown>) => ({
              id:       m.id,
              chat_id:  m.chat_id,
              content:  m.encrypted_content,
              type:     m.message_type,
              sent_at:  m.created_at,
            }));
            break;
          }

          case "activity": {
            const { data: follows } = await admin
              .from("follows")
              .select("following_id, created_at")
              .eq("follower_id", userId)
              .order("created_at", { ascending: false })
              .limit(200);
            dataPackage.activity = {
              follows: follows ?? [],
            };
            break;
          }

          case "transactions": {
            const [coinRes, xpRes] = await Promise.all([
              admin
                .from("acoin_transactions")
                .select("id, amount, type, note, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(500),
              admin
                .from("xp_transfers")
                .select("id, amount, reason, created_at")
                .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                .order("created_at", { ascending: false })
                .limit(200),
            ]);
            dataPackage.transactions = {
              acoin: coinRes.data ?? [],
              xp:    xpRes.data ?? [],
            };
            break;
          }
        }
      } catch {
        dataPackage[type] = { error: "Could not fetch this data" };
      }
    }));

    // ── 4. Build JSON attachment ─────────────────────────────────────────────
    const now = new Date();
    const exportPayload = {
      exported_at:    now.toISOString(),
      user_id:        userId,
      email:          userEmail,
      included_types: selectedTypes,
      data:           dataPackage,
    };

    const jsonStr       = JSON.stringify(exportPayload, null, 2);
    const base64Content = toBase64(jsonStr);
    const dateStr       = now.toISOString().split("T")[0];
    const filename      = `afuchat-data-export-${dateStr}.json`;

    // ── 5. Send email via Resend ─────────────────────────────────────────────
    const typeList = selectedTypes.map((t) => TYPE_LABELS[t] || t).join(", ");
    const humanDate = now.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

    const emailBody = {
      from:        "AfuChat <onboarding@resend.dev>",
      to:          [userEmail],
      subject:     "Your AfuChat data export is ready",
      attachments: [{ filename, content: base64Content }],
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a}
  .wrapper{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:#00BCD4;padding:24px 32px;display:flex;align-items:center;gap:12px}
  .header h1{color:#fff;font-size:20px;font-weight:700}
  .logo{width:36px;height:36px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px}
  .body{padding:32px}
  .title{font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:12px}
  .text{font-size:15px;color:#444;line-height:1.6;margin-bottom:16px}
  .card{background:#f8f8f8;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #00BCD4}
  .card .label{font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:6px}
  .card .value{font-size:15px;color:#1a1a1a;font-weight:500}
  .note{background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:14px 16px;font-size:13px;color:#614700;line-height:1.5;margin:16px 0}
  .divider{height:1px;background:#eee;margin:24px 0}
  .meta{font-size:13px;color:#888;line-height:1.6}
  .footer{background:#f5f5f5;padding:20px 32px;font-size:12px;color:#888;text-align:center;border-top:1px solid #eee}
  .footer a{color:#00BCD4;text-decoration:none}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo">💬</div>
    <h1>AfuChat</h1>
  </div>
  <div class="body">
    <p class="title">Your data export is attached 📦</p>
    <p class="text">Hi there, your AfuChat data export has been prepared and is attached to this email as a JSON file.</p>
    <div class="card">
      <div class="label">Included data</div>
      <div class="value">${escHtml(typeList)}</div>
      <div class="label" style="margin-top:12px">File name</div>
      <div class="value">${escHtml(filename)}</div>
      <div class="label" style="margin-top:12px">Exported at</div>
      <div class="value">${escHtml(humanDate)}</div>
    </div>
    <div class="note">
      <strong>How to open:</strong> The attached <code>.json</code> file can be opened in any text editor, browser, or JSON viewer. It contains all the data you selected in a structured, readable format.
    </div>
    <p class="text">If you didn't request this export, please contact our support team immediately.</p>
    <div class="divider"></div>
    <p class="meta">This export was requested from your AfuChat account.<br/>Questions? Contact <a href="mailto:support@afuchat.com" style="color:#00BCD4">support@afuchat.com</a></p>
  </div>
  <div class="footer">
    <p>This email was sent from <a href="mailto:support@afuchat.com">support@afuchat.com</a></p>
    <p style="margin-top:6px">AfuChat · Making connections meaningful</p>
  </div>
</div>
</body>
</html>`,
    };

    const emailRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(emailBody),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      console.error("[export-user-data] Resend error:", emailRes.status, errText);
      return json({ error: "Failed to send export email. Please try again later." }, 502);
    }

    console.log("[export-user-data] Export emailed to", userEmail, "types:", selectedTypes);
    return json({ ok: true, email: userEmail });

  } catch (err) {
    console.error("[export-user-data] Unexpected error:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});
