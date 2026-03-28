import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TemplateType =
  | "welcome"
  | "inactive_reminder"
  | "new_feature"
  | "weekly_digest"
  | "special_offer"
  | "custom";

const FOOTER_HTML = `
<tr><td style="padding:28px 28px 20px;border-top:1px solid #eee;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="text-align:center;padding-bottom:16px;">
<a href="https://afuchat.com" style="color:#4ECDC4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Website</a>
<span style="color:#ddd;">|</span>
<a href="https://afuchat.com/help" style="color:#4ECDC4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Help Center</a>
<span style="color:#ddd;">|</span>
<a href="https://afuchat.com/privacy" style="color:#4ECDC4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Privacy</a>
<span style="color:#ddd;">|</span>
<a href="https://afuchat.com/terms" style="color:#4ECDC4;text-decoration:none;font-size:13px;font-weight:600;margin:0 8px;">Terms</a>
</td></tr>
<tr><td style="text-align:center;padding-bottom:6px;">
<p style="color:#999;font-size:12px;margin:0;line-height:1.6;">Need help? Contact us at <a href="mailto:support@afuchat.com" style="color:#4ECDC4;text-decoration:none;">support@afuchat.com</a></p>
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
You're receiving this because you have an AfuChat account.<br>
To adjust email preferences, open AfuChat &gt; Settings &gt; Notifications.<br>
&copy; ${new Date().getFullYear()} AfuChat Technologies Ltd. All rights reserved.
</p>
</td></tr>
</table>
</td></tr>`;

