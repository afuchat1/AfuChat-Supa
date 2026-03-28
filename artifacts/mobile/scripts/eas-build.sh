#!/bin/bash
cd "$(dirname "$0")/.."

node scripts/bump-version.js

rm -f /tmp/eas_input
mkfifo /tmp/eas_input

(
  sleep 5
  echo "y" > /tmp/eas_input
) &
INPUT_PID=$!

EXPO_TOKEN="$EXPO_TOKEN" EAS_NO_VCS=1 \
  script -qefc "$HOME/.config/npm/node_global/bin/eas build --platform android --profile preview --no-wait" /tmp/eas_script.log < /tmp/eas_input &
SCRIPT_PID=$!

for i in $(seq 1 45); do
  sleep 2
  if ! kill -0 $SCRIPT_PID 2>/dev/null; then
    break
  fi
done

if kill -0 $SCRIPT_PID 2>/dev/null; then
  kill $SCRIPT_PID 2>/dev/null
fi
kill $INPUT_PID 2>/dev/null
wait 2>/dev/null

cat /tmp/eas_script.log 2>/dev/null | tr -d '\r' | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | grep -E "(Build details|Error|✔|Version)" | tail -10
rm -f /tmp/eas_input
