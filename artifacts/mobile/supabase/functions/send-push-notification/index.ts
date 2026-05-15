import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function channelId(type?: string): string {
  switch (type) {
    case "message":  return "messages";
    case "call":     return "calls";
    case "follow":
    case "like":
    case "reply":
    case "mention":  return "social";
    case "order":
    case "escrow":
    case "payment":  return "marketplace";
    default:         return "default";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const { userId, title, body, data = {}, categoryIdentifier } = await req.json();

    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "userId, title, and body are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .eq("id", userId)
      .single();

    if (profileErr || !profile?.expo_push_token) {
      return new Response(
        JSON.stringify({ error: "No push token found for user" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const type = data?.type as string | undefined;

    const payload: Record<string, unknown> = {
      to: profile.expo_push_token,
      title,
      body,
      data: { recipientUserId: userId, ...data },
      badge: 1,
      sound: "default",
      priority: type === "call" ? "high" : "normal",
      channelId: channelId(type),
      ttl: type === "call" ? 30 : 604800,
      expiration: Math.floor(Date.now() / 1000) + (type === "call" ? 30 : 604800),
    };

    if (categoryIdentifier)               payload.categoryIdentifier = categoryIdentifier;
    if (type === "message" && data.chatId) {
      payload.collapseId  = `chat_${data.chatId}`;
      payload["thread-id"] = data.chatId;
    }
    if (type === "call") {
      payload.collapseId = `call_${data.callId ?? userId}`;
    }

    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(payload),
    });

    const json = await expoRes.json();

    if (json?.data?.status === "error") {
      console.error("[send-push] Expo error:", json.data.message, json.data.details);
      return new Response(
        JSON.stringify({ error: json.data.message }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-push] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
