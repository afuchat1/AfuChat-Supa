---
name: Unread badge shared store
description: How the tab bar badge gets real-time unread count updates without SQLite latency
---

## The rule
The tab bar (`_tabLayout.tsx`) must read the unread count from `lib/chatUnreadEvents.ts` (in-memory module store), not from SQLite via `getLocalConversations()`.

## Why
SQLite reads are async and happen AFTER the React state update. The old approach subscribed to `message_status` inserts and then read from SQLite — by the time the read happened, the local store might not have been updated yet (2-second debounce in index.tsx before `saveConversations` is called).

## How to apply
- `lib/chatUnreadEvents.ts` exports `getTotalUnread()`, `setTotalUnread(n)`, `subscribeUnread(fn)`.
- `index.tsx` (ChatsScreen): has a `useEffect` watching `chats` state that calls `setTotalUnread(total)` on every change — instant propagation.
- `_tabLayout.tsx` (`useTotalUnread`): subscribes via `subscribeUnread()` for primary path; keeps `message_status` subscription as fallback for when ChatsScreen is not mounted.
