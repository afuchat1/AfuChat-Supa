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
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PESAPAL_CONSUMER_KEY = Deno.env.get("PESAPAL_CONSUMER_KEY")!;
const PESAPAL_CONSUMER_SECRET = Deno.env.get("PESAPAL_CONSUMER_SECRET")!;

const IPN_URL = `${SUPABASE_URL.replace("supabase.co", "supabase.co")}/functions/v1/pesapal-ipn`;
const CALLBACK_URL = "https://afuchat.com/wallet/payment-complete";

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
  if (!data.token) throw new Error(`No token in Pesapal response: ${JSON.stringify(data)}`);
  return data.token;
}

async function registerIPN(token: string): Promise<string> {
  const existingIpnId = Deno.env.get("PESAPAL_IPN_ID");
  if (existingIpnId) return existingIpnId;

  const res = await fetch(`${PESAPAL_BASE}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: IPN_URL,
      ipn_notification_type: "POST",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IPN registration failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.ipn_id || data.id || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { acoin_amount, currency } = await req.json();

    if (!acoin_amount || acoin_amount < 50) {
      return new Response(
        JSON.stringify({ error: "Minimum top-up is 50 ACoin" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const amount_usd = parseFloat((acoin_amount * 0.01).toFixed(2));
    const finalCurrency = currency || "USD";
    const merchantRef = `AFUCHAT-${user.id.slice(0, 8)}-${Date.now()}`;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name, handle, country")
      .eq("id", user.id)
      .single();

    const displayName = profile?.display_name || profile?.handle || "AfuChat User";
    const email = user.email || "";

    const token = await pesapalToken();
    const ipnId = await registerIPN(token);

    const orderRes = await fetch(`${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: merchantRef,
        currency: finalCurrency,
        amount: amount_usd,
        description: `${acoin_amount} ACoin top-up for ${displayName}`,
        callback_url: CALLBACK_URL,
        notification_id: ipnId,
        billing_address: {
          email_address: email,
          first_name: displayName.split(" ")[0] || displayName,
          last_name: displayName.split(" ").slice(1).join(" ") || "",
        },
      }),
    });

    if (!orderRes.ok) {
      const text = await orderRes.text();
      throw new Error(`Order submission failed (${orderRes.status}): ${text}`);
    }

    const orderData = await orderRes.json();
    const redirectUrl = orderData.redirect_url;
    const trackingId = orderData.order_tracking_id;

    if (!redirectUrl) {
      throw new Error(`No redirect_url from Pesapal: ${JSON.stringify(orderData)}`);
    }

    await adminClient.from("pesapal_orders").insert({
      user_id: user.id,
      merchant_reference: merchantRef,
      tracking_id: trackingId,
      acoin_amount,
      amount_usd,
      currency: finalCurrency,
      status: "pending",
    });

    return new Response(
      JSON.stringify({
        redirect_url: redirectUrl,
        merchant_reference: merchantRef,
        tracking_id: trackingId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[pesapal-initiate]", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
