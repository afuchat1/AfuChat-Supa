---
name: UI i18n vs content translation
description: The boundary between AfuChat's bundled page localization and runtime user-content translation.
---

Page and interface copy must use the synchronous bundled i18n catalogs. Runtime translation through Google is only for user-authored messages, posts, and similar content.

**Why:** UI must work offline and render deterministically without sending interface copy to a remote translator; user content is dynamic and cannot be fully cataloged.

**How to apply:** Add page strings to the local i18n catalogs and use the i18n entry point. Keep Google calls in clearly named user-content helpers and only call them with message/post content.