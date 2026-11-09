---
name: AfuChat Status Goods Implementation
description: How all 8 prestige status goods are implemented and where each effect renders
---

## Status Goods Architecture

All 8 goods (`sg1`–`sg8`) live in the `status_goods_purchases` table (`user_id, good_id, equipped` bool).

### Where each good renders

| ID | Name | Effect | Where applied |
|----|------|--------|---------------|
| sg1 | Crown Aura | Gold spinning ring around avatar, Platinum members only | `Avatar` `prestigeRing='crown'` / `effects.crownRing` → `PremiumRing ringType='crown'`; shared Avatar guard requires Platinum |
| sg2 | Obsidian Void Ring | Dark purple ring | Same, `prestigeRing='void'` → `ringType='void'` |
| sg3 | Diamond Halo | Ice-blue ring | Same, `prestigeRing='diamond'` → `ringType='diamond'` |
| sg4 | Gold Nameplate | Name in `#D4A853` gold | `goldNameplate` prop on `MessageBubble`, `authorGoldNameplate` in `post/[id].tsx` |
| sg5 | Verified Star | `⭐` appended to display name | `verifiedStar` prop on `MessageBubble`, `authorVerifiedStar` in `post/[id].tsx`, `equippedGoods.has('sg5')` in `me.tsx` |
| sg6 | Founder's Seal | 🔏 text below prestige badge | `equippedGoods.has('sg6')` in `me.tsx` hero card |
| sg7 | Royalty Title | "🎖️ Royalty of AfuChat" text | `equippedGoods.has('sg7')` in `me.tsx` hero card |
| sg8 | Status Glow | `PremiumBubbleShimmer` on bubble | `statusGlow` prop on `MessageBubble`; own msgs use `equippedGoods.has('sg8')`, others use `statusGlowIds` batch query |

### PremiumRing ring type colors
- `premium` / `crown`: `Colors.gold` primary + accent secondary
- `void`: `#7B2FBE` + `#9F4DDB`
- `diamond`: `#60CBFF` + `#A5E8FF`

### equippedGoods in AuthContext
`Set<string>` loaded at login via `status_goods_purchases` where `equipped=true`. Cleared on signOut. Passed everywhere via `useAuth().equippedGoods`.

**Why:** Avoids per-screen queries for the current user's own goods; only OTHER users' goods need per-chat/post batch queries.

### chat/[id].tsx batch query pattern
Single query fetches `user_id, good_id` for all senders, filtered to `["sg1","sg2","sg3","sg4","sg5","sg8"]`. Results populate 4 separate Sets/Maps. Fires on `messages.length` change.

### Android animation crash (prestige.tsx)
Fixed by changing `pulseAnim` from `useNativeDriver: true` → `false`. The Animated.View had both `shadowOpacity` (needs JS driver) and `transform: scale` (was native). Mixed drivers on same view = crash.
