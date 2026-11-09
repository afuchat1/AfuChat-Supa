---
name: EAS build on Replit — EAS_NO_VCS=1 workaround
description: How to trigger EAS CLI builds from Replit main agent without git errors
---

# EAS build on Replit

## The Rule
Always set `EAS_NO_VCS=1` when running `eas build` from the Replit main agent.

**Why:** Replit's main agent blocks all destructive git operations (git stash, git add, git commit, etc.). EAS CLI normally calls `git stash` when there are uncommitted changes (which there always are mid-session on Replit), then archives, then `git stash pop`. Both stash calls are blocked → build fails. `EAS_NO_VCS=1` skips all git interaction and uploads via file-system archive instead.

**How to apply:**
```bash
cd artifacts/mobile && EAS_NO_VCS=1 EXPO_TOKEN=<token> node_modules/.bin/eas build \
  --platform android --profile preview --non-interactive --no-wait
```

Use `configureWorkflow` (outputType: "console") to run the build as a background workflow — the bash tool will time out on long uploads.
The `--non-interactive` and `--no-wait` flags are both required.
Build typically takes ~18 minutes on EAS servers after submission.

## Active account (as of 2026-06-06)
- **Account:** amkaweesi1 (switched from afume which hit free plan quota)
- **EXPO_TOKEN env var:** stored in Replit env (EXPO_TOKEN)
- **EAS Project ID:** b55c5d92-7a83-472f-b660-d1838efba5fe
- **app.json owner:** amkaweesi1
- **Keystore:** Build Credentials I56-2eELc3 (auto-generated, remote)

## Switching accounts — steps required
When switching Expo accounts:
1. Remove `extra.eas.projectId` and update `owner` in `app.json`
2. Run `eas init --non-interactive --force` with new EXPO_TOKEN to get new project ID
3. Update all `EXPO_PUBLIC_EAS_PROJECT_ID` values in `eas.json` (3 profiles)
4. Update `app.json` `extra.eas.projectId` with new ID (eas init writes this automatically)

## Build history (most recent first)

## Account quota gate

EAS can upload and fingerprint the project successfully, then reject an Android build before compilation when the account has exhausted its monthly free-plan build allowance.

**Why:** Retrying the same profile does not create an APK and only repeats the upload/quota failure.

**How to apply:** Treat the explicit free-plan quota message as an account gate; wait for the reset or change the EAS plan/account before retrying. Verify local Expo export and config separately while blocked.

### 2026-06-07 — v2.2.2 (compileSdkVersion bumped 35→36 to fix checkReleaseAarMetadata)
- Build ID: 8622057e-4317-40cd-8a92-575685ac2b6c
- Build URL: https://expo.dev/accounts/amkaweesi1/projects/afuchat/builds/8622057e-4317-40cd-8a92-575685ac2b6c
- Profile: preview (APK, internal distribution)
- App version: 2.2.2 (com.afuchat.app)
- Account: amkaweesi1
- Root cause fixed: androidx.activity:1.11.0 + androidx.core:1.17.0 require compileSdk >= 36

### 2026-06-06 — v2.2.1 (DesktopShell wired + account switch to amkaweesi1)
- Build ID: 2275c062-f22e-4412-ae7f-7a6ca5bdc5d0
- Build URL: https://expo.dev/accounts/amkaweesi1/projects/afuchat/builds/2275c062-f22e-4412-ae7f-7a6ca5bdc5d0
- Profile: preview (APK, internal distribution)
- App version: 2.2.1 (com.afuchat.app)
- Account: amkaweesi1 (new; afume exhausted free plan quota)
- Submitted from: Replit (EAS_NO_VCS=1, --no-wait, 28.9 MB upload)
- Credentials: Keystore "Build Credentials I56-2eELc3" (default, remote, new account)

### 2026-06-06 — v2.1.6 (post-auth lazy tab fix)
- Build ID: 1654aaa0-d90b-4b52-9642-702e3aa3dd89
- Build URL: https://expo.dev/accounts/afume/projects/afuchat/builds/1654aaa0-d90b-4b52-9642-702e3aa3dd89
- Profile: preview (APK, internal distribution)
- App version: 2.1.6 (com.afuchat.app)
- Account: afume (quota exhausted for June 2026)
- Submitted from: Replit (EAS_NO_VCS=1, --no-wait, 28.9 MB upload)
- Credentials: Keystore "Build Credentials 1Nj4newnzl" (default, remote)

### 2026-06-05 — v2.1.3 (WeakRef polyfill fix)
- Build ID: 68bcd4f6-c221-4f0b-9922-d9d34328abbf
- Build URL: https://expo.dev/accounts/afume/projects/afuchat/builds/68bcd4f6-c221-4f0b-9922-d9d34328abbf

### 2026-06-05 — v2.1.2 (SVG crash fixes)
- Build ID: c68dad8b-a52f-4137-9b6c-93c425d3d4e1
- Build URL: https://expo.dev/accounts/afume/projects/afuchat/builds/c68dad8b-a52f-4137-9b6c-93c425d3d4e1
