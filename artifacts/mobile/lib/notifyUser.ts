import { supabase } from "@/lib/supabase";

type NotifyParams = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  notificationType?: string;
  actorId?: string;
  postId?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
};

async function callNotify(params: NotifyParams) {
  const {
    userId, notificationType, actorId,
    postId, referenceId, referenceType,
  } = params;

  // Push notifications are now handled server-side by the API watcher which
  // listens to `messages` and `notifications` table inserts via Supabase
  // Realtime. No client-side push call needed here.

  // Insert in-app notification record (client-side, works independently of push)
  if (notificationType) {
    try {
      // ── Deduplication: skip insert if an identical notification was created
      // within the last 3 minutes (same user, type, actor, post/reference).
      const windowStart = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      let dupQuery = supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", notificationType)
        .gte("created_at", windowStart)
        .limit(1);
      if (actorId)      dupQuery = dupQuery.eq("actor_id", actorId);
      else              dupQuery = dupQuery.is("actor_id", null);
      if (postId)       dupQuery = dupQuery.eq("post_id", postId);
      else              dupQuery = dupQuery.is("post_id", null);
      if (referenceId)  dupQuery = dupQuery.eq("reference_id", referenceId);
      else              dupQuery = dupQuery.is("reference_id", null);

      const { data: existing } = await dupQuery;
      if (existing && existing.length > 0) return; // duplicate — skip

      const record: any = {
        user_id: userId,
        actor_id: actorId || null,
        type: notificationType,
        post_id: postId || null,
        reference_id: referenceId || null,
        reference_type: referenceType || null,
        is_read: false,
      };
      await supabase.from("notifications").insert(record);
    } catch (e) {
      console.warn("[Notify] DB insert failed:", e);
    }
  }
}

