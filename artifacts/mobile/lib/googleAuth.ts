import { Platform } from "react-native";
import { supabase } from "./supabase";

const WEB_CLIENT_ID =
  "830762767270-lmefgjjk25i17lithkq6iisjv8gfh08d.apps.googleusercontent.com";

// Require the native Google Sign-In module at module-load time so any
// TurboModuleRegistry error is caught once here, not at call time.
let _GoogleSignin: any = null;
let _isErrorWithCode: any = null;
let _statusCodes: any = null;
try {
  const mod = require("@react-native-google-signin/google-signin");
  _GoogleSignin = mod.GoogleSignin;
  _isErrorWithCode = mod.isErrorWithCode;
  _statusCodes = mod.statusCodes;
} catch (_) {}

export type GoogleSignInResult =
  | { ok: true; userId: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; error: string };

export async function googleSignIn(): Promise<GoogleSignInResult> {
  if (Platform.OS !== "web") {
    return googleSignInNative();
  }
  return googleSignInWeb();
}

async function googleSignInNative(): Promise<GoogleSignInResult> {
  if (!_GoogleSignin) {
    return { ok: false, cancelled: false, error: "Google Sign-In is not available on this device." };
  }

  try {
    _GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    await _GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    let idToken: string | null = null;

    // Try silent sign-in first — instant for returning users
    try {
      const silent = await _GoogleSignin.signInSilently();
      idToken = silent?.data?.idToken ?? null;
    } catch (_) {}

    // Show native account picker if silent sign-in didn't return a token
    if (!idToken) {
      const resp = await _GoogleSignin.signIn();
      idToken = resp?.data?.idToken ?? null;
    }

    if (!idToken) {
      return { ok: false, cancelled: false, error: "No ID token received from Google." };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (error) return { ok: false, cancelled: false, error: error.message };
    return { ok: true, userId: data.user?.id ?? "" };
  } catch (err: any) {
    if (_isErrorWithCode?.(err)) {
      if (
        err.code === _statusCodes?.SIGN_IN_CANCELLED ||
        err.code === _statusCodes?.IN_PROGRESS
      ) {
        return { ok: false, cancelled: true };
      }
    }
    return {
      ok: false,
      cancelled: false,
      error: err?.message || "Google sign-in failed.",
    };
  }
}

async function googleSignInWeb(): Promise<GoogleSignInResult> {
  if (typeof window === "undefined") {
    return { ok: false, cancelled: false, error: "Not in browser context." };
  }

  const redirectUrl = window.location.origin + "/";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data?.url) {
    return {
      ok: false,
      cancelled: false,
      error: error?.message ?? "Could not start Google sign-in.",
    };
  }

  return new Promise<GoogleSignInResult>((resolve) => {
    const w = 500,
      h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);

    const popup = window.open(
      data.url,
      "google_oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      resolve({
        ok: false,
        cancelled: false,
        error: "Please allow popups for this site to sign in with Google.",
      });
      return;
    }

    const timer = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          resolve({ ok: false, cancelled: true });
          return;
        }

        let u = "";
        try {
          u = popup.location.href;
        } catch (_) {
          return;
        }
        if (!u) return;

        const isCallback =
          (u.includes("afuchat.com") || u.includes(window.location.origin)) &&
          (u.includes("code=") || u.includes("access_token="));

        if (isCallback) {
          clearInterval(timer);
          popup.close();

          const url = new URL(u);
          const code = url.searchParams.get("code");

          if (code) {
            const { data: sd, error: e } =
              await supabase.auth.exchangeCodeForSession(code);
            if (e) {
              resolve({ ok: false, cancelled: false, error: e.message });
            } else {
              resolve({ ok: true, userId: sd.user?.id ?? "" });
            }
          } else {
            resolve({
              ok: false,
              cancelled: false,
              error: "No authorization code received.",
            });
          }
        }
      } catch (_) {}
    }, 300);
  });
}
