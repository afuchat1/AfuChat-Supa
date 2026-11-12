import { createClient } from "npm:@supabase/supabase-js@2";
import { unwrapWebhook } from "npm:@whop/sdk@2.7.0/helpers";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WHOP_WEBHOOK_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
    return json({ error: "Webhook is not configured." }, 503);
  }

  const rawBody = await request.text();
  let event: any;
  try {
    event = unwrapWebhook(rawBody, {
      headers: Object.fromEntries(request.headers),
      key: WEBHOOK_SECRET,
    });
  } catch {
    return json({ error: "Invalid webhook signature." }, 401);
  }

  if (event.type !== "payment.succeeded") return json({ received: true, ignored: true });

  const payment = event.data || {};
  const checkoutConfigurationId = payment.checkout_configuration_id;
  if (!payment.id || !checkoutConfigurationId) return json({ received: true, ignored: true });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: session, error: sessionError } = await admin
    .from("whop_payment_sessions")
    .select("id")
    .eq("whop_checkout_configuration_id", checkoutConfigurationId)
    .maybeSingle();
  if (sessionError) {
    console.error("[whop-webhook] payment session lookup failed:", sessionError.message);
    return json({ error: "Unable to find checkout session." }, 500);
  }
  if (!session) return json({ received: true, ignored: true });

  const amount = Number(payment.subtotal?.amount ?? payment.total?.amount);
  const currency = String(payment.subtotal?.currency || payment.currency || "").toLowerCase();
  const { data: result, error } = await admin.rpc("fulfill_whop_payment", {
    p_session_id: session.id,
    p_whop_payment_id: payment.id,
    p_amount_usd: amount,
    p_currency: currency,
  });
  if (error || !result?.ok) {
    console.error("[whop-webhook] fulfillment failed:", error?.message || result?.error);
    return json({ error: "Payment fulfillment failed." }, 500);
  }
  return json({ received: true });
});
