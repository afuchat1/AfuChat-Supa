import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPECTED_AUTHORIZATION = Deno.env.get("REVENUECAT_WEBHOOK_AUTHORIZATION") ?? "";

const ACOIN_PRODUCTS = new Set([
  "acoin_100",
  "acoin_500",
  "acoin_2000",
  "acoin_5000",
  "acoin_20000",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function constantTimeEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!EXPECTED_AUTHORIZATION || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Purchase fulfillment is not configured." }, 503);
  }
  if (!constantTimeEquals(request.headers.get("authorization") ?? "", EXPECTED_AUTHORIZATION)) {
    return json({ error: "Unauthorized." }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid webhook payload." }, 400);
  }

  const event = payload.event && typeof payload.event === "object"
    ? payload.event as Record<string, unknown>
    : payload;
  const eventType = String(event.type ?? "").toLowerCase();
  if (eventType !== "non_renewing_purchase") {
    return json({ received: true, ignored: true });
  }

  const environment = String(event.environment ?? "").toUpperCase();
  const store = String(event.store ?? "").toUpperCase();
  const productId = String(event.product_id ?? "").toLowerCase();
  const transactionId = String(event.transaction_id ?? "").trim();
  const appUserId = String(event.app_user_id ?? "");
  if (environment !== "PRODUCTION" || !["APP_STORE", "PLAY_STORE"].includes(store)) {
    return json({ received: true, ignored: true });
  }
  if (!ACOIN_PRODUCTS.has(productId)) return json({ received: true, ignored: true });
  if (!UUID_PATTERN.test(appUserId) || !transactionId) {
    return json({ error: "Purchase identity is incomplete." }, 400);
  }

  const purchasedAtMs = Number(event.purchased_at_ms);
  const purchasedAt = Number.isFinite(purchasedAtMs) && purchasedAtMs > 0
    ? new Date(purchasedAtMs).toISOString()
    : null;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.rpc("fulfill_revenuecat_acoin_purchase", {
    p_store: store,
    p_transaction_id: transactionId,
    p_user_id: appUserId,
    p_product_id: productId,
    p_environment: environment,
    p_purchased_at: purchasedAt,
  });
  if (error || !data?.ok) {
    console.error("[revenuecat-webhook] fulfillment failed:", error?.message ?? data?.error ?? "unknown error");
    return json({ error: "Purchase fulfillment failed." }, 500);
  }

  return json({ received: true, already_processed: Boolean(data.already_processed) });
});
