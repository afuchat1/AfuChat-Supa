import { SUPABASE_ANON_KEY, SUPABASE_EDGE_URL } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type WhopCheckoutPurpose = "topup" | "donation";

export async function getPaymentAuthToken(): Promise<string> {
  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed.session?.access_token) return refreshed.session.access_token;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? "";
}

async function callWhopCheckout(body: Record<string, unknown>) {
  const token = await getPaymentAuthToken();
  const response = await fetch(`${SUPABASE_EDGE_URL}/whop-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Whop checkout could not be started.");
  }
  return result;
}

export function startWhopCheckout(input: {
  purpose: WhopCheckoutPurpose;
  acoin_amount?: number;
  usd_amount?: number;
}) {
  return callWhopCheckout({ action: "checkout", ...input }) as Promise<{
    session_id: string;
    purchase_url: string;
  }>;
}

export function confirmWhopPayment(sessionId: string) {
  return callWhopCheckout({ action: "confirm", session_id: sessionId }) as Promise<{
    confirmed: boolean;
    status: "pending" | "paid";
    purpose?: WhopCheckoutPurpose;
    acoin_amount?: number;
  }>;
}
