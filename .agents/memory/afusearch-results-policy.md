---
name: AfuSearch results policy
description: Product scope and result behavior for AfuSearch visual search.
---

AfuSearch searches public AfuChat posts only. It should find related posts using image matching, readable text inside the submitted image, and typed keywords. Keep results in one search screen: show matching posts as normal content rows and image results in a two-column, Google Images-style grid. Preserve a clear empty state. Do not scrape Google, TikTok, or other external image sources.

**Why:** The user selected AfuChat public posts as the source and asked for one results page that includes normal content matches and an image grid.

**How to apply:** Keep result queries limited to public, non-blocked AfuChat posts; display OCR/text/caption matches as content results and image matches in the image grid.
