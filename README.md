# AfuChat

AfuChat is an Android mobile app built with React Native and Expo. It provides messaging, social feeds, stories, AI features, payments, mini-apps, and offline-first native storage. Public application traffic goes through the Cloudflare Worker API, which uses the shared Supabase project internally and Cloudflare R2 for media.

## Stack

- React Native 0.83
- Expo SDK 55 and Expo Router
- Hermes and the React Native New Architecture
- Cloudflare Worker API (Hono)
- Supabase Auth, PostgreSQL, and Realtime behind the Worker
- Cloudflare R2 object storage behind the Worker
- AsyncStorage, SQLite, and MMKV for native persistence
- pnpm workspace with the app in `artifacts/mobile`

## Install and run

```bash
pnpm install
```

Start the configured Android workflow in Replit, or run:

```bash
cd artifacts/mobile
EXPO_OFFLINE=1 NODE_OPTIONS=--max-old-space-size=4096 \
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
  supabase/     Existing Supabase migrations kept for schema reference
backend/cf-worker/
  src/          Cloudflare Worker API
  wrangler.toml Worker routes and R2 binding
```

The Supabase directory is intentionally preserved for schema history. It is not a public backend surface; app-owned functions are implemented as Worker routes.

## Verification

```bash
cd artifacts/mobile
pnpm exec expo export --platform android
pnpm run typecheck
```

## Native-only notes

- The app does not include a web or Express server layer.
- The only public backend is the Cloudflare Worker at `https://api.afuchat.com`.
- `expo-web-browser` remains for Android OAuth and external links.
- `react-native-webview` remains for the native AfuPay payment flow.
- Replit startup uses `EXPO_OFFLINE=1`; do not replace it with `CI=1`.
- EAS builds from Replit require `EAS_NO_VCS=1`.

## License

MIT © 2026 AfuChat Technologies Ltd