// Legacy endpoint intentionally disabled.
// AfuSearch image search now uses traditional computer vision in
// ../visual-image-search/index.ts and must never call an AI vision provider.

Deno.serve((req: Request) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers });
  return new Response(JSON.stringify({
    error: "This legacy AI image endpoint is disabled. Use AfuSearch visual search.",
  }), { status: 410, headers });
});
