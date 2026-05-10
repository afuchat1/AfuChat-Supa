import { supabase } from "./supabase";

// Web client ID from google-services.json (client_type: 3).
// Used by the native SDK to obtain an ID token that Supabase can verify.
const WEB_CLIENT_ID =
  "148957999957-i5pgudckm6c9sc8pthqr2cl918nd3153.apps.googleusercontent.com";

// Load the native module once at module load time so any
// TurboModuleRegistry error surfaces immediately.
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

/**
 * Trigger the native Google account picker.
 *
 * Requirements for the native flow to succeed:
 *   - Production / EAS build of com.afuchat.app (not Expo Go)
 *   - The build's SHA-1 fingerprint registered as an Android OAuth client
 *     (client_type 1) in the Google Cloud Console project 148957999957
 *
 * Returns { ok: false, error: "EXPO_GO" } when called inside Expo Go so the
 * caller can show a friendly message without opening any browser.
 */
export async function googleSignIn(): Promise<GoogleSignInResult> {
  if (!_GoogleSignin) {
    return {
      ok: false,
      cancelled: false,
      error: "Google Sign-In is not available on this device.",
    };
  }

  try {
    _GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    await _GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    let idToken: string | null = null;

    // Try silent sign-in first — instant for returning users.
    try {
      const silent = await _GoogleSignin.signInSilently();
      idToken = silent?.data?.idToken ?? null;
    } catch (_) {}

    // Show the native account picker if silent sign-in didn't return a token.
    if (!idToken) {
      const resp = await _GoogleSignin.signIn();
      idToken = resp?.data?.idToken ?? null;
    }

    if (!idToken) {
      return {
        ok: false,
        cancelled: false,
        error: "No ID token received from Google.",
      };
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
      // Code 10 = DEVELOPER_ERROR: SHA-1 not registered, or running in Expo Go.
      if (err.code === 10 || err.code === "10") {
        return { ok: false, cancelled: false, error: "EXPO_GO" };
      }
    }
    if (err?.code === 10 || err?.code === "10") {
      return { ok: false, cancelled: false, error: "EXPO_GO" };
    }
    return {
      ok: false,
      cancelled: false,
      error: err?.message || "Google sign-in failed.",
    };
  }
}
