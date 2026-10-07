import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, InteractionManager } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  getStoredAccounts,
  getStoredAccount,
  storeAccount,
  removeStoredAccount,
  updateAccountTokens,
  updateAccountProfile,
  type StoredAccount,
} from "@/lib/accountStore";
import {
  cacheProfile,
  clearAccountCache,
  getCachedProfile,
  getCachedProfileSync,
  isOnline,
  onConnectivityChange,
  setCachedUserId,
  getCachedUserId,
  clearCachedUserId,
  wipeAllLocalData,
} from "@/lib/offlineStore";
import { clearAllConversations } from "@/lib/storage/localConversations";
import { invalidateConversationsPreload } from "@/lib/conversationsPreload";
import { saveLocalProfile, getLocalProfile } from "@/lib/storage/localProfile";
import { saveLocalSettings, deleteLocalSettings } from "@/lib/storage/localSettings";
import { clearProfileCache } from "@/lib/profileCache";
import { startOfflineSync, stopOfflineSync } from "@/lib/offlineSync";
import { ensureAfuAiChat } from "@/lib/afuAiBot";
import { safeRouter } from "@/lib/navUtils";

type Profile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  phone_number: string | null;
  xp: number;
  acoin: number;
  current_grade: string;
  is_verified: boolean;
  is_private: boolean;
  show_online_status: boolean;
  country: string | null;
  website_url: string | null;
  language: string;
  tipping_enabled: boolean;
  is_admin: boolean;
  is_support_staff: boolean;
  is_organization_verified: boolean;
  is_business_mode: boolean;
  gender: string | null;
  date_of_birth: string | null;
  region: string | null;
  interests: string[] | null;
  onboarding_completed: boolean;
  scheduled_deletion_at: string | null;
  created_at: string | null;
  platinum_until: string | null;
};

