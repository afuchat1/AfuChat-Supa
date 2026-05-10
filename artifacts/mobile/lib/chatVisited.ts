const _visited = new Map<string, number>();
let _activeChat: string | null = null;

export function markChatVisited(chatId: string) {
  if (chatId) _visited.set(chatId, Date.now());
}

export function wasChatRecentlyVisited(chatId: string, withinMs = 15000): boolean {
  const ts = _visited.get(chatId);
  return !!ts && Date.now() - ts < withinMs;
}

export function clearChatVisited(chatId: string) {
  _visited.delete(chatId);
}

/** Call when the user enters a chat room — suppresses unread badge with no time limit. */
export function setActiveChatId(chatId: string) {
  _activeChat = chatId;
}

/** Call when the user leaves a chat room (unmount). */
export function clearActiveChatId() {
  _activeChat = null;
}

/**
 * Returns the chat ID the user is currently viewing, or null if none.
 * Used by the chats list to skip counting unread messages for the open chat,
 * eliminating the race condition where loadChats runs before the mark-as-read
 * upsert from the chat screen completes.
 */
export function getActiveChatId(): string | null {
  return _activeChat;
}
