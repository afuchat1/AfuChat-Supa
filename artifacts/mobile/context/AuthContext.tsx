import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getStoredAccounts, storeAccount, removeStoredAccount, updateAccountTokens, type StoredAccount } from "@/lib/accountStore";
import { cacheProfile, getCachedProfile } from "@/lib/offlineStore";
import { startOfflineSync } from "@/lib/offlineSync";
import { clearPushToken } from "@/lib/pushNotifications";

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
  is_organization_verified: boolean;
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
  addAccount: async () => ({ success: false }),
  switchAccount: async () => ({ success: false }),
  removeAccount: async () => {},
  refreshLinkedAccounts: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedAccounts, setLinkedAccounts] = useState<StoredAccount[]>([]);

  async function fetchProfile(userId: string) {
    const [{ data: profileData }, { data: subData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, banner_url, bio, phone_number, xp, acoin, current_grade, is_verified, is_private, show_online_status, country, website_url, language, tipping_enabled, is_admin, is_organization_verified")
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
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
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

    await saveCurrentSession();

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
        startOfflineSync();
      } else {
        getCachedProfile().then((cached) => {
          if (cached) setProfile(cached as Profile);
        });
        setLoading(false);
      }
    });

    refreshLinkedAccounts();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setSubscription(null);
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

  const signOut = async () => {
    if (user) {
      await clearPushToken(user.id);
    }
    await supabase.auth.signOut();
  };

  const isPremium = !!subscription && subscription.is_active && new Date(subscription.expires_at) > new Date();

  return (
    <AuthContext.Provider
      value={{ session, user, profile, subscription, isPremium, loading, linkedAccounts, signOut, refreshProfile, addAccount, switchAccount, removeAccount: handleRemoveAccount, refreshLinkedAccounts }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
