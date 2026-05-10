import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { AppState } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getStoredAccounts, storeAccount, removeStoredAccount, updateAccountTokens, type StoredAccount } from "@/lib/accountStore";
import { cacheProfile, getCachedProfile, getCachedProfileSync, clearAccountCache, isOnline, onConnectivityChange, setCachedUserId, getCachedUserId, clearCachedUserId } from "@/lib/offlineStore";
import { clearProfileCache } from "@/lib/profileCache";
import { startOfflineSync } from "@/lib/offlineSync";
import { clearPushToken } from "@/lib/pushNotifications";
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
  // Pre-populate from MMKV synchronously — zero I/O, zero wait.
  // Screens like the Me tab render immediately with cached profile data.
  const _syncProfile = getCachedProfileSync();
  const [profile, setProfile] = useState<Profile | null>(_syncProfile as Profile | null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // If we have a cached profile, don't block screens while waiting for auth.
  const [loading, setLoading] = useState(!_syncProfile);
  const [linkedAccounts, setLinkedAccounts] = useState<StoredAccount[]>([]);

  async function fetchProfile(userId: string) {
    if (!isOnline()) {
      const cached = await getCachedProfile();
      if (cached) setProfile(cached as Profile);
      setSubscription(null);
      return;
    }

    try {
      const [{ data: profileData }, { data: subData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, handle, display_name, avatar_url, banner_url, bio, phone_number, xp, acoin, current_grade, is_verified, is_private, show_online_status, country, website_url, language, tipping_enabled, is_admin, is_support_staff, is_organization_verified, is_business_mode, gender, date_of_birth, region, interests, onboarding_completed, scheduled_deletion_at, created_at")
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
    } catch {
      const cached = await getCachedProfile();
      if (cached) setProfile(cached as Profile);
    }
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  // Instant local patch — merges fields into profile state + cache immediately.
  // Used for optimistic updates (e.g. avatar change) before the DB confirms.
  function patchProfile(patch: Partial<Profile>) {
    setProfile((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...patch };
      cacheProfile(merged);
      return merged;
    });
  }

  async function refreshLinkedAccounts() {
    const accounts = await getStoredAccounts();
    setLinkedAccounts(accounts);
  }

  async function saveCurrentSession() {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession && profile) {
      await storeAccount({
        userId: currentSession.user.id,
        email: currentSession.user.email || "",
        displayName: profile.display_name,
        handle: profile.handle,
        avatarUrl: profile.avatar_url,
        accessToken: currentSession.access_token,
        refreshToken: currentSession.refresh_token,
      });
      await refreshLinkedAccounts();
    }
  }

  async function addAccount(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    if (!profile?.is_admin) {
      const current = await getStoredAccounts();
      if (current.length >= 2) {
        return { success: false, error: "You've reached the maximum of 2 linked accounts." };
      }
    }

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const currentTokens = currentSession ? {
      access: currentSession.access_token,
      refresh: currentSession.refresh_token,
    } : null;

    await saveCurrentSession();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (currentTokens) {
        await supabase.auth.setSession({ access_token: currentTokens.access, refresh_token: currentTokens.refresh });
      }
      return { success: false, error: error.message };
    }

    if (data.session && data.user) {
      const { data: newProfile } = await supabase
        .from("profiles")
        .select("display_name, handle, avatar_url")
        .eq("id", data.user.id)
        .single();

      await storeAccount({
        userId: data.user.id,
        email: data.user.email || email,
        displayName: newProfile?.display_name || "User",
        handle: newProfile?.handle || "",
        avatarUrl: newProfile?.avatar_url || null,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      });

      if (currentTokens) {
        await supabase.auth.setSession({ access_token: currentTokens.access, refresh_token: currentTokens.refresh });
      }

      await refreshLinkedAccounts();
    }
    return { success: true };
  }

  async function switchAccount(userId: string): Promise<{ success: boolean; error?: string }> {
    const accounts = await getStoredAccounts();
    const target = accounts.find((a) => a.userId === userId);
    if (!target) return { success: false, error: "Account not found" };

    // 1. Persist the current session's tokens before leaving it.
    await saveCurrentSession();

    // 2. Wipe every user-specific cache so the incoming account starts clean.
    //    This must happen before setSession() so that no old data can appear
    //    in the brief window between session swap and the new profile arriving.
    await clearAccountCache();
    clearProfileCache();

    // 3. Drop React state immediately so screens show skeletons, not stale data.
    setProfile(null);
    setSubscription(null);

    const { data, error } = await supabase.auth.setSession({
      access_token: target.accessToken,
      refresh_token: target.refreshToken,
    });

    if (error) {
      const { data: reAuth, error: reErr } = await supabase.auth.refreshSession({ refresh_token: target.refreshToken });
      if (reErr || !reAuth.session) {
        await removeStoredAccount(userId);
        await refreshLinkedAccounts();
        return { success: false, error: "Session expired. Please add this account again." };
      }
      await updateAccountTokens(userId, reAuth.session.access_token, reAuth.session.refresh_token);
      await refreshLinkedAccounts();
      return { success: true };
    }

    if (data.session) {
      await updateAccountTokens(userId, data.session.access_token, data.session.refresh_token);
    }
    await refreshLinkedAccounts();
    return { success: true };
  }

  async function handleRemoveAccount(userId: string) {
    await removeStoredAccount(userId);
    await refreshLinkedAccounts();
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // ── Happy path: valid session found ────────────────────────────────────
        setSession(session);
        setUser(session.user);
        setCachedUserId(session.user.id);
        // Show cached profile immediately — no network wait needed for initial render.
        const cached = await getCachedProfile();
        if (cached) setProfile(cached as Profile);
        setLoading(false);
        // Refresh profile from network in the background.
        fetchProfile(session.user.id);
        startOfflineSync();
        supabase.from("profiles").select("display_name").eq("id", session.user.id).single().then(({ data }) => {
          ensureAfuAiChat(session.user.id, data?.display_name).catch(() => {});
        });
      } else {
        // ── No live session returned ────────────────────────────────────────────
        // This happens when the access token has already expired by the time the
        // app opens. Supabase will fire a background refresh; if the device is
        // offline that refresh fails and a SIGNED_OUT event is emitted (handled
        // below). In the meantime, keep the user "soft logged in" by restoring
        // their identity from our local stores so screens never redirect to login.
        const cachedUserId = getCachedUserId();
        const accounts = await getStoredAccounts();
        const primaryAccount = accounts[0] ?? null;

        if (cachedUserId && primaryAccount) {
          // We know who this user is. Load their cached profile immediately.
          const cached = await getCachedProfile();
          if (cached) setProfile(cached as Profile);

          if (isOnline()) {
            // Online but session null: try an explicit refresh using the stored
            // refresh token. If it works, onAuthStateChange will pick it up and
            // update session/user; we don't need to do it here.
            supabase.auth.refreshSession({ refresh_token: primaryAccount.refreshToken })
              .catch(() => {});
          } else {
            // Offline: create a minimal user object from stored account data so
            // every screen that checks `user?.id` keeps working. The real session
            // is re-established via onAuthStateChange once connectivity returns.
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
          // Genuinely not logged in — show cached profile if any (guest view).
          const cached = await getCachedProfile();
          if (cached) setProfile(cached as Profile);
          setLoading(false);
        }
      }
    });

    refreshLinkedAccounts();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // On the web, supabase-js silently rotates the access token whenever
        // the browser tab regains focus and emits TOKEN_REFRESHED. The user
        // identity hasn't changed, so re-setting session/user (which creates
        // new object refs) and re-fetching the profile would cascade a
        // re-render through every useAuth() consumer — making pages like
        // /shorts and /video/[id] visibly "refresh" each time the user
        // switches browser tabs and comes back. We keep the new tokens by
        // patching the existing session object in place instead.
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
          }
          return;
        }

        // ── SIGNED_OUT while offline ────────────────────────────────────────────
        // When the device has no network, Supabase cannot refresh an expired
        // access token and fires SIGNED_OUT. This must NOT clear auth state —
        // the user is still the same person; they just have no connectivity.
        // The session will be re-established as soon as the network returns and
        // supabase auto-refreshes (or we call refreshSession on reconnect).
        if (!newSession?.user && !isOnline()) {
          return;
        }

        const newUserId = newSession?.user?.id ?? null;

        // Skip no-op INITIAL_SESSION / SIGNED_IN replays on tab focus where
        // the active user hasn't actually changed.
        setSession((prev) => (prev?.user?.id === newUserId ? prev : newSession));
        setUser((prev) => (prev?.id === newUserId ? prev : newSession?.user ?? null));

        if (newSession?.user) {
          setCachedUserId(newSession.user.id);
        }

        if (!newSession?.user) {
          setProfile(null);
          setSubscription(null);
          return;
        }

        if (event === "SIGNED_IN") {
          // Register device on first sign-in to detect new devices.
          registerDeviceSession(newSession.user.id).catch(() => {});
          fetchProfile(newSession.user.id).then(() => {
            supabase.from("profiles").select("display_name").eq("id", newSession.user.id).single().then(({ data }) => {
              ensureAfuAiChat(newSession.user.id, data?.display_name).catch(() => {});
            });
          }).catch(() => {});
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && profile) {
      saveCurrentSession();
    }
  }, [session, profile]);

  useEffect(() => {
    if (!user) return;
    const updateLastSeen = () => {
      if (isOnline()) supabase.rpc("update_last_seen").then(() => {});
    };
    updateLastSeen();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") updateLastSeen();
    });
    const interval = setInterval(updateLastSeen, 60000);
    return () => { sub.remove(); clearInterval(interval); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onConnectivityChange((online) => {
      if (online) {
        fetchProfile(user.id);
        // Proactively refresh the JWT when connectivity is restored so Supabase
        // gets fresh tokens and stops treating the session as expired.
        supabase.auth.refreshSession().catch(() => {});
      }
    });
    return unsub;
  }, [user]);

  // ── Real-time profile subscription ─────────────────────────────────────────
  // Any UPDATE to this user's profile row (avatar, balance, display_name, etc.)
  // is merged directly into state — no manual refreshProfile() needed.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`profile-rt:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
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
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseAnonKey ?? "",
        },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        return { success: false, error: data.error ?? "Telegram sign-in failed" };
      }
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

  const signOut = useCallback(async () => {
    if (user) {
      await clearPushToken(user.id);
    }
    // Clear all local caches before signing out so the next account (or a fresh
    // login) never sees data from the previous session.
    clearCachedUserId();
    await clearAccountCache();
    clearProfileCache();
    await supabase.auth.signOut();
    router.replace("/discover");
  }, [user]);

  const isPremium = !!subscription && subscription.is_active && new Date(subscription.expires_at) > new Date();

  const contextValue = useMemo(() => ({
    session, user, profile, subscription, isPremium, loading, linkedAccounts,
    signOut, refreshProfile, patchProfile, signInWithTelegram, addAccount, switchAccount, removeAccount: handleRemoveAccount, refreshLinkedAccounts,
  }), [session, user, profile, subscription, isPremium, loading, linkedAccounts, signOut, signInWithTelegram]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
