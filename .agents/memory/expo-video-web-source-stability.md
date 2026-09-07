---
name: Expo video web source stability
description: The expo-video web adapter can emit an unhandled rejection when a source is replaced during a pending HTML media load.
---

# Expo video web source stability

## The rule

On web, give expo-video a stable source when creating the player and do not
call `replaceAsync` for the same source or for a late optimized/cache source.
Use the existing replacement lifecycle only for native players.

**Why:** Expo SDK's web adapter calls `HTMLMediaElement.play()` internally from
`replace()` without consuming the returned promise. If a later source update
calls `load()` before that promise settles, browsers reject it with
`The play() request was interrupted by a new load request.` The rejection can
reach the app's global error UI even though playback itself is recoverable.

**How to apply:** For feeds, previews, and story players, prefer
`useVideoPlayer({ uri })` on web, remove redundant `replaceAsync` calls, and
let the shared `safePlay`/`safePause` helpers serialize web playback changes.
Expo's web adapter returns void from `play()`/`pause()` and discards the
underlying HTML promise, so `safePause` must wait for a pending play request to
reach `playingChange` before pausing. Keep source resolution and native
replacement behavior unchanged unless the native player has a separate
lifecycle issue.