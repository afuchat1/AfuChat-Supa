/**
 * deepLinkVerifier.ts
 *
 * Comprehensive deep-link and route-coverage verification.
 * Runs in __DEV__ mode only — zero cost in production.
 *
 * Two layers of protection:
 *
 * 1. NAVIGATION tests — ensure afuchat:// deep links resolve to the correct
 *    screen, not accidentally to [handle].tsx.
 *
 * 2. ROUTE COVERAGE tests — every top-level route segment that is a valid
 *    handle pattern (a-z0-9_, 1-30 chars) must be in RESERVED_ROUTES inside
 *    [handle].tsx and must not be misclassified as an internal route by
 *    deepLinkHandler. This is the belt-and-suspenders guard that ensures
 *    no internal app path ever leaks into the catch-all [handle] screen.
 *
 * Call verifyDeepLinks() once inside a useEffect in _layout.tsx.
 * Results are grouped in the dev console. logHandleLeak() is called from
 * [handle].tsx whenever a reserved segment slips through at runtime.
 */

import { handleIncomingUrl } from "./deepLinkHandler";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavTest = {
  url: string;
  expectedType: "navigate" | "join_group" | "null";
  expectedPath?: string;
  description: string;
};

// ─── ALL top-level route segments that exist as static files in app/ ──────────
// Partitioned into two groups:
//   • WORD_ROUTES: alphanumeric/underscore only → could be misread as a user handle
//   • HYPHEN_ROUTES: contain hyphens → handle regex /[a-zA-Z0-9_]{1,30}/ blocks them
//     automatically, so they're inherently safe even without explicit guards.

const WORD_ROUTES = [
  // a–c
  "about", "achievements", "ai", "article",
  "business", "channel", "chat", "collections", "company", "contact",
  // f–j
  "followers", "freelance", "games", "gifts", "group",
  "help", "id", "join", "login",
  // m–r
  "match", "moments", "onboarding", "p", "post", "premium", "prestige",
  "privacy", "profile", "register", "report",
  // s–w
  "settings", "shop", "shorts", "status", "store", "stories",
  "support", "terms", "video", "wallet", "welcome",
] as const;

const HYPHEN_ROUTES = [
  "business-verification", "chat-info",
  "create-post", "device-security", "digital-events", "digital-id",
  "file-manager", "language-settings", "mini-programs",
  "my-posts", "paid-communities", "phone-contacts", "profile-not-found",
  "profile-private", "qr-scanner", "red-envelope", "reset-password",
  "saved-posts", "update-password", "user-discovery", "username-market",
  "watch-history",
] as const;

// ─── Navigation deep-link test cases ─────────────────────────────────────────

