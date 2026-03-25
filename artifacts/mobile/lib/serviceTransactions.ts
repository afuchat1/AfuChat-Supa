import { supabase } from "./supabase";

export type ServiceType =
  | "airtime"
  | "data_bundle"
  | "bill_payment"
  | "hotel_booking"
  | "event_ticket"
  | "money_transfer";

export type TransactionStatus = "pending" | "completed" | "failed" | "refunded";

export interface ServiceFee {
  serviceType: ServiceType;
  subtotal: number;
  feePercent: number;
  feeAmount: number;
  total: number;
}

export const SERVICE_FEES: Record<ServiceType, number> = {
  airtime: 2,
  data_bundle: 2,
  bill_payment: 3,
  hotel_booking: 5,
  event_ticket: 4,
  money_transfer: 1.5,
};

export function calculateFee(serviceType: ServiceType, amount: number): ServiceFee {
  const feePercent = SERVICE_FEES[serviceType];
  const feeAmount = Math.ceil((amount * feePercent) / 100);
  return {
    serviceType,
    subtotal: amount,
    feePercent,
    feeAmount,
    total: amount + feeAmount,
  };
}

export async function processServiceTransaction(
  userId: string,
  serviceType: ServiceType,
  amount: number,
  metadata: Record<string, any>
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Invalid amount" };
  }

  const fee = calculateFee(serviceType, amount);

  const { data: profile } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", userId)
    .single();

  if (!profile || profile.acoin < fee.total) {
    return { success: false, error: "Insufficient ACoins balance" };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ acoin: profile.acoin - fee.total })
    .eq("id", userId);

  if (updateError) {
    return { success: false, error: "Failed to process payment" };
  }

  const { data: tx, error: txError } = await supabase
    .from("acoin_transactions")
    .insert({
      user_id: userId,
      amount: -fee.total,
      transaction_type: `service_${serviceType}`,
      fee_charged: fee.feeAmount,
      metadata: {
        ...metadata,
        service_type: serviceType,
        subtotal: fee.subtotal,
        fee_percent: fee.feePercent,
        fee_amount: fee.feeAmount,
        total_charged: fee.total,
        status: "completed",
        processed_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (txError) {
    await supabase
      .from("profiles")
      .update({ acoin: profile.acoin })
      .eq("id", userId);
    return { success: false, error: "Failed to record transaction" };
  }

  return { success: true, transactionId: tx.id };
}

export const SERVICE_LABELS: Record<ServiceType, string> = {
  airtime: "Airtime",
  data_bundle: "Data Bundle",
  bill_payment: "Bill Payment",
  hotel_booking: "Hotel Booking",
  event_ticket: "Event Ticket",
  money_transfer: "Money Transfer",
};

export const SERVICE_ICONS: Record<ServiceType, string> = {
  airtime: "📱",
  data_bundle: "📶",
  bill_payment: "🧾",
  hotel_booking: "🏨",
  event_ticket: "🎫",
  money_transfer: "💸",
};
