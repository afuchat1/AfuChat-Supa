import { useUpdateChecker } from "@/hooks/useUpdateChecker";

/** Mount once at the app root to keep native Google Play updates active. */
export default function PlayStoreUpdateManager() {
  useUpdateChecker();
  return null;
}
