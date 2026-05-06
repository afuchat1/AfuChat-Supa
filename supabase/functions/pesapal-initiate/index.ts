import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PESAPAL_ENV = Deno.env.get("PESAPAL_ENV") || "live";
const PESAPAL_BASE = PESAPAL_ENV === "sandbox"
  ? "https://cybqa.pesapal.com/pesapalv3"
  : "https://pay.pesapal.com/v3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PESAPAL_CONSUMER_KEY = Deno.env.get("PESAPAL_CONSUMER_KEY") ?? "";
const PESAPAL_CONSUMER_SECRET = Deno.env.get("PESAPAL_CONSUMER_SECRET") ?? "";
const PESAPAL_IPN_ID = Deno.env.get("PESAPAL_IPN_ID") ?? "";

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
  if (!res.ok) throw new Error(`Pesapal auth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.token) throw new Error(`No token: ${JSON.stringify(data)}`);
  return data.token;
}

async function getOrRegisterIPN(token: string): Promise<string> {
  if (PESAPAL_IPN_ID) return PESAPAL_IPN_ID;
  const res = await fetch(`${PESAPAL_BASE}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ url: IPN_URL, ipn_notification_type: "POST" }),
  });
  if (!res.ok) throw new Error(`IPN registration failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const ipnId = data.ipn_id || data.id;
  if (!ipnId) throw new Error(`No IPN ID: ${JSON.stringify(data)}`);
  return ipnId;
}

Deno.serve(async (req: Request) => {
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

    const body = await req.json();
    const {
      acoin_amount,
      currency,
      payment_method,
      payment_data,
    } = body as {
      acoin_amount: number;
      currency?: string;
      payment_method?: "google_pay" | "card" | "mtn" | "airtel";
      payment_data?: Record<string, string>;
    };

    if (!acoin_amount || typeof acoin_amount !== "number" || acoin_amount < 50) {
      return new Response(
        JSON.stringify({ error: "Minimum top-up is 50 ACoin" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const amount_usd = parseFloat((acoin_amount * 0.01).toFixed(2));
    const finalCurrency = (currency || "USD").toUpperCase();
    const merchantRef = `AFUCHAT-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name, handle")
      .eq("id", user.id)
      .single();

    const displayName = ((profile as any)?.display_name || (profile as any)?.handle || "AfuChat User").trim();
    const nameParts = displayName.split(" ");
    const firstName = nameParts[0] || "AfuChat";
    const lastName = nameParts.slice(1).join(" ") || "User";

    const token = await pesapalToken();
    const ipnId = await getOrRegisterIPN(token);

    // Build base order payload
    const orderPayload: Record<string, unknown> = {
      id: merchantRef,
      currency: finalCurrency,
      amount: amount_usd,
      description: `${acoin_amount} ACoin top-up`,
      callback_url: CALLBACK_URL,
      notification_id: ipnId,
      billing_address: {
        email_address: user.email || "",
        first_name: firstName,
        last_name: lastName,
      },
    };

    // Apply payment-method-specific fields
    if (payment_method === "mtn" || payment_method === "airtel") {
      const phone = payment_data?.phone_number || "";
      if (!phone) {
        return new Response(
          JSON.stringify({ error: "Phone number is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const normalized = phone.startsWith("+")
        ? phone.replace(/[^\d+]/g, "")
        : `+${phone.replace(/\D/g, "")}`;
      (orderPayload.billing_address as any).phone_number = normalized;
      orderPayload.payment_method = payment_method === "mtn" ? "MTN" : "AIRTEL";

    } else if (payment_method === "card") {
      const { number, expiry_month, expiry_year, cvv, name_on_card } = payment_data || {};
      if (!number || !expiry_month || !expiry_year || !cvv) {
        return new Response(
          JSON.stringify({ error: "Card details are incomplete" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      orderPayload.payment_method = "card";
      orderPayload.card = {
        number: number.replace(/\s/g, ""),
        expiry_month,
        expiry_year,
        cvv,
        name_on_card: name_on_card || displayName,
      };

    } else if (payment_method === "google_pay") {
      const gpToken = payment_data?.token;
      if (!gpToken) {
        return new Response(
          JSON.stringify({ error: "Google Pay token is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      orderPayload.payment_method = "googlepay";
      orderPayload.google_pay_token = gpToken;
    }

    console.log(`[pesapal-initiate] ${merchantRef} user=${user.id} method=${payment_method} ${acoin_amount} ACoin $${amount_usd}`);

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
    if (!orderRes.ok) throw new Error(`Order submission failed (${orderRes.status}): ${orderText}`);

    const orderData = JSON.parse(orderText);

    // Persist the order
    const { error: insertErr } = await adminClient.from("pesapal_orders").insert({
      user_id: user.id,
      merchant_reference: merchantRef,
      tracking_id: orderData.order_tracking_id || null,
      acoin_amount,
      amount_usd,
      currency: finalCurrency,
      status: "pending",
    });
    if (insertErr) console.error("[pesapal-initiate] DB insert error:", insertErr);

    return new Response(
      JSON.stringify({
        merchant_reference: merchantRef,
        order_tracking_id: orderData.order_tracking_id || null,
        redirect_url: orderData.redirect_url || null,
        status: "pending",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pesapal-initiate] error:", msg);
    return new Response(
      JSON.stringify({ error: msg || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
