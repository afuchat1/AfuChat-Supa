type ChatListRow = Record<string, any>;

let latestSnapshot: {
  userId: string;
  rows: ChatListRow[];
  savedAt: number;
} | null = null;

const SNAPSHOT_MAX_AGE_MS = 30_000;

export function cacheChatListRows(userId: string, rows: ChatListRow[]): void {
  latestSnapshot = { userId, rows, savedAt: Date.now() };
}

export function getRecentChatListRows(userId: string): ChatListRow[] | null {
  if (!latestSnapshot || latestSnapshot.userId !== userId) return null;
  if (Date.now() - latestSnapshot.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
  return latestSnapshot.rows;
}
