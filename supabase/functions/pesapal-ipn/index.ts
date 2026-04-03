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

async function pesapalToken(): Promise<string> {
  const res = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      consumer_key: PESAPAL_CONSUMER_KEY,
      consumer_secret: PESAPAL_CONSUMER_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Pesapal auth failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function getTransactionStatus(token: string, trackingId: string) {
  const res = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${trackingId}`,
    {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return await res.json();
}

async function creditWallet(
  adminClient: ReturnType<typeof createClient>,
  order: {
    id: string;
    user_id: string;
    acoin_amount: number;
    merchant_reference: string;
    tracking_id: string;
  },
) {
  const { data: profile, error: profileErr } = await adminClient
    .from("profiles")
    .select("acoin")
    .eq("id", order.user_id)
    .single();

  if (profileErr) throw new Error(`Profile fetch failed: ${profileErr.message}`);

  const currentAcoin = profile?.acoin ?? 0;
  const newAcoin = currentAcoin + order.acoin_amount;

  const { error: updateErr } = await adminClient
    .from("profiles")
    .update({ acoin: newAcoin })
    .eq("id", order.user_id);

  if (updateErr) throw new Error(`Profile update failed: ${updateErr.message}`);

  await adminClient.from("acoin_transactions").insert({
    user_id: order.user_id,
    amount: order.acoin_amount,
    transaction_type: "topup",
    metadata: {
      merchant_reference: order.merchant_reference,
      tracking_id: order.tracking_id,
      payment_provider: "pesapal",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    let orderTrackingId: string | null = null;
    let merchantReference: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      orderTrackingId = url.searchParams.get("OrderTrackingId");
      merchantReference = url.searchParams.get("OrderMerchantReference");
    } else {
      const body = await req.json().catch(() => ({}));
      orderTrackingId = body.OrderTrackingId || body.order_tracking_id || null;
      merchantReference = body.OrderMerchantReference || body.merchant_reference || null;
    }

    if (!orderTrackingId && !merchantReference) {
      return new Response(
        JSON.stringify({ error: "Missing OrderTrackingId or OrderMerchantReference" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let orderQuery = adminClient.from("pesapal_orders").select("*");
    if (orderTrackingId) {
      orderQuery = orderQuery.eq("tracking_id", orderTrackingId) as any;
    } else {
      orderQuery = orderQuery.eq("merchant_reference", merchantReference!) as any;
    }
    const { data: order, error: orderError } = await orderQuery.maybeSingle();

    if (orderError || !order) {
      console.warn("[pesapal-ipn] Order not found", { orderTrackingId, merchantReference });
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (order.status === "completed") {
      return new Response(
        JSON.stringify({ message: "Already processed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const trackId = orderTrackingId || order.tracking_id;
    if (!trackId) {
      await adminClient
        .from("pesapal_orders")
        .update({ status: "invalid" })
        .eq("id", order.id);
      return new Response(
        JSON.stringify({ error: "No tracking ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = await pesapalToken();
    const statusData = await getTransactionStatus(token, trackId);

    console.log("[pesapal-ipn] status:", JSON.stringify(statusData));

    const paymentStatus: string = (statusData.payment_status_description || "").toLowerCase();
    const statusCode: number = statusData.status_code ?? -1;

    if (paymentStatus === "completed" || statusCode === 1) {
      await adminClient
        .from("pesapal_orders")
        .update({ status: "completed", tracking_id: trackId })
        .eq("id", order.id);

      await creditWallet(adminClient, {
        ...order,
        tracking_id: trackId,
      });

      return new Response(
        JSON.stringify({ message: "Payment confirmed, wallet credited" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else if (paymentStatus === "failed" || statusCode === 2) {
      await adminClient
        .from("pesapal_orders")
        .update({ status: "failed", tracking_id: trackId })
        .eq("id", order.id);

      return new Response(
        JSON.stringify({ message: "Payment failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      return new Response(
        JSON.stringify({ message: "Payment pending", status: paymentStatus }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (err: any) {
    console.error("[pesapal-ipn]", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
