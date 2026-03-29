import { supabase } from "@/lib/supabase";

async function callNotify(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  notificationType?: string;
  actorId?: string;
  postId?: string | null;
}) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .eq("id", params.userId)
      .single();

    if (profile?.expo_push_token) {
      const channelId =
        params.data?.type === "message"
          ? "messages"
          : params.data?.type === "follow" ||
              params.data?.type === "like" ||
              params.data?.type === "reply"
            ? "social"
            : "default";

      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify({
          to: profile.expo_push_token,
          title: params.title,
          body: params.body,
          data: params.data || {},
          sound: "default",
          badge: 1,
          priority: "high",
          channelId,
          ttl: 604800,
          expiration: Math.floor(Date.now() / 1000) + 604800,
        }),
      });
      const json = await res.json();
      if (json?.data?.status === "error") {
        console.warn("[Notify] Push error:", json.data.message, json.data.details);
      }
    }
  } catch (e) {
    console.warn("[Notify] Failed:", e);
  }

  if (params.notificationType && params.actorId) {
    try {
      await supabase.from("notifications").insert({
        user_id: params.userId,
        actor_id: params.actorId,
        type: params.notificationType,
        post_id: params.postId || null,
        is_read: false,
      });
    } catch {}
  }
}

export async function notifyNewMessage(params: {
  recipientIds: string[];
  senderName: string;
  messageText: string;
  chatId: string;
  isGroup?: boolean;
  groupName?: string;
}) {
  const title = params.isGroup
    ? `${params.senderName} in ${params.groupName || "Group"}`
    : params.senderName;
  const body = params.messageText || "Sent an attachment";

  for (const userId of params.recipientIds) {
    callNotify({
      userId,
      title,
      body: body.length > 100 ? body.substring(0, 97) + "..." : body,
      data: { chatId: params.chatId, type: "message" },
    });
  }
}

export async function notifyNewFollow(params: {
  targetUserId: string;
  followerName: string;
  followerUserId: string;
}) {
  callNotify({
    userId: params.targetUserId,
    title: "New Follower",
    body: `${params.followerName} started following you`,
    data: { type: "follow" },
    notificationType: "new_follower",
    actorId: params.followerUserId,
  });
}

export async function notifyPostLike(params: {
  postAuthorId: string;
  likerName: string;
  likerUserId: string;
  postId: string;
}) {
  callNotify({
    userId: params.postAuthorId,
    title: "Post Liked",
    body: `${params.likerName} liked your post`,
    data: { postId: params.postId, type: "like" },
    notificationType: "new_like",
    actorId: params.likerUserId,
    postId: params.postId,
  });
}

export async function notifyPostReply(params: {
  postAuthorId: string;
  replierName: string;
  replierUserId: string;
  postId: string;
  replyPreview: string;
}) {
  callNotify({
    userId: params.postAuthorId,
    title: params.replierName,
    body:
      params.replyPreview.length > 100
        ? params.replyPreview.substring(0, 97) + "..."
        : params.replyPreview,
    data: { postId: params.postId, type: "reply" },
    notificationType: "new_reply",
    actorId: params.replierUserId,
    postId: params.postId,
  });
}

export async function notifyGiftReceived(params: {
  recipientId: string;
  senderName: string;
  senderUserId: string;
  giftName: string;
}) {
  callNotify({
    userId: params.recipientId,
    title: "Gift Received!",
    body: `${params.senderName} sent you ${params.giftName}`,
    data: { type: "gift" },
    notificationType: "gift",
    actorId: params.senderUserId,
  });
}
