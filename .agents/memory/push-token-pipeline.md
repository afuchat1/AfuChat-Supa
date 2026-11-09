---
name: Expo push token pipeline
description: Expo token registration, provider ticket validation, and native build requirements for push delivery
---

The value emitted by `addPushTokenListener` is a native APNs/FCM device token, not an `ExpoPushToken`. Only values returned by `getExpoPushTokenAsync({ projectId })` belong in an Expo push registry or should be sent to the Expo Push API.

**Why:** Persisting the native token can make the registry appear populated while Expo rejects delivery, and provider ticket errors are otherwise easy to mistake for successful sends.

**How to apply:** Validate `ExpoPushToken[...]`/`ExponentPushToken[...]` at registration and send time, disable malformed rows, inspect every Expo ticket, and ship a new native build when client registration behavior changes.

Repeated native-token events must be change-detected before invalidating the Expo-token registration cache; otherwise startup events can create a registration request loop even when the device token is unchanged.

**Why:** A live Android client produced thousands of successful registration audit rows while only one device row existed, because every native-token listener event forced another registration.

**How to apply:** Persist the last native token, invalidate the Expo registration timestamp only when that native token changes, and deduplicate recent identical registrations server-side before writing audit rows.

## Edge-function auditability

Keep all values used by the push sender derived from explicitly named request fields, and run a deployed-function smoke check after every push-function change. A runtime symbol error before the audit write can make notifications disappear while leaving no delivery log.

**Why:** The live registry had enabled Android devices and successful registrations, but zero delivery records because the sender referenced an undeclared avatar variable before its audit block.

**How to apply:** Treat “registered devices but no delivery rows” as a sender invocation/runtime failure first; inspect deployed Edge Function code and redeploy it before changing client token or Android channel logic.

## Expo receipt verification

An Expo ticket with `status: "ok"` only means Expo accepted the request; Android delivery can still fail later. Poll Expo receipts and treat `SENDER_ID_MISMATCH` as an EAS/FCM credential project mismatch with the app's `google-services.json`, while `DeviceNotRegistered` means the stored device row is stale.

**Why:** Android receipts can report FCM `SenderId mismatch` or `DeviceNotRegistered` for every request even when Supabase rows are enabled and the initial provider response is successful.

**How to apply:** Keep the Firebase sender/project and EAS Android FCM service-account credentials aligned before changing client registration code. If the credentials already match, assume tokens from an older APK/sender until a clean reinstall proves otherwise; disable stale tokens after receipt errors and never label provider tickets as final delivery.

If a newly registered token from a clean/current install still returns `SENDER_ID_MISMATCH`, the dashboard credential alone is not proof that the installed artifact uses the same Firebase sender. Re-download `google-services.json`, rebuild with an incremented version, and verify the artifact/build project before debugging Supabase.

**Why:** A fresh registration can preserve the same failure when the APK was built from a different Firebase config or an older EAS credential/build artifact.

**How to apply:** Treat fresh-token `SENDER_ID_MISMATCH` as an APK/EAS credential alignment problem; do not purge working Supabase rows or rewrite client token registration first.

## Direct FCM provider

The app's push pipeline uses native FCM tokens and Firebase HTTP v1 only. It must not request Expo push tokens, call the Expo push gateway, or preserve legacy Expo device rows as enabled delivery targets.

**Why:** The product requires provider-independent direct Firebase delivery; an Expo fallback can hide a broken native FCM setup and route notifications through a different service than intended.

**How to apply:** Register `getDevicePushTokenAsync()` values only when the native token type is `fcm`, send through the Firebase HTTP v1 endpoint, disable legacy Expo rows, and ship a new Firebase-enabled native build after changing registration behavior. Expo Go cannot validate this path.

Web chat senders must still invoke the authenticated direct-FCM sender for native recipients; web should skip token registration, not message delivery.

**Why:** The browser has no native device token, but a browser-sent message can target an Android recipient that does. Returning early from the shared delivery helper on web caused those messages to produce no delivery audit row at all.

**How to apply:** Keep the `Platform.OS === "web"` guard out of `notifyChatRecipients`; let the Edge Function filter recipients by enabled native devices.

## Android notification media

For direct FCM notifications handled by Expo's Android builder, use the sender avatar as the FCM `notification.image` large icon and keep message attachments in `data` only.

**Why:** Sending an attachment URL as the FCM image makes the media dominate the notification instead of showing the sender identity.

**How to apply:** Preserve `senderAvatarUrl` in stringified FCM data for the app, and never promote `attachmentUrl` to the FCM image field.

Important API detail: `expo-notifications.getDevicePushTokenAsync()` labels the native token type by platform (`"android"`/`"ios"`), not provider (`"fcm"`). On Android, `type === "android"` with string `data` is the FCM token.

**Why:** Requiring `type === "fcm"` rejects every valid Android token before it reaches the registration Edge Function, leaving the production device registry empty.

**How to apply:** Compare the returned type with `Platform.OS`, validate the token data as a direct FCM token, and test only with a Firebase-enabled native build—not Expo Go.

Release builds should retry native FCM token acquisition before giving up because Firebase initialization can lag behind the first JavaScript frame on a Play-installed AAB.

**Why:** A one-shot token request can fail on a cold release install even when the same code works in an internal APK.

**How to apply:** Retry `getDevicePushTokenAsync()` with bounded delays, then retry registration on a later foreground/connectivity event.

Internal APK and Play AAB builds can share the same Firebase project and EAS keystore while still being signed by different certificates after Play re-signing.

**Why:** Firebase/Google API restrictions can allow FCM registration for the internal APK certificate but reject the Play App Signing certificate.

**How to apply:** Register both the EAS upload-key fingerprints and the Google Play App Signing SHA-1/SHA-256 fingerprints for `com.afuchat.afuapp` in the Firebase Android app.

## Production diagnostic

Production registration failures with `INVALID_DEVICE_TOKEN` and no `push_devices` rows indicate an Expo Go or legacy APK is still calling the endpoint with an Expo-formatted token; this is expected under direct FCM.

**Why:** Expo Go can exercise the JavaScript registration path but cannot produce the Firebase-backed native token required by the direct FCM sender.

**How to apply:** Test registration with the current Firebase-enabled standalone APK/AAB after a clean reinstall; do not loosen server validation to make Expo Go appear registered.

## Sender authorization

The push sender must derive identity from the verified Supabase session and verify sender membership, message ownership, and recipient membership for the supplied chat before reading device tokens.

**Why:** Authentication alone does not stop a signed-in client from submitting another user's IDs or using the sender as an arbitrary push-spam endpoint.

**How to apply:** Reject mismatched sender IDs and any message/chat/recipient combination not authorized by the authenticated user; keep device-token writes scoped by RLS to the token owner.