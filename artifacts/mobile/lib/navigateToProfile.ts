/**
 * navigateToProfile — canonical username navigation for mention taps.
 *
 * Every username tap goes through /[handle].tsx. That route owns the
 * skeleton, exact profile/channel/group resolution, and denied-state feedback.
 * Keeping this path unified also means a channel or group username in text
 * cannot be mistaken for a missing profile.
 */

import { showToast } from "@/lib/toast";
import { notificationAsync, NotificationFeedbackType } from "@/lib/haptics";
import {
  navigateToUsernameTarget,
  resolveUsernameTarget,
  setUsernameLoading,
} from "@/lib/usernameResolver";

let latestRequest = 0;

export async function navigateToProfile(
  handle: string,
  _isLoggedIn: boolean
): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase();
  if (!clean) return;

  const requestId = ++latestRequest;
  setUsernameLoading(clean);
  try {
    const target = await resolveUsernameTarget(clean);
    if (requestId !== latestRequest) return;
    setUsernameLoading(null);

    if (!target) {
      notificationAsync(NotificationFeedbackType.Error);
      showToast("Username unavailable", {
        type: "error",
        icon: "close-circle-outline",
      });
      return;
    }

    navigateToUsernameTarget(target);
  } catch {
    if (requestId !== latestRequest) return;
    setUsernameLoading(null);
    notificationAsync(NotificationFeedbackType.Error);
    showToast("Username unavailable", {
      type: "error",
      icon: "close-circle-outline",
    });
  }
}
