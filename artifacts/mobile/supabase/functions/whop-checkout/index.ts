import { createClient } from "npm:@supabase/supabase-js@2";
import { WhopClient, WhopEnvironment } from "npm:@whop/sdk@2.7.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WHOP_API_KEY = Deno.env.get("WHOP_API_KEY") ?? "";
const WHOP_COMPANY_ID = Deno.env.get("WHOP_COMPANY_ID") ?? "";
const WHOP_ENVIRONMENT = Deno.env.get("WHOP_ENVIRONMENT") === "sandbox" ? "sandbox" : "production";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

function createWhopClient() {
  if (!WHOP_API_KEY) throw new Error("Whop checkout is not configured.");
  return new WhopClient({
    token: WHOP_API_KEY,
    environment: WHOP_ENVIRONMENT === "sandbox" ? WhopEnvironment.Sandbox : WhopEnvironment.Production,
  });
}

async function getOptionalUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Your session has expired. Sign in and try again.");
  return data.user;
}

function parseCheckoutAmount(body: Record<string, unknown>) {
  const purpose = body.purpose;
  if (purpose === "topup") {
    const acoinAmount = Number(body.acoin_amount);
    if (!Number.isInteger(acoinAmount) || acoinAmount < 100 || acoinAmount > 2_000_000) {
      throw new Error("Choose a top-up between 100 and 2,000,000 ACoins.");
    }
    return { purpose, acoinAmount, usdAmount: acoinAmount / 100 };
  }

  if (purpose === "donation") {
    const usdAmount = Number(body.usd_amount);
    if (!Number.isFinite(usdAmount) || usdAmount < 1 || usdAmount > 10_000) {
      throw new Error("Donations must be between $1 and $10,000.");
    }
    const cents = Math.round(usdAmount * 100);
    if (Math.abs(cents / 100 - usdAmount) > 0.000001) {
      throw new Error("Donation amounts can have at most two decimal places.");
    }
    return { purpose, acoinAmount: null, usdAmount: cents / 100 };
  }

  throw new Error("Unsupported checkout purpose.");
}

async function createCheckout(userId: string | null, body: Record<string, unknown>) {
  const { purpose, acoinAmount, usdAmount } = parseCheckoutAmount(body);
  if (purpose === "topup" && !userId) throw new Error("Sign in before topping up your wallet.");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: session, error: insertError } = await admin
    .from("whop_payment_sessions")
    .insert({
      user_id: userId,
      purpose,
      usd_amount: usdAmount,
      acoin_amount: acoinAmount,
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !session) {
    console.error("[whop-checkout] could not create payment session:", insertError?.message);
    throw new Error("Could not prepare checkout. Please try again.");
  }

  try {
    const whop = createWhopClient();
    const accountId = WHOP_COMPANY_ID || (await whop.accounts.me()).id;
    const redirectUrl = `https://afuchat.com/about?payment-complete=1&session_id=${encodeURIComponent(session.id)}`;
    const checkout = await whop.checkoutConfigurations.create({
      variant: {
        title: purpose === "topup" ? `AfuChat ${acoinAmount} ACoins` : "AfuChat Donation",
        billing_type: "one_time",
        initial_price: usdAmount,
        currency: "usd",
      },
      metadata: {
        afuchat_payment_session: session.id,
        afuchat_purpose: purpose,
      },
      redirect_url: redirectUrl,
    });

    if (!checkout?.id || !checkout?.purchase_url) {
      throw new Error("Whop did not return a valid hosted checkout URL.");
    }

    const { error: updateError } = await admin
      .from("whop_payment_sessions")
      .update({
        whop_checkout_configuration_id: checkout.id,
        whop_account_id: accountId,
      })
      .eq("id", session.id);
    if (updateError) throw new Error("Could not save the Whop checkout reference.");

    return { session_id: session.id, purchase_url: checkout.purchase_url };
  } catch (error) {
    await admin.from("whop_payment_sessions").update({ status: "failed" }).eq("id", session.id);
    throw error;
  }
}

async function confirmCheckout(userId: string | null, sessionId: unknown) {
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    throw new Error("Invalid payment reference.");
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: session, error } = await admin
    .from("whop_payment_sessions")
    .select("id,user_id,purpose,usd_amount,acoin_amount,status,whop_checkout_configuration_id,whop_account_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !session) throw new Error("Payment reference was not found.");
  if (session.user_id && session.user_id !== userId) throw new Error("You cannot verify another user’s payment.");
  if (session.status === "paid") {
    return { confirmed: true, status: "paid", purpose: session.purpose, acoin_amount: session.acoin_amount };
  }
  if (!session.whop_checkout_configuration_id) {
    return { confirmed: false, status: "pending" };
  }

  const whop = createWhopClient();
  const accountId = session.whop_account_id || WHOP_COMPANY_ID || (await whop.accounts.me()).id;
  const result = await whop.payments.list({
    company_id: accountId,
    checkout_configuration_ids: [session.whop_checkout_configuration_id],
    first: 10,
  });
  const payments = Array.isArray(result?.data) ? result.data : [];
  const payment = payments.find((item: any) =>
    item.checkout_configuration_id === session.whop_checkout_configuration_id &&
    String(item.status).toLowerCase() === "paid"
  ) as any;

  if (!payment) return { confirmed: false, status: "pending" };
  const chargedCurrency = String(payment.subtotal?.currency || payment.currency || "").toLowerCase();
  const chargedAmount = Number(payment.subtotal?.amount ?? payment.total?.amount);
  if (chargedCurrency !== "usd" || !Number.isFinite(chargedAmount)) {
    throw new Error("The payment details could not be verified.");
  }

  const { data: fulfillment, error: fulfillmentError } = await admin.rpc("fulfill_whop_payment", {
    p_session_id: session.id,
    p_whop_payment_id: payment.id,
    p_amount_usd: chargedAmount,
    p_currency: chargedCurrency,
  });
  if (fulfillmentError || !fulfillment?.ok) {
    console.error("[whop-checkout] payment fulfillment failed:", fulfillmentError?.message || fulfillment?.error);
    throw new Error("Payment was received but wallet confirmation is still processing.");
  }
  return {
    confirmed: true,
    status: "paid",
    purpose: session.purpose,
    acoin_amount: session.acoin_amount,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Payment service is not configured." }, 503);
    }
    const user = await getOptionalUser(request);
    const body = await request.json().catch(() => ({}));
    const result = body.action === "confirm"
      ? await confirmCheckout(user?.id ?? null, body.session_id)
      : await createCheckout(user?.id ?? null, body);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process payment.";
    const status = /sign in|session has expired|another user/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
