/**
 * AfuChat Notification Action Handler
 *
 * Handles interactive notification action buttons (quick reply, like, follow back,
 * snooze, mark read) that run directly from the OS status bar without opening the app.
 *
 * All DB operations use the persisted Supabase session — no React context needed.
 * Navigation actions (view_post, view_profile, etc.) require the app to be in foreground
 * and are guarded accordingly.
 */
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export type NotifActionData = Record<string, string>;

/**
 * Main dispatch — called from addNotificationResponseReceivedListener.
 * @param actionIdentifier  The button identifier pressed (or DEFAULT_ACTION_IDENTIFIER for tap)
 * @param userText          Text typed by the user in a text-input action
 * @param data              Notification data payload
 */
export async function handleNotificationAction(
  actionIdentifier: string,
  userText: string | undefined,
  data: NotifActionData
): Promise<void> {
  try {
    switch (actionIdentifier) {

      // ── Chat message quick reply ────────────────────────────────────
      case "chat_reply": {
        if (!userText?.trim() || !data.chatId) return;
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        await supabase.from("messages").insert({
          chat_id: data.chatId,
          sender_id: session.user.id,
          encrypted_content: userText.trim(),
        });
        break;
      }

      // ── Post / mention quick reply ─────────────────────────────────
      case "post_reply": {
        if (!userText?.trim() || !data.postId) return;
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        await supabase.from("post_replies").insert({
          post_id: data.postId,
          author_id: session.user.id,
          content: userText.trim(),
        });
        break;
      }

      // ── Quick like / acknowledgment ────────────────────────────────
      case "like": {
        if (!data.postId) return;
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        // insert ignores duplicate gracefully
        await supabase.from("post_acknowledgments").insert({
          post_id: data.postId,
          user_id: session.user.id,
        }).then(() => {});
        break;
      }

      // ── Follow back directly from notification ─────────────────────
      case "follow_back": {
        if (!data.actorId) return;
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        await supabase.from("follows").insert({
          follower_id: session.user.id,
          following_id: data.actorId,
        }).then(() => {});
        break;
      }

      // ── Mark notification(s) as read ───────────────────────────────
      case "mark_read": {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        // Match by type + actor + post when available for a targeted update
        let q = supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", session.user.id)
          .eq("is_read", false);
        if (data.notifType) q = (q as any).eq("type", data.notifType);
        if (data.actorId)   q = (q as any).eq("actor_id", data.actorId);
        if (data.postId)    q = (q as any).eq("post_id", data.postId);
        await q;
        break;
      }

      // ── Snooze — schedule a local reminder in 1 hour ──────────────
      case "snooze_1h": {
        if (Platform.OS === "web") return;
        try {
          const Notifications = require("expo-notifications");
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "🔔 Snoozed Reminder",
              body: "You snoozed a notification — here's your reminder.",
              data: { ...data, snoozed: "true" },
              sound: "notification.wav",
              // Show the full-colour AfuChat app icon as the large icon on Android
              ...(Platform.OS === "android" && {
                icon: "@mipmap/ic_launcher",
                largeIcon: "@mipmap/ic_launcher",
                color: "#00BCD4",
              }),
            },
            trigger: {
              type: "timeInterval",
              seconds: 3600,
              repeats: false,
            } as any,
          });
        } catch (e) {
          console.warn("[NotifAction] Snooze failed:", e);
        }
        break;
      }

      // ── Decline an incoming call ───────────────────────────────────
      case "decline_call": {
        if (!data.callId) return;
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        await supabase
          .from("calls")
          .update({ status: "declined", ended_at: new Date().toISOString() })
          .eq("id", data.callId)
          .eq("callee_id", session.user.id);
        break;
      }

      // ── Confirm delivery of a shipped order ───────────────────────
      case "confirm_delivery": {
        if (!data.orderId) return;
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        // Mark delivered — triggers escrow release on the server side
        await supabase
          .from("orders")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", data.orderId)
          .eq("buyer_id", session.user.id);
        break;
      }

      // All other identifiers (DEFAULT, "view_*", "accept_call") are
      // navigation-based and handled by routeNotificationResponse in pushNotifications.ts.
      default:
        break;
    }
  } catch (e) {
    // Never crash the app for a notification action
    console.warn("[NotifAction]", actionIdentifier, "error:", e);
  }
}
