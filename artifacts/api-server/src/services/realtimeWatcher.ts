import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import {
  emailUserTicketCreated,
  emailStaffNewTicket,
  emailUserStaffReply,
  emailNewDeviceLogin,
  emailOrderPlaced,
  emailOrderShipped,
  emailOrderDelivered,
  emailAcoinTransaction,
} from "../lib/email";

// ─── Expo Push Helper ──────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default";
  badge?: number;
  priority?: "high" | "normal";
  channelId?: string;
}

async function sendExpoPush(
  admin: ReturnType<typeof createClient>,
  recipientUserIds: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  prefFilter: (pref: Record<string, unknown>) => boolean = () => true
): Promise<void> {
  if (recipientUserIds.length === 0) return;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, expo_push_token")
    .in("id", recipientUserIds)
    .not("expo_push_token", "is", null);

  if (!profiles || profiles.length === 0) return;

  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("user_id, push_enabled, push_messages, push_likes, push_follows, push_gifts, push_mentions, push_replies")
    .in("user_id", recipientUserIds);

  const prefMap = new Map<string, Record<string, unknown>>();
  for (const p of prefs || []) prefMap.set((p as any).user_id, p as any);

  const tokenToUserId = new Map<string, string>();
  const tokens: string[] = [];

  for (const profile of profiles as any[]) {
    const pref = prefMap.get(profile.id) || {};
    if ((pref as any).push_enabled === false) continue;
    if (!prefFilter(pref)) continue;
    tokens.push(profile.expo_push_token);
    tokenToUserId.set(profile.expo_push_token, profile.id);
  }

  if (tokens.length === 0) return;

  const messages: ExpoMessage[] = tokens.map((token) => ({
    to: token,
    title: title.substring(0, 100),
    body: body.substring(0, 200),
    data,
    sound: "default",
    badge: 1,
    priority: "high",
    channelId: "default",
  }));

  const chunks: ExpoMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  const invalidTokens: string[] = [];

  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        const result = await res.json();
        (result.data || []).forEach((ticket: any, idx: number) => {
          if (ticket.status === "ok") {
            logger.info({ recipient: chunk[idx]?.to?.slice(-12) }, "[push] Sent");
          } else if (ticket.details?.error === "DeviceNotRegistered") {
            const t = chunk[idx]?.to;
            if (t) invalidTokens.push(t);
          }
        });
      } else {
        logger.error({ status: res.status }, "[push] Expo API error");
      }
    } catch (err) {
      logger.error(err, "[push] fetch error");
    }
  }

  if (invalidTokens.length > 0) {
    const staleIds = invalidTokens.map((t) => tokenToUserId.get(t)).filter(Boolean) as string[];
    if (staleIds.length > 0) {
      await admin.from("profiles").update({ expo_push_token: null }).in("id", staleIds);
      logger.info({ count: staleIds.length }, "[push] Cleared stale token(s)");
    }
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let watcherStarted = false;

export function startRealtimeWatcher() {
  if (watcherStarted || !supabaseUrl || !serviceKey) {
    if (!supabaseUrl || !serviceKey) {
      logger.warn("[watcher] Missing Supabase config — email watcher not started");
    }
    return;
  }
  watcherStarted = true;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logger.info("[watcher] Starting Supabase realtime watcher");

  // ── Support Tickets ────────────────────────────────────────────────────
  admin
    .channel("support-tickets-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets" }, async (payload) => {
      const ticket = payload.new as any;
      logger.info({ ticketId: ticket.id }, "[watcher] New support ticket");

      // Fetch user profile for display name
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, handle, email:id")
        .eq("id", ticket.user_id)
        .single();

      // Fetch first message (the user's initial message)
      await new Promise((r) => setTimeout(r, 1000)); // wait a bit for messages to be inserted
      const { data: messages } = await admin
        .from("support_messages")
        .select("message")
        .eq("ticket_id", ticket.id)
        .eq("sender_type", "user")
        .order("created_at", { ascending: true })
        .limit(1);

      const preview = messages?.[0]?.message || "(no message)";
      const userName = (profile as any)?.display_name || (profile as any)?.handle || "User";

      // Email user confirmation
      if (ticket.email) {
        emailUserTicketCreated({
          to: ticket.email,
          ticketId: ticket.id,
          subject: ticket.subject,
          category: ticket.category,
          preview,
        }).catch((e) => logger.error(e, "[watcher] emailUserTicketCreated failed"));
      }

      // Email support staff
      emailStaffNewTicket({
        ticketId: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        userEmail: ticket.email,
        userName,
        preview,
      }).catch((e) => logger.error(e, "[watcher] emailStaffNewTicket failed"));
    })
    .subscribe();

  // ── Support Messages (staff replies → email user) ──────────────────────
  admin
    .channel("support-messages-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, async (payload) => {
      const msg = payload.new as any;
      if (msg.sender_type !== "staff" || msg.is_internal) return;

      logger.info({ msgId: msg.id, ticketId: msg.ticket_id }, "[watcher] Staff replied to ticket");

      const { data: ticket } = await admin
        .from("support_tickets")
        .select("email, subject, user_id")
        .eq("id", msg.ticket_id)
        .single();

      if (!ticket?.email) return;

      const { data: staffProfile } = await admin
        .from("profiles")
        .select("display_name, handle")
        .eq("id", msg.sender_id)
        .single();

      const staffName = (staffProfile as any)?.display_name || (staffProfile as any)?.handle || "AfuChat Support";

      emailUserStaffReply({
        to: (ticket as any).email,
        ticketId: msg.ticket_id,
        ticketSubject: (ticket as any).subject,
        staffName,
        replyText: msg.message,
      }).catch((e) => logger.error(e, "[watcher] emailUserStaffReply failed"));
    })
    .subscribe();

  // ── Device Sessions (new device → email user) ──────────────────────────
  admin
    .channel("device-sessions-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_device_sessions" }, async (payload) => {
      const session = payload.new as any;
      logger.info({ userId: session.user_id }, "[watcher] New device session");

      // Get user email from auth
      const { data: { user } } = await admin.auth.admin.getUserById(session.user_id);
      if (!user?.email) return;

      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, handle")
        .eq("id", session.user_id)
        .single();

      const userName = (profile as any)?.display_name || (profile as any)?.handle || "there";

      emailNewDeviceLogin({
        to: user.email,
        userName,
        deviceName: session.device_name || "Unknown device",
        deviceOs: session.device_os || "Unknown OS",
        city: session.city,
        country: session.country,
        time: new Date(session.created_at).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "full", timeStyle: "short" }) + " UTC",
      }).catch((e) => logger.error(e, "[watcher] emailNewDeviceLogin failed"));
    })
    .subscribe();

  // ── Shop Orders (new order → email buyer) ─────────────────────────────
  admin
    .channel("shop-orders-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "shop_orders" }, async (payload) => {
      const order = payload.new as any;
      logger.info({ orderId: order.id }, "[watcher] New shop order");

      await new Promise((r) => setTimeout(r, 500));

      const { data: buyer } = await admin.auth.admin.getUserById(order.buyer_id);
      const { data: buyerProfile } = await admin.from("profiles").select("display_name, handle").eq("id", order.buyer_id).single();
      const { data: product } = await admin.from("shop_products").select("title").eq("id", order.product_id).single();
      const { data: shop } = await admin.from("shops").select("name").eq("id", order.shop_id).single();

      if (!buyer.user?.email) return;

      emailOrderPlaced({
        to: buyer.user.email,
        buyerName: (buyerProfile as any)?.display_name || "there",
        orderId: order.id,
        productName: (product as any)?.title || "Product",
        amount: order.escrowed_acoin || 0,
        sellerName: (shop as any)?.name || "the seller",
      }).catch((e) => logger.error(e, "[watcher] emailOrderPlaced failed"));
    })
    .subscribe();

  // ── Shop Orders (status=shipped → email buyer) ─────────────────────────
  admin
    .channel("shop-orders-shipped-watcher")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shop_orders", filter: "status=eq.shipped" }, async (payload) => {
      const order = payload.new as any;
      if (!order.seller_confirmed_at) return;
      logger.info({ orderId: order.id }, "[watcher] Order shipped");

      const { data: buyer } = await admin.auth.admin.getUserById(order.buyer_id);
      const { data: buyerProfile } = await admin.from("profiles").select("display_name").eq("id", order.buyer_id).single();
      const { data: product } = await admin.from("shop_products").select("title").eq("id", order.product_id).single();
      const { data: shop } = await admin.from("shops").select("name").eq("id", order.shop_id).single();

      if (!buyer.user?.email) return;

      emailOrderShipped({
        to: buyer.user.email,
        buyerName: (buyerProfile as any)?.display_name || "there",
        orderId: order.id,
        productName: (product as any)?.title || "Product",
        sellerName: (shop as any)?.name || "the seller",
      }).catch((e) => logger.error(e, "[watcher] emailOrderShipped failed"));
    })
    .subscribe();

  // ── Shop Orders (status=delivered → email seller) ─────────────────────
  admin
    .channel("shop-orders-delivered-watcher")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shop_orders", filter: "status=eq.delivered" }, async (payload) => {
      const order = payload.new as any;
      logger.info({ orderId: order.id }, "[watcher] Order delivered, releasing to seller");

      const { data: shop } = await admin.from("shops").select("name, seller_id").eq("id", order.shop_id).single();
      if (!(shop as any)?.seller_id) return;

      const { data: seller } = await admin.auth.admin.getUserById((shop as any).seller_id);
      const { data: sellerProfile } = await admin.from("profiles").select("display_name").eq("id", (shop as any).seller_id).single();
      const { data: product } = await admin.from("shop_products").select("title").eq("id", order.product_id).single();

      if (!seller.user?.email) return;

      emailOrderDelivered({
        to: seller.user.email,
        sellerName: (sellerProfile as any)?.display_name || "there",
        orderId: order.id,
        productName: (product as any)?.title || "Product",
        amount: order.escrowed_acoin || 0,
      }).catch((e) => logger.error(e, "[watcher] emailOrderDelivered failed"));
    })
    .subscribe();

  // ── ACoin Transactions ─────────────────────────────────────────────────
  admin
    .channel("acoin-transactions-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "acoin_transactions" }, async (payload) => {
      const txn = payload.new as any;
      if (!["transfer", "gift"].includes(txn.type)) return;
      logger.info({ txnId: txn.id, type: txn.type }, "[watcher] ACoin transaction");

      const sendEmailForUser = async (userId: string, type: "sent" | "received", counterpartId: string) => {
        const { data: user } = await admin.auth.admin.getUserById(userId);
        if (!user.user?.email) return;
        const { data: profile } = await admin.from("profiles").select("display_name, handle").eq("id", userId).single();
        const { data: counterpart } = await admin.from("profiles").select("display_name, handle").eq("id", counterpartId).single();
        const userName = (profile as any)?.display_name || (profile as any)?.handle || "there";
        const counterpartName = (counterpart as any)?.display_name || (counterpart as any)?.handle || "someone";

        emailAcoinTransaction({
          to: user.user.email,
          userName,
          type,
          amount: Math.abs(txn.amount),
          counterpartName,
          note: txn.note || txn.description,
        }).catch((e) => logger.error(e, "[watcher] emailAcoinTransaction failed"));
      };

      if (txn.user_id) sendEmailForUser(txn.user_id, "sent", txn.related_user_id).catch(() => {});
      if (txn.related_user_id) sendEmailForUser(txn.related_user_id, "received", txn.user_id).catch(() => {});
    })
    .subscribe();

  // ── Chat Messages → Push Notifications ────────────────────────────────────
  // Dedup guard: realtime can occasionally deliver the same event twice
  const recentMsgIds = new Set<string>();

  admin
    .channel("messages-push-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
      const msg = payload.new as any;
      if (!msg.sender_id || !msg.chat_id) return;
      if (recentMsgIds.has(msg.id)) return;
      recentMsgIds.add(msg.id);
      setTimeout(() => recentMsgIds.delete(msg.id), 30_000);

      try {
        const [{ data: sender }, { data: chat }] = await Promise.all([
          admin.from("profiles").select("display_name, handle").eq("id", msg.sender_id).single(),
          admin.from("chats").select("name, is_group, is_system_notifications").eq("id", msg.chat_id).single(),
        ]);

        if (!chat) return;
        if ((chat as any).is_system_notifications) return;

        const { data: members } = await admin
          .from("chat_members")
          .select("user_id")
          .eq("chat_id", msg.chat_id)
          .neq("user_id", msg.sender_id);

        if (!members || members.length === 0) return;

        const senderName = (sender as any)?.display_name || (sender as any)?.handle || "Someone";
        const title = (chat as any).is_group
          ? `${senderName} in ${(chat as any).name || "a group"}`
          : senderName;

        let body: string;
        if (msg.audio_url) {
          body = "🎤 Voice message";
        } else if (msg.attachment_type) {
          const typeMap: Record<string, string> = { image: "📷 Photo", video: "🎥 Video", file: "📎 File" };
          body = typeMap[msg.attachment_type] || "📎 Attachment";
        } else {
          const text = (msg.encrypted_content || "").trim();
          body = text.length > 120 ? text.slice(0, 120) + "…" : text || "New message";
        }

        const recipientIds = (members as any[]).map((m) => m.user_id);
        logger.info({ chatId: msg.chat_id, recipients: recipientIds.length }, "[push] New message push");

        await sendExpoPush(
          admin,
          recipientIds,
          title,
          body,
          { chatId: msg.chat_id, type: "message" },
          (pref) => (pref as any).push_messages !== false
        );
      } catch (err) {
        logger.error(err, "[push] Message push failed");
      }
    })
    .subscribe();

  // ── Social Notifications → Push Notifications ─────────────────────────────
  const recentNotifIds = new Set<string>();

  const SOCIAL_PUSH_TITLES: Record<string, string> = {
    new_like: "New Like",
    new_follow: "New Follower",
    new_comment: "New Comment",
    reply: "New Reply",
    mention: "Mentioned You",
    new_gift: "You received a gift",
  };

  const SOCIAL_PREF_KEY: Record<string, string> = {
    new_like: "push_likes",
    new_follow: "push_follows",
    new_comment: "push_replies",
    reply: "push_replies",
    mention: "push_mentions",
    new_gift: "push_gifts",
  };

  admin
    .channel("notifications-push-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, async (payload) => {
      const notif = payload.new as any;
      if (!notif.user_id || !notif.actor_id || !notif.type) return;
      if (recentNotifIds.has(notif.id)) return;
      recentNotifIds.add(notif.id);
      setTimeout(() => recentNotifIds.delete(notif.id), 30_000);

      const pushTitle = SOCIAL_PUSH_TITLES[notif.type];
      if (!pushTitle) return; // unknown notification type, skip

      try {
        const { data: actor } = await admin
          .from("profiles")
          .select("display_name, handle")
          .eq("id", notif.actor_id)
          .single();

        const actorName = (actor as any)?.display_name || (actor as any)?.handle || "Someone";

        const bodyMap: Record<string, string> = {
          new_like: `${actorName} liked your post`,
          new_follow: `${actorName} started following you`,
          new_comment: `${actorName} commented on your post`,
          reply: `${actorName} replied to your comment`,
          mention: `${actorName} mentioned you`,
          new_gift: `${actorName} sent you a gift`,
        };
        const body = bodyMap[notif.type] || pushTitle;
        const prefKey = SOCIAL_PREF_KEY[notif.type] || "push_enabled";

        logger.info({ type: notif.type, recipient: notif.user_id }, "[push] Social notif push");

        await sendExpoPush(
          admin,
          [notif.user_id],
          pushTitle,
          body,
          { type: notif.type, postId: notif.post_id || "", actorId: notif.actor_id },
          (pref) => (pref as any)[prefKey] !== false
        );
      } catch (err) {
        logger.error(err, "[push] Social notification push failed");
      }
    })
    .subscribe();

  logger.info("[watcher] All realtime channels subscribed");
}
