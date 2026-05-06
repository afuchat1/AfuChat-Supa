/**
 * /api/payments/* — Direct Pesapal payment processing
 *
 * All logic runs inside this Express server — no Supabase edge function proxy,
 * no hosted checkout redirects. Every method (MTN, Airtel, card, Google Pay)
 * submits directly to Pesapal's SubmitOrderRequest API.
 *
 * For mobile money (MTN / Airtel): Pesapal pushes a USSD/STK prompt to the
 * user's phone the instant the order is submitted. No redirect URL is needed.
 *
 * POST /api/payments/initiate   — start a payment
 * POST /api/payments/webhook    — Pesapal IPN (called by Pesapal server)
 * GET  /api/payments/status/:merchantRef — poll order status
 */

import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../lib/constants";
import { logger } from "../lib/logger";

const router = Router();

// ─── Pesapal config (env vars injected at boot by bootstrap.ts) ───────────────

function getPesapalBase(): string {
  const env = (process.env.PESAPAL_ENV || "live").toLowerCase();
  return env === "sandbox"
    ? "https://cybqa.pesapal.com/pesapalv3"
    : "https://pay.pesapal.com/v3";
}

function getPesapalCreds() {
  return {
    consumerKey: process.env.PESAPAL_CONSUMER_KEY || "",
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET || "",
    ipnId: process.env.PESAPAL_IPN_ID || "",
  };
}

function getIpnUrl(): string {
  // Use explicit override first, then construct from Replit domain
  if (process.env.API_PUBLIC_URL) {
    return `${process.env.API_PUBLIC_URL.replace(/\/+$/, "")}/api/payments/webhook`;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0] || "";
  if (domain) return `https://${domain}/api/payments/webhook`;
  return "";
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function getAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
}

function getServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

