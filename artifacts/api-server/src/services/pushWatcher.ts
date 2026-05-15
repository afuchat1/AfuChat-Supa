/**
 * Server-side push notification watcher.
 *
 * Listens to Supabase realtime postgres_changes on three tables:
 *   • messages       → push to every chat member except the sender
 *   • calls          → push to the callee with accept/decline action buttons
 *   • notifications  → push to the recipient based on notification type
 *
 * All pushes come from this always-running Express server, so they are
 * delivered even when the sender's app is closed.
 */

import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { sendPush } from "../lib/push";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../lib/constants";

// Notification category identifiers — must match pushNotifications.ts on mobile
const CAT = {
  MESSAGE_REPLY:   "afuchat_message_reply",
  POST_INTERACT:   "afuchat_post_interact",
  NEW_FOLLOWER:    "afuchat_new_follower",
  ORDER_UPDATE:    "afuchat_order_update",
  ORDER_SHIPPED:   "afuchat_order_shipped",
  INCOMING_CALL:   "afuchat_incoming_call",
  GIFT_RECEIVED:   "afuchat_gift_received",
  MENTION:         "afuchat_mention",
} as const;

let started = false;

export function startPushWatcher() {
  if (started || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      logger.warn("[push-watcher] Missing Supabase config — push watcher not started");
    }
    return;
  }
  started = true;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  logger.info("[push-watcher] Starting push notification watchers");

  // ── Chat Messages ──────────────────────────────────────────────────────
  admin
    .channel("push-messages-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
      const msg = payload.new as any;
      if (!msg?.chat_id || !msg?.sender_id) return;

      try {
        // Get sender name
        const { data: sender } = await admin
          .from("profiles")
          .select("display_name, handle")
          .eq("id", msg.sender_id)
          .single();

        const senderName = (sender as any)?.display_name || (sender as any)?.handle || "Someone";

        // Get all chat members except sender
        const { data: members } = await admin
          .from("chat_members")
          .select("user_id")
          .eq("chat_id", msg.chat_id)
          .neq("user_id", msg.sender_id);

        if (!members?.length) return;

        // Get chat info (is_group, name)
        const { data: chat } = await admin
          .from("chats")
          .select("is_group, name")
          .eq("id", msg.chat_id)
          .single();

        const isGroup = (chat as any)?.is_group || false;
        const groupName = (chat as any)?.name;

        const title = isGroup ? `${senderName} in ${groupName || "Group"}` : senderName;
        const rawBody = (msg.encrypted_content || msg.content || "").trim();
        const body = rawBody.length > 0
          ? (rawBody.length > 100 ? rawBody.substring(0, 97) + "…" : rawBody)
          : "Sent an attachment";

        for (const member of members) {
          sendPush({
            userId: member.user_id,
            title,
            body,
            data: {
              type: "message",
              chatId: msg.chat_id,
              actorId: msg.sender_id,
              notifType: "new_message",
            },
            categoryIdentifier: CAT.MESSAGE_REPLY,
          }).catch(() => {});
        }

        logger.info({ chatId: msg.chat_id, recipients: members.length }, "[push-watcher] message push sent");
      } catch (err) {
        logger.error({ err, msgId: msg.id }, "[push-watcher] message push failed");
      }
    })
    .subscribe();

  // ── Incoming Calls ─────────────────────────────────────────────────────
  admin
    .channel("push-calls-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls" }, async (payload) => {
      const call = payload.new as any;
      if (!call?.callee_id || !call?.caller_id) return;

      try {
        const { data: caller } = await admin
          .from("profiles")
          .select("display_name, handle")
          .eq("id", call.caller_id)
          .single();

        const callerName = (caller as any)?.display_name || (caller as any)?.handle || "Someone";
        const callType = call.call_type === "video" ? "Video" : "Voice";

        await sendPush({
          userId: call.callee_id,
          title: `Incoming ${callType} Call`,
          body: `${callerName} is calling you`,
          data: {
            type: "call",
            callId: call.id,
            callType: call.call_type || "voice",
            actorId: call.caller_id,
            notifType: "call",
            url: `/call/${call.id}`,
          },
          categoryIdentifier: CAT.INCOMING_CALL,
        });

        logger.info({ callId: call.id, calleeId: call.callee_id }, "[push-watcher] call push sent");
      } catch (err) {
        logger.error({ err, callId: call.id }, "[push-watcher] call push failed");
      }
    })
    .subscribe();

  // ── Social / System Notifications Table ───────────────────────────────
  // The mobile app inserts into this table for follows, likes, replies,
  // mentions, gifts, orders, etc.  We push based on the row's type.
  admin
    .channel("push-notifications-watcher")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, async (payload) => {
      const notif = payload.new as any;
      if (!notif?.user_id || !notif?.type) return;

      // Skip call/message types — handled by their own watchers above
      if (notif.type === "call" || notif.type === "new_message") return;

      try {
        // Look up actor name if present
        let actorName = "Someone";
        if (notif.actor_id) {
          const { data: actor } = await admin
            .from("profiles")
            .select("display_name, handle")
            .eq("id", notif.actor_id)
            .single();
          actorName = (actor as any)?.display_name || (actor as any)?.handle || "Someone";
        }

        const { title, body, category, data } = buildNotifContent(notif, actorName);
        if (!title || !body) return;

        await sendPush({
          userId: notif.user_id,
          title,
          body,
          data,
          categoryIdentifier: category,
        });

        logger.info({ notifId: notif.id, type: notif.type }, "[push-watcher] notification push sent");
      } catch (err) {
        logger.error({ err, notifId: notif.id }, "[push-watcher] notification push failed");
      }
    })
    .subscribe();

  logger.info("[push-watcher] All push channels subscribed");
}

