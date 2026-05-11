import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { AppState } from "react-native";
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
  getCachedProfile,
  getCachedProfileSync,
  clearAccountCache,
  isOnline,
  onConnectivityChange,
  setCachedUserId,
  getCachedUserId,
  clearCachedUserId,
} from "@/lib/offlineStore";
import { clearAllConversations } from "@/lib/storage/localConversations";
import { clearProfileCache } from "@/lib/profileCache";
import { startOfflineSync } from "@/lib/offlineSync";
import { clearPushToken, registerSwitchAccount, setCurrentUserId } from "@/lib/pushNotifications";
import { registerDeviceSession } from "@/lib/deviceSession";
import { ensureAfuAiChat } from "@/lib/afuAiBot";

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
  loading: boolean;
  linkedAccounts: StoredAccount[];
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchProfile: (patch: Partial<Profile>) => void;
  signInWithTelegram: (initData: string) => Promise<{ success: boolean; error?: string }>;
  addAccount: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  switchAccount: (userId: string) => Promise<{ success: boolean; error?: string }>;
  removeAccount: (userId: string) => Promise<void>;
  refreshLinkedAccounts: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  subscription: null,
  isPremium: false,
  loading: true,
  linkedAccounts: [],
  signOut: async () => {},
  refreshProfile: async () => {},
  patchProfile: () => {},
  signInWithTelegram: async () => ({ success: false }),
  addAccount: async () => ({ success: false }),
  switchAccount: async () => ({ success: false }),
  removeAccount: async () => {},
  refreshLinkedAccounts: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const _syncProfile = getCachedProfileSync();
  const [profile, setProfile] = useState<Profile | null>(_syncProfile as Profile | null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(!_syncProfile);
  const [linkedAccounts, setLinkedAccounts] = useState<StoredAccount[]>([]);

  // ── Guard refs ──────────────────────────────────────────────────────────────
  // Prevent saveCurrentSession from firing during an account switch or link
  // operation — otherwise a race condition can write the wrong tokens.
  const isSwitchingRef = useRef(false);
  const isLinkingRef = useRef(false);

  // ── Profile fetch ───────────────────────────────────────────────────────────

  async function fetchProfile(userId: string): Promise<Profile | null> {
    if (!isOnline()) {
      const cached = await getCachedProfile();
      if (cached) setProfile(cached as Profile);
      setSubscription(null);
      return cached as Profile | null;
    }

    try {
      const [{ data: profileData }, { data: subData }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, handle, display_name, avatar_url, banner_url, bio, phone_number, xp, acoin, current_grade, is_verified, is_private, show_online_status, country, website_url, language, tipping_enabled, is_admin, is_support_staff, is_organization_verified, is_business_mode, gender, date_of_birth, region, interests, onboarding_completed, scheduled_deletion_at, created_at"
          )
          .eq("id", userId)
          .single(),
        supabase
          .from("user_subscriptions")
          .select("id, plan_id, started_at, expires_at, is_active, acoin_paid, subscription_plans(name, tier, features)")
          .eq("user_id", userId)
          .eq("is_active", true)
          .gte("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profileData) {
        setProfile(profileData as Profile);
        cacheProfile(profileData);
        // Keep the stored account's display metadata fresh
        updateAccountProfile(userId, {
          displayName: (profileData as any).display_name,
          handle: (profileData as any).handle,
          avatarUrl: (profileData as any).avatar_url,
        }).catch(() => {});
      }

      if (subData) {
        const plan = (subData as any).subscription_plans;
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

      return profileData as Profile | null;
    } catch {
      const cached = await getCachedProfile();
      if (cached) setProfile(cached as Profile);
      return cached as Profile | null;
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
      return merged;
    });
  }

  // ── Linked accounts ─────────────────────────────────────────────────────────

  async function refreshLinkedAccounts() {
    const accounts = await getStoredAccounts();
    setLinkedAccounts(accounts);
  }

  // ── Save current session snapshot to accountStore ───────────────────────────
  // Only persists tokens; never overwrites profile metadata (that's handled
  // inside fetchProfile via updateAccountProfile).

  async function saveCurrentSession() {
    if (isSwitchingRef.current || isLinkingRef.current) return;
    const { data: { session: live } } = await supabase.auth.getSession();
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
    await refreshLinkedAccounts();
  }

  // ── Add Account ─────────────────────────────────────────────────────────────
  // Links a new account WITHOUT switching to it. The user stays on their
  // current account. We temporarily sign in as the new user purely to
  // obtain their tokens, then immediately restore the original session.

  async function addAccount(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!profile?.is_admin) {
      const current = await getStoredAccounts();
      if (current.length >= 2) {
        return { success: false, error: "You've reached the maximum of 2 linked accounts." };
      }
    }

    // Snapshot current session tokens before we touch anything
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) return { success: false, error: "No active session." };

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
      // Always un-gate, even on unexpected errors
      isLinkingRef.current = false;
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
    if (isSwitchingRef.current) return { success: false, error: "Already switching." };

    const target = await getStoredAccount(userId);
    if (!target) return { success: false, error: "Account not found. Please add it again." };

    // ── 1. Snapshot current session ──────────────────────────────────────────
    await saveCurrentSession();

    // ── 2. Gate all side-effects ─────────────────────────────────────────────
    isSwitchingRef.current = true;

    try {
      // ── 3. Clear React state immediately (screens show skeletons) ───────────
      setProfile(null);
      setSubscription(null);
      setUser(null);
      setSession(null);
      setLoading(true);

      // ── 4. Wipe every local cache in parallel ───────────────────────────────
      clearProfileCache();
      clearCachedUserId();
      await Promise.all([
        clearAccountCache(),
        clearAllConversations(),
      ]);

      // ── 5. Sign out locally (keeps server session alive) ────────────────────
      await supabase.auth.signOut({ scope: "local" });

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
          setLoading(false);
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

      // ── 9. Update React identity state ──────────────────────────────────────
      setSession(newSession);
      setUser(newSession.user);
      setCachedUserId(newSession.user.id);
      setCurrentUserId(newSession.user.id);

      // Fetch the new account's profile directly (don't wait for onAuthStateChange)
      await fetchProfile(newSession.user.id);
      await refreshLinkedAccounts();

      setLoading(false);

      // ── 10. Reset navigation so stale screens are gone ───────────────────────
      router.replace("/(tabs)");

      // Background: register device + ensure AI chat exists
      registerDeviceSession(newSession.user.id).catch(() => {});
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", newSession.user.id)
        .single()
        .then(({ data }) => {
          ensureAfuAiChat(newSession!.user.id, data?.display_name).catch(() => {});
        });

      startOfflineSync();

      return { success: true };
    } finally {
      // ── 11. Always un-gate ───────────────────────────────────────────────────
      isSwitchingRef.current = false;
    }
  }

  // ── Remove Account ──────────────────────────────────────────────────────────

  async function handleRemoveAccount(userId: string) {
    await removeStoredAccount(userId);
    await refreshLinkedAccounts();
  }

  // ── Sign Out ────────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    isSwitchingRef.current = true; // suppress saveCurrentSession
    try {
      if (user) await clearPushToken(user.id);

      // Drop React state immediately
      setProfile(null);
      setSubscription(null);
      setUser(null);
      setSession(null);

      // Wipe all caches
      clearCachedUserId();
      clearProfileCache();
      await Promise.all([
        clearAccountCache(),
        clearAllConversations(),
      ]);

      await supabase.auth.signOut();
      router.replace("/discover");
    } finally {
      isSwitchingRef.current = false;
    }
  }, [user]);

  // ── Bootstrap ────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        setCachedUserId(session.user.id);
        const cached = await getCachedProfile();
        if (cached) setProfile(cached as Profile);
        setLoading(false);
        fetchProfile(session.user.id);
        startOfflineSync();
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            ensureAfuAiChat(session.user.id, data?.display_name).catch(() => {});
          });
      } else {
        // No live session — try to stay "soft logged in" from local storage
        const cachedUserId = getCachedUserId();
        const accounts = await getStoredAccounts();
        const primaryAccount = accounts[0] ?? null;

        if (cachedUserId && primaryAccount) {
          const cached = await getCachedProfile();
          if (cached) setProfile(cached as Profile);

          if (isOnline()) {
            supabase.auth
              .refreshSession({ refresh_token: primaryAccount.refreshToken })
              .catch(() => {});
          } else {
            const syntheticUser = {
              id: primaryAccount.userId,
              email: primaryAccount.email,
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: "",
            } as User;
            setUser(syntheticUser);
            startOfflineSync();
          }
          setLoading(false);
        } else {
          const cached = await getCachedProfile();
          if (cached) setProfile(cached as Profile);
          setLoading(false);
        }
      }
    });

    refreshLinkedAccounts();

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Suppress all state mutations during a switch or link operation.
      // The switch function manages state directly; we don't want a race.
      if (isSwitchingRef.current || isLinkingRef.current) return;

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

      // SIGNED_OUT while offline — keep state, the session will come back.
      if (!newSession?.user && !isOnline()) return;

      const newUserId = newSession?.user?.id ?? null;

      setSession((prev) => (prev?.user?.id === newUserId ? prev : newSession));
      setUser((prev) => (prev?.id === newUserId ? prev : newSession?.user ?? null));

      if (newSession?.user) setCachedUserId(newSession.user.id);

      if (!newSession?.user) {
        setProfile(null);
        setSubscription(null);
        return;
      }

      if (event === "SIGNED_IN") {
        registerDeviceSession(newSession.user.id).catch(() => {});
        fetchProfile(newSession.user.id)
          .then(() => {
            supabase
              .from("profiles")
              .select("display_name")
              .eq("id", newSession.user.id)
              .single()
              .then(({ data }) => {
                ensureAfuAiChat(newSession.user.id, data?.display_name).catch(() => {});
              });
          })
          .catch(() => {});
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Save current session tokens whenever the live session changes.
  // Guarded by isSwitchingRef / isLinkingRef so it never fires mid-switch.
  useEffect(() => {
    if (session && profile && !isSwitchingRef.current && !isLinkingRef.current) {
      saveCurrentSession();
    }
  }, [session?.access_token, profile?.id]);

  // Keep push notification router aware of the active user
  useEffect(() => { setCurrentUserId(user?.id ?? null); }, [user?.id]);
  useEffect(() => { registerSwitchAccount(switchAccount); }, []);

  // Update last_seen on app foreground
  useEffect(() => {
    if (!user) return;
    const updateLastSeen = () => {
      if (isOnline()) supabase.rpc("update_last_seen").then(() => {});
    };
    updateLastSeen();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") updateLastSeen();
    });
    const interval = setInterval(updateLastSeen, 60_000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [user]);

  // Reconnect: re-fetch profile + refresh JWT when network comes back
  useEffect(() => {
    if (!user) return;
    const unsub = onConnectivityChange((online) => {
      if (online) {
        fetchProfile(user.id);
        supabase.auth.refreshSession().catch(() => {});
      }
    });
    return unsub;
  }, [user]);

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
            return merged;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const signInWithTelegram = useCallback(async (initData: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseAnonKey ?? "" },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) return { success: false, error: data.error ?? "Telegram sign-in failed" };
      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Telegram sign-in failed" };
    }
  }, []);

  const isPremium = !!subscription && subscription.is_active && new Date(subscription.expires_at) > new Date();

  const contextValue = useMemo(
    () => ({
      session,
      user,
      profile,
      subscription,
      isPremium,
      loading,
      linkedAccounts,
      signOut,
      refreshProfile,
      patchProfile,
      signInWithTelegram,
      addAccount,
      switchAccount,
      removeAccount: handleRemoveAccount,
      refreshLinkedAccounts,
    }),
    [session, user, profile, subscription, isPremium, loading, linkedAccounts, signOut, signInWithTelegram]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
