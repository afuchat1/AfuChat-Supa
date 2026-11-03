import Constants from "expo-constants";

/**
 * Expo Go does not include every native module used by the standalone app.
 * Keep this check in one place so optional native integrations can fail closed
 * without logging a runtime error during app startup.
 */
export function isExpoGo(): boolean {
  if (process.env.EXPO_PUBLIC_IS_EXPO_GO === "1") return true;

  return (
    Constants?.appOwnership === "expo" ||
    (Constants as any)?.executionEnvironment === "storeClient"
  );
}