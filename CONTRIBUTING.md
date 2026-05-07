# AfuChat — Contributor Guidelines

Read this before touching any code. These rules protect decisions that are easy to break accidentally and very hard to debug after the fact.

---

## Table of Contents

- [Architecture — non-negotiable rules](#architecture--non-negotiable-rules)
- [Storage on device — most commonly broken rule](#storage-on-device--most-commonly-broken-rule)
- [Supabase queries](#supabase-queries)
- [Push notifications](#push-notifications)
- [Code quality](#code-quality)
- [Branch & commit conventions](#branch--commit-conventions)
- [Pull request checklist](#pull-request-checklist)
- [Deploying Edge Functions](#deploying-edge-functions)
- [Building the APK](#building-the-apk)
- [Reporting issues & security](#reporting-issues--security)

---

## Architecture — non-negotiable rules

### 1. Supabase is the ONLY backend
All API logic lives in **Supabase Edge Functions** (`supabase/functions/`).

- Do **not** add an Express server, Fastify server, or any other server process.
- Do **not** use Replit Auth or Replit Database. Auth and data are Supabase only.
- Do **not** call external services (R2, Pesapal, Resend, Expo Push) directly from the client — go through an Edge Function so credentials stay server-side.

### 2. R2 (Cloudflare) is the ONLY storage backend
All file uploads (images, videos, audio, documents) go to Cloudflare R2.

- Do **not** add Supabase Storage, Firebase Storage, S3 buckets, or any other storage provider.
- R2 credentials are fetched at runtime from the `app_settings` table inside Edge Functions — never hardcode them client-side.

### 3. All payments stay in-app via Pesapal
- Google Pay is the primary (most prominent) payment method in the checkout UI.
- Do **not** redirect users to a hosted Pesapal checkout page.
- Do **not** add Stripe, PayPal, or any other payment provider.

---

## Storage on device — most commonly broken rule

Android splits on-device storage into **User data** and **Cache**:

| Android label | Expo constant | Survives "Clear Cache"? | OS wipes automatically? |
|---|---|---|---|
| User data | `FileSystem.documentDirectory` | ✅ Yes | ❌ Never |
| Cache | `FileSystem.cacheDirectory` | ❌ No | ✅ Yes (low space) |

**The rule:**

- **User-intentional data → `documentDirectory`**
  Examples: offline videos the user saves to watch later, downloaded files, user preferences.
- **Expendable / auto-refills → `cacheDirectory`**
  Examples: streaming playback buffer that refills automatically, temp files deleted immediately after use.

### Never do this
```ts
// WRONG — user's saved offline videos end up counted as Android Cache
const OFFLINE_DIR = FileSystem.cacheDirectory + "afuchat_offline/";
```

### Always do this
```ts
// CORRECT — counted as User data, survives cache clears, user controls it
const OFFLINE_DIR = FileSystem.documentDirectory + "afuchat_offline/";
```

**If you add a new directory**, ask: "Would the user be upset if Android wiped this without warning?" If yes → `documentDirectory`.

**If you move a directory**, bump the registry key (e.g. `v2` → `v3`) and write a one-time migration that runs at startup to delete stale files from the old path. See `lib/videoCache.ts → migrateOfflineCacheV2toV3` as the reference pattern.

---

## Supabase queries

### Foreign-key hints
PostgREST FK hints (`table!constraint_name`) disambiguate joins when a table has **more than one** FK pointing at the same target table.

- Use a hint **only** when genuinely ambiguous (two FKs to the same table from the same source table).
- When there is only one FK, omit the hint — plain `profiles(...)` is cleaner and safer.
- Verify the exact constraint name exists in the DB before committing. A wrong hint silently returns no joined data.

### Always handle errors
Every `await supabase.from(...)` call must check the `error` return value. Loading functions must use `try/catch/finally` so the UI never gets stuck in a loading state when a query fails:

```ts
try {
  const { data, error } = await supabase.from("...").select("...");
  if (error) throw error;
  setData(data);
} catch (e) {
  console.warn("[MyScreen] load failed:", e);
} finally {
  setLoading(false);
}
```

### Mounted refs in async components
Any component that calls `setState` after an `await` must guard every state update with a mounted ref:

```ts
const mounted = useRef(true);
useEffect(() => {
  mounted.current = true;
  return () => { mounted.current = false; };
}, []);

async function load() {
  const { data } = await supabase.from("...").select("...");
  if (!mounted.current) return; // always check before setState
  setData(data);
}
```

---

## Push notifications

- Do **not** call `registerForPushNotifications` on every app foreground event. A 10-minute cooldown exists in `PushNotificationManager` — keep it. Calling it too often burns Expo's API quota and delays startup.
- Do **not** make the `notification_preferences` lookup in `send-push-notification` blocking. It is wrapped in try/catch that defaults to all-notifications-enabled — this prevents one missing table from silently breaking all pushes.
- Notification channels (default, messages, social, marketplace, system) are defined in `lib/pushNotifications.ts`. Add new channels there; do not create ad-hoc channel IDs elsewhere.

---

## Code quality

### No `console.log` in production code
| Statement | Rule |
|---|---|
| `console.log` | Remove entirely — adds bundle weight and leaks info in production |
| `console.warn` | Only for recoverable unexpected conditions |
| `console.error` | Only for real, non-recoverable errors |

### No silent fallbacks
If something fails, be explicit — show an error state, log a warning, or throw. Never substitute placeholder data and pretend success.

### No duplicate helpers
Before adding a utility, check `lib/` first:

| Need | Use |
|---|---|
| Alerts / toasts | `lib/alert.ts` (`showAlert`, `showToast`, `confirmAlert`) |
| Haptics | `lib/haptics.ts` |
| Notify another user | `lib/notifyUser.ts` |
| AI requests | `lib/aiHelper.ts` |
| Media upload | `lib/mediaUpload.ts` |
| Offline caching | `lib/offlineStore.ts` |
| Video cache | `lib/videoCache.ts` |

### Keep files focused
Files over ~800 lines are a sign a screen or component is doing too much. Extract:

- Reusable UI pieces → `components/ui/`
- Business logic / API calls → `lib/`
- Context / global state → `context/`

Do not put shared logic inside a screen file.

### Avoid redundant state calculations
Never add `+ (liked ? 1 : 0)` or similar adjustments on top of a value already fetched from the database. Load the real count and update it directly. Double-counting bugs are silent and hard to spot in testing.

---

## Branch & commit conventions

Branch names:

| Prefix | Purpose | Example |
|---|---|---|
| `feat/` | New feature | `feat/voice-call-support` |
| `fix/` | Bug fix | `fix/comment-like-crash` |
| `refactor/` | Code clean-up | `refactor/auth-context` |
| `chore/` | Tooling, deps | `chore/upgrade-expo-sdk` |
| `hotfix/` | Urgent production fix | `hotfix/login-crash` |

Commit format ([Conventional Commits](https://www.conventionalcommits.org/)):

```
<type>(<scope>): <short description>

feat(mobile): add offline video TTL setting
fix(edge): make notification_preferences query defensive
chore(mobile): bump video cache registry to v3
```

Scopes: `mobile`, `edge`, `db`, `ui`, `auth`, `chat`, `wallet`, `ai`.

---

## Pull request checklist

- [ ] No `console.log` left in the diff
- [ ] All `await supabase` calls handle `error`
- [ ] Async state updates guarded by mounted ref
- [ ] User-facing files use `documentDirectory`, not `cacheDirectory`
- [ ] No new FK hints added without verifying the constraint name exists
- [ ] New screens have loading skeletons and error states
- [ ] Dark mode and light mode both look correct
- [ ] Works on iOS, Android, and web where applicable
- [ ] No hardcoded credentials or secrets

---

## Deploying Edge Functions

After any change to `supabase/functions/`:

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
  npx supabase functions deploy <function-name> \
  --project-ref rhnsjqqtdzlkvqazfcbg
```

`SUPABASE_SERVICE_ROLE_KEY` must be set in the **Supabase Dashboard** (Project Settings → Edge Function Secrets), not in Replit Secrets. Edge Functions read it from their own secret store.

---

## Building the APK

Run from `artifacts/mobile/` with `EXPO_TOKEN` set:

```bash
eas build --platform android --profile production
```

EAS project ID: `b55c5d92-7a83-472f-b660-d1838efba5fe`.

---

## Reporting issues & security

**Bugs** — include: description, steps to reproduce, platform (iOS / Android / Web + OS version), screenshots, and any console errors.

**Security vulnerabilities** — do **not** open a public issue. Email **security@afuchat.com** with the description, reproduction steps, and potential impact. We respond within 48 hours.
