import { Hono } from "hono";
import type { Env } from "../types";
import { createPublicDbClient } from "../lib/public-db";
import { getSupabaseUser } from "../lib/function-auth";

const payments = new Hono<{ Bindings: Env }>();

type PesapalResponse = Record<string, any>;

function apiBase(env: Env): string {
  return env.PESAPAL_ENV === "sandbox"
    ? "https://cybqa.pesapal.com/pesapalv3/api"
    : "https://pay.pesapal.com/v3/api";
}

function encodePart(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePart(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

function publicApiUrl(env: Env): string {
  return (env.PUBLIC_API_URL ?? "https://api.afuchat.com").replace(/\/+$/, "");
}

async function pesapalToken(env: Env): Promise<string> {
  const key = env.PESAPAL_CONSUMER_KEY?.trim();
  const secret = env.PESAPAL_CONSUMER_SECRET?.trim();
  if (!key || !secret) throw new Error("Pesapal credentials are not configured");

  const response = await fetch(`${apiBase(env)}/Auth/Request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });
  const data = await response.json().catch(() => null) as PesapalResponse | null;
  const token = typeof data?.token === "string" ? data.token : "";
  if (!response.ok || !token) throw new Error("Pesapal authentication failed");
  return token;
}

function merchantReference(userId: string, purpose: "donation" | "acoin_topup", amount: number): string {
  const kind = purpose === "donation" ? "d" : "t";
  return `AFU1.${kind}.${encodePart(userId)}.${amount}.${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function parseMerchantReference(value: string): {
  userId: string;
  purpose: "donation" | "acoin_topup";
  amount: number;
} | null {
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "AFU1") return null;
  const purpose = parts[1] === "d" ? "donation" : parts[1] === "t" ? "acoin_topup" : null;
  const amount = Number(parts[3]);
  if (!purpose || !Number.isInteger(amount) || amount < 1) return null;
  try {
    const userId = decodePart(parts[2]);
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
    return { userId, purpose, amount };
  } catch {
    return null;
  }
}

function statusIsCompleted(data: PesapalResponse): boolean {
  const status = String(data.status ?? data.payment_status_description ?? "").toLowerCase();
  return data.status_code === 1 || status === "completed" || status === "completed successfully";
}

payments.post("/pesapal-initiate", async (c) => {
  const user = await getSupabaseUser(c);
  if (!user) return c.json({ error: "Invalid or expired session" }, 401);
  if (!c.env.PESAPAL_IPN_ID) return c.json({ error: "Pesapal notifications are not configured" }, 503);

  const body = await c.req.json().catch(() => ({})) as Record<string, any>;
  const purpose = body.purpose === "donation" ? "donation" : "acoin_topup";
  const amount = Number(body.acoin_amount);
  const usdAmount = Number(body.usd_amount);
  if (purpose === "donation" && (!Number.isFinite(usdAmount) || usdAmount < 1)) {
    return c.json({ error: "A valid donation amount is required" }, 400);
  }
  const acoinAmount = purpose === "donation"
    ? (Number.isFinite(usdAmount) && usdAmount >= 1 ? Math.round(usdAmount * 100) : amount)
    : amount;
  if (!Number.isInteger(acoinAmount) || acoinAmount < 50 || acoinAmount > 2_000_000) {
    return c.json({ error: "A valid amount between 50 and 2,000,000 ACoin is required" }, 400);
  }

  const email = user.email?.trim();
  if (!email) return c.json({ error: "A verified email address is required for payment" }, 400);

  try {
    const token = await pesapalToken(c.env);
    const reference = merchantReference(user.id, purpose, acoinAmount);
    const submit = await fetch(`${apiBase(c.env)}/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: reference,
        currency: "USD",
        amount: purpose === "donation" ? Number(usdAmount.toFixed(2)) : Number((acoinAmount / 100).toFixed(2)),
        description: purpose === "donation" ? "AfuChat donation" : `AfuChat ${acoinAmount} ACoin`,
        callback_url: `${publicApiUrl(c.env)}/v1/payments/pesapal-callback`,
        notification_id: c.env.PESAPAL_IPN_ID,
        billing_address: {
          email_address: email,
          country_code: "UG",
          first_name: String(user.user_metadata?.first_name ?? user.user_metadata?.name ?? "AfuChat"),
          last_name: String(user.user_metadata?.last_name ?? "User"),
        },
      }),
    });
    const data = await submit.json().catch(() => null) as PesapalResponse | null;
    if (!submit.ok || typeof data?.redirect_url !== "string") {
      console.error("[pesapal-initiate]", submit.status, data);
      return c.json({ error: "Pesapal could not create the checkout session" }, 502);
    }
    return c.json({
      redirect_url: data.redirect_url,
      order_tracking_id: data.order_tracking_id ?? null,
      merchant_reference: reference,
    });
  } catch (error) {
    console.error("[pesapal-initiate]", error);
    return c.json({ error: "Payment service is not configured" }, 503);
  }
});

payments.get("/pesapal-callback", async (c) => {
  const trackingId = c.req.query("OrderTrackingId") ?? "";
  const reference = c.req.query("OrderMerchantReference") ?? "";
  if (!trackingId || !reference) return c.json({ error: "Missing payment reference" }, 400);

  try {
    const token = await pesapalToken(c.env);
    const response = await fetch(
      `${apiBase(c.env)}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    const data = await response.json().catch(() => null) as PesapalResponse | null;
    return c.json({
      ok: response.ok,
      status: statusIsCompleted(data ?? {}) ? "completed" : String(data?.payment_status_description ?? "pending").toLowerCase(),
      order_tracking_id: trackingId,
      merchant_reference: reference,
    });
  } catch {
    return c.json({ ok: false, status: "pending", order_tracking_id: trackingId, merchant_reference: reference });
  }
});

payments.all("/pesapal-ipn", async (c) => {
  const trackingId = c.req.query("OrderTrackingId") ?? c.req.query("orderTrackingId") ?? "";
  const reference = c.req.query("OrderMerchantReference") ?? c.req.query("orderMerchantReference") ?? "";
  if (!trackingId || !reference) return c.json({ error: "Missing payment reference" }, 400);

  try {
    const token = await pesapalToken(c.env);
    const response = await fetch(
      `${apiBase(c.env)}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    const data = await response.json().catch(() => null) as PesapalResponse | null;
    const parsed = parseMerchantReference(reference);
    if (response.ok && statusIsCompleted(data ?? {}) && parsed?.purpose === "acoin_topup") {
      const db = createPublicDbClient(c.env);
      const existing = await db.select(
        "acoin_transactions",
        `select=id&user_id=eq.${encodeURIComponent(parsed.userId)}&transaction_type=eq.pesapal_topup&metadata->>pesapal_tracking_id=eq.${encodeURIComponent(trackingId)}&limit=1`,
      );
      if (!existing.length) {
        await db.rpc("credit_acoin", {
          p_user_id: parsed.userId,
          p_amount: parsed.amount,
          p_reason: "Pesapal ACoin purchase",
        });
        await db.insert("acoin_transactions", {
          user_id: parsed.userId,
          amount: parsed.amount,
          transaction_type: "pesapal_topup",
          metadata: { pesapal_tracking_id: trackingId, merchant_reference: reference },
        });
      }
    }
    return c.json({ orderNotificationId: c.env.PESAPAL_IPN_ID ?? "", orderTrackingId: trackingId, orderMerchantReference: reference });
  } catch (error) {
    console.error("[pesapal-ipn]", error);
    return c.json({ error: "Could not process payment notification" }, 502);
  }
});

export default payments;