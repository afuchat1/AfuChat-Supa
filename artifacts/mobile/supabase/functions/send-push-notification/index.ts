import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const ANDROID_NOTIFICATION_CHANNELS = new Set([
  "messages_notifications_v1",
  "calls_notifications_v1",
  "social_notifications_v1",
  "commerce_notifications_v1",
]);
const DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID = "messages_notifications_v1";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

function encode(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(serviceAccount: any) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const keyData = serviceAccount.private_key.replace(/\\n/g, "\n")
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
  if (!response.ok || typeof data.access_token !== "string") throw new Error("FCM access token request failed");
  return data.access_token as string;
}

type SocialNotificationEvent = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  kind: string;
  title: string;
  body: string;
  cta_route: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
};

type SocialPushDevice = {
  id: string;
  token: string;
  notification_preferences: Record<string, unknown> | null;
};

async function setSocialPushStatus(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  status: "sent" | "skipped" | "failed",
  error?: string,
) {
  const { error: updateError } = await admin.from("notification_events").update({
    push_status: status,
    push_sent_at: status === "sent" ? new Date().toISOString() : null,
    push_last_error: error ?? null,
  }).eq("id", eventId);
  if (updateError) {
    console.error("[send-push] could not update social push status", updateError.message);
  }
}

async function dispatchSocialNotification(eventId: string) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const firebaseJson =
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ??
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY") ??
    "";
  if (!url || !serviceRoleKey) {
    return json({ error: "Push delivery is not configured" }, 503);
  }

  const admin = createClient(url, serviceRoleKey);
  const { data, error } = await admin.rpc("claim_notification_push_event", {
    p_event_id: eventId,
  });
  if (error) {
    console.error("[send-push] could not claim social notification", error.message);
    return json({ error: "Could not claim notification event" }, 500);
  }

  const event = (Array.isArray(data) ? data[0] : data) as SocialNotificationEvent | null;
  if (!event) return json({ ok: true, sent: 0, status: "already-processed" });

  if (!firebaseJson) {
    await setSocialPushStatus(admin, event.id, "failed", "Firebase service account is not configured in Supabase");
    return json({ ok: false, sent: 0, status: "failed", reason: "FCM is not configured" }, 503);
  }

  let serviceAccount: Record<string, any>;
  try {
    serviceAccount = JSON.parse(firebaseJson);
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error("Firebase service account is incomplete");
    }
  } catch {
    await setSocialPushStatus(admin, event.id, "failed", "Firebase service account is invalid");
    return json({ ok: false, sent: 0, status: "failed", reason: "FCM credentials are invalid" }, 503);
  }

  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("id, token, notification_preferences")
    .eq("user_id", event.recipient_id)
    .eq("enabled", true);
  if (deviceError) {
    await setSocialPushStatus(admin, event.id, "failed", "Could not load registered devices");
    return json({ ok: false, sent: 0, status: "failed" }, 500);
  }

  const eligibleDevices = ((devices ?? []) as SocialPushDevice[]).filter((device) => {
    const preferences = device.notification_preferences ?? {};
    return preferences.social !== false && preferences.social_notifications !== false;
  });
  if (!eligibleDevices.length) {
    await setSocialPushStatus(admin, event.id, "skipped");
    return json({ ok: true, sent: 0, attempted: 0, status: "skipped" });
  }

  let bearer: string;
  try {
    bearer = await accessToken(serviceAccount);
  } catch {
    await setSocialPushStatus(admin, event.id, "failed", "Could not authenticate with Firebase");
    return json({ ok: false, sent: 0, attempted: eligibleDevices.length, status: "failed" }, 502);
  }

  const metadata = event.metadata ?? {};
  const actorId = [
    event.actor_id,
    metadata.actor_id,
    metadata.follower_id,
    metadata.liker_id,
    metadata.replier_id,
  ].find((value): value is string => typeof value === "string" && value.length > 0) ?? "";
  const followBackEligible =
    event.kind === "follow" && metadata.follow_back_eligible === true;
  const categoryId = followBackEligible ? "social_follow" : "social";
  const pushData = Object.fromEntries(Object.entries({
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
              data: pushData,
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "social_notifications_v1",
                  sound: "default",
                },
              },
              apns: {
                headers: {
                  "apns-push-type": "alert",
                  "apns-priority": "10",
                },
                payload: {
                  aps: { sound: "default", category: categoryId },
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

      const responseBody = await response.json().catch(() => ({}));
      const fcmCode = responseBody?.error?.details?.[0]?.errorCode;
      if (fcmCode === "UNREGISTERED" || response.status === 404 || response.status === 410) {
        await admin.from("push_devices").update({ enabled: false }).eq("id", device.id);
      }
      console.error("[send-push] social FCM delivery failed", {
        eventId: event.id,
        status: response.status,
        code: fcmCode ?? responseBody?.error?.status ?? "UNKNOWN",
      });
    } catch (error) {
      console.error("[send-push] social FCM request failed", {
        eventId: event.id,
        message: error instanceof Error ? error.message.slice(0, 300) : "Unknown FCM error",
      });
    }
  }

  const status = sent > 0 ? "sent" : "failed";
  await setSocialPushStatus(
    admin,
    event.id,
    status,
    sent > 0 ? undefined : "No device accepted the push",
  );
  return json({ ok: sent > 0, sent, attempted: eligibleDevices.length, status });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await request.json().catch(() => null);
  if (typeof body?.eventId === "string") {
    const eventId = body.eventId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
      return json({ error: "A valid notification event ID is required" }, 400);
    }
    return await dispatchSocialNotification(eventId);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authorization required" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Keep compatibility with the existing Supabase secret name. Both names
  // are accepted so deployments do not require copying a private key again.
  const firebaseJson =
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ??
    Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY") ??
    "";
  if (!url || !anonKey || !serviceRoleKey || !firebaseJson) return json({ error: "FCM is not configured" }, 503);

  const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
  const authenticatedUserId = userData.user.id;
  if (body?.senderId !== authenticatedUserId) {
    return json({ error: "Sender does not match the authenticated user" }, 403);
  }
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : "message";
  if (!["message", "call", "social", "commerce"].includes(categoryId)) {
    return json({ error: "Unsupported notification category" }, 400);
  }
  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
  let authorizedCallRecipientId: string | null = null;
  if (categoryId === "message") {
    if (!chatId || !messageId) return json({ error: "A chat and message are required" }, 400);

    // Chat pushes may only be sent for a message owned by the authenticated
    // sender in a chat where that sender is a member.
    const { data: membership, error: membershipError } = await adminlessMembershipCheck(auth, chatId, authenticatedUserId);
    if (membershipError || !membership) return json({ error: "Not authorized for this chat" }, 403);
    const { data: ownMessage, error: messageError } = await auth
      .from("messages")
      .select("id")
      .eq("id", messageId)
      .eq("chat_id", chatId)
      .eq("sender_id", authenticatedUserId)
      .maybeSingle();
    if (messageError || !ownMessage) return json({ error: "Message is not owned by the authenticated user" }, 403);
  } else if (categoryId === "call") {
    const callId = typeof body?.callId === "string" ? body.callId.trim() : "";
    if (!callId || !chatId) {
      return json({ error: "A call ID is required" }, 400);
    }
    const { data: call, error: callError } = await auth
      .from("calls")
      .select("id, caller_id, callee_id, chat_id, status")
      .eq("id", callId)
      .maybeSingle();
    if (
      callError ||
      !call ||
      call.caller_id !== authenticatedUserId ||
      call.chat_id !== chatId ||
      call.status !== "ringing"
    ) {
      return json({ error: "Not authorized to notify this call recipient" }, 403);
    }
    authorizedCallRecipientId = call.callee_id;
  }

  const recipientIds = Array.isArray(body?.recipientUserIds)
    ? [...new Set(body.recipientUserIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
    : [];
  if (
    categoryId === "call" &&
    (recipientIds.length !== 1 || recipientIds[0] !== authorizedCallRecipientId)
  ) {
    return json({ error: "A call notification may only target its callee" }, 403);
  }
  if (!recipientIds.length) return json({ ok: true, sent: 0 });

  const admin = createClient(url, serviceRoleKey);
  let authorizedRecipientIds = new Set(recipientIds);
  if (chatId) {
    const { data: chatRecipients, error: recipientError } = await admin
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", chatId)
      .in("user_id", recipientIds);
    if (recipientError) return json({ error: "Could not verify chat recipients" }, 500);
    authorizedRecipientIds = new Set((chatRecipients ?? []).map((row) => row.user_id));
    if (authorizedRecipientIds.size !== recipientIds.length) {
      return json({ error: "One or more recipients are not members of this chat" }, 403);
    }
  }
  // Suppress message pushes while a recipient is actively viewing this chat.
  // Keep current push delivery working if presence lookup fails or its schema
  // has not been migrated yet.
  if (categoryId === "message" && chatId) {
    const now = Date.now();
    const { data: activePresence, error: presenceError } = await admin
      .from("active_chat_notification_presence")
      .select("user_id")
      .eq("chat_id", chatId)
      .gt("expires_at", new Date(now).toISOString())
      .lte("expires_at", new Date(now + 65_000).toISOString())
      .in("user_id", [...authorizedRecipientIds]);
    if (presenceError) {
      console.error("[send-push] active-chat presence lookup failed:", presenceError.message);
    } else {
      for (const presence of activePresence ?? []) {
        authorizedRecipientIds.delete(presence.user_id);
      }
    }
    if (authorizedRecipientIds.size === 0) {
      return json({ ok: true, sent: 0, attempted: 0, suppressed: "chat-active" });
    }
  }
  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("id, token")
    .in("user_id", [...authorizedRecipientIds])
    .eq("enabled", true);
  if (deviceError) return json({ error: "Could not load push devices" }, 500);

  const serviceAccount = JSON.parse(firebaseJson);
  const bearer = await accessToken(serviceAccount);
  const requestedChannelId = typeof body.channelId === "string" ? body.channelId : "";
  const androidChannelId = ANDROID_NOTIFICATION_CHANNELS.has(requestedChannelId)
    ? requestedChannelId
    : DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID;
  const data = Object.fromEntries(Object.entries({
    ...(body.data ?? {}),
    categoryId,
    chatId: body.chatId ?? "",
    messageId: body.messageId ?? "",
    notificationId: body.notificationId ?? "",
    route: body.route ?? "",
    entityId: body.entityId ?? "",
    callId: body.callId ?? "",
    callerId: body.callerId ?? body.senderId ?? "",
    callerName: body.callerName ?? body.senderName ?? "",
    callerAvatar: body.callerAvatar ?? body.senderAvatarUrl ?? "",
    senderName: body.senderName ?? "",
  }).map(([key, value]) => [key, String(value ?? "")]));
  let sent = 0;
  for (const device of devices ?? []) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: device.token,
           notification: {
             title: body.title || body.senderName || "AfuChat",
             body: body.body || "New message",
           },
          data,
          android: {
            priority: "HIGH",
            notification: {
              channel_id: androidChannelId,
              // Use the system notification sound. The channel above is
              // intentionally separate from older channels whose sound may
              // have been changed to a ringtone on an existing device.
              sound: "default",
              // Expo Notifications reads categoryId from the FCM data
              // payload and applies the registered Reply/Mark as read/Open
              // actions to the system notification.
            },
          },
          apns: {
            headers: {
              "apns-push-type": "alert",
              "apns-priority": "10",
            },
            payload: {
              aps: {
                "content-available": 1,
              },
            },
          },
        },
      }),
    });
    if (response.ok) sent += 1;
    else if ([404, 410].includes(response.status)) await admin.from("push_devices").update({ enabled: false }).eq("id", device.id);
  }
  return json({ ok: true, sent, attempted: devices?.length ?? 0 });
});

async function adminlessMembershipCheck(
  client: ReturnType<typeof createClient>,
  chatId: string,
  userId: string,
) {
  return await client
    .from("chat_members")
    .select("user_id")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();
}