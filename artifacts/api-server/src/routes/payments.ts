/**
 * /api/payments/* — Custom in-app checkout via Pesapal
 *
 * POST /api/payments/initiate
 *   body: { acoin_amount, currency?, payment_method, payment_data }
 *   payment_method: "google_pay" | "card" | "mtn" | "airtel"
 *   payment_data:
 *     google_pay  → { token: string }           (PaymentData JSON from Google Pay JS API)
 *     card        → { number, expiry_month, expiry_year, cvv, name_on_card }
 *     mtn/airtel  → { phone_number: string }
 *   auth: Bearer <supabase access_token>
 *
 * POST /api/payments/webhook
 *   Called by Pesapal IPN — no auth required (we re-verify directly with Pesapal)
 *
 * GET /api/payments/status/:merchantRef
 *   auth: Bearer <supabase access_token>
 */

import { Router, type Request, type Response } from "express";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { SUPABASE_URL } from "../lib/constants";
import { logger } from "../lib/logger";

const router = Router();

// ─── Pesapal helpers ──────────────────────────────────────────────────────────

function pesapalBase(): string {
  const env = process.env.PESAPAL_ENV || "live";
  return env === "sandbox"
    ? "https://cybqa.pesapal.com/pesapalv3"
    : "https://pay.pesapal.com/v3";
}

async function getPesapalToken(): Promise<string> {
  const base = pesapalBase();
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY || "";
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET || "";

  if (!consumerKey || !consumerSecret) {
    throw new Error("Pesapal credentials not configured");
  }

  const res = await fetch(`${base}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });
  if (!res.ok) throw new Error(`Pesapal auth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.token) throw new Error("No token returned by Pesapal");
  return data.token;
}

async function getOrRegisterIPN(token: string): Promise<string> {
  const existingIpnId = process.env.PESAPAL_IPN_ID || "";
  if (existingIpnId) return existingIpnId;

  const ipnUrl = `${process.env.API_BASE_URL || `${SUPABASE_URL}/functions/v1/pesapal-ipn`}`;
  const webhookUrl = process.env.PAYMENTS_WEBHOOK_URL || `${SUPABASE_URL}/functions/v1/pesapal-ipn`;

  const res = await fetch(`${pesapalBase()}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: webhookUrl, ipn_notification_type: "POST" }),
  });
  if (!res.ok) throw new Error(`IPN registration failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const ipnId = data.ipn_id || data.id;
  if (!ipnId) throw new Error(`No IPN ID in response: ${JSON.stringify(data)}`);
  return ipnId;
}

async function submitPesapalOrder(
  token: string,
  ipnId: string,
  orderPayload: Record<string, unknown>,
): Promise<{ redirect_url?: string; order_tracking_id?: string; raw: unknown }> {
  const res = await fetch(`${pesapalBase()}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...orderPayload, notification_id: ipnId }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pesapal order submission failed (${res.status}): ${text}`);
  const data = JSON.parse(text);
  return {
    redirect_url: data.redirect_url,
    order_tracking_id: data.order_tracking_id,
    raw: data,
  };
}

async function getPesapalTransactionStatus(
  token: string,
  orderTrackingId: string,
): Promise<{ status_code: number; payment_status_description: string; raw: unknown }> {
  const res = await fetch(
    `${pesapalBase()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`GetTransactionStatus failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return {
    status_code: data.status_code ?? 0,
    payment_status_description: data.payment_status_description || "PENDING",
    raw: data,
  };
}

// ─── Middleware: verify Supabase JWT and extract user ─────────────────────────

async function requireAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();
  if (!admin) {
    res.status(503).json({ error: "Auth service unavailable" });
    return;
  }
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as any).authUser = user;
  next();
}

// ─── POST /api/payments/initiate ──────────────────────────────────────────────

