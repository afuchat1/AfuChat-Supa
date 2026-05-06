/**
 * /api/payments/* — Custom in-app checkout via Pesapal
 *
 * POST /api/payments/initiate
 *   body: { acoin_amount, currency?, payment_method, payment_data }
 *   payment_method: "google_pay" | "card" | "mtn" | "airtel"
 *   payment_data:
 *     google_pay → { token: string }
 *     card       → { number, expiry_month, expiry_year, cvv, name_on_card }
 *     mtn/airtel → { phone_number: string }
 *   auth: Bearer <supabase access_token>
 *
 * POST /api/payments/webhook
 *   Pesapal IPN — no auth (we re-verify with Pesapal before crediting)
 *
 * GET /api/payments/status/:merchantRef
 *   auth: Bearer <supabase access_token>
 */

import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { SUPABASE_URL } from "../lib/constants";
import { logger } from "../lib/logger";

const router = Router();

// ─── Supabase anon client (user-auth verification — no service role needed) ───

function getAnonKey(): string {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

async function verifyUser(
  bearerToken: string,
): Promise<{ id: string; email?: string } | null> {
  const anonKey = getAnonKey();
  if (!anonKey) return null;
  const client = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email };
}

async function getUserClient(bearerToken: string) {
  const anonKey = getAnonKey();
  return createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });
}

// ─── Pesapal helpers ──────────────────────────────────────────────────────────

function pesapalBase(): string {
  return (process.env.PESAPAL_ENV || "live") === "sandbox"
    ? "https://cybqa.pesapal.com/pesapalv3"
    : "https://pay.pesapal.com/v3";
}

async function getPesapalToken(): Promise<string> {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY || "";
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET || "";
  if (!consumerKey || !consumerSecret) {
    throw new Error("Payment service not configured. Please try again later.");
  }
  const res = await fetch(`${pesapalBase()}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });
  if (!res.ok) throw new Error(`Payment auth failed (${res.status})`);
  const data = await res.json();
  if (!data.token) throw new Error("Invalid payment service response");
  return data.token;
}

async function getOrRegisterIPN(token: string): Promise<string> {
  const existing = process.env.PESAPAL_IPN_ID || "";
  if (existing) return existing;
  const webhookUrl =
    process.env.PAYMENTS_WEBHOOK_URL ||
    `${SUPABASE_URL}/functions/v1/pesapal-ipn`;
  const res = await fetch(`${pesapalBase()}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: webhookUrl, ipn_notification_type: "POST" }),
  });
  if (!res.ok) throw new Error(`IPN registration failed (${res.status})`);
  const data = await res.json();
  const ipnId = data.ipn_id || data.id;
  if (!ipnId) throw new Error("No IPN ID returned");
  return ipnId;
}

