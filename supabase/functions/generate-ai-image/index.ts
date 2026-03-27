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

async function generateWithGemini(apiKey: string, prompt: string): Promise<{ text: string; base64Images: string[] }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini image error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.find((p: any) => p.text)?.text || "";
  const base64Images = parts
    .filter((p: any) => p.inlineData?.mimeType?.startsWith("image/"))
    .map((p: any) => `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`);
  return { text, base64Images };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");

    if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No AI API key configured. Add OPENAI_API_KEY or GEMINI_API_KEY to Supabase edge function secrets." }),
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

    const jwt = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    const userId = payload.sub;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "User ID not found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false },
    });

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

    let imageUrls: string[] = [];
    let replyText = "Here is your generated image!";

    if (OPENAI_API_KEY) {
      imageUrls = await generateWithOpenAI(OPENAI_API_KEY, prompt);
    } else {
      const result = await generateWithGemini(GEMINI_API_KEY!, prompt);
      replyText = result.text || replyText;
      const uploaded: string[] = [];
      for (let i = 0; i < result.base64Images.length; i++) {
        const dataUrl = result.base64Images[i];
        const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) { uploaded.push(dataUrl); continue; }
        const [, imageType, base64Data] = match;
        const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const fileName = `${userId}/${Date.now()}-${i}-afuai.${imageType}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("ai-generated-images")
          .upload(fileName, imageBuffer, { contentType: `image/${imageType}`, upsert: false });
        if (uploadError) {
          uploaded.push(dataUrl);
        } else {
          const { data: { publicUrl } } = supabaseAdmin.storage.from("ai-generated-images").getPublicUrl(fileName);
          uploaded.push(publicUrl);
        }
      }
      imageUrls = uploaded;
    }

    if (imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ reply: "I was unable to generate an image. Please try a different prompt.", images: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.rpc("award_xp", {
      p_user_id: userId,
      p_action_type: "use_ai",
      p_xp_amount: 10,
      p_metadata: { action: "generate_ai_image" },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ reply: replyText, images: imageUrls }),
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
