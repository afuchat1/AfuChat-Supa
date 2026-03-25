import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const CACHE_KEYS = {
  PROFILE: "offline_profile",
  CONVERSATIONS: "offline_conversations",
  CONTACTS: "offline_contacts",
  MESSAGES_PREFIX: "offline_messages_",
  MOMENTS: "offline_moments",
  NOTIFICATIONS: "offline_notifications",
  PENDING_MESSAGES: "offline_pending_messages",
};

export type PendingMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string;
  created_at: string;
};

let _isOnline = true;
let _listeners: ((online: boolean) => void)[] = [];
let _netInfoInitialized = false;

function initNetInfo() {
  if (_netInfoInitialized) return;
  _netInfoInitialized = true;

  if (Platform.OS === "web") {
    _isOnline = navigator.onLine;
    window.addEventListener("online", () => {
      _isOnline = true;
      _listeners.forEach((fn) => fn(true));
    });
    window.addEventListener("offline", () => {
      _isOnline = false;
      _listeners.forEach((fn) => fn(false));
    });
  } else {
    try {
      const NetInfo = require("@react-native-community/netinfo").default;
      NetInfo.addEventListener((state: any) => {
        const newOnline = state.isConnected === true && state.isInternetReachable !== false;
        if (newOnline !== _isOnline) {
          _isOnline = newOnline;
          _listeners.forEach((fn) => fn(newOnline));
        }
      });
    } catch {}
  }
}

initNetInfo();

export function isOnline(): boolean {
  return _isOnline;
}

export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

export async function cacheProfile(profile: any): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.PROFILE, JSON.stringify(profile));
  } catch {}
}

export async function getCachedProfile(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheConversations(conversations: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
  } catch {}
}

export async function getCachedConversations(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheMessages(chatId: string, messages: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.MESSAGES_PREFIX + chatId, JSON.stringify(messages));
  } catch {}
}

export async function getCachedMessages(chatId: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.MESSAGES_PREFIX + chatId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheContacts(contacts: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.CONTACTS, JSON.stringify(contacts));
  } catch {}
}

export async function getCachedContacts(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheMoments(moments: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.MOMENTS, JSON.stringify(moments));
  } catch {}
}

export async function getCachedMoments(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.MOMENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheNotifications(notifications: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  } catch {}
}

export async function getCachedNotifications(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.NOTIFICATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function queueMessage(msg: PendingMessage): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    const pending: PendingMessage[] = raw ? JSON.parse(raw) : [];
    pending.push(msg);
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_MESSAGES, JSON.stringify(pending));
  } catch {}
}

export async function getPendingMessages(): Promise<PendingMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearPendingMessages(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.PENDING_MESSAGES);
  } catch {}
}

export async function removePendingMessage(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    const pending: PendingMessage[] = raw ? JSON.parse(raw) : [];
    const filtered = pending.filter((m) => m.id !== id);
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_MESSAGES, JSON.stringify(filtered));
  } catch {}
}
