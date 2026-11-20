import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const ALLOWED_NATIVE_REDIRECTS = new Set([
  "afuchat://(auth)/login",
  "afuchat://(auth)/register",
]);

function assertExpectedCallback(callback: URL, redirectUrl: string): void {
  const expected = new URL(redirectUrl);
  if (
    callback.protocol !== expected.protocol ||
    callback.host !== expected.host ||
    callback.pathname !== expected.pathname
  ) {
    throw new Error("Google sign-in returned an unexpected redirect URL.");
  }
}

export async function signInWithGoogleOAuth(nativePath: string): Promise<string | null> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
    return null;
  }

  // Only allow the app's known auth callbacks; never accept a caller-provided
  // arbitrary redirect target.
  if (!ALLOWED_NATIVE_REDIRECTS.has(nativePath)) {
    throw new Error("Google sign-in redirect is not allowed.");
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
  assertExpectedCallback(callbackUrl, redirectUrl);

  const queryParams = callbackUrl.searchParams;
  const hashParams = callbackUrl.hash
    ? new URLSearchParams(callbackUrl.hash.slice(1))
    : new URLSearchParams();

  const providerError =
    queryParams.get("error") ??
    hashParams.get("error");
  if (providerError) {
    const description =
      queryParams.get("error_description") ??
      hashParams.get("error_description");
    throw new Error(description || providerError);
  }

  // Supabase is configured for PKCE. Accept only the one-time authorization
  // code and let Supabase validate it against the locally stored verifier.
  // Never install bearer/refresh tokens copied from an unverified redirect.
  const code = queryParams.get("code");
  if (!code) {
    throw new Error("Google sign-in did not return a valid authorization code.");
  }

  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  if (!sessionData.user?.id) {
    throw new Error("Google sign-in completed without an authenticated user.");
  }

  return sessionData.user.id;
}
