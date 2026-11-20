import { isExpoGo } from "@/lib/expoEnvironment";
import { Platform } from "react-native";
import { GOOGLE_WEB_CLIENT_ID } from "@/lib/env";

type GoogleSigninModule = {
  configure: (options: {
    webClientId: string;
    offlineAccess: boolean;
    scopes?: string[];
  }) => void | Promise<void>;
  hasPlayServices: (options: { showPlayServicesUpdateDialog: boolean }) => Promise<boolean>;
  signIn: () => Promise<any>;
  signInSilently: () => Promise<any>;
  hasPreviousSignIn?: () => boolean;
};

export type NativeGoogleResult =
  | { kind: "success"; idToken: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "no_saved_credential" };

let configurePromise: Promise<GoogleSigninModule | null> | null = null;

function getGoogleSignin(): GoogleSigninModule | null {
  if (Platform.OS !== "android" || isExpoGo()) return null;

  try {
    return require("@react-native-google-signin/google-signin").GoogleSignin as GoogleSigninModule;
  } catch {
    // Expo Go does not bundle this native module.
    return null;
  }
}

async function getConfiguredGoogleSignin(): Promise<GoogleSigninModule | null> {
  if (Platform.OS !== "android") return null;
  if (configurePromise) return configurePromise;

  const googleSignin = getGoogleSignin();
  if (!googleSignin) return null;

  configurePromise = Promise.resolve(
    googleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
      scopes: ["openid", "profile", "email"],
    }),
  )
    .then(() => googleSignin)
    .catch((error) => {
      configurePromise = null;
      throw error;
    });

  return configurePromise;
}

function errorCode(error: any): string {
  return String(error?.code ?? "");
}

export function isNativeGoogleConfigurationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const nativeError = error as { code?: unknown; message?: unknown };
  const code = String(nativeError.code ?? "").trim().toUpperCase();
  const message = typeof nativeError.message === "string" ? nativeError.message : "";

  // Google Play Services reports CommonStatusCodes.DEVELOPER_ERROR as 10.
  return code === "10" || code === "DEVELOPER_ERROR" || /\bDEVELOPER_ERROR\b/i.test(message);
}

function isCancelled(error: any): boolean {
  const code = errorCode(error);
  return code === "SIGN_IN_CANCELLED" || code === "12501";
}

function isNoSavedCredential(error: any): boolean {
  const code = errorCode(error);
  return (
    code === "SIGN_IN_REQUIRED" ||
    code === "4" ||
    code === "SIGN_IN_REQUIRED_CODE"
  );
}

function extractIdToken(result: any): string {
  const token = result?.data?.idToken ?? result?.idToken;
  if (!token || typeof token !== "string") {
    throw new Error("Google did not return an ID token.");
  }
  return token;
}

export async function signInWithNativeGoogle(): Promise<NativeGoogleResult> {
  const googleSignin = await getConfiguredGoogleSignin();
  if (!googleSignin) return { kind: "unavailable" };

  try {
    await googleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await googleSignin.signIn();
    if (result?.type === "cancelled") return { kind: "cancelled" };
    return { kind: "success", idToken: extractIdToken(result) };
  } catch (error) {
    if (isCancelled(error)) return { kind: "cancelled" };
    throw error;
  }
}

export async function signInSilentlyWithNativeGoogle(): Promise<NativeGoogleResult> {
  const googleSignin = await getConfiguredGoogleSignin();
  if (!googleSignin) return { kind: "unavailable" };

  try {
    if (googleSignin.hasPreviousSignIn && !googleSignin.hasPreviousSignIn()) {
      return { kind: "no_saved_credential" };
    }

    const result = await googleSignin.signInSilently();
    if (result?.type === "noSavedCredentialFound") {
      return { kind: "no_saved_credential" };
    }
    return { kind: "success", idToken: extractIdToken(result) };
  } catch (error) {
    if (isNoSavedCredential(error)) return { kind: "no_saved_credential" };
    throw error;
  }
}