# AfuChat device compatibility: research and implementation

**Audit date:** 2026-11-22  
**Status:** Shared keyboard foundation implemented; real-device validation remains open.

## Executive summary

AfuChat uses Expo SDK 58, React Native 0.88.1, Android target SDK 36, and
`softwareKeyboardLayoutMode: "resize"`. There was no device model, OS version,
keyboard, or reproducible step-by-step onboarding failure in the request, and
no physical Android or iOS device is available in this workspace. The onboarding
code did contain a confirmed timing/coordinate defect, but the user's exact
reported hardware behavior cannot be claimed as reproduced.

The native app now has one root `KeyboardProvider`. Existing keyboard-avoiding
screens use a shared compatibility component backed by the controller on
Android/iOS and the React Native implementation on web. Onboarding and its
country-search list use controller-aware scrolling; its bottom action follows
the reported keyboard frame instead of independently timing manual scrolls.
This is a source-level correction, not a claim of universal device validation.

## Platform research

### Android

- Android 15 enforces edge-to-edge for apps targeting API 35 or later. AfuChat
  targets API 36, so system-bar and display-cutout insets are part of normal
  layout correctness.
- Android 16 disables the edge-to-edge opt-out for apps targeting API 36.
  On displays at least 600 dp wide, Android 16 also ignores requested
  orientation, aspect-ratio, and resizability restrictions. Tablets and
  foldables therefore need live-window responsive layouts even if a phone
  appears portrait-only.
- `WindowInsets.Type.ime()` reports the docked software-keyboard inset. Android
  documents that floating or undocked keyboards may not produce an IME inset;
  code must not assume every keyboard covers the full window bottom.
- The app currently requests `adjustResize`. That setting is retained; changing
  the native window mode without a device reproduction would introduce risk.
- Android window size, orientation, navigation mode, font scale, multi-window,
  and fold posture can change during an app session. Layout should follow the
  current app window and safe areas rather than a phone model name.

### iOS and iPadOS

- Keyboard frames can change during presentation and movement; a fixed keyboard
  height is not a stable layout input.
- Safe areas account for system UI such as the home indicator and display
  cutouts. iPad windows may resize and multitask, and Dynamic Type can change
  the amount of content that fits.
- AfuChat keeps the existing safe-area provider and reads live window
  dimensions, orientation, and font scale through the new adaptation hook.

### Keyboard and input methods

- Microsoft documents SwiftKey full, one-handed, floating/undocked, split
  (“thumb”), and tablet modes. These are user choices; AfuChat does not ask
  users to install or switch keyboards.
- Gboard, Samsung Keyboard, other IMEs, voice input, hardware keyboards,
  autocorrection, multilingual input, and secure-field behavior remain device
  test targets. No manufacturer-specific keyboard behavior is asserted without
  a primary source or a reproducible observation.
- Floating keyboards may overlap content without changing the app's bottom
  inset. The implementation avoids fixed keyboard-height constants, but
  floating-keyboard behavior still needs physical-device verification.

## Manufacturer notes

These are research findings, not test results. Unless noted, this audit did not
find a primary developer source proving a keyboard or inset deviation from
Android's documented behavior. The app therefore uses capability and measured
window data, not manufacturer-name detection.

| Manufacturer | Verified information | Remaining validation |
| --- | --- | --- |
| Samsung | One UI devices use Android window and inset behavior; the Samsung Keyboard is user-selected. No One UI-specific keyboard workaround was verified. | Galaxy device, Samsung Keyboard, Gboard, gesture and 3-button navigation, split-screen, floating keyboard. |
| Google / Pixel | Android platform documentation is the compatibility baseline. No Pixel-only keyboard workaround was verified. | Pixel with Gboard, multiple Android releases, edge-to-edge and navigation modes. |
| Xiaomi / Redmi | No vendor-specific keyboard/inset divergence was verified from a primary developer source in this audit. | HyperOS/MIUI device, floating windows, navigation modes, and keyboard variants. |
| TECNO | No vendor-specific keyboard/inset divergence was verified from a primary developer source in this audit. | HiOS device, navigation modes, keyboard behavior, app resume and low-memory behavior. |
| Infinix | No vendor-specific keyboard/inset divergence was verified from a primary developer source in this audit. | XOS device, floating windows, keyboard behavior, and app resume. |
| OPPO | No vendor-specific keyboard/inset divergence was verified from a primary developer source in this audit. | ColorOS device, resize behavior, floating windows, and keyboard variants. |
| OnePlus | No vendor-specific keyboard/inset divergence was verified from a primary developer source in this audit. | OxygenOS device, navigation modes, multitasking, and keyboard variants. |
| Vivo | Vivo's open-platform small-window guide advises supporting Android multi-window and configuration changes, and notes model/version variation. | Funtouch OS and OriginOS devices, small-window transitions, orientation changes, and keyboards. |
| Motorola | No vendor-specific keyboard/inset divergence was verified from a primary developer source in this audit. | Hello UI device, display scaling, navigation modes, and keyboards. |
| HONOR | No vendor-specific keyboard/inset divergence was verified from a primary developer source in this audit. | MagicOS device, multi-window, navigation modes, and keyboards. |
| Huawei | No app-specific EMUI/HarmonyOS compatibility result was established in this audit. Device availability and Android-app compatibility must be checked per model. | Supported Huawei model, app installation/runtime support, keyboard, and window behavior. |

## AfuChat audit and confirmed code issue

### Confirmed onboarding defect

