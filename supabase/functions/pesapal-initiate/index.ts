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

// IPN endpoint — must be the same Supabase project URL
const IPN_URL = `${SUPABASE_URL}/functions/v1/pesapal-ipn`;
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

async function getOrRegisterIPN(token: string): Promise<string> {
  // If admin has pre-registered the IPN ID, use it directly
  const existingIpnId = Deno.env.get("PESAPAL_IPN_ID");
  if (existingIpnId) return existingIpnId;

  // Otherwise register it now (Pesapal deduplicates by URL, so this is idempotent)
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
  const ipnId = data.ipn_id || data.id;
  if (!ipnId) throw new Error(`No IPN ID returned: ${JSON.stringify(data)}`);
  return ipnId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the calling user's JWT
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

    const body = await req.json();
    const { acoin_amount, currency } = body;

    if (!acoin_amount || typeof acoin_amount !== "number" || acoin_amount < 50) {
      return new Response(
        JSON.stringify({ error: "Minimum top-up is 50 ACoin" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const amount_usd = parseFloat((acoin_amount * 0.01).toFixed(2));
    const finalCurrency = (currency && typeof currency === "string") ? currency.toUpperCase() : "USD";
    const merchantRef = `AFUCHAT-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name, handle, country")
      .eq("id", user.id)
      .single();

    const displayName = (profile?.display_name || profile?.handle || "AfuChat User").trim();
    const nameParts = displayName.split(" ");
    const firstName = nameParts[0] || "AfuChat";
    const lastName = nameParts.slice(1).join(" ") || "User";
    const email = user.email || "";
    const phoneNumber = user.phone || "";

    // Get Pesapal token and IPN ID
    const token = await pesapalToken();
    const ipnId = await getOrRegisterIPN(token);

    console.log(`[pesapal-initiate] submitting order ${merchantRef} for user ${user.id}, ${acoin_amount} ACoin = $${amount_usd}`);

    const orderPayload: Record<string, any> = {
      id: merchantRef,
      currency: finalCurrency,
      amount: amount_usd,
      description: `${acoin_amount} ACoin top-up`,
      callback_url: CALLBACK_URL,
      notification_id: ipnId,
      billing_address: {
        email_address: email,
        first_name: firstName,
        last_name: lastName,
      },
    };
    if (phoneNumber) {
      orderPayload.billing_address.phone_number = phoneNumber;
    }

    const orderRes = await fetch(`${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const orderText = await orderRes.text();
    if (!orderRes.ok) {
      throw new Error(`Order submission failed (${orderRes.status}): ${orderText}`);
    }

    const orderData = JSON.parse(orderText);
    const redirectUrl: string | undefined = orderData.redirect_url;
    const trackingId: string | undefined = orderData.order_tracking_id;

    if (!redirectUrl) {
      throw new Error(`No redirect_url from Pesapal: ${orderText}`);
    }

    // Persist the order before returning so IPN can find it
    const { error: insertErr } = await adminClient.from("pesapal_orders").insert({
      user_id: user.id,
      merchant_reference: merchantRef,
      tracking_id: trackingId || null,
      acoin_amount,
      amount_usd,
      currency: finalCurrency,
      status: "pending",
    });

    if (insertErr) {
      console.error("[pesapal-initiate] DB insert error:", insertErr);
      // Non-fatal: payment can still proceed, IPN will create it if needed
    }

    return new Response(
      JSON.stringify({
        redirect_url: redirectUrl,
        merchant_reference: merchantRef,
        tracking_id: trackingId || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[pesapal-initiate] error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
