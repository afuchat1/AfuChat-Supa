---
name: AfuMusic platform rules
description: Product constraints for AfuMusic publishing, purchases, and album artwork.
---

AfuMusic uses AfuPay as its only wallet and purchase system; do not introduce a separate balance or payment ledger. Paid publishing requires an active Premium tier and prices must be integer ACoin amounts from 5 through 1000. Show genuine uploaded cover art when available; do not use generated artist initials or fake tracks/statistics as production artwork.

**Why:** These are explicit requirements in the AfuMusic platform implementation brief.

**How to apply:** Keep publishing and purchases tied to the existing subscription and AfuPay records, and use a neutral music-icon fallback until real cover art is available.
