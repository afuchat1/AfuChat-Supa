---
name: Discover augmented feed pattern
description: How the Discover page injects recommendation/upsell cards into the FlatList without breaking viewability tracking.
---

## Rule
`discover.tsx` FlatList uses `FeedEntry` union type, not `PostItem[]` directly.

```ts
type FeedEntry =
  | { _kind: "post"; item: PostItem }
  | { _kind: "user_recs"; id: string; seed: number }
  | { _kind: "premium"; id: string; variant: "ai" | "creator" | "wallet" };
```

**Why:** Injecting UserRecsCard (every 8 posts) and PremiumUpsellCard (every 15 posts) directly into FlatList data keeps the augmented feed in sync with filtering/dismiss state without a separate list.

**How to apply:**
- `keyExtractor`: branch on `_kind === "post" ? entry.item.id : entry.id`
- `onViewableItemsChanged`: skip entries where `vi.item?._kind !== "post"` before reading `postId`
- `renderItem`: switch on `entry._kind` to render the right component
- `ListEmptyComponent`/footer still check `filteredPosts.length` (pre-augmentation), not `augmentedFeed.length`

## Dismiss system
- `dismissedIds: Set<string>` — single posts hidden (Not interested, Already seen, etc.)
- `suppressedAuthors: Set<string>` — all posts from author hidden (Mute)
- `dismissedUpsellVariants: Set<string>` — premium cards the user X'd out
- `dismissTarget` state drives the `DismissSheet` modal
- PostCard menu now includes "Not interested" (→ opens DismissSheet) and "Mute @handle" (→ direct suppress)

## New files
- `components/discover/UserRecsCard.tsx` — horizontal scroll of 5 suggested users, Follow buttons, fetches from `profiles` ordered by `follower_count`
- `components/discover/PremiumUpsellCard.tsx` — LinearGradient card, 3 variants (ai/creator/wallet), CTA routes to `/premium`
- `components/discover/DismissSheet.tsx` — 5 reason options, bottom sheet modal