// ─── Social Notifications ────────────────────────────────────────────

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
  const short = body.length > 100 ? body.substring(0, 97) + "..." : body;

  for (const userId of params.recipientIds) {
    callNotify({
      userId, title, body: short,
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
    data: { type: "follow", userId: params.followerUserId },
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
  replyPreview?: string;
}) {
  const preview = (params.replyPreview || "").trim();
  const body = preview.length > 100
    ? preview.substring(0, 97) + "..."
    : preview || "Replied to your post";
  callNotify({
    userId: params.postAuthorId,
    title: params.replierName,
    body,
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
    title: "Gift Received! 🎁",
    body: `${params.senderName} sent you ${params.giftName}`,
    data: { type: "gift" },
    notificationType: "gift",
    actorId: params.senderUserId,
  });
}

export async function notifyMention(params: {
  targetUserId: string;
  mentionedBy: string;
  mentionedByUserId: string;
  postId: string;
  preview: string;
}) {
  callNotify({
    userId: params.targetUserId,
    title: `${params.mentionedBy} mentioned you`,
    body: params.preview.substring(0, 100),
    data: { postId: params.postId, type: "mention" },
    notificationType: "new_mention",
    actorId: params.mentionedByUserId,
    postId: params.postId,
  });
}

// ─── Marketplace / Shop Notifications ────────────────────────────────

export async function notifyOrderPlaced(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
  totalAcoin: number;
  itemCount: number;
}) {
  callNotify({
    userId: params.sellerId,
    title: "New Order Received! 🛍️",
    body: `${params.buyerName} placed an order for ${params.itemCount} item${params.itemCount !== 1 ? "s" : ""} — ${params.totalAcoin} AC in escrow`,
    data: { type: "order", orderId: params.orderId, url: `/shop/order/${params.orderId}` },
    notificationType: "order_placed",
    actorId: params.buyerUserId,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyOrderShipped(params: {
  buyerId: string;
  sellerName: string;
  sellerUserId: string;
  orderId: string;
}) {
  callNotify({
    userId: params.buyerId,
    title: "Your Order Has Shipped! 📦",
    body: `${params.sellerName} has shipped your order. Confirm delivery to release payment.`,
    data: { type: "order", orderId: params.orderId, url: `/shop/order/${params.orderId}` },
    notificationType: "order_shipped",
    actorId: params.sellerUserId,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyDeliveryConfirmed(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
  amountReleased: number;
}) {
  callNotify({
    userId: params.sellerId,
    title: "Payment Released! 💰",
    body: `${params.buyerName} confirmed delivery. ${params.amountReleased} AC has been credited to your wallet.`,
    data: { type: "escrow", orderId: params.orderId, url: `/shop/order/${params.orderId}` },
    notificationType: "escrow_released",
    actorId: params.buyerUserId,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyDisputeRaised(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
}) {
  callNotify({
    userId: params.sellerId,
    title: "Order Dispute Opened ⚠️",
    body: `${params.buyerName} raised a dispute on their order. Our team is reviewing it.`,
    data: { type: "order", orderId: params.orderId, url: `/shop/order/${params.orderId}` },
    notificationType: "dispute_raised",
    actorId: params.buyerUserId,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyRefundIssued(params: {
  buyerId: string;
  orderId: string;
  amountRefunded: number;
}) {
  callNotify({
    userId: params.buyerId,
    title: "Refund Issued ✅",
    body: `Your refund of ${params.amountRefunded} AC has been returned to your AfuPay wallet.`,
    data: { type: "payment", orderId: params.orderId, url: `/shop/order/${params.orderId}` },
    notificationType: "refund_issued",
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyOrderReview(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
  rating: number;
}) {
  callNotify({
    userId: params.sellerId,
    title: `New Review — ${params.rating}⭐`,
    body: `${params.buyerName} left a review for your shop.`,
    data: { type: "order", orderId: params.orderId, url: `/shop/order/${params.orderId}` },
    notificationType: "shop_review",
    actorId: params.buyerUserId,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

// ─── ACoins / Payment Notifications ──────────────────────────────────

export async function notifyAcoinReceived(params: {
  userId: string;
  amount: number;
  reason: string;
  referenceId?: string;
  referenceType?: string;
}) {
  callNotify({
    userId: params.userId,
    title: `+${params.amount} AC Received 💰`,
    body: params.reason,
    data: { type: "payment", url: "/me" },
    notificationType: "acoin_received",
    referenceId: params.referenceId || null,
    referenceType: params.referenceType || null,
  });
}

export async function notifyAcoinSent(params: {
  userId: string;
  amount: number;
  reason: string;
}) {
  callNotify({
    userId: params.userId,
    title: `${params.amount} AC Sent`,
    body: params.reason,
    data: { type: "payment", url: "/me" },
    notificationType: "acoin_sent",
  });
}

export async function notifySubscriptionActivated(params: {
  userId: string;
  planName: string;
}) {
  callNotify({
    userId: params.userId,
    title: "Subscription Active! ⭐",
    body: `Your ${params.planName} subscription is now active. Enjoy premium features!`,
    data: { type: "payment", url: "/monetize" },
    notificationType: "subscription_activated",
  });
}

// ─── Channel / Social Group Notifications ────────────────────────────

export async function notifyChannelPost(params: {
  subscriberIds: string[];
  channelName: string;
  channelId: string;
  postPreview: string;
}) {
  const body = params.postPreview.length > 100
    ? params.postPreview.substring(0, 97) + "..."
    : params.postPreview;
  for (const userId of params.subscriberIds) {
    callNotify({
      userId,
      title: params.channelName,
      body,
      data: { type: "channel", channelId: params.channelId, url: `/channel/${params.channelId}` },
      notificationType: "channel_post",
      referenceId: params.channelId,
      referenceType: "channel",
    });
  }
}

export async function notifyLiveStream(params: {
  followerIds: string[];
  streamerName: string;
  streamerId: string;
  channelId: string;
}) {
  for (const userId of params.followerIds) {
    callNotify({
      userId,
      title: `${params.streamerName} is live! 🔴`,
      body: "Tap to join the stream",
      data: { type: "live", userId: params.streamerId, url: `/channel/${params.channelId}` },
      notificationType: "live_started",
      actorId: params.streamerId,
      referenceId: params.channelId,
      referenceType: "channel",
    });
  }
}

// ─── System / Admin Notifications ────────────────────────────────────

export async function notifySystemMessage(params: {
  userId: string;
  title: string;
  body: string;
  url?: string;
}) {
  callNotify({
    userId: params.userId,
    title: params.title,
    body: params.body,
    data: { type: "system", url: params.url || "/" },
    notificationType: "system",
  });
}

export async function notifySellerApplicationStatus(params: {
  userId: string;
  approved: boolean;
}) {
  callNotify({
    userId: params.userId,
    title: params.approved ? "Seller Application Approved! 🎉" : "Seller Application Update",
    body: params.approved
      ? "Your seller application has been approved. You can now list products on AfuMarket!"
      : "Your seller application needs more information. Please check your email.",
    data: { type: "system", url: params.approved ? "/shop/manage" : "/shop/apply" },
    notificationType: params.approved ? "seller_approved" : "seller_rejected",
  });
}

export async function notifyVerificationStatus(params: {
  userId: string;
  approved: boolean;
  profileType: string;
}) {
  callNotify({
    userId: params.userId,
    title: params.approved ? `${params.profileType} Verification Approved ✅` : "Verification Update",
    body: params.approved
      ? "Your account has been verified. A badge is now visible on your profile."
      : "Your verification request needs additional information.",
    data: { type: "system", url: "/me" },
    notificationType: params.approved ? "verification_approved" : "verification_update",
  });
}

export async function notifyCallInitiated(params: {
  calleeId: string;
  callId: string;
  callType: "voice" | "video";
  callerName: string;
}) {
  callNotify({
    userId: params.calleeId,
    title: `Incoming ${params.callType === "video" ? "Video" : "Voice"} Call`,
    body: `${params.callerName} is calling you`,
    data: { type: "call", callId: params.callId, callType: params.callType, url: `/call/${params.callId}` },
    notificationType: "call",
  });
}
