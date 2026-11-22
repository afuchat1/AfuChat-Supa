import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getAuthRedirectUrl } from "@/lib/authRedirect";

export type GoogleOAuthResult =
  | { redirected: true; user: null }
  | { redirected: false; user: User | null };

/**
 * Use the browser OAuth flow on web and on native platforms where the Google
 * credential module is unavailable. Web returns to the app entry route with a
 * marker so it can route new Google users to onboarding after session restore.
 */
export async function continueWithGoogleOAuth(): Promise<GoogleOAuthResult> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      throw new Error("Google sign-in is not available in this browser context.");
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/?googleAuth=1`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
    return { redirected: true, user: null };
  }

  const redirectUrl = getAuthRedirectUrl("afuchat://(auth)/login");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Google sign-in could not be started.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
    showInRecents: false,
  });
  if (result.type !== "success" || !result.url) {
    return { redirected: false, user: null };
  }

  const callbackUrl = new URL(result.url);
  const callbackParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
  const callbackError =
    callbackUrl.searchParams.get("error_description") ??
    callbackParams.get("error_description") ??
    callbackUrl.searchParams.get("error") ??
    callbackParams.get("error");
  if (callbackError) throw new Error(callbackError);

  let user: User | null = null;
  const code = callbackUrl.searchParams.get("code");
  if (code) {
    const { data: authData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    user = authData.user;
  } else {
    const accessToken =
      callbackParams.get("access_token") ??
      callbackUrl.searchParams.get("access_token");
    const refreshToken =
      callbackParams.get("refresh_token") ??
      callbackUrl.searchParams.get("refresh_token");
    if (!accessToken || !refreshToken) {
      throw new Error("Google did not return an authenticated session.");
    }
    const { data: authData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    user = authData.user;
  }

  if (!user) {
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    user = data.user;
  }

  return { redirected: false, user };
}

export async function getGoogleAuthDestination(userId: string): Promise<string> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return profile?.onboarding_completed === true ? "/(tabs)/chats" : "/onboarding";
}

export function getGoogleProfileDetails(user: User | null | undefined): {
  displayName: string;
  avatarUrl: string | null;
} {
  const identityData = user?.identities?.find((identity) => identity.provider === "google")
    ?.identity_data as Record<string, unknown> | undefined;
  const metadata = {
    ...(identityData ?? {}),
    ...((user?.user_metadata ?? {}) as Record<string, unknown>),
  };
  const firstName = typeof metadata.given_name === "string"
    ? metadata.given_name
    : typeof metadata.first_name === "string"
      ? metadata.first_name
      : "";
  const lastName = typeof metadata.family_name === "string"
    ? metadata.family_name
    : typeof metadata.last_name === "string"
      ? metadata.last_name
      : "";

  const displayName = [
    metadata.full_name,
    metadata.name,
    `${firstName} ${lastName}`.trim(),
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  const avatar = [metadata.avatar_url, metadata.picture, metadata.photo_url]
    .find((value) => typeof value === "string" && value.trim().length > 0);

  return {
    displayName: typeof displayName === "string" ? displayName.trim() : "",
    avatarUrl: typeof avatar === "string" ? avatar.trim() : null,
  };
}
