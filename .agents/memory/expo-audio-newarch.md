---
name: expo-audio New Architecture requirement
description: expo-audio 1.x (Expo SDK 54) requires New Architecture; use expo-av for old-arch builds
---

## Rule
Never add `expo-audio` to a project with `newArchEnabled: false`. It causes a silent Gradle failure deep in the native build phase with the generic error "Gradle build failed with unknown error."

## Why
`expo-audio` 1.x in Expo SDK 54 is a ground-up New Architecture rewrite of `expo-av`. It uses Nitro/JSI and requires New Architecture to be enabled. The failure happens during native compilation, not configuration, so the error message is not descriptive.

`expo-av ~16.0.8` is the Old Architecture compatible equivalent — the two packages provide essentially the same functionality via different APIs.

## Migration: expo-audio → expo-av
| expo-audio | expo-av |
|---|---|
| `useAudioRecorder(preset)` hook | `useRef<Audio.Recording \| null>(null)` |
| `requestRecordingPermissionsAsync()` | `Audio.requestPermissionsAsync()` |
| `recorder.prepareToRecordAsync()` + `recorder.record()` | `new Audio.Recording()` → `prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)` → `startAsync()` |
| `recorder.stop()` | `recorderRef.current?.stopAndUnloadAsync()` |
| `recorder.uri` | `recorderRef.current?.getURI()` (call BEFORE clearing ref, but AFTER stopAndUnloadAsync — getURI() persists after unload) |

## How to apply
Before adding any new `expo-*` package to an old-arch project, check the Expo SDK 54 changelog — several packages were rewritten for New Arch: `expo-audio`, `expo-video` (check version), etc.