function wrapEmail(bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#4ECDC4 0%,#40B5AE 100%);padding:32px 24px;text-align:center;">
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
</html>`;
}

function getTemplateContent(template: TemplateType, displayName: string, customData?: { subject?: string; heading?: string; body?: string; ctaText?: string; ctaUrl?: string }): { subject: string; html: string } {
  const name = displayName || "there";

  switch (template) {
    case "welcome":
      return {
        subject: "Welcome to AfuChat! Here's how to get started",
        html: wrapEmail(`
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;font-weight:600;">Welcome aboard, ${name}!</h2>
<p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">We're thrilled to have you on AfuChat. Here are a few things to get you started:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
<span style="color:#4ECDC4;font-size:18px;font-weight:700;margin-right:12px;">1</span>
<span style="color:#444;font-size:14px;">Complete your profile with a photo and bio</span>
</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
<span style="color:#4ECDC4;font-size:18px;font-weight:700;margin-right:12px;">2</span>
<span style="color:#444;font-size:14px;">Find and follow friends in Contacts</span>
</td></tr>
<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
<span style="color:#4ECDC4;font-size:18px;font-weight:700;margin-right:12px;">3</span>
<span style="color:#444;font-size:14px;">Share your first post on Discover</span>
</td></tr>
<tr><td style="padding:12px 0;">
<span style="color:#4ECDC4;font-size:18px;font-weight:700;margin-right:12px;">4</span>
<span style="color:#444;font-size:14px;">Try AfuAi \u2014 your personal AI assistant</span>
</td></tr>
</table>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">Have questions? We're always here to help at support@afuchat.com</p>`),
      };

    case "inactive_reminder":
      return {
        subject: `${name}, we miss you on AfuChat!`,
        html: wrapEmail(`
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;font-weight:600;">We miss you, ${name}!</h2>
<p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">It's been a while since you last visited AfuChat. Your friends and contacts are waiting to hear from you.</p>
<div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center;">
<p style="color:#444;font-size:15px;margin:0 0 8px;font-weight:600;">Here's what you might have missed:</p>
<p style="color:#666;font-size:14px;margin:0;line-height:1.6;">New messages, posts from your contacts, and updates from channels you follow.</p>
</div>
<div style="text-align:center;margin:0 0 24px;">
<a href="https://afuchat.com" style="display:inline-block;background:#4ECDC4;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">Open AfuChat</a>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">We'll keep your chats and data safe until you're ready to return.</p>`),
      };

    case "new_feature":
      return {
        subject: "Something new on AfuChat you'll love!",
        html: wrapEmail(`
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;font-weight:600;">What's New on AfuChat</h2>
<p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">Hey ${name}, we've been working on some exciting updates just for you:</p>
<div style="background:linear-gradient(135deg,#f0fffe 0%,#e8fffe 100%);border:1px solid #d0f0f0;border-radius:12px;padding:20px;margin:0 0 24px;">
<p style="color:#00897B;font-size:15px;margin:0;line-height:1.6;font-weight:500;">${customData?.body || "Check out the latest features and improvements we've made to enhance your experience."}</p>
</div>
<div style="text-align:center;margin:0 0 24px;">
<a href="https://afuchat.com" style="display:inline-block;background:#4ECDC4;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">See What's New</a>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">Update your app to get the latest version with all improvements.</p>`),
      };

    case "weekly_digest":
      return {
        subject: `${name}, your AfuChat weekly update`,
        html: wrapEmail(`
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;font-weight:600;">Your Weekly Digest</h2>
<p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">Hi ${name}, here's a summary of what happened this week on AfuChat:</p>
<div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:0 0 24px;">
<p style="color:#444;font-size:14px;margin:0;line-height:1.8;">${customData?.body || "Your contacts have been active. Open AfuChat to catch up on messages and posts."}</p>
</div>
<div style="text-align:center;margin:0 0 24px;">
<a href="https://afuchat.com" style="display:inline-block;background:#4ECDC4;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">Open AfuChat</a>
</div>`),
      };

    case "special_offer":
      return {
        subject: customData?.subject || "A special offer just for you, " + name,
        html: wrapEmail(`
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;font-weight:600;">${customData?.heading || "Special Offer"}</h2>
<p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">Hey ${name},</p>
<div style="background:linear-gradient(135deg,#FFF8E1 0%,#FFF3CD 100%);border:1px solid #FFE082;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center;">
<p style="color:#F57F17;font-size:16px;margin:0;line-height:1.6;font-weight:600;">${customData?.body || "Upgrade to Premium and unlock exclusive features at a special price."}</p>
</div>
<div style="text-align:center;margin:0 0 24px;">
<a href="${customData?.ctaUrl || "https://afuchat.com"}" style="display:inline-block;background:#D4A853;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">${customData?.ctaText || "Claim Your Offer"}</a>
</div>
<p style="color:#999;font-size:13px;line-height:1.5;margin:0;">This offer may be limited. Don't miss out!</p>`),
      };

    case "custom":
      return {
        subject: customData?.subject || "A message from AfuChat",
        html: wrapEmail(`
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;font-weight:600;">${customData?.heading || "Hello!"}</h2>
<p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">Hi ${name},</p>
<p style="color:#444;font-size:15px;line-height:1.7;margin:0 0 24px;">${customData?.body || ""}</p>
${customData?.ctaText && customData?.ctaUrl ? `<div style="text-align:center;margin:0 0 24px;">
<a href="${customData.ctaUrl}" style="display:inline-block;background:#4ECDC4;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">${customData.ctaText}</a>
</div>` : ""}`),
      };

    default:
      return {
        subject: "News from AfuChat",
        html: wrapEmail(`
<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px;font-weight:600;">Hello, ${name}!</h2>
<p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">We have some updates for you on AfuChat.</p>
<div style="text-align:center;margin:0 0 24px;">
<a href="https://afuchat.com" style="display:inline-block;background:#4ECDC4;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:600;">Open AfuChat</a>
</div>`),
      };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .single();

    if (!callerProfile?.is_admin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      template = "custom" as TemplateType,
      userIds,
      toAll = false,
      subject,
      heading,
      body: emailBody,
      ctaText,
      ctaUrl,
    } = body;

    const batchSize = 50;

    const customData = { subject, heading, body: emailBody, ctaText, ctaUrl };

    let recipients: { id: string; email: string; display_name: string | null }[] = [];

    async function fetchAllAuthUsers(): Promise<Map<string, string>> {
      const emailMap = new Map<string, string>();
      let page = 1;
      const perPage = 1000;
      while (true) {
        const { data: { users }, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        if (!users || users.length === 0) break;
        users.forEach((u: any) => {
          if (u.email) emailMap.set(u.id, u.email);
        });
        if (users.length < perPage) break;
        page++;
      }
      return emailMap;
    }

    if (toAll) {
      const { data: allUsers, error: fetchError } = await adminClient
        .from("profiles")
        .select("id, display_name")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      if (allUsers && allUsers.length > 0) {
        const emailMap = await fetchAllAuthUsers();

        recipients = allUsers
          .filter(p => emailMap.has(p.id))
          .map(p => ({
            id: p.id,
            email: emailMap.get(p.id)!,
            display_name: p.display_name,
          }));
      }
    } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      if (userIds.length > 500) {
        return new Response(JSON.stringify({ error: "Maximum 500 recipients per targeted campaign" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profiles, error: fetchError } = await adminClient
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      if (fetchError) throw fetchError;

      if (profiles && profiles.length > 0) {
        const emailMap = await fetchAllAuthUsers();

        recipients = profiles
          .filter(p => emailMap.has(p.id))
          .map(p => ({
            id: p.id,
            email: emailMap.get(p.id)!,
            display_name: p.display_name,
          }));
      }
    } else {
      return new Response(JSON.stringify({ error: "Provide userIds array or set toAll: true" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, total: 0, message: "No recipients found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const sends = batch.map(async (recipient) => {
        try {
          const { subject: emailSubject, html } = getTemplateContent(
            template as TemplateType,
            recipient.display_name || "",
            customData,
          );

          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "AfuChat <noreply@afuchat.com>",
              to: [recipient.email],
              subject: emailSubject,
              html,
            }),
          });

          if (response.ok) {
            sent++;
          } else {
            const errData = await response.json();
            console.error(`Failed to send to ${recipient.email}:`, errData);
            failed++;
          }
        } catch (err) {
          console.error(`Error sending to ${recipient.email}:`, err);
          failed++;
        }
      });

      await Promise.all(sends);

      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Marketing email campaign: template=${template}, sent=${sent}, failed=${failed}, total=${recipients.length}`);

    return new Response(
      JSON.stringify({ sent, failed, total: recipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-marketing-email error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
