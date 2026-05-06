const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Service unavailable" }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const identifier = String(body?.identifier || "").trim();
  if (!identifier) return json({ error: "identifier is required" }, 400);

  const digitsOnly = identifier.replace(/[\s\-().]/g, "");
  const isPhone = identifier.startsWith("+") || /^\d{7,15}$/.test(digitsOnly);

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/json",
  };

  let userId: string | null = null;

  if (isPhone) {
    const normalized = identifier.startsWith("+")
      ? identifier.replace(/[^\d+]/g, "")
      : `+${digitsOnly}`;
    const alt = normalized.replace(/^\+/, "");

    const resp = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id&or=(phone_number.eq.${encodeURIComponent(normalized)},phone_number.eq.${encodeURIComponent(alt)})&limit=1`,
      { headers },
    );
    if (resp.ok) {
      const rows = await resp.json();
      userId = rows?.[0]?.id ?? null;
    }
  } else {
    const handle = identifier.replace(/^@/, "").toLowerCase();
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id&handle=eq.${encodeURIComponent(handle)}&limit=1`,
      { headers },
    );
    if (resp.ok) {
      const rows = await resp.json();
      userId = rows?.[0]?.id ?? null;
    }
  }

  if (!userId) return json({ error: "No account found with that identifier" }, 404);

  const userResp = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${userId}`,
    { headers },
  );
  if (!userResp.ok) return json({ error: "No account found with that identifier" }, 404);
  const userData = await userResp.json();
  const email = userData?.email;
  if (!email) return json({ error: "No account found with that identifier" }, 404);

  return json({ email });
});
