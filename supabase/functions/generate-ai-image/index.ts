import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImageProvider {
  name: string;
  generate: (prompt: string) => Promise<string[]>;
}

function buildImageProviders(): ImageProvider[] {
  const providers: ImageProvider[] = [];

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const RUNWARE_API_KEY = Deno.env.get("RUNWARE_API_KEY");
  const AIMLAPI_KEY = Deno.env.get("AIMLAPI_KEY");
  const FREEPIK_API_KEY = Deno.env.get("FREEPIK_API_KEY");

  if (OPENAI_API_KEY) {
    providers.push({
      name: "DALL-E 3",
      generate: async (prompt) => {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", response_format: "url" }),
        });
        if (!res.ok) throw new Error(`DALL-E ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return (data.data || []).map((img: any) => img.url).filter(Boolean);
      },
    });
  }

  if (RUNWARE_API_KEY) {
    providers.push({
      name: "Runware",
      generate: async (prompt) => {
        const res = await fetch("https://api.runware.ai/v1/images/generations", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RUNWARE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ positivePrompt: prompt, model: "runware:100@1", numberResults: 1, outputFormat: "WEBP", width: 1024, height: 1024 }),
        });
        if (!res.ok) throw new Error(`Runware ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return (data.data || []).map((img: any) => img.imageURL).filter(Boolean);
      },
    });
  }

  if (AIMLAPI_KEY) {
    providers.push({
      name: "AIML Flux",
      generate: async (prompt) => {
        const res = await fetch("https://api.aimlapi.com/v1/images/generations", {
          method: "POST",
          headers: { "Authorization": `Bearer ${AIMLAPI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "flux/schnell", prompt, n: 1, image_size: { width: 1024, height: 1024 } }),
        });
        if (!res.ok) throw new Error(`AIML ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return (data.data || []).map((img: any) => img.url).filter(Boolean);
      },
    });
  }

  if (FREEPIK_API_KEY) {
    providers.push({
      name: "Freepik AI",
      generate: async (prompt) => {
        const res = await fetch("https://api.freepik.com/v1/ai/text-to-image", {
          method: "POST",
          headers: { "x-freepik-api-key": FREEPIK_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, num_images: 1, image: { size: "square" } }),
        });
        if (!res.ok) throw new Error(`Freepik ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return (data.data || []).map((img: any) => img.base64 ? `data:image/jpeg;base64,${img.base64}` : img.url).filter(Boolean);
      },
    });
  }

  return providers;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const imageProviders = buildImageProviders();

    if (imageProviders.length === 0) {
      return new Response(
        JSON.stringify({ error: "No image generation API keys configured. Add OPENAI_API_KEY, RUNWARE_API_KEY, AIMLAPI_KEY, or FREEPIK_API_KEY to Supabase edge function secrets." }),
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
    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    const { data: subscription } = await supabaseAdmin
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

    const errors: string[] = [];

    for (const provider of imageProviders) {
      try {
        console.log(`Trying image provider: ${provider.name}`);
        const imageUrls = await provider.generate(prompt);
        if (imageUrls.length > 0) {
          console.log(`Success with: ${provider.name}`);

          await supabaseAdmin.rpc("award_xp", {
            p_user_id: userId,
            p_action_type: "use_ai",
            p_xp_amount: 10,
            p_metadata: { action: "generate_ai_image", provider: provider.name },
          }).catch(() => {});

          return new Response(
            JSON.stringify({ reply: "Here is your generated image!", images: imageUrls, provider: provider.name }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`${provider.name} returned no images`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Image provider ${provider.name} failed: ${msg}`);
        errors.push(`${provider.name}: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({ reply: "I was unable to generate an image. Please try a different prompt.", images: [], errors }),
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