async function verifyUser(bearerToken: string): Promise<{ id: string; email?: string } | null> {
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

function getAdminClient() {
  const key = getServiceKey();
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

// ─── Pesapal API helpers ──────────────────────────────────────────────────────

async function pesapalToken(): Promise<string> {
  const { consumerKey, consumerSecret } = getPesapalCreds();
  if (!consumerKey || !consumerSecret) {
    throw new Error("Pesapal credentials not configured. Set PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET.");
  }
  const res = await fetch(`${getPesapalBase()}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });
  if (!res.ok) throw new Error(`Pesapal auth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.token) throw new Error(`No token in Pesapal auth response`);
  return data.token;
}

async function getOrRegisterIpn(token: string): Promise<string> {
  const { ipnId } = getPesapalCreds();
  if (ipnId) return ipnId;

  const url = getIpnUrl();
  if (!url) {
    logger.warn("No IPN URL available — IPN registration skipped");
    return "";
  }

  const res = await fetch(`${getPesapalBase()}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url, ipn_notification_type: "POST" }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "IPN registration failed — continuing without IPN ID");
    return "";
  }
  const data = await res.json();
  const id = data.ipn_id || data.id || "";
  if (id) logger.info({ ipnId: id, url }, "IPN registered with Pesapal");
  return id;
}

async function submitOrder(token: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${getPesapalBase()}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pesapal order failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function getTransactionStatus(token: string, trackingId: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${getPesapalBase()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`GetTransactionStatus failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ─── POST /api/payments/initiate ─────────────────────────────────────────────

router.post("/payments/initiate", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const bearerToken = authHeader.slice(7);

  try {
    const user = await verifyUser(bearerToken);
    if (!user) {
      res.status(401).json({ error: "Session expired. Please sign in again." });
      return;
    }

    const { acoin_amount, currency, payment_method, payment_data } = req.body as {
      acoin_amount?: number;
      currency?: string;
      payment_method?: "google_pay" | "card" | "mtn" | "airtel";
      payment_data?: Record<string, string>;
    };

    if (!acoin_amount || typeof acoin_amount !== "number" || acoin_amount < 50) {
      res.status(400).json({ error: "Minimum top-up is 50 ACoin" });
      return;
    }

    const amount_usd = parseFloat((acoin_amount * 0.01).toFixed(2));
    const finalCurrency = (currency || "USD").toUpperCase();
    const merchantRef = `AFUCHAT-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;

    // Fetch user display name for billing address
    const admin = getAdminClient();
    let displayName = "AfuChat User";
    if (admin) {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, handle")
        .eq("id", user.id)
        .single();
      displayName = ((profile as any)?.display_name || (profile as any)?.handle || displayName).trim();
    }
    const nameParts = displayName.split(" ");
    const firstName = nameParts[0] || "AfuChat";
    const lastName = nameParts.slice(1).join(" ") || "User";

    // Auth with Pesapal + get IPN ID
    const token = await pesapalToken();
    const ipnId = await getOrRegisterIpn(token);

    // Base order payload — no callback_url needed for direct (non-redirect) flow
    const orderPayload: Record<string, unknown> = {
      id: merchantRef,
      currency: finalCurrency,
      amount: amount_usd,
      description: `${acoin_amount} ACoin top-up`,
      notification_id: ipnId,
      billing_address: {
        email_address: user.email || "",
        first_name: firstName,
        last_name: lastName,
      },
    };

    // ── Payment-method-specific fields ───────────────────────────────────────
    if (payment_method === "mtn" || payment_method === "airtel") {
      const phone = payment_data?.phone_number || "";
      if (!phone) {
        res.status(400).json({ error: "Phone number is required for mobile money" });
        return;
      }
      const normalized = phone.startsWith("+")
        ? phone.replace(/[^\d+]/g, "")
        : `+${phone.replace(/\D/g, "")}`;
      (orderPayload.billing_address as any).phone_number = normalized;
      // Pesapal sends USSD/STK push directly to the phone when payment_method is set
      orderPayload.payment_method = payment_method === "mtn" ? "MTN" : "AIRTEL";

    } else if (payment_method === "card") {
      const { number, expiry_month, expiry_year, cvv, name_on_card } = payment_data || {};
      if (!number || !expiry_month || !expiry_year || !cvv) {
        res.status(400).json({ error: "Card details are incomplete" });
        return;
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
        res.status(400).json({ error: "Google Pay token is required" });
        return;
      }
      orderPayload.payment_method = "googlepay";
      orderPayload.google_pay_token = gpToken;

    } else {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }

    logger.info(
      { merchantRef, userId: user.id, method: payment_method, acoin_amount, amount_usd },
      "Submitting order to Pesapal",
    );

    const orderData = await submitOrder(token, orderPayload);

    // Persist the order to Supabase
    if (admin) {
      const { error: insertErr } = await admin.from("pesapal_orders").insert({
        user_id: user.id,
        merchant_reference: merchantRef,
        tracking_id: (orderData.order_tracking_id as string) || null,
        acoin_amount,
        amount_usd,
        currency: finalCurrency,
        status: "pending",
      });
      if (insertErr) logger.error({ err: insertErr }, "pesapal_orders insert failed");
    } else {
      logger.warn("Supabase admin not configured — order not persisted to DB");
    }

    res.json({
      merchant_reference: merchantRef,
      order_tracking_id: orderData.order_tracking_id || null,
      status: "pending",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/initiate error");
    res.status(500).json({ error: err?.message || "Payment could not be started. Please try again." });
  }
});

// ─── POST /api/payments/webhook — Pesapal IPN ────────────────────────────────
// Pesapal calls this URL when a payment status changes. No JWT required.

const PESAPAL_STATUS = { PENDING: 0, COMPLETED: 1, FAILED: 2, REVERSED: 3, INVALID: 4 } as const;

router.post("/payments/webhook", async (req: Request, res: Response) => {
  try {
    const url = new URL(req.url, `http://localhost`);
    let orderTrackingId: string | null =
      url.searchParams.get("OrderTrackingId") ||
      req.body?.OrderTrackingId ||
      req.query?.OrderTrackingId ||
      null;
    let merchantReference: string | null =
      url.searchParams.get("OrderMerchantReference") ||
      req.body?.OrderMerchantReference ||
      req.query?.OrderMerchantReference ||
      null;

    logger.info({ orderTrackingId, merchantReference }, "[IPN] received");

    if (!orderTrackingId && !merchantReference) {
      res.status(400).json({ error: "Missing OrderTrackingId or OrderMerchantReference" });
      return;
    }

    const admin = getAdminClient();
    if (!admin) {
      logger.error("[IPN] Supabase admin not configured — cannot process IPN");
      res.status(503).json({ error: "Service unavailable" });
      return;
    }

    // Find the order
    let query = admin
      .from("pesapal_orders")
      .select("id, user_id, acoin_amount, merchant_reference, tracking_id, status");
    if (orderTrackingId) {
      query = query.eq("tracking_id", orderTrackingId) as any;
    } else {
      query = query.eq("merchant_reference", merchantReference!) as any;
    }
    let { data: order } = await query.maybeSingle();

    // Fallback: try merchant reference if tracking lookup found nothing
    if (!order && orderTrackingId && merchantReference) {
      const { data: fallback } = await admin
        .from("pesapal_orders")
        .select("id, user_id, acoin_amount, merchant_reference, tracking_id, status")
        .eq("merchant_reference", merchantReference)
        .maybeSingle();
      order = fallback;
    }

    if (!order) {
      logger.warn({ orderTrackingId, merchantReference }, "[IPN] order not found");
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Update tracking_id if missing
    const trackId = orderTrackingId || order.tracking_id;
    if (trackId && !order.tracking_id) {
      await admin.from("pesapal_orders").update({ tracking_id: trackId }).eq("id", order.id);
    }

    if (order.status === "completed") {
      res.json({ message: "Already processed" });
      return;
    }
    if (!trackId) {
      await admin.from("pesapal_orders").update({ status: "invalid" }).eq("id", order.id);
      res.status(400).json({ error: "No tracking ID" });
      return;
    }

    // Verify with Pesapal directly
    const token = await pesapalToken();
    const statusData = await getTransactionStatus(token, trackId);
    logger.info({ statusData }, "[IPN] Pesapal status");

    const statusCode: number = (statusData.status_code as number) ?? PESAPAL_STATUS.PENDING;
    const statusDesc = ((statusData.payment_status_description as string) || "").toUpperCase();

    if (statusCode === PESAPAL_STATUS.COMPLETED || statusDesc === "COMPLETED") {
      const { error: updateErr } = await admin
        .from("pesapal_orders")
        .update({ status: "completed", tracking_id: trackId })
        .eq("id", order.id)
        .eq("status", "pending");

      if (!updateErr) {
        const { error: rpcErr } = await admin.rpc("credit_acoin", {
          p_user_id: order.user_id,
          p_amount: order.acoin_amount,
        });
        if (rpcErr) {
          logger.error({ err: rpcErr }, "[IPN] credit_acoin failed");
          await admin.from("pesapal_orders").update({ status: "pending" }).eq("id", order.id);
          res.status(500).json({ error: "Wallet credit failed, will retry" });
          return;
        }
        await admin.from("acoin_transactions").insert({
          user_id: order.user_id,
          amount: order.acoin_amount,
          transaction_type: "topup",
          metadata: {
            merchant_reference: order.merchant_reference,
            tracking_id: trackId,
            payment_provider: "pesapal",
          },
        });
        logger.info({ userId: order.user_id, acoin: order.acoin_amount }, "[IPN] wallet credited");
      }
      res.json({ message: "Payment confirmed, wallet credited" });
    } else if (
      statusCode === PESAPAL_STATUS.FAILED ||
      statusCode === PESAPAL_STATUS.REVERSED ||
      statusCode === PESAPAL_STATUS.INVALID ||
      statusDesc === "FAILED" || statusDesc === "REVERSED" || statusDesc === "INVALID"
    ) {
      await admin.from("pesapal_orders").update({ status: "failed", tracking_id: trackId }).eq("id", order.id);
      res.json({ message: "Payment failed", pesapal_status: statusDesc });
    } else {
      res.json({ message: "Payment still pending", pesapal_status: statusDesc });
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "[IPN] error");
    res.status(500).json({ error: "IPN processing failed" });
  }
});

// GET also supported (Pesapal sometimes uses GET for IPN)
router.get("/payments/webhook", async (req: Request, res: Response) => {
  // Delegate to POST handler by re-invoking with same logic
  req.method = "POST";
  router.handle(req, res, () => {});
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
    const admin = getAdminClient();
    if (!admin) {
      res.status(503).json({ error: "Service unavailable" });
      return;
    }

    const { data: order } = await admin
      .from("pesapal_orders")
      .select("status, acoin_amount, tracking_id")
      .eq("merchant_reference", merchantRef)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json({ status: order.status, acoin_amount: order.acoin_amount });
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/status error");
    res.status(500).json({ error: "Status check failed" });
  }
});

export default router;
