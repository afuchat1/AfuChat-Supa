---
name: EAS project migration
description: The app uses a replacement EAS project when ownership access cannot be transferred.
---

When an EAS project is replaced rather than transferred, update every build-profile project ID together and treat Expo push tokens as project-scoped: devices must register again against the replacement project.

**Why:** The old project may remain inaccessible to the active Expo account, while builds and push registration must resolve through the same replacement project.

**How to apply:** Keep the app identifiers unchanged for internal builds, verify the new owner can read the project before building, and do not assume old push-device rows remain deliverable.