import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const jwt = authHeader.slice(7);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !user) {
      return json({ error: "Invalid token" }, 401);
    }

    const body = await req.json();
    const { contactId } = body;
    if (!contactId || typeof contactId !== "string") {
      return json({ error: "contactId is required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: chat, error: chatError } = await adminClient
      .from("chats")
      .insert({ is_group: false, created_by: user.id, user_id: user.id })
      .select()
      .single();

    if (chatError || !chat) {
      return json({ error: "Failed to create chat", detail: chatError?.message }, 500);
    }

    const { error: memberError } = await adminClient
      .from("chat_members")
      .insert([
        { chat_id: chat.id, user_id: user.id },
        { chat_id: chat.id, user_id: contactId },
      ]);

    if (memberError) {
      await adminClient.from("chats").delete().eq("id", chat.id);
      return json({ error: "Failed to add members", detail: memberError.message }, 500);
    }

    return json({ chatId: chat.id });
  } catch (err: any) {
    console.error("create-chat error:", err?.message || err);
    return json({ error: "Internal error", detail: err?.message }, 500);
  }
});
