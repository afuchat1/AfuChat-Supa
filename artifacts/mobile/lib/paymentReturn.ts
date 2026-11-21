const APP_LINK_HOSTS = new Set(["afuchat.com", "www.afuchat.com"]);
const COMPLETION_QUERY_KEYS = ["payment-complete", "payment_complete", "paymentcomplete"];
const RETURN_PARAMS = [
  "session_id",
  "provider",
  "purpose",
  "OrderTrackingId",
  "OrderMerchantReference",
];

/** Extract payment return parameters only from AfuChat's verified app-link domain. */
export function parsePaymentReturnParams(url: string | null | undefined): Record<string, string> | null {
  if (!url) return null;
  try {
    const normalized = url.replace(/^afuchat:\/\//i, "https://afuchat.com/");
    const parsed = new URL(normalized);
    const isAfuChatLink =
      parsed.protocol === "afuchat:" ||
      (parsed.protocol === "https:" && APP_LINK_HOSTS.has(parsed.hostname.toLowerCase()));
    if (!isAfuChatLink) return null;

    const path = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    const isPaymentReturn =
      path === "payment-return" ||
      COMPLETION_QUERY_KEYS.some((key) => parsed.searchParams.has(key));
    if (!isPaymentReturn) return null;

    const params: Record<string, string> = {};
    for (const key of RETURN_PARAMS) {
      const value = parsed.searchParams.get(key);
      if (value) params[key] = value;
    }
    return params;
  } catch {
    return null;
  }
}
