---
name: Metro watchHistory resolution fix
description: How to fix Metro "Unable to resolve @/lib/watchHistory" on native when file exists
---

## Rule
If Metro reports "Unable to resolve @/lib/<newfile>" on native but the file exists and the
alias works for other files, the cause is Metro's haste map having a stale negative-cache
entry for the newly created file. Two fixes work together:

1. Replace any Unicode box-drawing characters (U+2500 `─`, U+2014 `—`, smart quotes) in the
   file's comments with plain ASCII equivalents. Hermes/Metro on native can mis-index files
   with non-ASCII content in some cache states.

2. The next successful Android bundle request (with a fresh Metro start) will rebuild the
   haste map and resolve the file correctly. The cache clear from `.expo/cache` + `.expo/metro`
   is sufficient; the Metro temp files in /tmp are rebuilt on the next bundle.

## Why
Metro's haste map caches negative results ("file not found") across restarts when using
persistent cache. Newly created files with unusual Unicode characters sometimes fail to be
indexed correctly on native (while web bundling works because it uses a different resolution
path). The cache rebuild triggered by the first full native bundle request (2739 modules)
clears the stale entry.

## How to apply
- When creating new lib files, use only ASCII in comments
- If "Unable to resolve @/lib/X" appears after creating X, clear `.expo/cache` and `.expo/metro`
  then allow the next bundle request to rebuild the haste map
- Do NOT add `--clear` to the expo start workflow permanently; it adds ~30s to every startup
