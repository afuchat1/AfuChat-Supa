import {
  jsonResponse,
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
} from "./shared.ts";

const PREFIX = "/v1/chat/payments";
type PesapalResponse = Record<string, any>;

function apiBase(env: Env): string {
  return env.PESAPAL_ENV?.trim().toLowerCase() === "sandbox"
    ? "https://cybqa.pesapal.com/pesapalv3/api"
    : "https://pay.pesapal.com/v3/api";
}

function publicApiUrl(env: Env): string {
  return (env.PUBLIC_API_URL ?? "https://api.afuchat.com").replace(/\/+$/, "");
}

function encodePart(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePart(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

function merchantReference(
  userId: string,
  purpose: "donation" | "acoin_topup",
  amount: number,
): string {
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

function errorResponse(
  request: Request,
  requestId: string,
  message: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error: message, request_id: requestId }, status);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function getCallbackParams(request: Request): Promise<{
  trackingId: string;
  reference: string;
}> {
  const url = new URL(request.url);
  let trackingId = url.searchParams.get("OrderTrackingId") ??
    url.searchParams.get("orderTrackingId") ?? "";
  let reference = url.searchParams.get("OrderMerchantReference") ??
    url.searchParams.get("orderMerchantReference") ?? "";
  if (request.method === "POST" && (!trackingId || !reference)) {
    const form = await request.clone().formData().catch(() => null);
    trackingId ||= String(form?.get("OrderTrackingId") ?? form?.get("orderTrackingId") ?? "");
    reference ||= String(form?.get("OrderMerchantReference") ?? form?.get("orderMerchantReference") ?? "");
    if (!trackingId || !reference) {
      const body = await readBody(request);
      trackingId ||= typeof body.OrderTrackingId === "string" ? body.OrderTrackingId : "";
      reference ||= typeof body.OrderMerchantReference === "string" ? body.OrderMerchantReference : "";
    }
  }
  return { trackingId, reference };
}

async function checkTransaction(env: Env, trackingId: string): Promise<{
  response: Response;
  data: PesapalResponse | null;
}> {
  const token = await pesapalToken(env);
  const response = await fetch(
    `${apiBase(env)}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return {
    response,
    data: await response.json().catch(() => null) as PesapalResponse | null,
  };
}

function serviceHeaders(env: Env): Headers {
  const serviceKey = env.SUPABASE_SERVICE_KEY?.trim();
  if (!serviceKey) throw new Error("Supabase service key is not configured");
  return new Headers({
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Profile": "afuchat",
    "Content-Profile": "afuchat",
  });
}

async function serviceRest(
  env: Env,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const supabase = supabaseConfig(env);
  if (!supabase) throw new Error("Supabase is not configured");
  const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
    method,
    headers: serviceHeaders(env),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase request failed with HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

async function handleInitiate(request: Request, env: Env, requestId: string): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(request, requestId, "Method not allowed", 405);
  }
  const verified = await verifySharedSession(request, env, requestId);
  if (verified.response) return verified.response;
  const { user } = verified.session;
  if (!env.PESAPAL_IPN_ID?.trim()) {
    return errorResponse(request, requestId, "Payments are temporarily unavailable.", 503);
  }

  const body = await readBody(request);
  const purpose = body.purpose === "donation" ? "donation" : "acoin_topup";
  const amount = Number(body.acoin_amount);
  const usdAmount = Number(body.usd_amount);
  if (purpose === "donation" && (!Number.isFinite(usdAmount) || usdAmount < 1)) {
    return errorResponse(request, requestId, "A valid donation amount is required", 400);
  }
  const acoinAmount = purpose === "donation"
    ? (Number.isFinite(usdAmount) && usdAmount >= 1 ? Math.round(usdAmount * 100) : amount)
    : amount;
  if (!Number.isInteger(acoinAmount) || acoinAmount < 50 || acoinAmount > 2_000_000) {
    return errorResponse(request, requestId, "A valid amount between 50 and 2,000,000 ACoin is required", 400);
  }
  const email = user.email?.trim();
  if (!email) return errorResponse(request, requestId, "A verified email address is required for payment", 400);

  try {
    const token = await pesapalToken(env);
    const reference = merchantReference(user.id, purpose, acoinAmount);
    const submit = await fetch(`${apiBase(env)}/Transactions/SubmitOrderRequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: reference,
        currency: "USD",
        amount: purpose === "donation"
          ? Number(usdAmount.toFixed(2))
          : Number((acoinAmount / 100).toFixed(2)),
        description: purpose === "donation" ? "AfuChat donation" : `AfuChat ${acoinAmount} ACoin`,
        callback_url: `${publicApiUrl(env)}${PREFIX}/pesapal-callback`,
        notification_id: env.PESAPAL_IPN_ID,
        billing_address: {
          email_address: email,
          country_code: "UG",
          first_name: user.firstName ?? user.name?.split(/\s+/)[0] ?? "AfuChat",
          last_name: user.lastName ?? user.name?.split(/\s+/).slice(1).join(" ") ?? "User",
        },
      }),
    });
    const data = await submit.json().catch(() => null) as PesapalResponse | null;
    if (!submit.ok || typeof data?.redirect_url !== "string") {
      console.error("[afuchat-pesapal-initiate]", submit.status);
      return errorResponse(request, requestId, "Payment could not be initiated.", 502);
    }
    return privateJsonResponse(
      request,
      requestId,
      {
        redirect_url: data.redirect_url,
        order_tracking_id: data.order_tracking_id ?? null,
        merchant_reference: reference,
      },
      200,
    );
  } catch (error) {
    console.error("[afuchat-pesapal-initiate]", error instanceof Error ? error.message : "unknown error");
    return errorResponse(request, requestId, "Payments are temporarily unavailable.", 503);
  }
}

