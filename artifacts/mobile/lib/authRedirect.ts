import * as Linking from "expo-linking";
import { isExpoGo } from "@/lib/expoEnvironment";

/**
 * Expo Go uses its development URL as the OAuth return target. Installed
 * builds use the app's registered custom scheme.
 */
export function getAuthRedirectUrl(nativeRedirectUrl: string): string {
  return isExpoGo() ? Linking.createURL("") : nativeRedirectUrl;
}
