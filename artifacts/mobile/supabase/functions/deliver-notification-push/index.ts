import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SOCIAL_ANDROID_CHANNEL = "social_notifications_v1";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

type NotificationEvent = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  kind: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_route: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  message_id: string | null;
  push_attempts: number;
};

type PushDevice = {
  id: string;
  token: string;
  notification_preferences: Record<string, unknown> | null;
};

function encode(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(serviceAccount: Record<string, any>) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const keyData = String(serviceAccount.private_key)
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(keyData), (char) => char.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${encode(new Uint8Array(signature))}`,
  });
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error("FCM access token request failed");
  }
  return data.access_token as string;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 500);
  return String(value ?? "Push delivery failed").slice(0, 500);
}

async function setPushStatus(
  admin: ReturnType<typeof createClient>,
  id: string,
  status: "sent" | "skipped" | "failed",
  error?: string,
) {
  await admin.from("notification_events").update({
    push_status: status,
    push_sent_at: status === "sent" ? new Date().toISOString() : null,
    push_last_error: error ?? null,
  }).eq("id", id);
}

async function deliverEvent(
  admin: ReturnType<typeof createClient>,
  event: NotificationEvent,
  serviceAccountJson: string,
) {
  let serviceAccount: Record<string, any>;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error("Firebase service account is incomplete");
    }
  } catch (error) {
    await setPushStatus(admin, event.id, "failed", errorMessage(error));
    return { sent: 0, attempted: 0, status: "failed" };
  }

  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("id, token, notification_preferences")
    .eq("user_id", event.recipient_id)
    .eq("enabled", true);

  if (deviceError) {
    await setPushStatus(admin, event.id, "failed", "Could not load registered devices");
    return { sent: 0, attempted: 0, status: "failed" };
  }

  const eligibleDevices = ((devices ?? []) as PushDevice[]).filter((device) => {
    const prefs = device.notification_preferences ?? {};
    return prefs.social !== false && prefs.social_notifications !== false;
  });

  if (!eligibleDevices.length) {
    await setPushStatus(admin, event.id, "skipped");
    return { sent: 0, attempted: 0, status: "skipped" };
  }

  let bearer: string;
  try {
    bearer = await accessToken(serviceAccount);
  } catch (error) {
    await setPushStatus(admin, event.id, "failed", errorMessage(error));
    return { sent: 0, attempted: eligibleDevices.length, status: "failed" };
  }

  const metadata = event.metadata ?? {};
  const actorId = [
    event.actor_id,
    typeof metadata.actor_id === "string" ? metadata.actor_id : null,
    typeof metadata.follower_id === "string" ? metadata.follower_id : null,
  ].find((value): value is string => typeof value === "string" && value.length > 0) ?? "";
  const followBackEligible =
    event.kind === "follow" && metadata.follow_back_eligible === true;
  const categoryId = followBackEligible ? "social_follow" : "social";
  const data = Object.fromEntries(Object.entries({
    categoryId,
    notificationId: event.id,
    eventKind: event.kind,
    actorId,
    followerId: event.kind === "follow" ? actorId : "",
    followId: typeof metadata.follow_id === "string" ? metadata.follow_id : "",
    chatId: typeof metadata.chat_id === "string" ? metadata.chat_id : "",
    messageId: typeof metadata.message_id === "string" ? metadata.message_id : "",
    route: event.cta_route ?? "",
    entityId: event.entity_id ?? "",
  }).map(([key, value]) => [key, String(value ?? "")]));

  let sent = 0;
  for (const device of eligibleDevices) {
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: {
                title: event.title || "AfuChat",
                body: event.body || "Someone interacted with you.",
              },
              data,
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: SOCIAL_ANDROID_CHANNEL,
                  sound: "default",
                },
              },
              apns: {
                headers: {
                  "apns-push-type": "alert",
                  "apns-priority": "10",
                },
                payload: {
                  aps: {
                    sound: "default",
                    category: categoryId,
                  },
                },
              },
            },
          }),
        },
      );

      if (response.ok) {
        sent += 1;
        continue;
      }

      const body = await response.json().catch(() => ({}));
      const fcmCode = body?.error?.details?.[0]?.errorCode;
      if (fcmCode === "UNREGISTERED" || response.status === 404 || response.status === 410) {
        await admin.from("push_devices")
          .update({ enabled: false })
          .eq("id", device.id);
      }
      console.error("[deliver-notification-push] FCM delivery failed", {
        eventId: event.id,
        status: response.status,
        code: fcmCode ?? body?.error?.status ?? "UNKNOWN",
      });
    } catch (error) {
      console.error("[deliver-notification-push] FCM request failed", {
        eventId: event.id,
        message: errorMessage(error),
      });
    }
  }

  const status = sent > 0 ? "sent" : "failed";
  await setPushStatus(admin, event.id, status, sent > 0 ? undefined : "No device accepted the push");
  return { sent, attempted: eligibleDevices.length, status };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const firebaseServiceAccount =
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ??
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY") ??
    "";

  if (!url || !serviceRoleKey) {
    return json({ error: "Push delivery is not configured" }, 503);
  }

  const body = await request.json().catch(() => null);
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
  if (!eventId) return json({ error: "A notification event ID is required" }, 400);

  const admin = createClient(url, serviceRoleKey);
  const { data, error } = await admin.rpc("claim_notification_push_event", {
    p_event_id: eventId,
  });
  if (error) {
    console.error("[deliver-notification-push] claim failed", error.message);
    return json({ error: "Could not claim notification event" }, 500);
  }

  const event = (Array.isArray(data) ? data[0] : data) as NotificationEvent | null;
  if (!event) return json({ ok: true, sent: 0, status: "already-processed" });

  if (!firebaseServiceAccount) {
    await setPushStatus(admin, event.id, "failed", "Firebase service account is not configured in Supabase");
    return json({ ok: false, sent: 0, status: "failed", reason: "FCM is not configured" });
  }

  const result = await deliverEvent(admin, event, firebaseServiceAccount);
  return json({ ok: result.status !== "failed", ...result });
});
