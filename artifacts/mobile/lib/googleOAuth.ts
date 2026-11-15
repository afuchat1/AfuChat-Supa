import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export async function signInWithGoogleOAuth(nativePath: string): Promise<string | null> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
    return null;
  }

  const redirectUrl = makeRedirectUri({ native: nativePath });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Google sign-in could not be started.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
    showInRecents: false,
  });
  if (result.type !== "success" || !result.url) return null;

  const callbackUrl = new URL(result.url);
  const code = callbackUrl.searchParams.get("code");
  if (code) {
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return sessionData.user?.id ?? null;
  }

  const callbackParams = callbackUrl.hash
    ? new URLSearchParams(callbackUrl.hash.slice(1))
    : callbackUrl.searchParams;
  const accessToken = callbackParams.get("access_token");
  const refreshToken = callbackParams.get("refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error("Google sign-in did not return a complete session.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) throw sessionError;
  return sessionData.user?.id ?? null;
}
