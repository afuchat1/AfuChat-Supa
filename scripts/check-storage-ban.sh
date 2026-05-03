#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AfuChat Storage Ban Checker
#
# Fails with exit code 1 if any source file contains a banned Supabase Storage
# pattern. Run on every PR — Cloudflare R2 (cdn.afuchat.com) is the ONLY
# allowed storage backend. See docs/STORAGE_RULES.md for full context.
#
# Usage:
#   ./scripts/check-storage-ban.sh              # scan everything
#   ./scripts/check-storage-ban.sh src/foo.ts   # scan specific files
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Banned patterns ───────────────────────────────────────────────────────────
# Each entry: "PATTERN|REASON"
declare -a BANNED=(
  "\.storage\.from(|Supabase Storage client API (.storage.from) — use uploadToStorage() from lib/mediaUpload.ts"
  "\.storage\.createBucket(|Supabase Storage bucket creation — no buckets must exist"
  "\.storage\.upload(|Direct Supabase Storage upload — use uploadToStorage() from lib/mediaUpload.ts"
  "\.storage\.getPublicUrl(|Supabase Storage public URL — CDN URL comes from uploadToStorage() return value"
  "storage/v1/bucket|Direct Supabase Storage REST API (bucket endpoint) — use R2 via edge function only"
  "storage/v1/object|Direct Supabase Storage REST API (object endpoint) — use R2 via edge function only"
  "supabaseStorageUpload|Banned fallback function — this was deliberately removed"
  "supabase\.co/storage|Hardcoded Supabase Storage URL — all media must be on cdn.afuchat.com"
)

# ── Files / dirs to exclude from scanning ────────────────────────────────────
EXCLUDE_PATHS=(
  "node_modules"
  ".git"
  "supabase/migrations"          # SQL files reference storage schema legitimately
  "docs/STORAGE_RULES.md"        # documentation explains the banned patterns
  "scripts/check-storage-ban.sh" # this file itself
  ".github/workflows"            # CI YAML may echo pattern names
  "dist"
  "build"
  ".local"
  "*.map"
)

# ── Build the grep exclude args ───────────────────────────────────────────────
GREP_EXCLUDES=()
for p in "${EXCLUDE_PATHS[@]}"; do
  GREP_EXCLUDES+=("--exclude-dir=${p}" "--exclude=${p}")
done

# ── Determine scan targets ────────────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=(
    "artifacts/mobile"
    "artifacts/api-server/src"
    "supabase/functions"
  )
fi

# ── Run the scan ──────────────────────────────────────────────────────────────
TOTAL_HITS=0
declare -a VIOLATIONS=()

for entry in "${BANNED[@]}"; do
  PATTERN="${entry%%|*}"
  REASON="${entry#*|}"

  # grep -rn returns 0 if matches found, 1 if no matches
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    VIOLATIONS+=("${RED}BANNED:${RESET} ${YELLOW}${REASON}${RESET}\n  ${hit}")
    (( TOTAL_HITS++ )) || true
  done < <(
    grep -rn "${GREP_EXCLUDES[@]}" \
      --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs" \
      -E "$PATTERN" \
      "${TARGETS[@]}" 2>/dev/null \
      | grep -vE '^\S+:[0-9]+:\s*(//|/\*|\*|#)' \
      || true
  )
done

# ── Report ────────────────────────────────────────────────────────────────────
echo ""
if [[ $TOTAL_HITS -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ Storage ban check passed.${RESET}"
  echo -e "  All media correctly routed through Cloudflare R2 (cdn.afuchat.com)."
  echo ""
  exit 0
fi

echo -e "${RED}${BOLD}✗ Storage ban check FAILED — ${TOTAL_HITS} violation(s) found${RESET}"
echo -e "${BOLD}  All user-uploaded files must go through Cloudflare R2 only.${RESET}"
echo -e "  See docs/STORAGE_RULES.md for the correct patterns.\n"

for v in "${VIOLATIONS[@]}"; do
  echo -e "  $v"
  echo ""
done

echo -e "${YELLOW}Fix:${RESET} Use ${BOLD}uploadToStorage()${RESET} from ${BOLD}artifacts/mobile/lib/mediaUpload.ts${RESET}"
echo -e "     The upload URL is ${BOLD}https://cdn.afuchat.com/...${RESET} — never supabase.co/storage"
echo ""
exit 1
