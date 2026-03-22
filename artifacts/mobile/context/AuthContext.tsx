import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  subscription: null,
  isPremium: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    const [{ data: profileData }, { data: subData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, banner_url, bio, phone_number, xp, acoin, current_grade, is_verified, is_private, show_online_status, country, website_url, language, tipping_enabled")
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isPremium = !!subscription && subscription.is_active && new Date(subscription.expires_at) > new Date();

  return (
    <AuthContext.Provider
      value={{ session, user, profile, subscription, isPremium, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
