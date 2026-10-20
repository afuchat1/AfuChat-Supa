---
name: AfuSearch content-first discovery
description: Product rule for AfuSearch's pre-search discovery and spelling suggestions.
---

AfuSearch should expose real AfuChat content before the user starts searching. While typing, show content-backed suggestions as a ranked vertical list of tap-to-search rows, not horizontal chips. Typing and autocomplete are read-only: only a completed search the user explicitly submits may contribute to shared trends. Normalize and deduplicate contributions, honor the user's analytics opt-out, exclude profiles hidden from search, and show profile details only when their visibility allows it. When a query has no results, only show corrected results when a close candidate from AfuChat content, visible profiles, or submitted search terms produces current visible results; preserve the original query and let the user choose it instead. If no trustworthy match exists, do not guess an unrelated term.

**Why:** the user wants a globally shared, trend-aware search experience without indexing unfinished input or exposing private profile information.

**How to apply:** keep trending content visible on the idle screen, rank exact matches ahead of popularity, derive suggestions and corrections from AfuChat data rather than external or generated vocabularies, and keep an explicit route back to the exact original search.
