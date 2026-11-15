// Legacy endpoint retained so older clients receive a clear response.
// New app versions use free peer-to-peer STUN and do not request relay credentials.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  return json({
    error: "Paid call relays are disabled. Update AfuChat to use direct peer-to-peer calls.",
  }, 410);
});
