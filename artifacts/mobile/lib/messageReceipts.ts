import { isOnline } from "@/lib/offlineStore";
import { enqueue } from "@/lib/storage/syncQueue";
import { supabase } from "@/lib/supabase";

export type MessageDeliveryReceipt = {
  message_id: string;
  delivered_at: string;
};

const DELIVERY_BATCH_SIZE = 100;

/**
 * Persist delivery only after this authenticated recipient's device has
 * actually received the message or its push payload. The database supplies
 * the timestamp and verifies chat membership; a push-send result is not a
 * delivery receipt.
 */
export async function acknowledgeMessagesDelivered(
  messageIds: string[],
  userId: string,
): Promise<MessageDeliveryReceipt[]> {
  const uniqueIds = [...new Set(messageIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (!uniqueIds.length || !userId) return [];

  const receipts: MessageDeliveryReceipt[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += DELIVERY_BATCH_SIZE) {
    const batch = uniqueIds.slice(offset, offset + DELIVERY_BATCH_SIZE);
    if (!isOnline()) {
      await queueDelivery(batch, userId);
      continue;
    }

    try {
      const { data, error } = await supabase.rpc("acknowledge_message_delivery", {
        p_message_ids: batch,
      });
      if (error) {
        await queueDelivery(batch, userId);
        if (__DEV__) console.warn("[message-receipt] delivery acknowledgement deferred", error.message);
        continue;
      }

      for (const receipt of (data ?? []) as MessageDeliveryReceipt[]) {
        if (receipt?.message_id && receipt.delivered_at) receipts.push(receipt);
      }
    } catch (error) {
      await queueDelivery(batch, userId);
      if (__DEV__) console.warn("[message-receipt] delivery acknowledgement deferred", error);
    }
  }

  return receipts;
}

async function queueDelivery(messageIds: string[], userId: string): Promise<void> {
  try {
    await enqueue("mark_delivered", { message_ids: messageIds, user_id: userId });
  } catch (error) {
    if (__DEV__) console.warn("[message-receipt] could not queue delivery acknowledgement", error);
  }
}
