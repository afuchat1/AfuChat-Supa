import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateWithOpenAI(apiKey: string, prompt: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.data || []).map((img: any) => img.url).filter(Boolean);
}

async function generateWithRunware(apiKey: string, prompt: string): Promise<string[]> {
  const res = await fetch("https://api.runware.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      positivePrompt: prompt,
      model: "runware:100@1",
      numberResults: 1,
      outputFormat: "WEBP",
      width: 1024,
      height: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Runware error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.data || []).map((img: any) => img.imageURL).filter(Boolean);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const RUNWARE_API_KEY = Deno.env.get("RUNWARE_API_KEY");

    if (!OPENAI_API_KEY && !RUNWARE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No image generation API key configured. Add OPENAI_API_KEY or RUNWARE_API_KEY to Supabase edge function secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseAuth = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    const { data: subscription } = await supabaseAuth
      .from("user_subscriptions")
      .select("is_active, expires_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!subscription) {
      return new Response(
        JSON.stringify({ error: "Premium subscription required", requiresPremium: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let imageUrls: string[] = [];

    if (OPENAI_API_KEY) {
      imageUrls = await generateWithOpenAI(OPENAI_API_KEY, prompt);
    } else if (RUNWARE_API_KEY) {
      imageUrls = await generateWithRunware(RUNWARE_API_KEY, prompt);
    }

    if (imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ reply: "I was unable to generate an image. Please try a different prompt.", images: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAuth.rpc("award_xp", {
      p_user_id: userId,
      p_action_type: "use_ai",
      p_xp_amount: 10,
      p_metadata: { action: "generate_ai_image" },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ reply: "Here is your generated image!", images: imageUrls }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-ai-image:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
