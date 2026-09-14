#!/usr/bin/env bash
# Patch: react-native-worklets SoLoader try-catch.
# WorkletsModule has a static/init SoLoader.loadLibrary("worklets") block that runs
# when the class is first loaded (New Architecture, during early JS init). If libworklets.so
# fails to load (ABI mismatch, linker error, missing dep), it throws UnsatisfiedLinkError
# which escapes the Java exception handler and crashes the whole JVM before any JS error
# handler can catch it. Wrapping in try-catch degrades gracefully: Reanimated will
# report a JS error (caught by ErrorBoundary) instead of a silent native crash.

set -e

# ─── Skip patch if python3 is unavailable (e.g. Replit web env) ─────────────
if ! command -v python3 &>/dev/null; then
  echo "[postinstall] python3 not found — skipping WorkletsModule patch (web/dev env)."
  exit 0
fi

# ─── Patch: WorkletsModule SoLoader try-catch ───────────────────────────────
# Worklets 0.10 moved from Java bundling variants to Kotlin networking/no-networking
# source sets. Discover both layouts so SDK upgrades do not silently remove this
# native crash guard.

patch_worklets() {
  local FILE="$1"
  if [ ! -f "$FILE" ]; then
    return
  fi

  python3 - "$FILE" <<'PYEOF'
import sys
import pathlib
import re

path = pathlib.Path(sys.argv[1])
txt = path.read_text()

if 'catch (Throwable __wt)' in txt:
    print("[postinstall] WorkletsModule already patched:", path)
else:
    def replace_load(match):
        indent = match.group("indent")
        call = f'{indent}SoLoader.loadLibrary("worklets")'
        return (
            f"{indent}try\n"
            f"{indent}{{\n"
            f"{indent}    {call.lstrip()}\n"
            f"{indent}}} catch (Throwable __wt) {{\n"
            f'{indent}    android.util.Log.e("WorkletsModule", '
            f'"libworklets.so failed to load - Reanimated will be disabled: " + __wt)\n'
            f"{indent}}}"
        )

    patched, count = re.subn(
        r'^(?P<indent>[ \t]*)SoLoader\.loadLibrary\("worklets"\)\s*$',
        replace_load,
        txt,
        flags=re.MULTILINE,
    )
    if count:
        path.write_text(patched)
        print("[postinstall] WorkletsModule patched:", path)
    else:
        print("[postinstall] WorkletsModule load block not found:", path)
PYEOF
}

mapfile -t WORKLETS_FILES < <(
  find node_modules/react-native-worklets/android -type f \
    \( -name "WorkletsModule.java" -o -name "WorkletsModule.kt" \) \
    -print
)

for WORKLETS_FILE in "${WORKLETS_FILES[@]}"; do
  patch_worklets "$WORKLETS_FILE"
done

# ─── Verify patches applied — fail loudly if not ──────────────────────────────
# Silent patch failure is worse than a build failure: it produces an APK that
# crashes on launch with no JS error, no stack trace, and no red-box.

WORKLETS_PATCHED=0
for WORKLETS_FILE in "${WORKLETS_FILES[@]}"; do
  if grep -q 'catch (Throwable __wt)' "$WORKLETS_FILE" 2>/dev/null; then
    WORKLETS_PATCHED=1
  fi
done

if [ "$WORKLETS_PATCHED" -eq 0 ]; then
  echo "[postinstall] ERROR: WorkletsModule SoLoader patch DID NOT APPLY." >&2
  echo "[postinstall] No supported WorkletsModule source file was patched under:" >&2
  echo "  node_modules/react-native-worklets/android" >&2
  echo "[postinstall] Without this patch, a libworklets.so load failure crashes the JVM" >&2
  echo "[postinstall] before any JS error handler can intercept it." >&2
  echo "[postinstall] Check the installed WorkletsModule source format." >&2
  exit 1
fi
echo "[postinstall] WorkletsModule SoLoader patch verified OK."

