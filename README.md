# AfuChat

AfuChat is an Android mobile app built with React Native and Expo. It provides messaging, social feeds, stories, AI features, payments, mini-apps, and offline-first native storage while using the existing Supabase project for backend services.

## Stack

- React Native 0.83
- Expo SDK 55 and Expo Router
- Hermes and the React Native New Architecture
- Supabase Auth, PostgreSQL, Realtime, Storage, and Edge Functions
- AsyncStorage, SQLite, and MMKV for native persistence
- pnpm workspace with the app in `artifacts/mobile`

## Install and run

```bash
pnpm install
```

Start the configured Android workflow in Replit, or run:

```bash
cd artifacts/mobile
NODE_OPTIONS=--max-old-space-size=4096 \
  pnpm exec expo start --go --tunnel --port 8000
```

Scan the Expo Go QR code with an Android device.

## Repository structure

```text
artifacts/mobile/
  app/          Expo Router routes
  components/   React Native components
  context/      Shared application state
  hooks/        React hooks
  lib/          Native services and Supabase client
  modules/      Native mini-apps
  supabase/     Existing Supabase migrations and functions
```

The Supabase directory is intentionally preserved. App cleanup must not modify its migrations or Edge Functions.

## Verification

```bash
cd artifacts/mobile
pnpm exec expo export --platform android
pnpm run typecheck
```

## Native-only notes

- The app does not include a web or Express server layer.
- `expo-web-browser` remains for Android OAuth and external links.
- `react-native-webview` remains for the native AfuPay payment flow.
- Replit startup uses `EXPO_OFFLINE=1`; do not replace it with `CI=1`.
- EAS builds from Replit require `EAS_NO_VCS=1`.

## License

MIT © 2026 AfuChat Technologies Ltd