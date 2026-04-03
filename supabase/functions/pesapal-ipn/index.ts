/**
 * pesapal-ipn — Instant Payment Notification handler
 *
 * Pesapal calls this endpoint (POST or GET) whenever a payment status changes.
 * This function MUST be deployed with verify_jwt = false (in Supabase config.toml
 * or via the Dashboard → Edge Functions → Settings → disable JWT verification).
 *
 * Security note: We always re-verify payment status directly with Pesapal's API
 * before crediting the wallet, so a forged IPN call cannot credit any wallet.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PESAPAL_ENV = Deno.env.get("PESAPAL_ENV") || "live";
const PESAPAL_BASE = PESAPAL_ENV === "sandbox"
  ? "https://cybqa.pesapal.com/pesapalv3"
  : "https://pay.pesapal.com/v3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PESAPAL_CONSUMER_KEY = Deno.env.get("PESAPAL_CONSUMER_KEY")!;
const PESAPAL_CONSUMER_SECRET = Deno.env.get("PESAPAL_CONSUMER_SECRET")!;

// Pesapal v3 status_code values
const PESAPAL_STATUS = {
  PENDING: 0,
  COMPLETED: 1,
  FAILED: 2,
  REVERSED: 3,
  INVALID: 4,
} as const;

async function pesapalToken(): Promise<string> {
  const res = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      consumer_key: PESAPAL_CONSUMER_KEY,
      consumer_secret: PESAPAL_CONSUMER_SECRET,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pesapal auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error(`No token in Pesapal response`);
  return data.token;
}

async function getTransactionStatus(token: string, trackingId: string) {
  const res = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`,
    {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GetTransactionStatus failed (${res.status}): ${text}`);
  }
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Parse OrderTrackingId / OrderMerchantReference from query string (GET) or body (POST)
    let orderTrackingId: string | null = null;
    let merchantReference: string | null = null;

    const url = new URL(req.url);
    orderTrackingId = url.searchParams.get("OrderTrackingId");
    merchantReference = url.searchParams.get("OrderMerchantReference");

    if (req.method === "POST" && (!orderTrackingId && !merchantReference)) {
      try {
        const body = await req.json();
        orderTrackingId = body.OrderTrackingId || body.order_tracking_id || null;
        merchantReference = body.OrderMerchantReference || body.merchant_reference || null;
      } catch {
        // Body may not be JSON
      }
    }

    console.log("[pesapal-ipn] received:", { method: req.method, orderTrackingId, merchantReference });

    if (!orderTrackingId && !merchantReference) {
      return new Response(
        JSON.stringify({ error: "Missing OrderTrackingId or OrderMerchantReference" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Look up the order in our DB
    let orderQuery = adminClient
      .from("pesapal_orders")
      .select("id, user_id, acoin_amount, merchant_reference, tracking_id, status");

    if (orderTrackingId) {
      orderQuery = orderQuery.eq("tracking_id", orderTrackingId) as any;
    } else {
      orderQuery = orderQuery.eq("merchant_reference", merchantReference!) as any;
    }

    const { data: order, error: orderError } = await orderQuery.maybeSingle();

    if (orderError) {
      console.error("[pesapal-ipn] DB error:", orderError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!order) {
      // If tracking ID lookup failed, try merchant reference as fallback
      if (orderTrackingId && merchantReference) {
        const { data: fallback } = await adminClient
          .from("pesapal_orders")
          .select("id, user_id, acoin_amount, merchant_reference, tracking_id, status")
          .eq("merchant_reference", merchantReference)
          .maybeSingle();

        if (fallback) {
          // Update tracking_id on the order if it was missing
          if (!fallback.tracking_id && orderTrackingId) {
            await adminClient
              .from("pesapal_orders")
              .update({ tracking_id: orderTrackingId })
              .eq("id", fallback.id);
          }
          // Continue with fallback order (handled below by reassigning order)
          return await processOrder(adminClient, { ...fallback, tracking_id: orderTrackingId || fallback.tracking_id }, orderTrackingId, corsHeaders);
        }
      }
      console.warn("[pesapal-ipn] order not found:", { orderTrackingId, merchantReference });
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ensure tracking_id is populated
    const trackId = orderTrackingId || order.tracking_id;
    if (trackId && !order.tracking_id) {
      await adminClient
        .from("pesapal_orders")
        .update({ tracking_id: trackId })
        .eq("id", order.id);
    }

    return await processOrder(adminClient, { ...order, tracking_id: trackId }, orderTrackingId, corsHeaders);
  } catch (err: any) {
    console.error("[pesapal-ipn] unhandled error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function processOrder(
  adminClient: ReturnType<typeof createClient>,
  order: { id: string; user_id: string; acoin_amount: number; merchant_reference: string; tracking_id: string | null; status: string },
  orderTrackingId: string | null,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (order.status === "completed") {
    return new Response(
      JSON.stringify({ message: "Already processed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const trackId = order.tracking_id;
  if (!trackId) {
    await adminClient.from("pesapal_orders").update({ status: "invalid" }).eq("id", order.id);
    return new Response(
      JSON.stringify({ error: "No tracking ID — cannot verify payment" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Always verify payment status directly with Pesapal
  const token = await pesapalToken();
  const statusData = await getTransactionStatus(token, trackId);

  console.log("[pesapal-ipn] Pesapal status response:", JSON.stringify(statusData));

  const statusCode: number = statusData.status_code ?? PESAPAL_STATUS.PENDING;
  const paymentStatusDesc: string = (statusData.payment_status_description || "").toUpperCase();

  if (statusCode === PESAPAL_STATUS.COMPLETED || paymentStatusDesc === "COMPLETED") {
    // Mark the order as completed first (idempotency guard)
    const { error: updateErr } = await adminClient
      .from("pesapal_orders")
      .update({ status: "completed", tracking_id: trackId })
      .eq("id", order.id)
      .eq("status", "pending"); // only update if still pending

    if (updateErr) {
      console.error("[pesapal-ipn] order update error:", updateErr);
      // Could mean it was already marked completed in a concurrent call — that's OK
    }

    // Atomically credit the wallet using the SQL function
    const { error: rpcErr } = await adminClient.rpc("credit_acoin", {
      p_user_id: order.user_id,
      p_amount: order.acoin_amount,
    });

    if (rpcErr) {
      console.error("[pesapal-ipn] credit_acoin RPC failed:", rpcErr);
      // Revert the order status so IPN can retry
      await adminClient
        .from("pesapal_orders")
        .update({ status: "pending" })
        .eq("id", order.id);
      return new Response(
        JSON.stringify({ error: "Failed to credit wallet, will retry" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Log the transaction
    await adminClient.from("acoin_transactions").insert({
      user_id: order.user_id,
      amount: order.acoin_amount,
      transaction_type: "topup",
      metadata: {
        merchant_reference: order.merchant_reference,
        tracking_id: trackId,
        payment_provider: "pesapal",
        pesapal_status_code: statusCode,
      },
    });

    console.log(`[pesapal-ipn] credited ${order.acoin_amount} ACoin to user ${order.user_id}`);

    return new Response(
      JSON.stringify({ message: "Payment confirmed, wallet credited" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } else if (
    statusCode === PESAPAL_STATUS.FAILED ||
    statusCode === PESAPAL_STATUS.REVERSED ||
    statusCode === PESAPAL_STATUS.INVALID ||
    paymentStatusDesc === "FAILED" ||
    paymentStatusDesc === "REVERSED" ||
    paymentStatusDesc === "INVALID"
  ) {
    await adminClient
      .from("pesapal_orders")
      .update({ status: "failed", tracking_id: trackId })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({ message: "Payment failed or reversed", pesapal_status: paymentStatusDesc }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } else {
    // PENDING (status_code 0) or unknown — do nothing yet
    return new Response(
      JSON.stringify({ message: "Payment still pending", pesapal_status: paymentStatusDesc }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
