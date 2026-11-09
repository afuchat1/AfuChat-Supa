import { useUpdateChecker } from "@/hooks/useUpdateChecker";

/** Mount once at the app root to keep native Play Store updates active. */
export default function UpdatePrompt() {
  useUpdateChecker();
  return null;
}
