// ─── Navigation Abstraction ────────────────────────────────────────────────────
// Centralised, typed route helpers that wrap Expo Router.
//
// Why this exists:
//   • Eliminates hardcoded path strings scattered across screens.
//   • Expo Router resolves routes from the local bundle — all navigation works
//     identically online and offline; no network access is needed.
//   • A single file to update when a route is renamed or restructured.
//
// Usage:
//   import { Navigate } from "@/lib/navigation";
//   Navigate.toChat({ id: chatId, name: "Alice" });
//   Navigate.back();

import { safeRouter } from "@/lib/navUtils";
import { navigateToProfile } from "@/lib/navigateToProfile";

// ─── Param shapes ──────────────────────────────────────────────────────────────

export type ChatParams = {
  id: string;
  name?: string;
  avatar?: string;
};

export type PostParams    = { postId: string };
export type VideoParams   = { id: string };
export type HandleParam   = { handle: string };
export type DeepLinkParam = { code?: string; ref?: string };

// ─── Navigate namespace ────────────────────────────────────────────────────────

export const Navigate = {

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  /** Replace the current stack with the Chats tab (home screen). */
  toChats() {
    safeRouter.replace("/(tabs)/chats" as any);
  },

  toDiscover() {
    safeRouter.replace("/(tabs)/discover" as any);
  },

  toShorts() {
    safeRouter.replace("/(tabs)/shorts" as any);
  },

  toProfile() {
    safeRouter.replace("/(tabs)/me" as any);
  },

  // ── Auth ─────────────────────────────────────────────────────────────────────

  toWelcome() {
    safeRouter.replace("/welcome" as any);
  },

  toLogin() {
    safeRouter.replace("/(auth)/login" as any);
  },

  toOnboarding() {
    safeRouter.replace("/onboarding" as any);
  },

  // ── Chat ─────────────────────────────────────────────────────────────────────

  /** Open an existing chat conversation. */
  toChat(params: ChatParams) {
    safeRouter.push({ pathname: "/chat/[id]" as any, params });
  },

  toNewChat() {
    safeRouter.push("/chat/new" as any);
  },

  toNewGroup() {
    safeRouter.push("/group/create" as any);
  },

  toChatInfo(params: { id: string }) {
    safeRouter.push({ pathname: "/chat-info/[id]" as any, params });
  },

  // ── Content ──────────────────────────────────────────────────────────────────

  toPost(params: PostParams) {
    safeRouter.push({ pathname: "/post/[id]" as any, params: { id: params.postId } });
  },

  toVideo(params: VideoParams) {
    safeRouter.push({ pathname: "/video/[id]" as any, params });
  },

  toCreatePost() {
    safeRouter.push("/moments/create" as any);
  },

  // ── User profiles ─────────────────────────────────────────────────────────────

  /** Push a user's public profile page (e.g. "/@alice"). */
  toUserProfile(handle: string) {
    const normalizedHandle = handle.replace(/^@+/, "");
    return navigateToProfile(normalizedHandle, true);
  },

  // ── Search / discovery ───────────────────────────────────────────────────────

  toSearch() {
    safeRouter.push("/search" as any);
  },

  toUserDiscovery() {
    safeRouter.push("/user-discovery" as any);
  },

  // ── Settings ─────────────────────────────────────────────────────────────────

  toSettings() {
    safeRouter.push("/settings" as any);
  },

  toPrivacySettings() {
    safeRouter.push("/settings/privacy" as any);
  },

  // ── Wallet / payments ─────────────────────────────────────────────────────────

  toWallet() {
    safeRouter.push("/app/afupay" as any);
  },

  // ── Utilities ─────────────────────────────────────────────────────────────────

  /**
   * Go back one screen. If there is no back-stack entry (e.g. the app was
   * deep-linked directly to this screen), falls back to the Chats home tab
   * so the user is never stranded.
   */
  back() {
    safeRouter.back("/(tabs)/chats");
  },

  /**
   * Replace the entire navigation stack with a new root screen.
   * Use instead of `router.replace` when you need to reset history
   * (e.g. after sign-out or when handling deep links).
   */
  reset(href: string) {
    safeRouter.replace(href as any);
  },
};