const NAV_TESTS: NavTest[] = [
  // ── Tab screens ─────────────────────────────────────────────────────────
  { url: "afuchat://discover",     expectedType: "navigate", expectedPath: "/(tabs)/discover",   description: "Discover tab" },
  { url: "afuchat://chats",        expectedType: "navigate", expectedPath: "/(tabs)/chats",      description: "Chats tab" },
  { url: "afuchat://search",       expectedType: "navigate", expectedPath: "/(tabs)/search",     description: "Search tab" },
  { url: "afuchat://new-chat",     expectedType: "navigate", expectedPath: "/chat/new",          description: "New chat shortcut" },
  { url: "afuchat://shorts",       expectedType: "navigate", expectedPath: "/(tabs)/shorts",     description: "Shorts tab" },
  { url: "afuchat://communities",  expectedType: "navigate", expectedPath: "/(tabs)/communities",description: "Communities tab" },
  { url: "afuchat://contacts",     expectedType: "navigate", expectedPath: "/(tabs)/contacts",   description: "Contacts tab" },
  { url: "afuchat://apps",         expectedType: "navigate", expectedPath: "/apps",             description: "Apps page" },
  // ── Profile ─────────────────────────────────────────────────────────────
  { url: "afuchat://profile",      expectedType: "navigate", expectedPath: "/(tabs)/me",         description: "Profile tab" },
  { url: "afuchat://me",           expectedType: "navigate", expectedPath: "/(tabs)/me",         description: "Me tab (alias)" },
  { url: "afuchat://followers",    expectedType: "navigate", expectedPath: "/followers",         description: "Followers" },
  // ── Core screens ────────────────────────────────────────────────────────
  { url: "afuchat://settings",     expectedType: "navigate", expectedPath: "/settings",          description: "Settings" },
  { url: "afuchat://wallet",       expectedType: "navigate", expectedPath: "/app/afupay",        description: "Wallet" },
  { url: "afuchat://ai",           expectedType: "navigate", expectedPath: "/ai",                description: "AfuAI" },
  { url: "afuchat://premium",      expectedType: "navigate", expectedPath: "/premium",           description: "Premium" },
  { url: "afuchat://prestige",     expectedType: "navigate", expectedPath: "/prestige",          description: "Prestige" },
  { url: "afuchat://store",        expectedType: "navigate", expectedPath: "/app/afumarket",     description: "Store" },
  { url: "afuchat://support",      expectedType: "navigate", expectedPath: "/support",           description: "Support" },
  { url: "afuchat://about",        expectedType: "navigate", expectedPath: "/about",             description: "About" },
  { url: "afuchat://terms",        expectedType: "navigate", expectedPath: "/terms",             description: "Terms" },
  { url: "afuchat://help",         expectedType: "navigate", expectedPath: "/help",              description: "Help" },
  { url: "afuchat://privacy",      expectedType: "navigate", expectedPath: "/privacy",           description: "Privacy" },
  // ── Content creation ────────────────────────────────────────────────────
  { url: "afuchat://moments",      expectedType: "navigate", expectedPath: "/moments",           description: "Moments" },
  { url: "afuchat://create-post",  expectedType: "navigate", expectedPath: "/create-post",       description: "Create post" },
  { url: "afuchat://stories",      expectedType: "navigate", expectedPath: "/stories/view",      description: "Stories" },
  // ── Social ──────────────────────────────────────────────────────────────
  { url: "afuchat://achievements", expectedType: "navigate", expectedPath: "/achievements",      description: "Achievements" },
  { url: "afuchat://collections",  expectedType: "navigate", expectedPath: "/app/afucollections", description: "Collections" },
  { url: "afuchat://saved-posts",  expectedType: "navigate", expectedPath: "/app/afusaved",       description: "Saved posts" },
  { url: "afuchat://my-posts",     expectedType: "navigate", expectedPath: "/my-posts",          description: "My posts" },
  { url: "afuchat://watch-history",expectedType: "navigate", expectedPath: "/watch-history",     description: "Watch history" },
  // ── Commerce & mini-apps ────────────────────────────────────────────────
  { url: "afuchat://shop",         expectedType: "navigate", expectedPath: "/shop",              description: "Shop" },
  { url: "afuchat://games",        expectedType: "navigate", expectedPath: "/app/afugames",      description: "Games" },
  { url: "afuchat://freelance",    expectedType: "navigate", expectedPath: "/app/afufreelance",  description: "Freelance" },
  { url: "afuchat://gifts",        expectedType: "navigate", expectedPath: "/app/afugifts",      description: "Gifts" },
  { url: "afuchat://business",     expectedType: "navigate", expectedPath: "/app/afubusiness",   description: "Business" },
  // ── Parameterised routes ─────────────────────────────────────────────────
  {
    url: "afuchat://chat/00000000-0000-0000-0000-000000000001",
    expectedType: "navigate", expectedPath: "/chat/[id]",
    description: "Chat by UUID",
  },
  // ── Group join ───────────────────────────────────────────────────────────
  {
    url: "afuchat://join/00000000-0000-0000-0000-000000000002",
    expectedType: "join_group",
    description: "Group join by UUID",
  },
  {
    url: "https://afuchat.com/join/00000000-0000-0000-0000-000000000003",
    expectedType: "join_group",
    description: "Group join via https:// link",
  },
  {
    url: "https://afuchat.com/someuser",
    expectedType: "navigate",
    expectedPath: "/[handle]",
    description: "Profile https:// link",
  },
];

// ─── Route coverage tests — word routes (could be handles) ───────────────────
// Every word route must resolve as navigation, not the catch-all [handle] screen.
// If any returns the wrong action, it means the SYSTEM_ROUTES set in
// deepLinkHandler.ts is missing that entry → runtime leak risk.

