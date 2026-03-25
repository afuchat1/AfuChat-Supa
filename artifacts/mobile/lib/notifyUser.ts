import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_ANON_KEY || "",
      },
      body: JSON.stringify(params),
    });
  } catch {}

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
