import Constants from "expo-constants";

/**
 * Expo Go does not include every native module used by the standalone app.
 * Keep this check in one place so optional native integrations can fail closed
 * without logging a runtime error during app startup.
 */
export function isExpoGo(): boolean {
  return (
    Constants?.appOwnership === "expo" ||
    (Constants as any)?.executionEnvironment === "storeClient"
  );
}