async function submitOrder(
  token: string,
  ipnId: string,
  payload: Record<string, unknown>,
): Promise<{ order_tracking_id?: string; redirect_url?: string }> {
  const res = await fetch(`${pesapalBase()}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...payload, notification_id: ipnId }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Order failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function getTransactionStatus(
  token: string,
  trackingId: string,
): Promise<{ status_code: number; payment_status_description: string }> {
  const res = await fetch(
    `${pesapalBase()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  const data = await res.json();
  return {
    status_code: data.status_code ?? 0,
    payment_status_description: data.payment_status_description || "PENDING",
  };
}

// ─── POST /api/payments/initiate ──────────────────────────────────────────────

router.post("/payments/initiate", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const bearerToken = authHeader.slice(7);

  const user = await verifyUser(bearerToken);
  if (!user) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
    return;
  }

  try {
    const { acoin_amount, currency, payment_method, payment_data } = req.body as {
      acoin_amount: number;
      currency?: string;
      payment_method: "google_pay" | "card" | "mtn" | "airtel";
      payment_data?: Record<string, string>;
    };

    if (!acoin_amount || typeof acoin_amount !== "number" || acoin_amount < 50) {
      res.status(400).json({ error: "Minimum top-up is 50 ACoin" });
      return;
    }
    if (!["google_pay", "card", "mtn", "airtel"].includes(payment_method)) {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }

    const amountUsd = parseFloat((acoin_amount * 0.01).toFixed(2));
    const finalCurrency = (currency || "USD").toUpperCase();
    const merchantRef = `AFUCHAT-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;

    // Fetch profile with user's own token (no service role needed)
    const userClient = await getUserClient(bearerToken);
    const { data: profile } = await userClient
      .from("profiles")
      .select("display_name, handle")
      .eq("id", user.id)
      .single();

    const displayName = ((profile as any)?.display_name || (profile as any)?.handle || "AfuChat User").trim();
    const nameParts = displayName.split(" ");
    const firstName = nameParts[0] || "AfuChat";
    const lastName = nameParts.slice(1).join(" ") || "User";

    // Get Pesapal token + IPN
    const pesapalToken = await getPesapalToken();
    const ipnId = await getOrRegisterIPN(pesapalToken);

    // Build order payload
    const baseOrder: Record<string, unknown> = {
      id: merchantRef,
      currency: finalCurrency,
      amount: amountUsd,
      description: `${acoin_amount} ACoin top-up`,
      callback_url: "https://afuchat.com/wallet/payment-complete",
      billing_address: {
        email_address: user.email || "",
        first_name: firstName,
        last_name: lastName,
      },
    };

    if (payment_method === "mtn" || payment_method === "airtel") {
      const phone = payment_data?.phone_number || "";
      if (!phone) {
        res.status(400).json({ error: "Phone number is required" });
        return;
      }
      const normalized = phone.startsWith("+")
        ? phone.replace(/[^\d+]/g, "")
        : `+${phone.replace(/\D/g, "")}`;
      (baseOrder.billing_address as any).phone_number = normalized;
      baseOrder.payment_method = payment_method === "mtn" ? "MTN" : "AIRTEL";
    } else if (payment_method === "card") {
      const { number, expiry_month, expiry_year, cvv, name_on_card } = payment_data || {};
      if (!number || !expiry_month || !expiry_year || !cvv) {
        res.status(400).json({ error: "Card details are incomplete" });
        return;
      }
      baseOrder.payment_method = "card";
      baseOrder.card = {
        number: number.replace(/\s/g, ""),
        expiry_month,
        expiry_year,
        cvv,
        name_on_card: name_on_card || displayName,
      };
    } else if (payment_method === "google_pay") {
      const gpToken = payment_data?.token;
      if (!gpToken) {
        res.status(400).json({ error: "Google Pay token is required" });
        return;
      }
      baseOrder.payment_method = "googlepay";
      baseOrder.google_pay_token = gpToken;
    }

    const { order_tracking_id, redirect_url } = await submitOrder(
      pesapalToken,
      ipnId,
      baseOrder,
    );

    // Persist order — try admin client first, fall back to user client
    const admin = getSupabaseAdmin();
    const dbClient = admin || userClient;
    const { error: insertErr } = await dbClient.from("pesapal_orders").insert({
      user_id: user.id,
      merchant_reference: merchantRef,
      tracking_id: order_tracking_id || null,
      acoin_amount,
      amount_usd: amountUsd,
      currency: finalCurrency,
      status: "pending",
    });
    if (insertErr) {
      logger.warn({ insertErr: insertErr.message }, "payments/initiate: order insert failed");
    }

    logger.info({ merchantRef, userId: user.id, acoin_amount, payment_method }, "payment initiated");

    res.json({
      merchant_reference: merchantRef,
      order_tracking_id: order_tracking_id || null,
      redirect_url: redirect_url || null,
      status: "pending",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/initiate error");
    res.status(500).json({ error: err?.message || "Payment could not be started. Please try again." });
  }
});

// ─── POST /api/payments/webhook — Pesapal IPN ─────────────────────────────────

router.post("/payments/webhook", async (req: Request, res: Response) => {
  try {
    const merchantRef: string =
      req.body?.OrderMerchantReference ||
      req.query?.OrderMerchantReference ||
      "";
    const trackingId: string =
      req.body?.OrderTrackingId ||
      req.query?.OrderTrackingId ||
      "";

    if (!merchantRef || !trackingId) {
      res.status(400).json({ error: "Missing required IPN fields" });
      return;
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      logger.warn("payments/webhook: no admin client, IPN cannot be processed");
      res.json({ message: "Acknowledged" });
      return;
    }

    const { data: order } = await admin
      .from("pesapal_orders")
      .select("*")
      .eq("merchant_reference", merchantRef)
      .maybeSingle();

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.status === "completed") { res.json({ message: "Already processed" }); return; }

    const token = await getPesapalToken();
    const { status_code, payment_status_description } = await getTransactionStatus(token, trackingId);
    const statusDesc = payment_status_description.toUpperCase();

    if (status_code === 1 || statusDesc === "COMPLETED") {
      const { error: upErr } = await admin
        .from("pesapal_orders")
        .update({ status: "completed", tracking_id: trackingId })
        .eq("id", order.id)
        .eq("status", "pending");

      if (!upErr) {
        const { error: rpcErr } = await admin.rpc("credit_acoin", {
          p_user_id: order.user_id,
          p_amount: order.acoin_amount,
        });
        if (rpcErr) {
          await admin.from("pesapal_orders").update({ status: "pending" }).eq("id", order.id);
          res.status(500).json({ error: "Wallet credit failed" });
          return;
        }
        await admin.from("acoin_transactions").insert({
          user_id: order.user_id,
          amount: order.acoin_amount,
          transaction_type: "topup",
          metadata: { merchant_reference: merchantRef, tracking_id: trackingId, payment_provider: "pesapal" },
        });
        logger.info({ merchantRef, userId: order.user_id }, "wallet credited");
      }
      res.json({ message: "Payment confirmed" });
    } else if ([2, 3, 4].includes(status_code) || ["FAILED", "REVERSED", "INVALID"].includes(statusDesc)) {
      await admin.from("pesapal_orders").update({ status: "failed", tracking_id: trackingId }).eq("id", order.id);
      res.json({ message: "Payment failed" });
    } else {
      res.json({ message: "Payment pending" });
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/webhook error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── GET /api/payments/status/:merchantRef ────────────────────────────────────

router.get("/payments/status/:merchantRef", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const bearerToken = authHeader.slice(7);

  const user = await verifyUser(bearerToken);
  if (!user) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  try {
    const { merchantRef } = req.params;
    const userClient = await getUserClient(bearerToken);

    const { data: order } = await userClient
      .from("pesapal_orders")
      .select("status, acoin_amount, tracking_id")
      .eq("merchant_reference", merchantRef)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    // If pending + has tracking ID, poll Pesapal for live status
    if (order.status === "pending" && order.tracking_id) {
      try {
        const token = await getPesapalToken();
        const { status_code, payment_status_description } = await getTransactionStatus(token, order.tracking_id);
        const statusDesc = payment_status_description.toUpperCase();

        if (status_code === 1 || statusDesc === "COMPLETED") {
          const admin = getSupabaseAdmin();
          if (admin) {
            await admin.from("pesapal_orders").update({ status: "completed" }).eq("merchant_reference", merchantRef).eq("status", "pending");
            await admin.rpc("credit_acoin", { p_user_id: user.id, p_amount: order.acoin_amount });
          }
          res.json({ status: "completed", acoin_amount: order.acoin_amount });
          return;
        } else if ([2, 3, 4].includes(status_code) || ["FAILED", "REVERSED", "INVALID"].includes(statusDesc)) {
          const admin = getSupabaseAdmin();
          if (admin) await admin.from("pesapal_orders").update({ status: "failed" }).eq("merchant_reference", merchantRef);
          res.json({ status: "failed", acoin_amount: order.acoin_amount });
          return;
        }
      } catch (pollErr: any) {
        logger.warn({ err: pollErr?.message }, "payments/status: live poll failed");
      }
    }

    res.json({ status: order.status, acoin_amount: order.acoin_amount });
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/status error");
    res.status(500).json({ error: "Status check failed" });
  }
});

export default router;
