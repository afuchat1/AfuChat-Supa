export type MessageTimestampFields = {
  sent_at?: unknown;
  created_at?: unknown;
};

export function messageTimestampMillis(value: unknown): number | null {
  if (value instanceof Date) {
    const valueMs = value.getTime();
    return Number.isFinite(valueMs) ? valueMs : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && Number.isFinite(new Date(value).getTime())
      ? value
      : null;
  }

  if (typeof value !== "string" || !value.trim()) return null;
  const valueMs = Date.parse(value.trim());
  return Number.isFinite(valueMs) ? valueMs : null;
}

export function normalizeMessageTimestamp(value: unknown): string | null {
  const valueMs = messageTimestampMillis(value);
  return valueMs === null ? null : new Date(valueMs).toISOString();
}

/**
 * `sent_at` is the database field. `created_at` is accepted only for older
 * locally queued messages written before the queue used the database field.
 */
export function resolveMessageTimestamp(
  message: MessageTimestampFields,
  fallback?: unknown,
): string {
  return normalizeMessageTimestamp(message.sent_at) ??
    normalizeMessageTimestamp(message.created_at) ??
    normalizeMessageTimestamp(fallback) ??
    "";
}

export function latestMessageTimestamp(
  current: unknown,
  incoming: unknown,
): string | null {
  const currentMs = messageTimestampMillis(current);
  const incomingMs = messageTimestampMillis(incoming);
  if (currentMs === null) return normalizeMessageTimestamp(incoming);
  if (incomingMs === null) return normalizeMessageTimestamp(current);
  return new Date(Math.max(currentMs, incomingMs)).toISOString();
}

/** Sorts valid timestamps by time and leaves missing/invalid values last. */
export function compareMessageTimestamps(
  left: unknown,
  right: unknown,
  direction: "asc" | "desc" = "asc",
): number {
  const leftMs = messageTimestampMillis(left);
  const rightMs = messageTimestampMillis(right);
  if (leftMs === null) return rightMs === null ? 0 : 1;
  if (rightMs === null) return -1;
  return direction === "desc" ? rightMs - leftMs : leftMs - rightMs;
}
