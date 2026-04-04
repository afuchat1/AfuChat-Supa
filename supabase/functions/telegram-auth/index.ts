import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifyTelegramInitData(initData: string, botToken: string): Promise<boolean> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;

  params.delete("hash");

  const sorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const secretKey = await crypto.subtle.sign("HMAC", keyMaterial, encoder.encode(botToken));

  const dataKey = await crypto.subtle.importKey(
    "raw",
    secretKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", dataKey, encoder.encode(sorted));

  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex === hash;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { initData } = await req.json();

    if (!initData || typeof initData !== "string") {
      return new Response(JSON.stringify({ error: "initData is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyTelegramInitData(initData, botToken);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid Telegram signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams(initData);
    const userRaw = params.get("user");
    if (!userRaw) {
      return new Response(JSON.stringify({ error: "No user data in initData" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tgUser = JSON.parse(userRaw);
    const telegramId = String(tgUser.id);
    const email = `tg_${telegramId}@afuchat.tg`;
    const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Telegram User";
    const password = `tg_${telegramId}_${botToken.slice(0, 8)}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: existingUser, error: listError } = await supabase.auth.admin.listUsers();
    const found = existingUser?.users?.find(
      (u: any) => u.user_metadata?.telegram_id === telegramId
    );

    let userId: string;

    if (found) {
      userId = found.id;
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          telegram_username: tgUser.username ?? null,
          full_name: displayName,
          avatar_url: tgUser.photo_url ?? null,
          provider: "telegram",
        },
      });

      if (createError || !created?.user) {
        return new Response(JSON.stringify({ error: createError?.message ?? "Failed to create user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = created.user.id;

      await supabase.from("profiles").upsert({
        id: userId,
        display_name: displayName,
        handle: tgUser.username ? tgUser.username.toLowerCase().replace(/[^a-z0-9_]/g, "") : `tg${telegramId}`,
        avatar_url: tgUser.photo_url ?? null,
        language: tgUser.language_code ?? "en",
        onboarding_completed: false,
      }, { onConflict: "id" });
    }

    const { data: signInData, error: signInError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: undefined },
    });

    if (signInError || !signInData) {
      const { data: signIn2, error: signIn2Err } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      return new Response(JSON.stringify({ error: "Could not generate session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError || !sessionData?.session) {
      return new Response(JSON.stringify({ error: sessionError?.message ?? "Failed to create session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user: sessionData.session.user,
        telegram_user: tgUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
