/**
 * /api/payments/* — Payment routes proxying to Supabase Edge Functions
 *
 * POST /api/payments/initiate
 *   Proxies to supabase/functions/pesapal-initiate which holds Pesapal
 *   credentials as Supabase secrets. Supports all payment methods:
 *   google_pay | card | mtn | airtel
 *
 * POST /api/payments/webhook
 *   Pesapal IPN — proxied to supabase/functions/pesapal-ipn
 *
 * GET /api/payments/status/:merchantRef
 *   Polls pesapal_orders table directly via Supabase admin client
 */

import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../lib/constants";
import { logger } from "../lib/logger";

const router = Router();

const EDGE_INITIATE = `${SUPABASE_URL}/functions/v1/pesapal-initiate`;
const EDGE_IPN = `${SUPABASE_URL}/functions/v1/pesapal-ipn`;

// ─── Supabase anon client for user auth verification ─────────────────────────

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

// ─── POST /api/payments/initiate ─────────────────────────────────────────────
// Proxy to the pesapal-initiate edge function which has the Pesapal credentials

router.post("/payments/initiate", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  try {
    const edgeRes = await fetch(EDGE_INITIATE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await edgeRes.json();

    if (!edgeRes.ok) {
      logger.warn({ status: edgeRes.status, err: data?.error }, "payments/initiate edge error");
      res.status(edgeRes.status).json(data);
      return;
    }

    logger.info({ merchantRef: data.merchant_reference }, "payment initiated via edge function");
    res.json(data);
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/initiate proxy error");
    res.status(500).json({ error: err?.message || "Payment could not be started. Please try again." });
  }
});

// ─── POST /api/payments/webhook — Pesapal IPN ────────────────────────────────
// Forward the IPN from Pesapal to the edge function that has the credentials

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

    // Build the IPN URL with query params the same way Pesapal sends them
    const ipnUrl = new URL(EDGE_IPN);
    if (trackingId) ipnUrl.searchParams.set("OrderTrackingId", trackingId);
    if (merchantRef) ipnUrl.searchParams.set("OrderMerchantReference", merchantRef);

    const edgeRes = await fetch(ipnUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await edgeRes.json().catch(() => ({}));
    logger.info({ merchantRef, trackingId, status: edgeRes.status }, "IPN forwarded to edge function");
    res.status(edgeRes.ok ? 200 : edgeRes.status).json(data);
  } catch (err: any) {
    logger.error({ err: err?.message }, "payments/webhook proxy error");
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
    const admin = getSupabaseAdmin();
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