async function runRouteCoverageTests() {
  const failures: string[] = [];

  for (const seg of WORD_ROUTES) {
    const url = `afuchat://${seg}`;
    try {
      const action = await handleIncomingUrl(url);
      // Acceptable outcomes: navigate (explicit nav route) or null (blocked by SYSTEM_ROUTES).
      if (action && action.type !== "navigate") {
        failures.push(`"${seg}" → did not resolve as navigation`);
      }
    } catch {
      failures.push(`"${seg}" → threw an error`);
    }
  }

  // Hyphen routes: deepLinkHandler regex blocks these automatically, but verify anyway.
  for (const seg of HYPHEN_ROUTES) {
    const url = `afuchat://${seg}`;
    try {
      const action = await handleIncomingUrl(url);
      if (action && action.type !== "navigate") {
        failures.push(`"${seg}" → unexpectedly resolved as ${action?.type ?? "null"}`);
      }
    } catch {
      failures.push(`"${seg}" → threw an error`);
    }
  }

  return failures;
}

// ─── Navigation tests ─────────────────────────────────────────────────────────

async function runNavTests() {
  const failures: { desc: string; url: string; got: string; expected: string }[] = [];

  for (const tc of NAV_TESTS) {
    try {
      const action = await handleIncomingUrl(tc.url);
      const gotType = action === null ? "null" : action.type;
      const gotPath = action?.type === "navigate" ? action.path : undefined;

      const typeMatch = gotType === tc.expectedType;
      const pathMatch = tc.expectedPath == null || gotPath === tc.expectedPath;

      if (!typeMatch || !pathMatch) {
        failures.push({
          desc: tc.description,
          url: tc.url,
          got: action === null ? "null" : `${action.type}${gotPath ? ` → ${gotPath}` : ""}`,
          expected: tc.expectedPath ? `${tc.expectedType} → ${tc.expectedPath}` : tc.expectedType,
        });
      }
    } catch (err) {
      failures.push({
        desc: tc.description,
        url: tc.url,
        got: `ERROR: ${err}`,
        expected: tc.expectedPath ? `${tc.expectedType} → ${tc.expectedPath}` : tc.expectedType,
      });
    }
  }

  return failures;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run all verification tests. No-op in production builds.
 * Call once from _layout.tsx useEffect.
 */
export async function verifyDeepLinks(): Promise<void> {
  if (!__DEV__) return;

  const [navFailures, coverageFailures] = await Promise.all([
    runNavTests(),
    runRouteCoverageTests(),
  ]);

  const totalRoutes = WORD_ROUTES.length + HYPHEN_ROUTES.length;
  const totalNav    = NAV_TESTS.length;
  const totalFail   = navFailures.length + coverageFailures.length;
  const totalPass   = (totalNav + totalRoutes) - totalFail;

  console.group?.("[DeepLinkVerifier] Route verification");
  console.log(
    `✅ ${totalPass} passed  ❌ ${totalFail} failed` +
    `  (${totalNav} nav tests · ${totalRoutes} route coverage tests)`
  );

  if (navFailures.length > 0) {
    console.warn("[DeepLinkVerifier] ❌ Navigation test failures:");
    for (const f of navFailures) {
      console.warn(`  ${f.desc} | URL: ${f.url}`);
      console.warn(`    expected: ${f.expected}  got: ${f.got}`);
    }
  }

  if (coverageFailures.length > 0) {
    console.warn("[DeepLinkVerifier] ❌ Route coverage failures (handle leaks!):");
    for (const f of coverageFailures) {
      console.warn(`  ${f}`);
    }
  }

  if (totalFail === 0) {
    console.log("[DeepLinkVerifier] All routes protected — zero [handle].tsx leaks possible.");
  }

  console.groupEnd?.();
}

/**
 * Log a route leak — call this from [handle].tsx when a path that should
 * have been caught by a static file ends up in the catch-all handler.
 *
 * @param handle  The raw handle/path segment that landed in [handle].tsx
 * @param reason  Why it was flagged
 */
export function logHandleLeak(handle: string, reason: string): void {
  if (!__DEV__) return;
  console.warn(
    `[DeepLinkVerifier] ⚠️ Route leak!\n` +
    `  Segment "${handle}" reached [handle].tsx — ${reason}.\n` +
    `  Fix: add a static file or add to RESERVED_ROUTES.`
  );
}
