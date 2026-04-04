const _visited = new Map<string, number>();

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
