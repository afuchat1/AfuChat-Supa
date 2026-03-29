#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "Bumping version..."
node scripts/bump-version.js

echo "Starting EAS build..."
EAS_NO_VCS=1 EXPO_NO_INTERACTIVE=1 npx eas-cli@latest build \
  --platform android \
  --profile preview \
  --non-interactive \
  --no-wait 2>&1
