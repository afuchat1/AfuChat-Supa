---
name: Call engine audio + mic permission
description: Critical fixes for _activateAudioMode synchronous throw, audio takeover bus, and mic permission pre-check flow in callEngine/CallContext.
---

## _activateAudioMode / _deactivateAudioMode must use try/catch

`_AV.Audio.setAudioModeAsync({...})` can throw **synchronously** on web (not as a rejected Promise). Using only `.catch()` on the return value does NOT catch synchronous throws — they propagate up through `engineAccept`, get caught by `CallContext.acceptCall`'s catch block, show a toast, and leave the engine stuck in "connecting" state with the modal gone but no call screen pushed.

**Fix:** Wrap every `setAudioModeAsync` call in `try { const p = ...; p?.catch?.(() => {}); } catch {}`.

**Why:** This was the root cause of "Accept/Decline buttons not working" — the modal disappeared (status became "connecting") but `router.push` to the call screen never ran because `engineAccept` threw before reaching it.

## callAudioBus.ts — audio takeover pattern

`lib/callAudioBus.ts` exports `subscribeCallAudio` / `emitCallAudio`. `callEngine.setStatus` emits `"takeover"` when entering `outgoing_ringing` or `incoming_ringing`, and `"release"` when returning to `"idle"`.

Consumers subscribe in a `useEffect(() => subscribeCallAudio(...), [])`:
- `AudioPlayer.tsx` — pauses `soundRef.current` (expo-av voice messages)
- `VideoFeed.tsx` — iterates `playerMapRef.current` and calls `player.pause()` (expo-video)
- `chat/[id].tsx` — watches `callStatus` from `useCall()` in a dedicated `useEffect([callStatus])` to stop the `recorderRef`, `webMediaRecorderRef`, and `webStreamRef`

## Mic permission pre-check in CallContext

`lib/micPermission.ts` exports:
- `getMicPermissionState()` → `"granted" | "denied" | "prompt"` (web: navigator.permissions.query; native: expo-av Audio.getPermissionsAsync)
- `requestMicPermission()` → `"granted" | "denied"` (native: Audio.requestPermissionsAsync; web: getUserMedia probe)
- `openMicSettings()` → `Linking.openSettings()` on native, no-op on web

`CallContext` checks permission in BOTH `startCall` and `acceptCall` before calling the engine. On native with `"prompt"` state, it calls `requestMicPermission()` first. If `"denied"`, it shows `MicPermissionModal` and returns without starting the engine.

`micBlocked: boolean` and `showMicPermModal: () => void` are exposed in the call context. AppState listener (native only, lazy-required) re-checks permission when app foregrounds.

## MicPermissionModal

`components/MicPermissionModal.tsx` — glass bottom-sheet modal. Key caution: **never use curly/smart quotes** (`"…"`) inside JS string literals — Hermes/Babel parser treats them as unexpected tokens and crashes Metro. Use straight ASCII `'…'` or escaped `\"…\"` instead.

## Call button disabled state (chat/[id].tsx)

When `micBlocked` is true from `useCall()`:
- Button shows `mic-off-outline` icon (red `#FF3B30`) instead of `call-outline`
- Border becomes `rgba(255,59,48,0.40)`, opacity 0.65
- `onPress` calls `showMicPermModal()` instead of `callStart()`