type Subscription = {
  id: string;
  plan_id: string;
  started_at: string;
  expires_at: string;
  is_active: boolean;
  acoin_paid: number;
  plan_name: string;
  plan_tier: string;
  plan_features: any[];
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  subscription: Subscription | null;
  isPremium: boolean;
  equippedGoods: Set<string>;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchProfile: (patch: Partial<Profile>) => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  subscription: null,
  isPremium: false,
  equippedGoods: new Set(),
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  patchProfile: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const _syncProfile = getCachedProfileSync();
  const _syncUserId = getCachedUserId();
  const [profile, setProfile] = useState<Profile | null>(_syncProfile as Profile | null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // Don't block on loading if we already know who the user is (MMKV sync read).
  // This lets index.tsx route to tabs immediately for previously-logged-in users.
  const [loading, setLoading] = useState(!_syncProfile && !_syncUserId);
  // ── CRITICAL: initialize `user` synchronously from MMKV on first render. ──
  // `loading` is already false on the first render when _syncUserId exists,
  // so any screen with `if (!user && !loading)` would fire a login redirect
  // before the fast-path useEffect runs. Initialising synchronously here
  // closes that window and prevents the "1-minute lock-out" on Android app
  // resurrection (OS killed → reopen from recents → user briefly sees login).
  const [user, setUser] = useState<User | null>(
    _syncUserId
      ? ({
          id: _syncUserId,
          email: (_syncProfile as any)?.email ?? "",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: "",
        } as User)
      : null
  );
  const [equippedGoods, setEquippedGoods] = useState<Set<string>>(new Set());
  const [linkedAccounts, setLinkedAccounts] = useState<StoredAccount[]>([]);

  // ── Guard refs ──────────────────────────────────────────────────────────────
  // Kept for the legacy account-store migration path; no account-switch UI is
  // exposed and the active session remains the only usable account.
  const isSwitchingRef = useRef(false);
  const isLinkingRef = useRef(false);
  const switchOperationRef = useRef(0);
  const linkedAccountsRequestRef = useRef(0);
  // Tracks explicit user-initiated sign-out so we can distinguish it from
  // involuntary sign-outs (expired token, server error, network failure).
  // onAuthStateChange ignores SIGNED_OUT unless this is true.
  const isUserSigningOut = useRef(false);
  // Invalidates async bootstrap work when auth identity changes.
  // Late completions must never restore an old user or navigate over a newer flow.
  const authGenerationRef = useRef(0);
  // Supabase may emit several SIGNED_OUT events while a refresh token is being
  // rejected. Keep fallback restoration single-flight to avoid a network and
  // Keystore storm racing the navigation state.
  const sessionRestoreRef = useRef<Promise<void> | null>(null);

  // ── Profile fetch ───────────────────────────────────────────────────────────

  async function fetchProfile(
    userId: string,
    isCurrent: () => boolean = () => true,
  ): Promise<Profile | null> {
    if (!isCurrent()) return null;

    if (!isOnline()) {
      const cached = (await getCachedProfile()) ?? (await getLocalProfile(userId));
      const ownedCached = cached?.id === userId ? cached : null;
      if (!isCurrent()) return null;
      if (ownedCached) setProfile(ownedCached as Profile);
      setSubscription(null);
      return ownedCached as Profile | null;
    }

    try {
      const [
        { data: profileData, error: profileError },
        { data: subData, error: subscriptionError },
        { data: goodsData, error: goodsError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, handle, display_name, avatar_url, banner_url, bio, phone_number, xp, acoin, current_grade, is_verified, is_private, show_online_status, country, website_url, language, tipping_enabled, is_admin, is_support_staff, is_organization_verified, is_business_mode, gender, date_of_birth, region, interests, onboarding_completed, scheduled_deletion_at, created_at, platinum_until"
          )
          .eq("id", userId)
          .single(),
        supabase
          .from("user_subscriptions")
          .select("id, plan_id, started_at, expires_at, is_active, acoin_paid")
          .eq("user_id", userId)
          .eq("is_active", true)
          .gte("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("status_goods_purchases")
          .select("good_id")
          .eq("user_id", userId)
          .eq("equipped", true),
      ]);

      if (!isCurrent()) return null;

      if (profileError) {
        console.warn("[AuthContext] Profile fetch failed", {
          code: profileError.code,
          message: profileError.message,
        });
        const cached = await getCachedProfile();
        const ownedCached =
          cached?.id === userId ? cached : await getLocalProfile(userId);
        if (!isCurrent()) return null;
        if (ownedCached?.id === userId) setProfile(ownedCached as Profile);
        return ownedCached?.id === userId ? (ownedCached as Profile) : null;
      }

      if (subscriptionError) {
        console.warn("[AuthContext] Subscription fetch failed", {
          code: subscriptionError.code,
          message: subscriptionError.message,
        });
      }
      if (goodsError) {
        console.warn("[AuthContext] Equipped goods fetch failed", {
          code: goodsError.code,
          message: goodsError.message,
        });
      }

      let subscriptionPlanData: any = null;
      if (subData?.plan_id) {
        const { data, error } = await supabase
          .from("subscription_plans")
          .select("name, tier, features")
          .eq("id", subData.plan_id)
          .maybeSingle();
        subscriptionPlanData = data;
        if (error) {
          console.warn("[AuthContext] Subscription plan fetch failed", {
            code: error.code,
            message: error.message,
          });
        }
      }
      if (!isCurrent()) return null;

      if (profileData) {
        // The durable profile is the root of the offline identity pipeline.
        // Finish both local writes before exposing fresh profile state to
        // dependent screens, so chats/feed can never outrun profile storage.
        await saveLocalProfile(profileData as any);
        await cacheProfile(profileData);
        setProfile(profileData as Profile);
        updateAccountProfile(userId, {
          displayName: (profileData as any).display_name,
          handle: (profileData as any).handle,
          avatarUrl: (profileData as any).avatar_url,
        }).catch(() => {});
      }

      if (subData) {
        const plan = subscriptionPlanData;
        setSubscription({
          id: subData.id,
          plan_id: subData.plan_id,
          started_at: subData.started_at,
          expires_at: subData.expires_at,
          is_active: subData.is_active,
          acoin_paid: subData.acoin_paid,
          plan_name: plan?.name || "",
          plan_tier: plan?.tier || "free",
          plan_features: plan?.features || [],
        });
      } else {
        setSubscription(null);
      }

      setEquippedGoods(goodsData ? new Set(goodsData.map((g: any) => g.good_id)) : new Set());

      return profileData as Profile | null;
    } catch {
      try {
        const cached = (await getCachedProfile()) ?? (await getLocalProfile(userId));
        if (!isCurrent()) return null;
        const ownedCached = cached?.id === userId ? cached : null;
        if (ownedCached) setProfile(ownedCached as Profile);
        return ownedCached as Profile | null;
      } catch {
        return null;
      }
    }
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  function patchProfile(patch: Partial<Profile>) {
    setProfile((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...patch };
      cacheProfile(merged);
      saveLocalProfile(merged as any).catch(() => {});
      return merged;
    });
  }

  // ── Linked accounts ─────────────────────────────────────────────────────────

  async function refreshLinkedAccounts() {
    const requestId = ++linkedAccountsRequestRef.current;
    const accounts = await getStoredAccounts();
    if (requestId !== linkedAccountsRequestRef.current) return;
    setLinkedAccounts(accounts);
  }

  // ── Save current session snapshot to accountStore ───────────────────────────
  // Only persists tokens; never overwrites profile metadata (that's handled
  // inside fetchProfile via updateAccountProfile).

  async function saveCurrentSession(allowDuringTransition = false) {
    if (!allowDuringTransition && (isSwitchingRef.current || isLinkingRef.current)) return;
    let live: Session | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      live = data.session;
    } catch {
      return;
    }
    if (!live || !profile) return;
    await storeAccount({
      userId: live.user.id,
      email: live.user.email || "",
      displayName: profile.display_name,
      handle: profile.handle,
      avatarUrl: profile.avatar_url,
      accessToken: live.access_token,
      refreshToken: live.refresh_token,
    });
  }

  // ── Add Account ─────────────────────────────────────────────────────────────
  // Links a new account WITHOUT switching to it. The user stays on their
  // current account. We temporarily sign in as the new user purely to
  // obtain their tokens, then immediately restore the original session.

  // Synchronous in-flight guard — prevents duplicate signInWithPassword calls
  // from rapid UI taps before the caller's loading state has flushed.
  const isAddingAccountRef = useRef(false);

  async function addAccount(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    if (isAddingAccountRef.current) {
      return { success: false, error: "Already in progress." };
    }
    isAddingAccountRef.current = true;

    // Validate account limit
    if (!profile?.is_admin) {
      let current: any[];
      try {
        current = await getStoredAccounts();
      } catch {
        isAddingAccountRef.current = false;
        return { success: false, error: "Failed to read accounts." };
      }
      if (current.length >= 2) {
        isAddingAccountRef.current = false;
        return { success: false, error: "You've reached the maximum of 2 linked accounts." };
      }
    }

    // Snapshot current session tokens before we touch anything
    let currentSession: Session | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      currentSession = data.session;
    } catch {
      isAddingAccountRef.current = false;
      return { success: false, error: "Failed to read current session." };
    }
    if (!currentSession) {
      isAddingAccountRef.current = false;
      return { success: false, error: "No active session." };
    }

    const savedAccess = currentSession.access_token;
    const savedRefresh = currentSession.refresh_token;
    const savedUserId = currentSession.user.id;

    // Suppress all onAuthStateChange side-effects during the temporary sign-in
    isLinkingRef.current = true;

    try {
      // Sign in as the new account to get their tokens
      const { data: newData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !newData.session || !newData.user) {
        return { success: false, error: signInError?.message || "Authentication failed." };
      }

      // Prevent linking the same account that is already active
      if (newData.user.id === savedUserId) {
        return { success: false, error: "This account is already active." };
      }

      // Check if it's already linked
      const already = await getStoredAccount(newData.user.id);
      if (already) {
        return { success: false, error: "This account is already linked." };
      }

      // Fetch the new account's profile for display metadata
      const { data: newProfile } = await supabase
        .from("profiles")
        .select("display_name, handle, avatar_url")
        .eq("id", newData.user.id)
        .single();

      // Persist the new account's session
      await storeAccount({
        userId: newData.user.id,
        email: newData.user.email || email,
        displayName: newProfile?.display_name || "User",
        handle: newProfile?.handle || "",
        avatarUrl: newProfile?.avatar_url || null,
        accessToken: newData.session.access_token,
        refreshToken: newData.session.refresh_token,
      });

      // Restore the original user's session immediately
      await supabase.auth.setSession({
        access_token: savedAccess,
        refresh_token: savedRefresh,
      });

      await refreshLinkedAccounts();
      return { success: true };
    } finally {
      // Always un-gate both guards, even on unexpected errors
      isLinkingRef.current = false;
      isAddingAccountRef.current = false;
    }
  }

  // ── Switch Account ──────────────────────────────────────────────────────────
  // Full account switch with zero data leakage:
  //
  // 1. Save current session tokens (last chance before wiping state)
  // 2. Set isSwitchingRef → prevents saveCurrentSession effect from firing
  // 3. Wipe ALL React state immediately → screens show skeletons, not stale data
  // 4. Wipe ALL local caches (MMKV + AsyncStorage, full list in clearAccountCache)
  // 5. Sign out locally only (server session is kept alive for re-use)
  // 6. Set the new session from stored tokens
  // 7. If setSession fails → try refreshSession with stored refreshToken
  // 8. If that also fails → account session is dead; remove it and abort
  // 9. Fetch the new profile directly (don't rely on onAuthStateChange)
  // 10. Navigate to root so no stale screen state lingers
  // 11. Un-gate isSwitchingRef

  async function switchAccount(
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (isSwitchingRef.current || switchOperationRef.current !== 0) {
      return { success: false, error: "Already switching." };
    }

    const operationId = ++authGenerationRef.current;
    switchOperationRef.current = operationId;
    isSwitchingRef.current = true;
    const isCurrentSwitch = () =>
      authGenerationRef.current === operationId &&
      switchOperationRef.current === operationId &&
      !isUserSigningOut.current;

    try {
      const target = await getStoredAccount(userId);
      if (!target) return { success: false, error: "Account not found. Please add it again." };

      // ── 1. Snapshot current session before caches are wiped ────────────────
      await saveCurrentSession(true);
      if (!isCurrentSwitch()) return { success: false, error: "Account switch cancelled." };

      // ── 3. Clear React state immediately (screens show skeletons) ───────────
      setProfile(null);
      setSubscription(null);
      setUser(null);
      setSession(null);
      setLoading(true);

      // ── 4. Wipe every local cache in parallel ───────────────────────────────
      clearProfileCache();
      clearCachedUserId();
      invalidateConversationsPreload();
      await Promise.all([
        clearAccountCache(),
        clearAllConversations(),
      ]);
      if (!isCurrentSwitch()) return { success: false, error: "Account switch cancelled." };

      // ── 5. Sign out locally (keeps server session alive) ────────────────────
      await supabase.auth.signOut({ scope: "local" });
      if (!isCurrentSwitch()) return { success: false, error: "Account switch cancelled." };

      // ── 6. Set the new session ───────────────────────────────────────────────
      let newSession: Session | null = null;

      const { data: setData, error: setError } = await supabase.auth.setSession({
        access_token: target.accessToken,
        refresh_token: target.refreshToken,
      });

      if (!setError && setData.session) {
        newSession = setData.session;
        await updateAccountTokens(
          userId,
          setData.session.access_token,
          setData.session.refresh_token
        );
      } else {
        // ── 7. Fallback: refresh using stored refreshToken ───────────────────
        const { data: reData, error: reError } = await supabase.auth.refreshSession({
          refresh_token: target.refreshToken,
        });

        if (reError || !reData.session) {
          // ── 8. Session is dead — remove it and abort ─────────────────────
          await removeStoredAccount(userId);
          await refreshLinkedAccounts();
          if (isCurrentSwitch()) setLoading(false);
          return {
            success: false,
            error: "This session has expired. Please add this account again.",
          };
        }

        newSession = reData.session;
        await updateAccountTokens(
          userId,
          reData.session.access_token,
          reData.session.refresh_token
        );
      }

      if (!newSession || !isCurrentSwitch()) {
        return { success: false, error: "Account switch cancelled." };
      }

      // ── 9. Update React identity state ──────────────────────────────────────
      setSession(newSession);
      setUser(newSession.user);
      setCachedUserId(newSession.user.id);

      // Fetch the new account's profile directly (don't wait for onAuthStateChange)
      await fetchProfile(newSession.user.id, isCurrentSwitch);
      await refreshLinkedAccounts();

      if (!isCurrentSwitch()) return { success: false, error: "Account switch cancelled." };
      setLoading(false);
      const switchedUserId = newSession.user.id;

      // ── 10. Reset navigation so stale screens are gone ───────────────────────
      safeRouter.replace("/(tabs)/discover");

      // Background: register device + ensure AI chat exists
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", switchedUserId)
        .single()
         .then(({ data }) => {
           ensureAfuAiChat(switchedUserId, data?.display_name).catch(() => {});
         }, () => {});

      startOfflineSync();

      return { success: true };
    } finally {
      // ── 11. Always un-gate ───────────────────────────────────────────────────
      if (switchOperationRef.current === operationId) {
        switchOperationRef.current = 0;
        isSwitchingRef.current = false;
      }
    }
  }

  // ── Remove Account ──────────────────────────────────────────────────────────

  async function handleRemoveAccount(userId: string) {
    await removeStoredAccount(userId);
    await refreshLinkedAccounts();
  }

  // ── Sign Out ────────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    isUserSigningOut.current = true; // mark as intentional before any state changes
    authGenerationRef.current += 1;
    switchOperationRef.current = 0;
    isSwitchingRef.current = true;  // suppress saveCurrentSession
    const signedOutUserId = user?.id;
    try {
      // Fire-and-forget: don't let slow/offline network block the logout UX.

      // Drop React state immediately so the UI shows nothing while wiping.
      setProfile(null);
      setSubscription(null);
      setUser(null);
      setSession(null);
      setEquippedGoods(new Set());
      clearProfileCache();
      invalidateConversationsPreload();
      stopOfflineSync();

      // ── Nuclear wipe: clear local stores without blocking navigation ─────
      // SQLite/AsyncStorage cleanup can be slow on a large account and must
      // never hold the user on a dead screen. It runs after auth state is
      // invalidated and is independently guarded inside wipeAllLocalData().
      void wipeAllLocalData();

      // Remove this account's SecureStore token so background session-restore
      // in onAuthStateChange cannot silently re-login the user.
      if (signedOutUserId) {
        removeStoredAccount(signedOutUserId).catch(() => {});
      }

      // Sign out from Supabase (best-effort — works offline too via local clear).
      void supabase.auth.signOut().catch(() => {});

      // Route immediately. The local wipe and remote sign-out are deliberately
      // fire-and-forget so a hung native store/network cannot freeze navigation.
      safeRouter.replace("/welcome");
    } finally {
      isSwitchingRef.current = false;
      // Keep isUserSigningOut=true for 3 s after the call so the async
      // onAuthStateChange SIGNED_OUT handler sees it and does NOT attempt
      // a SecureStore session restore (which would re-login the user).
      setTimeout(() => { isUserSigningOut.current = false; }, 3000);
    }
  }, [user]);
  // ── Bootstrap ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const bootstrapGeneration = ++authGenerationRef.current;
    const isCurrentBootstrap = () => authGenerationRef.current === bootstrapGeneration;

    // ── FAST PATH: synchronous MMKV identity check ──────────────────────────
    // MMKV is synchronous and survives all app restarts (online or offline).
    // If the user has ever logged in on this device, their ID is in MMKV.
    // We release the splash IMMEDIATELY with a synthetic user so index.tsx
    // routes straight to chats — the user NEVER sees the welcome/onboarding
    // screen even when the network is down or getSession() is slow.
    // getSession() still runs below and silently upgrades to a real session.
    let offlineSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let offlineSyncTask: { cancel?: () => void } | null = null;
    const scheduleOfflineSync = () => {
      if (offlineSyncTimer) return;
      // Let the first authenticated route render before opening the offline
      // queue and its realtime/network listeners on a release build.
      offlineSyncTimer = setTimeout(() => {
        offlineSyncTimer = null;
        if (!isCurrentBootstrap()) return;
        offlineSyncTask = InteractionManager.runAfterInteractions(() => {
          if (isCurrentBootstrap()) startOfflineSync();
        });
      }, 5000);
    };

    const fastCachedId = getCachedUserId();
    if (fastCachedId) {
      const fastProfile = getCachedProfileSync();
      if (isCurrentBootstrap()) {
        if (fastProfile) setProfile(fastProfile as Profile);
        setUser({
          id: fastCachedId,
          email: (fastProfile as any)?.email ?? "",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: "",
        } as User);
        setLoading(false); // ← index.tsx sees this synchronously, routes to chats
      }
      scheduleOfflineSync();
    }

    // Safety-net: if getSession() ever hangs indefinitely on native (no reject,
    // just silence), release the splash after 3.5 s so the user is never locked out.
    let safetyFired = false;
    const safetyTimer = setTimeout(() => {
      if (!isCurrentBootstrap()) return;
      safetyFired = true;
      setLoading(false);
    }, 3500);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!isCurrentBootstrap()) return;
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          setCachedUserId(session.user.id);
          // Hydrate the profile root before releasing the app to dependent
          // screens. MMKV is fastest; SQLite is the durable fallback.
          const cachedSyncRaw = getCachedProfileSync();
          const cachedSync = cachedSyncRaw?.id === session.user.id ? cachedSyncRaw : null;
          const durableProfile = cachedSync ? null : await getLocalProfile(session.user.id);
          const initialProfile = cachedSync ?? durableProfile;
          if (initialProfile) setProfile(initialProfile as Profile);
          const refreshProfilePromise = fetchProfile(session.user.id, isCurrentBootstrap);
          // A first-ever user has no safe local identity to fall back to.
          // Complete the profile fetch and durable write before releasing
          // dependent screens. Existing cached users remain instant.
          if (!initialProfile && isOnline()) {
            await refreshProfilePromise.catch(() => null);
          }
          clearTimeout(safetyTimer);
          setLoading(false);
          // Existing cached profiles refresh in the background. For a new
          // profile this promise is already complete, so this also provisions
          // dependent services from the durable profile result.
          refreshProfilePromise
            .then((freshProfile) => {
              setTimeout(() => {
                if (isCurrentBootstrap()) {
                  ensureAfuAiChat(session.user.id, freshProfile?.display_name).catch(() => {});
                }
              }, 5000);
            })
            .catch(() => {});
          scheduleOfflineSync();
        } else {
          // No live session — try to stay "soft logged in" from local storage.
          //
          // HARDENED: SecureStore (tokens) is more durable than MMKV (userId cache).
          // If MMKV was cleared but SecureStore still has tokens, fall back to the
          // stored account's userId so the user is NEVER routed to the welcome screen.
          const cachedUserId = getCachedUserId();
          // When MMKV already has the identity, do not block the fast path on
          // SecureStore/Android Keystore. Keystore initialization can be slow
          // in standalone release builds even while the rest of the app is
          // ready. The account entry is only needed for background token
          // refresh and is retried below.
          let primaryAccount: StoredAccount | null = null;
          if (!cachedUserId) {
            const accounts = await getStoredAccounts();
            if (!isCurrentBootstrap()) return;
            primaryAccount = accounts[0] ?? null;
          }

          // Use stored account userId as fallback when MMKV was wiped
          const effectiveUserId = cachedUserId ?? primaryAccount?.userId ?? null;

          if (effectiveUserId) {
            // ── CRITICAL: use effectiveUserId alone, NOT "effectiveUserId && primaryAccount".
            // On Android, SecureStore (Keystore-backed) can return null on the very
            // first read after a device reboot — the Keystore is locked until the
            // user authenticates, which happens milliseconds before the app opens but
            // the read may race. If SecureStore fails, primaryAccount is null even
            // though the user is legitimately logged in. The MMKV userId is a strong
            // enough signal on its own — always keep the user in the app.

            // Restore MMKV userId if it was wiped (ensures fast startup next time)
            if (!cachedUserId && effectiveUserId) setCachedUserId(effectiveUserId);

            // Publish the synchronous cache immediately. Never wait for
            // AsyncStorage/SQLite here: those reads can stall while Android is
            // offline or while the device has just unlocked.
            // Profile is the root cache for this identity. Read the durable
            // row before routing so chats and feed never become the only
            // surviving offline data.
            const cachedSyncRaw = getCachedProfileSync();
            const cachedSync = cachedSyncRaw?.id === effectiveUserId ? cachedSyncRaw : null;
            const [asyncCached, durableProfile] = await Promise.all([
              cachedSync ? Promise.resolve(null) : getCachedProfile(),
              cachedSync ? Promise.resolve(null) : getLocalProfile(effectiveUserId),
            ]);
            const initialProfile =
              cachedSync ??
              (asyncCached?.id === effectiveUserId ? asyncCached : null) ??
              (durableProfile?.id === effectiveUserId ? durableProfile : null);
            if (initialProfile) setProfile(initialProfile as Profile);

            // Set a synthetic user immediately so the app routes to home without
            // waiting for a network round-trip. The real session replaces it once
            // the background token refresh completes (TOKEN_REFRESHED fires).
            const syntheticUser = {
              id: effectiveUserId,
              email: primaryAccount?.email || (cachedSync as any)?.email || "",
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: "",
            } as User;
            if (!isCurrentBootstrap()) return;
            setUser(syntheticUser);
            // Release loading NOW — home renders before refresh completes.
             clearTimeout(safetyTimer);
            setLoading(false);

            // Hydrate the slower local profile cache after routing. This is
            // deliberately fire-and-forget and cannot delay chats or navigation.
            if (isOnline()) {
              if (primaryAccount) {
                // Pass refresh token explicitly — Supabase's AsyncStorage may have
                // been cleared by a prior involuntary SIGNED_OUT, so relying on
                // supabase.auth.refreshSession() with no args can silently fail.
                supabase.auth
                  .refreshSession({ refresh_token: primaryAccount.refreshToken })
                  .then(({ error }) => {
                    // On success: TOKEN_REFRESHED fires and replaces the synthetic
                    // session with a real one — no further action needed here.
                  })
                  .catch((error) => {
                  });
              } else {
                // SecureStore was temporarily unavailable (Android Keystore race on
                // fresh reboot). Retry in 3 s — by then the Keystore is accessible.
                setTimeout(async () => {
                  if (!isCurrentBootstrap()) return;
                  try {
                    const retried = await getStoredAccounts();
                    if (!isCurrentBootstrap()) return;
                    const stored = retried[0] ?? null;
                    if (!stored) return;
                    // Try to promote the synthetic session to a real one.
                    await supabase.auth.setSession({
                      access_token: stored.accessToken,
                      refresh_token: stored.refreshToken,
                    });
                    // On success: TOKEN_REFRESHED fires and updates session state.
                  } catch (error) {
                  }
                }, 3000);
              }
            } else {
              scheduleOfflineSync();
            }
          } else {
            // Truly no identity anywhere — user has never logged in on this device.
            const cached = await getCachedProfile();
            if (!isCurrentBootstrap()) return;
            if (cached) setProfile(cached as Profile);
             clearTimeout(safetyTimer);
            setLoading(false);
          }
        }
      })
      .catch(() => {
        if (!isCurrentBootstrap()) return;
        clearTimeout(safetyTimer);
        if (!safetyFired) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Suppress all state mutations during a switch or link operation.
      // The switch function manages state directly; we don't want a race.
      if (isSwitchingRef.current || isLinkingRef.current) return;
      const eventGeneration = authGenerationRef.current;

      // TOKEN_REFRESHED: patch tokens in-place, don't re-fetch the profile.
      if (event === "TOKEN_REFRESHED") {
        setSession((prev) => {
          if (!prev || !newSession) return newSession;
          if (prev.access_token === newSession.access_token) return prev;
          return Object.assign(prev, {
            access_token: newSession.access_token,
            refresh_token: newSession.refresh_token,
            expires_at: newSession.expires_at,
            expires_in: newSession.expires_in,
          });
        });
        if (newSession?.user) {
          setUser((prev) => prev ?? newSession.user);
          setCachedUserId(newSession.user.id);
          // Keep stored tokens fresh
          updateAccountTokens(
            newSession.user.id,
            newSession.access_token,
            newSession.refresh_token
          ).catch(() => {});
        }
        return;
      }

      // Never clear auth state on involuntary sign-outs (offline, token refresh
      // failure, server error). Only a user-initiated signOut() call sets
      // isUserSigningOut=true, which is the only case where we allow clearing.
      if (!newSession?.user) {
        if (!isUserSigningOut.current) {
          // Involuntary SIGNED_OUT: Supabase cleared its AsyncStorage session
          // (e.g., access token expired and refresh token was rejected).
          // Attempt a silent background restore from SecureStore.
          // CRITICAL: we do NOT clear any user state here regardless of outcome.
          // A user who has ever logged in must NEVER be involuntarily signed out.
          if (!sessionRestoreRef.current) {
             const currentUserId = user?.id ?? session?.user?.id ?? getCachedUserId();
            const restorePromise = getStoredAccounts()
              .then(async (accts) => {
                if (
                  authGenerationRef.current !== eventGeneration ||
                  isUserSigningOut.current ||
                  isSwitchingRef.current
                ) return;
                 const stored = currentUserId
                   ? (accts.find((account) => account.userId === currentUserId) ?? null)
                   : (accts[0] ?? null);
                if (!stored) return;

                try {
                  await supabase.auth.setSession({
                    access_token: stored.accessToken,
                    refresh_token: stored.refreshToken,
                  });
                  // On success: TOKEN_REFRESHED fires and updates session state.
                } catch (error) {
                }
                // On failure: user keeps their current (synthetic) session and
                // cached data — they stay in the shell until they sign in again.
              })
              .catch(() => {});
            sessionRestoreRef.current = restorePromise;
            void restorePromise
              .finally(() => {
                if (sessionRestoreRef.current === restorePromise) {
                  sessionRestoreRef.current = null;
                }
              })
              .catch(() => {});
          }
          return; // Never fall through to state-clearing code below
        }
        // Intentional sign-out — clear everything and stop.
        setProfile(null);
        setSubscription(null);
        setSession(null);
        setUser(null);
        return;
      }

      const newUserId = newSession.user.id;

      setSession((prev) => (prev?.user?.id === newUserId ? prev : newSession));
      setUser((prev) => (prev?.id === newUserId ? prev : newSession.user));
      setCachedUserId(newUserId);

      if (event === "SIGNED_IN") {
        // Persist fresh tokens to SecureStore immediately on every sign-in.
        // This is the earliest opportunity — profile metadata is not yet loaded,
        // so displayName/handle are stored as empty strings and overwritten by
        // fetchProfile → updateAccountProfile below.  Without this, a user who
        // logs in and quits before TOKEN_REFRESHED fires has no SecureStore entry,
        // and the bootstrap refresh-fallback path has nothing to restore from.
        storeAccount({
          userId: newSession.user.id,
          email: newSession.user.email || "",
          displayName: "",
          handle: "",
          avatarUrl: null,
          accessToken: newSession.access_token,
          refreshToken: newSession.refresh_token,
        }).catch(() => {});

        fetchProfile(
          newSession.user.id,
          () =>
            authGenerationRef.current === eventGeneration &&
            !isSwitchingRef.current &&
            !isUserSigningOut.current,
        )
           .then((freshProfile) => {
             setTimeout(() => {
               if (
                 authGenerationRef.current === eventGeneration &&
                 !isSwitchingRef.current &&
                 !isUserSigningOut.current
               ) {
                 ensureAfuAiChat(newSession.user.id, freshProfile?.display_name).catch(() => {});
               }
             }, 5000);
          })
          .catch(() => {});
      }
    });

    return () => {
      authGenerationRef.current += 1;
      if (offlineSyncTimer) clearTimeout(offlineSyncTimer);
      offlineSyncTask?.cancel?.();
      listener.subscription.unsubscribe();
    };
  }, []);

  // Save current session tokens whenever the live session changes.
  // Guarded by isSwitchingRef / isLinkingRef so it never fires mid-switch.
  useEffect(() => {
    if (session && profile && !isSwitchingRef.current && !isLinkingRef.current) {
      saveCurrentSession();
    }
  }, [session?.access_token, profile?.id]);

  // Update last_seen on app foreground
  useEffect(() => {
    if (!user) return;
    const updateLastSeen = () => {
      if (isOnline()) supabase.rpc("update_last_seen").then(null, () => {});
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(updateLastSeen, 1200);
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (timer) clearTimeout(timer);
        timer = setTimeout(updateLastSeen, 300);
      }
    });
    const interval = setInterval(updateLastSeen, 60_000);
    return () => {
      interactionTask.cancel();
      if (timer) clearTimeout(timer);
      sub.remove();
      clearInterval(interval);
    };
  }, [user]);

  // Reconnect: re-fetch profile + refresh JWT when network comes back.
  // Pass the refresh token explicitly from SecureStore rather than relying on
  // supabase.auth.refreshSession() with no args — Supabase may have cleared its
  // own AsyncStorage session after an involuntary SIGNED_OUT while offline.
  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const unsub = onConnectivityChange((online) => {
      if (online) {
        fetchProfile(userId);
        getStoredAccount(userId)
          .then((stored) => {
            if (stored) {
              return supabase.auth.setSession({
                access_token: stored.accessToken,
                refresh_token: stored.refreshToken,
              });
            }
            return supabase.auth.refreshSession();
          })
          .catch(() => {});
      }
    });
    return unsub;
  }, [user?.id]);

  // Real-time profile subscription — any DB UPDATE flows straight into state
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`profile-rt:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const incoming = payload.new as Partial<Profile>;
          setProfile((prev) => {
            if (!prev) return prev;
            const merged = { ...prev, ...incoming };
            cacheProfile(merged);
            saveLocalProfile(merged as any).catch(() => {});
            return merged;
          });
        }
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          console.info("[AuthContext] Profile realtime subscribed");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[AuthContext] Profile realtime unavailable", {
            status,
            message: error?.message,
          });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Premium status is based only on an active paid subscription.
  const isPremium = subscription !== null;

  const contextValue = useMemo(
    () => ({
      session,
      user,
      profile,
      subscription,
      isPremium,
      equippedGoods,
      loading,
      signOut,
      refreshProfile,
      patchProfile,
    }),
    [session, user, profile, subscription, isPremium, equippedGoods, loading, signOut]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