The onboarding screen scheduled separate delayed scrolls after focus and after
the keyboard appeared. It also measured the scroll view's absolute screen Y
position and added that value to the scroll responder's additional keyboard
clearance. That mixed coordinate spaces and allowed two timing-dependent scroll
requests to compete.

**Correction:** Removed the timers and manual native-handle scroll calculation.
The screen now uses controller-managed focused-input scrolling and a sticky
action view driven by live keyboard events. The country picker search input is
inside a keyboard-aware list scroll component.

**Scope of the claim:** The coordinate/timing defect is confirmed by source
inspection. Because no reproduction steps or affected device were supplied,
the exact user-visible symptom has not been reproduced on hardware.

### Shared architecture changes

- Added the root keyboard event provider and a device adaptation hook exposing
  platform/OS version, live window size, orientation, width class, safe-area
  insets, font scale, and keyboard animation values.
- Standardized the existing keyboard-avoiding views in 30 app/component files
  through one platform-aware wrapper. Native screens use the controller;
  browser rendering retains React Native's keyboard-avoiding view.
- Updated the existing keyboard-aware scroll wrapper to use the controller on
  native and a regular scroll view on web.
- Kept the existing Supabase, authentication, app routing, and Android resize
  configuration unchanged.
- Added deterministic tests for compact, medium, and expanded window-width
  classification.

## Repeatable device test matrix

**Current result: not run.** This environment has no attached physical devices.
The rows below are required test runs, not passes.

| Device family | OS/device record | IME | Navigation / window modes | Result |
| --- | --- | --- | --- | --- |
| Samsung Galaxy | Record exact model and Android/One UI version | Samsung Keyboard, Gboard, SwiftKey | Gesture, 3-button, split-screen, floating | Not run |
| Google Pixel | Record exact model and Android version | Gboard, SwiftKey | Gesture, 3-button, floating | Not run |
| Xiaomi / Redmi | Record exact model and HyperOS/MIUI version | Installed default IME, Gboard, SwiftKey | Navigation modes, floating window | Not run |
| TECNO | Record exact model and HiOS version | Installed default IME, Gboard | Navigation modes, background/resume | Not run |
| Infinix | Record exact model and XOS version | Installed default IME, Gboard | Navigation modes, floating window | Not run |
| OPPO | Record exact model and ColorOS version | Installed default IME, Gboard, SwiftKey | Navigation modes, floating window | Not run |
| OnePlus | Record exact model and OxygenOS version | Installed default IME, Gboard, SwiftKey | Navigation modes, multi-window | Not run |
| Vivo | Record exact model and Funtouch/OriginOS version | Installed default IME, Gboard | Navigation modes, small window | Not run |
| Motorola | Record exact model and Hello UI/Android version | Gboard, SwiftKey | Navigation modes, display scaling | Not run |
| HONOR | Record exact model and MagicOS version | Installed default IME, Gboard | Navigation modes, multi-window | Not run |
| Huawei | Record exact model and EMUI/HarmonyOS version | Installed default IME | Installation/runtime support, window modes | Not run |
| iPhone | Record model and iOS version | Apple keyboard, hardware keyboard | Portrait, landscape, larger text | Not run |
| iPad | Record model and iPadOS version | Apple keyboard, hardware keyboard | Split View/resizable window, floating keyboard, Dynamic Type | Not run |

For each available device, exercise login, registration, onboarding, profile
editing, long and multiline fields, search, comments, chat composer, modal
forms, and submit actions. Focus and move between fields, scroll with the
keyboard open, submit, dismiss/reopen the keyboard, rotate where supported,
change display/font scaling, switch IMEs, and navigate away while focused.
Record the exact device, OS, keyboard, screen, expected behavior, observed
behavior, and result. Do not treat an emulator or web export as a real-device
pass.

## Verification and open limitations

- TypeScript check: passed after the shared component migration.
- Mobile Node test suite: 49 passed, 0 failed, including the width-class and
  onboarding architecture regression tests.
- Expo web export: passed and served 150 static routes; the browser preview
  loaded the public root route. A web screenshot cannot exercise native
  keyboard movement.
- Native startup and Android/iOS device tests: not run.
- Physical Android/iOS and IME testing: not run.
- Chat, story, channel, post, and video-comment features still contain bespoke
  keyboard-event listeners because they coordinate custom composers, media, or
  animated panels. They require a dedicated behavior review before replacing
  their event-driven animations.
- A full performance, low-memory, network-resilience, and lifecycle benchmark
  was not run; this change does not claim those results.

## Primary references

- [Android window insets](https://developer.android.com/develop/ui/views/layout/insets)
- [Android IME inset API](https://developer.android.com/reference/android/view/WindowInsets.Type#ime())
- [Android adaptive apps](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps)
- [Android width size classes](https://developer.android.com/develop/adaptive-apps/guides/window-size-classes)
- [Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16)
- [Vivo global small-window adaptation guide](https://dev.vivo.com.cn/documentCenter/doc/582)
- [Apple keyboard frame notification](https://developer.apple.com/documentation/uikit/uiresponder/keyboarddidchangeframenotification)
- [Apple layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Apple multitasking guidance](https://developer.apple.com/design/human-interface-guidelines/multitasking)
- [Microsoft SwiftKey keyboard modes](https://support.microsoft.com/en-US/swiftkey-keyboard/how-to-change-your-keyboard-mode-on-microsoft-swiftkey-keyboard)
- [Expo SDK 58 keyboard controller](https://docs.expo.dev/versions/v58.0.0/sdk/keyboard-controller/)
- [Expo keyboard handling guide](https://docs.expo.dev/guides/keyboard-handling)
