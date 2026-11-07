export type ChatActivity = "typing" | "recording" | "sending_image";

export function normalizeChatActivity(payload: unknown): ChatActivity | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { activity?: unknown; is_typing?: unknown };
  if (
    value.activity === "typing" ||
    value.activity === "recording" ||
    value.activity === "sending_image"
  ) {
    return value.activity;
  }
  // Older app versions send only is_typing, so continue to interoperate.
  return value.is_typing === true ? "typing" : null;
}

export function chatActivityLabel(activity: ChatActivity): string {
  switch (activity) {
    case "typing":
      return "typing";
    case "recording":
      return "recording audio";
    case "sending_image":
      return "sending image";
  }
}
