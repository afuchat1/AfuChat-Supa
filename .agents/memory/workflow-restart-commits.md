---
name: Workflow restart commits
description: Managed workflow restarts can advance local branch pointers by recording workspace changes.
---

In this workspace, restarting a managed workflow has been followed by an automatic commit of the current workspace changes, moving `master` ahead of `origin/master`. Do not assume an earlier branch reset will remain in effect after a restart.

**Why:** The user requested local branches remain at the origin commit, but restarting Expo Go later recreated a local commit.

**How to apply:** After managed workflow restarts, inspect branch heads and `git status`. When origin alignment is still required, use a mixed reset for the current branch and reset other explicitly named local branches to the same target so working files are preserved.
