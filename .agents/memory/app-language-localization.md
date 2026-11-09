---
name: App language localization
description: The selected first-run language controls global UI text independently from message translation settings.
---

The first language selected before welcome is the app UI language. Keep it in the device preference for immediate startup and sync it to the profile for recovery on another device; do not derive it from the message-translation toggle.

**Why:** Users expect choosing Chinese, Swahili, or another language to change the whole interface, while message translation is a separate content preference.

**How to apply:** Route first-run users through language selection before welcome, keep global static UI text on the localization transform, and use the translation service as a fallback for supported languages without local dictionary entries.

Language changes must update the context immediately but serialize persistence with latest-selection-wins semantics. Rapid taps or a settings change must never allow an older async write to overwrite the newest language.

**Why:** The onboarding selector can write on selection and again on Continue, and remote/device writes can otherwise resolve out of order.

**How to apply:** Keep a monotonically increasing change id and a persistence queue around AsyncStorage, local storage, and profile synchronization.

New UI work should use semantic namespaced keys (for example, `profile.edit_profile`) while legacy English-phrase keys remain temporarily supported during migration.

**Why:** Semantic keys make catalog coverage auditable and prevent copy changes from silently breaking translations, without requiring a risky all-screen rewrite.

**How to apply:** Add every new key to all bundled UI locales, use interpolation parameters for dynamic copy, and run `pnpm audit:i18n` before shipping.