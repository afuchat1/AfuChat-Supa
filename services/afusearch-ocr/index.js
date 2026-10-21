export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    try {
      const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization },
      });
      if (!authResponse.ok) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length < 8 || bytes.length > 3145728) {
        return new Response(JSON.stringify({ error: "Image must be between 8 bytes and 3 MB" }), { status: 400, headers: cors });
      }

      const output = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
        image: Array.from(bytes),
        prompt: "Transcribe text visible in this image exactly as written. Preserve spelling, capitalization, numbers, punctuation, and line breaks. Do not describe the image, summarize it, infer missing words, or add commentary. If no readable text is visible, return an empty string.",
        max_tokens: 512,
        temperature: 0,
      });
      return new Response(JSON.stringify({
        text: String(output?.description || "").trim().slice(0, 5000),
        model: "@cf/llava-hf/llava-1.5-7b-hf",
      }), { headers: cors });
    } catch {
      return new Response(JSON.stringify({ error: "OCR inference failed" }), { status: 502, headers: cors });
    }
  },
};
