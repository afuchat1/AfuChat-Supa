import { supabase } from "@/lib/supabase";

type TransferPayload = {
  success?: unknown;
  message?: unknown;
  new_balance?: unknown;
};

export type AcoinTransferResult =
  | { status: "sent" }
  | { status: "rejected"; message: string }
  | { status: "unknown"; message: string };

const UNKNOWN_TRANSFER_MESSAGE =
  "Transfer not confirmed. Check your wallet activity before trying again.";

export async function transferAcoin(
  recipientId: string,
  amount: number,
  note?: string | null,
): Promise<AcoinTransferResult> {
  if (
    !recipientId ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2_147_483_647
  ) {
    return { status: "rejected", message: "Enter a valid recipient and ACoin amount." };
  }

  try {
    // Transfers are not safe to retry automatically if the response is lost.
    const { data, error } = await supabase
      .rpc("transfer_acoin", {
        p_recipient_id: recipientId,
        p_amount: amount,
        p_note: note?.trim() || null,
      })
      .retry(false);

    if (error) {
      return { status: "unknown", message: UNKNOWN_TRANSFER_MESSAGE };
    }

    const payload = (Array.isArray(data) ? data[0] : data) as TransferPayload | null;
    if (payload?.success !== true) {
      return {
        status: "rejected",
        message:
          typeof payload?.message === "string"
            ? payload.message
            : "Could not send ACoin.",
      };
    }

    return { status: "sent" };
  } catch {
    return { status: "unknown", message: UNKNOWN_TRANSFER_MESSAGE };
  }
}
