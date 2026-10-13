---
name: AfuMusic platform rules
description: Product constraints for AfuMusic publishing, purchases, and album artwork.
---

AfuMusic uses AfuPay as its only wallet and purchase system; do not introduce a separate balance or payment ledger. Paid publishing requires an active Premium tier and prices must be integer ACoin amounts from 5 through 1000. Show genuine uploaded cover art when available; do not use generated artist initials or fake tracks/statistics as production artwork.

Treat AfuMusic as a platform-wide AfuChat content type, not a standalone app feature. "Search" in this scope means the existing AfuSearch experience. The same canonical tracks must be discoverable and usable from AfuSearch, feed posts, Shots, video creation, creator profiles, and AfuMusic.

**Why:** These are explicit requirements in the AfuMusic platform implementation brief.

**How to apply:** Keep publishing and purchases tied to existing subscription and AfuPay records, and carry one track ID and permissions model across all app surfaces. Use a neutral music-icon fallback until real cover art is available.
