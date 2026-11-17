import { NativeModules, Platform } from "react-native";

export type ShareShortcutChat = {
  chatId: string;
  label: string;
  avatarUrl?: string | null;
  lastMessageAt?: string | null;
  isGroup?: boolean;
  isChannel?: boolean;
};

export type NativeWidgetStatus = {
  installed: boolean;
  wasAdded: boolean;
  dismissed: boolean;
};

type ShareShortcutsModule = {
  update?: (chats: ShareShortcutChat[]) => Promise<boolean> | void;
  getInitialChatId?: () => Promise<string | null>;
  requestWidgetPin?: () => Promise<boolean> | void;
  getWidgetStatus?: () => Promise<NativeWidgetStatus | null> | NativeWidgetStatus | null;
  dismissWidgetOffer?: () => Promise<boolean> | boolean;
  setSpeakerphone?: (enabled: boolean) => Promise<boolean> | void;
};

/**
 * Updates Android Direct Share targets when the app has a native build.
 *
 * Expo Go and web do not contain the custom native module, so this is
 * deliberately a no-op there. The visible share screen remains functional
 * on every platform.
 */
export function updateNativeShareShortcuts(chats: ShareShortcutChat[]): void {
  if (Platform.OS !== "android") return;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.update) return;

  const unique = chats
    .filter((chat) => chat.chatId && chat.label)
    .filter((chat, index, list) => list.findIndex((item) => item.chatId === chat.chatId) === index)
    .filter((chat) => !!chat.lastMessageAt)
    .sort((a, b) => {
      const aTime = Date.parse(a.lastMessageAt || "");
      const bTime = Date.parse(b.lastMessageAt || "");
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    })
    .slice(0, 8);

  try {
    Promise.resolve(native.update?.(unique)).catch(() => {});
  } catch {
    // Native modules can throw synchronously while a standalone build is
    // starting; sharing in the app must remain usable in that case.
  }
}

/**
 * Reads the chat ID attached to an Android Direct Share launch. The custom
 * native module is absent in Expo Go and on web, so callers can safely use
 * the null result as the normal fallback.
 */
export async function getNativeShareChatId(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.getInitialChatId) return null;
  try {
    const chatId = await native.getInitialChatId();
    return typeof chatId === "string" && chatId.length > 0 ? chatId : null;
  } catch {
    return null;
  }
}

/**
 * Ask a supported Android launcher to place the AfuChat widget directly on
 * the home screen. Older launchers return false and the settings screen
 * keeps its manual-install instructions as the fallback.
 */
export async function requestNativeWidgetPin(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.requestWidgetPin) return false;
  try {
    return (await native.requestWidgetPin()) === true;
  } catch {
    return false;
  }
}

/**
 * Reads launcher-owned widget state so Settings can show the one-time setup
 * offer only when no AfuChat widget has been added or dismissed.
 */
export async function getNativeWidgetStatus(): Promise<NativeWidgetStatus | null> {
  if (Platform.OS !== "android") return null;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.getWidgetStatus) return null;
  try {
    const status = await native.getWidgetStatus();
    if (!status) return null;
    return {
      installed: status.installed === true,
      wasAdded: status.wasAdded === true,
      dismissed: status.dismissed === true,
    };
  } catch {
    return null;
  }
}

/**
 * Permanently dismisses the one-time widget setup offer on this device.
 */
export async function dismissNativeWidgetOffer(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.dismissWidgetOffer) return false;
  try {
    return (await native.dismissWidgetOffer()) === true;
  } catch {
    return false;
  }
}

/**
 * Routes call audio through the Android speaker or earpiece. The method is
 * intentionally optional so iOS, web, and older installed builds keep the
 * normal WebRTC audio path.
 */
export function setNativeSpeakerphone(enabled: boolean): void {
  if (Platform.OS !== "android") return;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.setSpeakerphone) return;
  try {
    Promise.resolve(native.setSpeakerphone(enabled)).catch(() => {});
  } catch {
    // An older binary may not include the optional audio method.
  }
}
