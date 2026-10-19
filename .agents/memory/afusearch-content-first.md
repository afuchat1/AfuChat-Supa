---
name: AfuSearch content-first discovery
description: Product rule for AfuSearch's pre-search discovery and spelling suggestions.
---

AfuSearch should expose real AfuChat content before the user starts searching. When a query has no results, only show corrected results when a close keyword match is found in existing public content or visible profiles; preserve the original query and let the user choose it instead. If no trustworthy match exists, do not guess an unrelated term.

**Why:** the user wants AfuSearch to help people discover content, not explain categories, and to base "Did you mean?" suggestions on what actually exists in AfuChat.

**How to apply:** keep trending content visible on the idle screen, derive corrections from AfuChat data rather than external or generated vocabularies, and keep an explicit route back to the exact original search.
