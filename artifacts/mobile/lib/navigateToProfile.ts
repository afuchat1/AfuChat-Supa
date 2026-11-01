/**
 * navigateToProfile — canonical username navigation for mention taps.
 *
 * Every username tap goes through /[handle].tsx. That route owns the
 * skeleton, exact profile/channel/group resolution, and denied-state feedback.
 * Keeping this path unified also means a channel or group username in text
 * cannot be mistaken for a missing profile.
 */

import { router } from "expo-router";
import { showToast } from "@/lib/toast";
import { impactAsync, ImpactFeedbackStyle } from "@/lib/haptics";
import { setProfileCache, type CachedProfile } from "@/lib/profileCache";
import {
  navigateToUsernameTarget,
  resolveUsernameTarget,
} from "@/lib/usernameResolver";

let latestRequest = 0;

type KnownProfilePreview = Pick<CachedProfile, "id" | "display_name" | "handle" | "avatar_url"> &
  Partial<CachedProfile>;

/**
 * Use this when a screen already has a profile row and its ID.
 * Avoid resolving a known profile's handle against profiles/channels/groups
 * before navigation, and seed the profile screen's in-memory preview cache.
 */
export function navigateToKnownProfile(profile: KnownProfilePreview): void {
  if (!profile.id) return;
  setProfileCache(profile.id, profile);
  router.push({ pathname: "/contact/[id]", params: { id: profile.id } } as any);
}

export async function navigateToProfile(
  handle: string,
  _isLoggedIn: boolean
): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase();
  if (!clean) return;

  const requestId = ++latestRequest;
  try {
    const target = await resolveUsernameTarget(clean);
    if (requestId !== latestRequest) return;

    if (!target) {
      impactAsync(ImpactFeedbackStyle.Heavy);
      return;
    }

    navigateToUsernameTarget(target);
  } catch {
    if (requestId !== latestRequest) return;
    impactAsync(ImpactFeedbackStyle.Heavy);
    showToast("Username unavailable", {
      type: "error",
      icon: "close-circle-outline",
    });
  }
}
