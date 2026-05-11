/**
 * Account Store — secure multi-account session storage.
 *
 * Design principles:
 * ─────────────────
 * 1. Each account's tokens are stored under their OWN SecureStore key
 *    (`afuchat_session_<userId>`) instead of one shared JSON blob. This
 *    avoids iOS's 2048-byte SecureStore value limit and isolates corruption.
 *
 * 2. A lightweight index (`afuchat_accounts_index`) stores only the ordered
 *    list of user IDs so listing accounts is cheap.
 *
 * 3. Profile metadata (display_name, handle, avatarUrl, email) is stored
 *    alongside tokens in the per-user entry so the accounts list can render
 *    without a network call.
 *
 * 4. Web uses AsyncStorage as a fallback (SecureStore is native-only).
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const INDEX_KEY = "afuchat_accounts_index";
const SESSION_PREFIX = "afuchat_session_";

export type StoredAccount = {
  userId: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
};

// ─── Platform-safe storage primitives ─────────────────────────────────────────

async function secureGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {}
}

async function secureDel(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {}
}

// ─── Index helpers ─────────────────────────────────────────────────────────────

async function getIndex(): Promise<string[]> {
  try {
    const raw = await secureGet(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setIndex(ids: string[]): Promise<void> {
  await secureSet(INDEX_KEY, JSON.stringify(ids));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Return all stored accounts in insertion order. */
export async function getStoredAccounts(): Promise<StoredAccount[]> {
  const ids = await getIndex();
  const results: StoredAccount[] = [];
  for (const id of ids) {
    try {
      const raw = await secureGet(SESSION_PREFIX + id);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAccount;
        results.push(parsed);
      }
    } catch {}
  }
  return results;
}

/** Return a single stored account by userId, or null. */
export async function getStoredAccount(userId: string): Promise<StoredAccount | null> {
  try {
    const raw = await secureGet(SESSION_PREFIX + userId);
    return raw ? (JSON.parse(raw) as StoredAccount) : null;
  } catch {
    return null;
  }
}

/**
 * Upsert an account. If the userId already exists, its entry is updated in
 * place (preserving its position in the index). Otherwise it is appended.
 */
export async function storeAccount(account: StoredAccount): Promise<void> {
  // Write the per-user entry
  await secureSet(SESSION_PREFIX + account.userId, JSON.stringify(account));

  // Update the index only if this is a new user
  const ids = await getIndex();
  if (!ids.includes(account.userId)) {
    await setIndex([...ids, account.userId]);
  }
}

/** Update only the token fields for an existing account. */
export async function updateAccountTokens(
  userId: string,
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const existing = await getStoredAccount(userId);
  if (!existing) return;
  await secureSet(
    SESSION_PREFIX + userId,
    JSON.stringify({ ...existing, accessToken, refreshToken })
  );
}

/** Update profile metadata (called after a profile refresh to keep name/avatar fresh). */
export async function updateAccountProfile(
  userId: string,
  patch: Partial<Pick<StoredAccount, "displayName" | "handle" | "avatarUrl" | "email">>
): Promise<void> {
  const existing = await getStoredAccount(userId);
  if (!existing) return;
  await secureSet(
    SESSION_PREFIX + userId,
    JSON.stringify({ ...existing, ...patch })
  );
}

/** Remove an account entirely. */
export async function removeStoredAccount(userId: string): Promise<void> {
  await secureDel(SESSION_PREFIX + userId);
  const ids = await getIndex();
  await setIndex(ids.filter((id) => id !== userId));
}

/** Wipe every stored account and the index. */
export async function clearAllAccounts(): Promise<void> {
  const ids = await getIndex();
  await Promise.all(ids.map((id) => secureDel(SESSION_PREFIX + id)));
  await secureDel(INDEX_KEY);
}
