import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const PESAPAL_CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY || "";
const PESAPAL_CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET || "";
const PESAPAL_BASE_URL = process.env.PESAPAL_ENV === "live"
  ? "https://pay.pesapal.com/v3"
  : "https://cybqa.pesapal.com/pesapalv3";

async function getPesapalToken(): Promise<string | null> {
  try {
    const res = await fetch(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        consumer_key: PESAPAL_CONSUMER_KEY,
        consumer_secret: PESAPAL_CONSUMER_SECRET,
      }),
    });
    const data = await res.json();
    return data.token || null;
  } catch {
    return null;
  }
}

router.post("/payments/pesapal/initiate", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let authenticatedUserId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (authUser) {
        authenticatedUserId = authUser.id;
      }
    }

    const { user_id, email, nexa_amount, acoin_amount, currency_type, price_usd, first_name, last_name } = req.body;
    const resolvedUserId = authenticatedUserId || user_id;
    const cType = currency_type || "nexa";
    const amount = cType === "acoin" ? (acoin_amount || 0) : (nexa_amount || 0);

    if (!resolvedUserId || !email || !amount || !price_usd) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (authenticatedUserId && user_id && authenticatedUserId !== user_id) {
      return res.status(403).json({ error: "User ID mismatch" });
    }

    let expectedPrice: number;
    if (cType === "acoin") {
      expectedPrice = amount <= 100 ? 2 : amount <= 500 ? 8 : amount <= 2000 ? 28 : amount <= 5000 ? 60 : amount <= 20000 ? 200 : Math.ceil(amount * 0.014 * 100) / 100;
    } else {
      expectedPrice = amount <= 500 ? 5 : amount <= 1500 ? 12 : amount <= 5000 ? 35 : amount <= 15000 ? 90 : amount <= 50000 ? 250 : Math.ceil(amount * 0.007 * 100) / 100;
    }
    if (Number(price_usd) < expectedPrice * 0.9) {
      return res.status(400).json({ error: "Invalid price for selected amount" });
    }

    if (!PESAPAL_CONSUMER_KEY || !PESAPAL_CONSUMER_SECRET) {
      return res.status(503).json({
        error: "Payment gateway not configured. Please contact support.",
        redirect_url: null,
      });
    }

    const token = await getPesapalToken();
    if (!token) {
      return res.status(500).json({ error: "Failed to authenticate with payment provider" });
    }

    const callbackBase = process.env.API_PUBLIC_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const orderId = `AFC-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const ipnRes = await fetch(`${PESAPAL_BASE_URL}/api/URLSetup/RegisterIPN`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: `${callbackBase}/api/payments/pesapal/ipn`,
        ipn_notification_type: "POST",
      }),
    });
    const ipnData = await ipnRes.json();
    const ipnId = ipnData.ipn_id;

    const orderRes = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: orderId,
        currency: "USD",
        amount: price_usd,
        description: `AfuChat Top Up - ${amount} ${cType === "acoin" ? "ACoin" : "Nexa"}`,
        callback_url: `${callbackBase}/api/payments/pesapal/callback`,
        notification_id: ipnId,
        billing_address: {
          email_address: email,
          first_name: first_name || "",
          last_name: last_name || "",
        },
      }),
    });

    const orderData = await orderRes.json();

    if (orderData.redirect_url) {
      await supabase.from("merchant_orders").insert({
        order_id: orderId,
        user_id: resolvedUserId,
        nexa_amount: cType === "nexa" ? amount : 0,
        acoin_amount: cType === "acoin" ? amount : 0,
        currency_type: cType,
        price_usd,
        status: "pending",
        tracking_id: orderData.order_tracking_id || null,
      });

      return res.json({
        redirect_url: orderData.redirect_url,
        order_id: orderId,
        tracking_id: orderData.order_tracking_id,
      });
    }

    return res.status(500).json({ error: "Failed to create payment order", details: orderData });
  } catch (err: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/payments/pesapal/ipn", async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference, OrderNotificationType } = req.body;

    if (OrderNotificationType === "COMPLETED" || OrderNotificationType === "IPNCOMPLETED") {
      const token = await getPesapalToken();
      if (!token) {
        return res.status(500).json({ error: "Auth failed" });
      }

      const statusRes = await fetch(
        `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${OrderTrackingId}`,
        { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }
      );
      const statusData = await statusRes.json();

      if (statusData.payment_status_description === "Completed") {
        const { data: order } = await supabase
          .from("merchant_orders")
          .select("*")
          .eq("tracking_id", OrderTrackingId)
          .single();

        if (order && order.status !== "completed") {
          await supabase.from("merchant_orders").update({ status: "completed" }).eq("id", order.id);

          const isAcoin = order.currency_type === "acoin";
          const creditAmount = isAcoin ? (order.acoin_amount || 0) : (order.nexa_amount || 0);
          const field = isAcoin ? "acoin" : "xp";

          const { data: profile } = await supabase
            .from("profiles")
            .select("xp, acoin")
            .eq("id", order.user_id)
            .single();

          if (profile) {
            await supabase.from("profiles").update({
              [field]: ((profile as any)[field] || 0) + creditAmount,
            }).eq("id", order.user_id);
          }

          await supabase.from("acoin_transactions").insert({
            user_id: order.user_id,
            amount: creditAmount,
            transaction_type: isAcoin ? "acoin_topup" : "topup",
            metadata: { order_id: order.order_id, tracking_id: OrderTrackingId, price_usd: order.price_usd, currency_type: order.currency_type || "nexa" },
          });
        }
      }
    }

    return res.json({ orderNotificationType: OrderNotificationType, orderTrackingId: OrderTrackingId });
  } catch {
    return res.status(500).json({ error: "IPN processing failed" });
  }
});

router.get("/payments/pesapal/callback", async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Payment Complete</title></head>
    <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;background:#000;color:#fff;">
      <div style="text-align:center;">
        <h1 style="color:#00C2CB;">Payment Received</h1>
        <p>Your ACoin balance will be updated shortly.</p>
        <p>You can close this window and return to AfuChat.</p>
      </div>
    </body>
    </html>
  `);
});

router.get("/payments/pesapal/success", (_req, res) => {
  res.json({ status: "completed" });
});

router.get("/payments/pesapal/cancel", (_req, res) => {
  res.json({ status: "cancelled" });
});

export default router;
