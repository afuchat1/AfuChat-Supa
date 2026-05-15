#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# AfuChat dev-start.sh
#
# Starts Expo Metro and immediately pre-warms the Android + iOS native
# bundles in the background.
#
# WHY: Metro compiles the native bundle on the first request (~100 s).
# Expo Go has a ~60 s timeout, so it always fails with
# "Failed to download remote update" on cold start.
# Pre-warming caches the bundle so Expo Go gets it in < 1 s.
# ---------------------------------------------------------------------------

set -e
cd "$(dirname "$0")/.."   # cd to artifacts/mobile/

echo "► Starting Expo Metro on port 5000…"

EXPO_NO_LAZY=1 \
  EXPO_PACKAGER_PROXY_URL="https://${REPLIT_EXPO_DEV_DOMAIN}" \
  EXPO_PUBLIC_DOMAIN="${REPLIT_DEV_DOMAIN}" \
  EXPO_PUBLIC_REPL_ID="${REPL_ID}" \
  REACT_NATIVE_PACKAGER_HOSTNAME="${REPLIT_EXPO_DEV_DOMAIN}" \
  ./node_modules/.bin/expo start --web --port 5000 &

EXPO_PID=$!

# ── Wait for Metro to become ready ─────────────────────────────────────────
echo "► Waiting for Metro bundler to be ready…"
for i in $(seq 1 60); do
  if curl -sf "http://localhost:5000/packager-status" 2>/dev/null | grep -q "running"; then
    break
  fi
  sleep 3
done
echo "► Metro is ready."

# ── Pre-warm Android bundle ─────────────────────────────────────────────────
(
  ANDROID_URL=$(
    curl -sf --max-time 15 "http://localhost:5000/" \
      -H "Accept: application/expo+json" \
      -H "Expo-SDK-Version: 54.0.0" \
      -H "Expo-Platform: android" 2>/dev/null |
    node -e "
      let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
        try {
          const u = JSON.parse(d).launchAsset?.url || '';
          console.log(u.replace(/^https?:\/\/[^/]+/, 'http://localhost:5000'));
        } catch(e) { process.exit(1); }
      });
    " 2>/dev/null
  )
  if [ -n "$ANDROID_URL" ]; then
    echo "► Pre-warming Android bundle (first compile ~100 s)…"
    if curl -sf --max-time 300 "$ANDROID_URL" -o /dev/null 2>/dev/null; then
      echo "► Android bundle warm ✓"
    else
      echo "► Android bundle pre-warm failed (will compile on demand)"
    fi
  else
    echo "► Could not resolve Android bundle URL — skipping pre-warm"
  fi
) &

# ── Pre-warm iOS bundle ─────────────────────────────────────────────────────
(
  IOS_URL=$(
    curl -sf --max-time 15 "http://localhost:5000/" \
      -H "Accept: application/expo+json" \
      -H "Expo-SDK-Version: 54.0.0" \
      -H "Expo-Platform: ios" 2>/dev/null |
    node -e "
      let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
        try {
          const u = JSON.parse(d).launchAsset?.url || '';
          console.log(u.replace(/^https?:\/\/[^/]+/, 'http://localhost:5000'));
        } catch(e) { process.exit(1); }
      });
    " 2>/dev/null
  )
  if [ -n "$IOS_URL" ]; then
    echo "► Pre-warming iOS bundle (first compile ~100 s)…"
    if curl -sf --max-time 300 "$IOS_URL" -o /dev/null 2>/dev/null; then
      echo "► iOS bundle warm ✓"
    else
      echo "► iOS bundle pre-warm failed (will compile on demand)"
    fi
  fi
) &

# ── Keep Metro in the foreground ────────────────────────────────────────────
wait $EXPO_PID
