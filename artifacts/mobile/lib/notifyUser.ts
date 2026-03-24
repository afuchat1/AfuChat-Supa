import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function callNotify(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
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

export function notifyNewFollow(params: {
  targetUserId: string;
  followerName: string;
}) {
  callNotify({
    userId: params.targetUserId,
    title: "New Follower",
    body: `${params.followerName} started following you`,
    data: { type: "follow" },
  });
}

export function notifyPostLike(params: {
  postAuthorId: string;
  likerName: string;
  postId: string;
}) {
  callNotify({
    userId: params.postAuthorId,
    title: "Post Liked",
    body: `${params.likerName} liked your post`,
    data: { postId: params.postId, type: "like" },
  });
}

export function notifyPostReply(params: {
  postAuthorId: string;
  replierName: string;
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
  });
}

export function notifyGiftReceived(params: {
  recipientId: string;
  senderName: string;
  giftName: string;
}) {
  callNotify({
    userId: params.recipientId,
    title: "Gift Received!",
    body: `${params.senderName} sent you ${params.giftName}`,
    data: { type: "gift" },
  });
}
