import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TYPE_LABELS: Record<string, string> = {
  profile: "Profile Data",
  messages: "Messages",
  posts: "Posts & Moments",
  activity: "Activity History",
  transactions: "Transactions",
};

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. Verify caller JWT ─────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const userEmail = user.email;

    if (!userEmail) {
      return new Response(JSON.stringify({ error: "No email address on this account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Validate requested types ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const validTypes = new Set(["profile", "messages", "posts", "activity", "transactions"]);
    const rawTypes: string[] = Array.isArray(body.types) ? body.types : ["profile"];
    const selectedTypes = rawTypes.filter((t) => validTypes.has(t));
    if (selectedTypes.length === 0) selectedTypes.push("profile");

    // ── 3. Fetch all requested data in parallel ──────────────────────────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const dataPackage: Record<string, unknown> = {};

    await Promise.all(
      selectedTypes.map(async (type) => {
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
                id: m.id,
                chat_id: m.chat_id,
                content: m.encrypted_content,
                type: m.message_type,
                sent_at: m.created_at,
              }));
              break;
            }
            case "activity": {
              const [notifRes, followRes] = await Promise.all([
                admin
                  .from("notifications")
                  .select("id, type, data, is_read, created_at")
                  .eq("user_id", userId)
                  .order("created_at", { ascending: false })
                  .limit(200),
                admin
                  .from("follows")
                  .select("following_id, created_at")
                  .eq("follower_id", userId)
                  .order("created_at", { ascending: false })
                  .limit(200),
              ]);
              dataPackage.activity = {
                notifications: notifRes.data ?? [],
                follows: followRes.data ?? [],
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
                xp: xpRes.data ?? [],
              };
              break;
            }
          }
        } catch (err) {
          console.error(`[data-export] Failed to fetch type="${type}":`, err);
          dataPackage[type] = { error: "Could not fetch this data" };
        }
      }),
    );

    // ── 4. Build JSON attachment ─────────────────────────────────────────────
    const exportPayload = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      email: userEmail,
      included_types: selectedTypes,
      data: dataPackage,
    };

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `afuchat-data-export-${dateStr}.json`;
    const typeList = selectedTypes.map((t) => TYPE_LABELS[t] ?? t).join(", ");

    // ── 5. Send email via Resend ─────────────────────────────────────────────
    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a}
  .wrapper{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#00BCD4 0%,#00ACC1 100%);padding:24px 32px;display:flex;align-items:center;gap:12px}
  .header h1{color:#fff;font-size:20px;font-weight:700}
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
  <div class="header"><h1>AfuChat</h1></div>
  <div class="body">
    <p class="title">Your data export is attached</p>
    <p class="text">Hi there, your AfuChat data export has been prepared and is attached to this email as a JSON file.</p>
    <div class="card">
      <div class="label">Included data</div>
      <div class="value">${escHtml(typeList)}</div>
      <div class="label" style="margin-top:12px">File name</div>
      <div class="value">${escHtml(filename)}</div>
      <div class="label" style="margin-top:12px">Exported at</div>
      <div class="value">${escHtml(new Date().toUTCString())}</div>
    </div>
    <div class="note">
      <strong>How to open:</strong> The attached <code>.json</code> file can be opened in any text editor, browser, or JSON viewer.
    </div>
    <p class="text">If you didn't request this export, please contact our support team immediately.</p>
    <div class="divider"></div>
    <p class="meta">Questions? Contact <a href="mailto:support@afuchat.com" style="color:#00BCD4">support@afuchat.com</a></p>
  </div>
  <div class="footer">
    <p>AfuChat &middot; Making connections meaningful</p>
  </div>
</div>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AfuChat <noreply@afuchat.com>",
        to: [userEmail],
        subject: "Your AfuChat data export is ready",
        html: emailHtml,
        attachments: [{ filename, content: base64Content }],
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json().catch(() => ({}));
      console.error("[data-export] Resend error:", errData);
      return new Response(
        JSON.stringify({ error: "Failed to send export email. Please try again later." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[data-export] Exported for user=${userId}, types=${selectedTypes.join(",")}`);

    return new Response(
      JSON.stringify({ ok: true, email: userEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[data-export] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
