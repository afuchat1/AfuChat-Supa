---
name: RNTP 4.1.2 getQueue crash on RN 0.81
description: react-native-track-player 4.1.2 has 3 null-safety NPE crash sites in MusicModule.kt; all must be patched in postinstall.sh.
---

## Rule
When using react-native-track-player 4.1.2 with React Native 0.81+, patch all three `originalItem` (Bundle?) usages in `MusicModule.kt` via `postinstall.sh`.

## The three sites (MusicModule.kt)

| Method | Crash pattern | Fix |
|---|---|---|
| `getTrack()` ~line 548 | `Arguments.fromBundle(...originalItem)` | `?: Bundle()` |
| `getQueue()` ~line 558 | `tracks.map { it.originalItem }` | `map { it.originalItem ?: Bundle() }` |
| `getActiveTrack()` ~line 588 | `...originalItem` (multi-line) | `?: Bundle()` |

The `getQueue()` site was **the main crash** — it fires as soon as any track is loaded into RNTP's queue (on every `setQueue`/`skip`/play call). The other two fire less frequently.

**Why:** `Track.originalItem` is declared `Bundle?` in `Track.kt`. `Arguments.fromBundle()` and `Arguments.fromList()` in RN 0.81 no longer accept nullable Bundles — they throw `IllegalArgumentException` / NPE at the native layer, hard-killing the app process.

**How to apply:** The fix lives in `artifacts/mobile/scripts/postinstall.sh`. The script runs automatically after `pnpm install`. If re-checking an installed tree, run it manually: `cd artifacts/mobile && bash scripts/postinstall.sh`.
