import Constants from "expo-constants";
import { supabase } from "./supabase";

const WEB_CLIENT_ID =
  "148957999957-i5pgudckm6c9sc8pthqr2cl918nd3153.apps.googleusercontent.com";

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
  | { ok: false; cancelled: false; error: "EXPO_GO" | "SHA1_MISMATCH" | "NO_MODULE" | string };

/** True when running inside Expo Go (not a compiled APK/IPA). */
function isExpoGo(): boolean {
  return (Constants as any).appOwnership === "expo";
}

/**
 * Trigger the native Google account picker.
 *
 * Works on full EAS/APK builds where:
 *  - The APK's SHA-1 fingerprint is registered as an Android OAuth client
 *    (client_type 1) in Google Cloud Console project 148957999957
 *  - google-services.json is bundled with package com.afuchat.app
 *
 * Returns specific error codes so callers can show the right message:
 *  - "EXPO_GO"       → running in Expo Go, native SDK won't work
 *  - "SHA1_MISMATCH" → real APK but SHA-1 not registered in Cloud Console
 *  - "NO_MODULE"     → native module not linked (shouldn't happen in EAS builds)
 */
export async function googleSignIn(): Promise<GoogleSignInResult> {
  if (isExpoGo()) {
    return { ok: false, cancelled: false, error: "EXPO_GO" };
  }

  if (!_GoogleSignin) {
    return { ok: false, cancelled: false, error: "NO_MODULE" };
  }

  try {
    _GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    await _GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    let idToken: string | null = null;

    try {
      const silent = await _GoogleSignin.signInSilently();
      idToken = silent?.data?.idToken ?? null;
    } catch (_) {}

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
      const code = err.code;
      if (code === _statusCodes?.SIGN_IN_CANCELLED || code === _statusCodes?.IN_PROGRESS) {
        return { ok: false, cancelled: true };
      }
      if (code === 10 || code === "10") {
        return { ok: false, cancelled: false, error: "SHA1_MISMATCH" };
      }
    }
    if (err?.code === 10 || err?.code === "10") {
      return { ok: false, cancelled: false, error: "SHA1_MISMATCH" };
    }
    return {
      ok: false,
      cancelled: false,
      error: err?.message || "Google sign-in failed.",
    };
  }
}