router.post("/payments/initiate", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  const bearerToken = authHeader.slice(7);

  const admin = getSupabaseAdmin();
  if (!admin) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  const { data: { user }, error: authError } = await admin.auth.getUser(bearerToken);
  if (authError || !user) {
    res.status(401).json({ error: "Invalid or expired token" });
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
      res.status(400).json({ error: "Invalid payment_method" });
      return;
    }

    const amountUsd = parseFloat((acoin_amount * 0.01).toFixed(2));
    const finalCurrency = (currency || "USD").toUpperCase();
    const merchantRef = `AFUCHAT-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, handle")
      .eq("id", user.id)
      .single();

    const displayName = ((profile as any)?.display_name || (profile as any)?.handle || "AfuChat User").trim();
    const nameParts = displayName.split(" ");
    const firstName = nameParts[0] || "AfuChat";
    const lastName = nameParts.slice(1).join(" ") || "User";

    const pesapalToken = await getPesapalToken();
    const ipnId = await getOrRegisterIPN(pesapalToken);

    // Build order payload based on payment method
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
        res.status(400).json({ error: "phone_number is required for mobile money" });
        return;
      }
      const normalizedPhone = phone.startsWith("+") ? phone.replace(/[^\d+]/g, "") : `+${phone.replace(/\D/g, "")}`;
      (baseOrder.billing_address as any).phone_number = normalizedPhone;
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
        res.status(400).json({ error: "Google Pay payment token is required" });
        return;
      }
      baseOrder.payment_method = "googlepay";
      baseOrder.google_pay_token = gpToken;
    }

    const { order_tracking_id, redirect_url, raw } = await submitPesapalOrder(
      pesapalToken,
      ipnId,
      baseOrder,
    );

    const { error: insertErr } = await admin.from("pesapal_orders").insert({
      user_id: user.id,
      merchant_reference: merchantRef,
      tracking_id: order_tracking_id || null,
      acoin_amount,
      amount_usd: amountUsd,
      currency: finalCurrency,
      status: "pending",
    });
    if (insertErr) {
      logger.warn({ insertErr }, "payments/initiate: DB insert failed");
    }

    logger.info({ merchantRef, userId: user.id, acoin_amount, payment_method }, "payment initiated");

    res.json({
      merchant_reference: merchantRef,
      order_tracking_id: order_tracking_id || null,
      redirect_url: redirect_url || null,
      status: "pending",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/initiate: unexpected error");
    res.status(500).json({ error: err?.message || "Payment initiation failed" });
  }
});

// ─── POST /api/payments/webhook — Pesapal IPN ─────────────────────────────────

router.post("/payments/webhook", async (req: Request, res: Response) => {
  const admin = getSupabaseAdmin();
  if (!admin) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  try {
    // Pesapal sends: { OrderMerchantReference, OrderTrackingId, OrderNotificationType, OrderPaymentStatus }
    const merchantRef: string =
      req.body?.OrderMerchantReference ||
      req.query?.OrderMerchantReference ||
      "";
    const trackingId: string =
      req.body?.OrderTrackingId ||
      req.query?.OrderTrackingId ||
      "";

    if (!merchantRef || !trackingId) {
      res.status(400).json({ error: "Missing OrderMerchantReference or OrderTrackingId" });
      return;
    }

    const { data: order } = await admin
      .from("pesapal_orders")
      .select("*")
      .eq("merchant_reference", merchantRef)
      .maybeSingle();

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.status === "completed") {
      res.json({ message: "Already processed" });
      return;
    }

    // Always re-verify with Pesapal (never trust IPN payload alone)
    const token = await getPesapalToken();
    const { status_code, payment_status_description } = await getPesapalTransactionStatus(token, trackingId);

    const COMPLETED = 1, FAILED = 2, REVERSED = 3, INVALID = 4;
    const statusDesc = payment_status_description.toUpperCase();

    if (status_code === COMPLETED || statusDesc === "COMPLETED") {
      const { error: updateErr } = await admin
        .from("pesapal_orders")
        .update({ status: "completed", tracking_id: trackingId })
        .eq("id", order.id)
        .eq("status", "pending");

      if (!updateErr) {
        const { error: rpcErr } = await admin.rpc("credit_acoin", {
          p_user_id: order.user_id,
          p_amount: order.acoin_amount,
        });
        if (rpcErr) {
          await admin.from("pesapal_orders").update({ status: "pending" }).eq("id", order.id);
          logger.error({ rpcErr }, "payments/webhook: credit_acoin RPC failed");
          res.status(500).json({ error: "Wallet credit failed, will retry" });
          return;
        }
        await admin.from("acoin_transactions").insert({
          user_id: order.user_id,
          amount: order.acoin_amount,
          transaction_type: "topup",
          metadata: {
            merchant_reference: merchantRef,
            tracking_id: trackingId,
            payment_provider: "pesapal",
          },
        });
        logger.info({ merchantRef, userId: order.user_id, acoin_amount: order.acoin_amount }, "payments/webhook: wallet credited");
      }

      res.json({ message: "Payment confirmed" });
    } else if ([FAILED, REVERSED, INVALID].includes(status_code) || ["FAILED", "REVERSED", "INVALID"].includes(statusDesc)) {
      await admin
        .from("pesapal_orders")
        .update({ status: "failed", tracking_id: trackingId })
        .eq("id", order.id);
      res.json({ message: "Payment failed" });
    } else {
      res.json({ message: "Payment pending" });
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/webhook: error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── GET /api/payments/status/:merchantRef ────────────────────────────────────

router.get("/payments/status/:merchantRef", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  const bearerToken = authHeader.slice(7);

  const admin = getSupabaseAdmin();
  if (!admin) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  const { data: { user }, error: authError } = await admin.auth.getUser(bearerToken);
  if (authError || !user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const { merchantRef } = req.params;
    const { data: order } = await admin
      .from("pesapal_orders")
      .select("status, acoin_amount, tracking_id, created_at")
      .eq("merchant_reference", merchantRef)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // If still pending and has a tracking ID, try to get live status from Pesapal
    if (order.status === "pending" && order.tracking_id) {
      try {
        const token = await getPesapalToken();
        const { status_code, payment_status_description } = await getPesapalTransactionStatus(token, order.tracking_id);
        const COMPLETED = 1, FAILED = 2, REVERSED = 3, INVALID = 4;
        const statusDesc = payment_status_description.toUpperCase();

        if (status_code === COMPLETED || statusDesc === "COMPLETED") {
          await admin.from("pesapal_orders").update({ status: "completed" }).eq("merchant_reference", merchantRef).eq("status", "pending");
          await admin.rpc("credit_acoin", { p_user_id: user.id, p_amount: order.acoin_amount });
          res.json({ status: "completed", acoin_amount: order.acoin_amount });
          return;
        } else if ([FAILED, REVERSED, INVALID].includes(status_code) || ["FAILED", "REVERSED", "INVALID"].includes(statusDesc)) {
          await admin.from("pesapal_orders").update({ status: "failed" }).eq("merchant_reference", merchantRef);
          res.json({ status: "failed", acoin_amount: order.acoin_amount });
          return;
        }
      } catch (pollErr: any) {
        logger.warn({ pollErr: pollErr?.message }, "payments/status: live poll failed, using DB status");
      }
    }

    res.json({ status: order.status, acoin_amount: order.acoin_amount });
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/status: error");
    res.status(500).json({ error: "Status check failed" });
  }
});

export default router;