async function handleCallback(request: Request, env: Env, requestId: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return errorResponse(request, requestId, "Method not allowed", 405);
  }
  const { trackingId, reference } = await getCallbackParams(request);
  if (!trackingId || !reference) {
    return errorResponse(request, requestId, "Missing payment reference", 400);
  }

  try {
    const transaction = await checkTransaction(env, trackingId);
    return privateJsonResponse(
      request,
      requestId,
      {
        ok: transaction.response.ok,
        status: statusIsCompleted(transaction.data ?? {})
          ? "completed"
          : String(transaction.data?.payment_status_description ?? "pending").toLowerCase(),
        order_tracking_id: trackingId,
        merchant_reference: reference,
      },
      200,
    );
  } catch {
    return privateJsonResponse(
      request,
      requestId,
      { ok: false, status: "pending", order_tracking_id: trackingId, merchant_reference: reference },
      200,
    );
  }
}

async function handleIpn(request: Request, env: Env, requestId: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return errorResponse(request, requestId, "Method not allowed", 405);
  }
  const { trackingId, reference } = await getCallbackParams(request);
  if (!trackingId || !reference) {
    return errorResponse(request, requestId, "Missing payment reference", 400);
  }

  try {
    const transaction = await checkTransaction(env, trackingId);
    const parsed = parseMerchantReference(reference);
    if (
      transaction.response.ok &&
      statusIsCompleted(transaction.data ?? {}) &&
      parsed?.purpose === "acoin_topup"
    ) {
      const supabase = supabaseConfig(env);
      if (!supabase) throw new Error("Supabase is not configured");
      const existing = await serviceRest(
        env,
        `acoin_transactions?select=id&user_id=eq.${encodeURIComponent(parsed.userId)}&transaction_type=eq.pesapal_topup&metadata->>pesapal_tracking_id=eq.${encodeURIComponent(trackingId)}&limit=1`,
      ) as unknown[];
      if (!existing.length) {
        await serviceRest(env, "rpc/credit_acoin", "POST", {
          p_user_id: parsed.userId,
          p_amount: parsed.amount,
          p_reason: "Pesapal ACoin purchase",
        });
        await serviceRest(env, "acoin_transactions", "POST", {
          user_id: parsed.userId,
          amount: parsed.amount,
          transaction_type: "pesapal_topup",
          metadata: { pesapal_tracking_id: trackingId, merchant_reference: reference },
        });
      }
    }
    return jsonResponse(request, requestId, {
      orderNotificationId: env.PESAPAL_IPN_ID ?? "",
      orderTrackingId: trackingId,
      orderMerchantReference: reference,
    });
  } catch (error) {
    console.error("[afuchat-pesapal-ipn]", error instanceof Error ? error.message : "unknown error");
    return errorResponse(request, requestId, "Could not process payment notification", 502);
  }
}

export async function handlePayments(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const path = new URL(request.url).pathname;
  if (path === `${PREFIX}/pesapal-initiate`) {
    return handleInitiate(request, env, requestId);
  }
  if (path === `${PREFIX}/pesapal-callback`) {
    return handleCallback(request, env, requestId);
  }
  if (path === `${PREFIX}/pesapal-ipn`) {
    return handleIpn(request, env, requestId);
  }
  return privateJsonResponse(
    request,
    requestId,
    { error: "Payment route not found", request_id: requestId },
    404,
  );
}
