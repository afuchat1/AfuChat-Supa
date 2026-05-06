const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function checkSupabase(supabaseUrl: string, serviceKey: string): Promise<{ ok: boolean; latency_ms: number }> {
  const start = Date.now();
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: resp.ok, latency_ms: Date.now() - start };
  } catch {
    return { ok: false, latency_ms: Date.now() - start };
  }
}

async function checkR2(supabaseUrl: string, serviceKey: string): Promise<{ ok: boolean; configured: boolean }> {
  try {
    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
    const aki = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID") || "";
    if (accountId && aki) return { ok: true, configured: true };

    const resp = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=key,value&key=in.(CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_R2_ACCESS_KEY_ID)`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { ok: false, configured: false };
    const rows: { key: string; value: string }[] = await resp.json();
    const configured = rows.some((r) => r.key === "CLOUDFLARE_R2_ACCESS_KEY_ID" && r.value);
    return { ok: configured, configured };
  } catch {
    return { ok: false, configured: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const [supabaseStatus, r2Status] = await Promise.all([
    checkSupabase(supabaseUrl, serviceKey),
    checkR2(supabaseUrl, serviceKey),
  ]);

  const allOk = supabaseStatus.ok && r2Status.ok;

  return json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    services: {
      supabase: { ok: supabaseStatus.ok, latency_ms: supabaseStatus.latency_ms },
      r2: { ok: r2Status.ok, configured: r2Status.configured },
      edge_functions: { ok: true },
    },
  }, allOk ? 200 : 503);
});
