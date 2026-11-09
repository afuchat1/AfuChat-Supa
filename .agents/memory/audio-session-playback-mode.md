---
name: Audio session playback mode
description: allowsRecordingIOS must be explicitly false in every setAudioModeAsync call that precedes playback, or iOS routes audio silently to the earpiece.
---

## Rule

Every `setAudioModeAsync` call that sets up for **playback** must include `allowsRecordingIOS: false`. Omitting it leaves the value unchanged — if a prior recording session set it `true`, iOS stays in `.playAndRecord` category, which routes audio through the earpiece at low volume (effectively silent to the user).

**Why:** iOS `allowsRecordingIOS: true` → AVAudioSession category `.playAndRecord`. Without `AVAudioSessionCategoryOptionDefaultToSpeaker`, `.playAndRecord` defaults to the earpiece (phone-call routing). `allowsRecordingIOS: false` → `.playback`, which routes to the speaker normally.

**How to apply:**
- `AudioPlayer.tsx` `loadAudio()` — must include `allowsRecordingIOS: false`
- `VoicePlayer` in `VideoCommentsSheet.tsx` `loadVoice()` — already correct
- Any new audio playback component: always set `allowsRecordingIOS: false` explicitly

## Audio session must also be reset on ALL exit paths from recording

`stopVoiceRecording` in `chat/[id].tsx` had an early-return path (recording < 1s) that skipped the mode reset. This left `allowsRecordingIOS: true` for all subsequent playback.

**Rule:** Every exit path from a recording function (stop, cancel, discard, error, too-short) must call:
```js
Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
```