type NotifContent = {
  title: string;
  body: string;
  category: string;
  data: Record<string, string>;
};

function buildNotifContent(notif: any, actorName: string): NotifContent {
  const postId   = notif.post_id    || "";
  const actorId  = notif.actor_id   || "";
  const refId    = notif.reference_id || "";

  switch (notif.type) {
    case "new_like":
      return {
        title: "Post Liked ❤️",
        body: `${actorName} liked your post`,
        category: CAT.POST_INTERACT,
        data: { type: "like",    postId, actorId, notifType: "new_like" },
      };
    case "new_follower":
      return {
        title: "New Follower",
        body: `${actorName} started following you`,
        category: CAT.NEW_FOLLOWER,
        data: { type: "follow",  actorId, notifType: "new_follower" },
      };
    case "new_reply":
      return {
        title: actorName,
        body: "Replied to your post",
        category: CAT.POST_INTERACT,
        data: { type: "reply",   postId, actorId, notifType: "new_reply" },
      };
    case "new_mention":
      return {
        title: `${actorName} mentioned you`,
        body: "You were mentioned in a post",
        category: CAT.MENTION,
        data: { type: "mention", postId, actorId, notifType: "new_mention" },
      };
    case "gift":
      return {
        title: "Gift Received! 🎁",
        body: `${actorName} sent you a gift`,
        category: CAT.GIFT_RECEIVED,
        data: { type: "gift",    actorId, notifType: "gift" },
      };
    case "order_placed":
      return {
        title: "New Order Received! 🛍️",
        body: `${actorName} placed a new order`,
        category: CAT.ORDER_UPDATE,
        data: { type: "order",   orderId: refId, actorId, notifType: "order_placed", url: `/shop/order/${refId}` },
      };
    case "order_shipped":
      return {
        title: "Your Order Has Shipped! 📦",
        body: `${actorName} shipped your order`,
        category: CAT.ORDER_SHIPPED,
        data: { type: "order",   orderId: refId, actorId, notifType: "order_shipped", url: `/shop/order/${refId}` },
      };
    case "escrow_released":
      return {
        title: "Payment Released! 💰",
        body: `${actorName} confirmed delivery — funds released`,
        category: CAT.ORDER_UPDATE,
        data: { type: "escrow",  orderId: refId, actorId, notifType: "escrow_released", url: `/shop/order/${refId}` },
      };
    case "dispute_raised":
      return {
        title: "Order Dispute Opened ⚠️",
        body: `${actorName} raised a dispute`,
        category: CAT.ORDER_UPDATE,
        data: { type: "order",   orderId: refId, actorId, notifType: "dispute_raised", url: `/shop/order/${refId}` },
      };
    case "refund_issued":
      return {
        title: "Refund Issued ✅",
        body: "Your refund has been returned to your AfuPay wallet",
        category: CAT.ORDER_UPDATE,
        data: { type: "payment", orderId: refId, notifType: "refund_issued", url: `/shop/order/${refId}` },
      };
    case "acoin_received":
      return {
        title: "ACoins Received 💰",
        body: notif.body || "ACoins have been credited to your wallet",
        category: "",
        data: { type: "payment", notifType: "acoin_received", url: "/me" },
      };
    case "seller_approved":
      return {
        title: "Seller Application Approved! 🎉",
        body: "You can now list products on AfuMarket",
        category: "",
        data: { type: "system", notifType: "seller_approved", url: "/shop/manage" },
      };
    case "verification_approved":
      return {
        title: "Verification Approved ✅",
        body: "Your verified badge is now live on your profile",
        category: "",
        data: { type: "system", notifType: "verification_approved", url: "/me" },
      };
    case "system":
      return {
        title: notif.title || "AfuChat",
        body: notif.body || "Tap to view",
        category: "",
        data: { type: "system", notifType: "system" },
      };
    default:
      return { title: "", body: "", category: "", data: {} };
  }
}
