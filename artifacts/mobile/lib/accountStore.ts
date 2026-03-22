import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const ACCOUNTS_KEY = "afuchat_linked_accounts";

export type StoredAccount = {
  userId: string;
  email: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
};

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export async function getStoredAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function storeAccount(account: StoredAccount): Promise<void> {
  const accounts = await getStoredAccounts();
  const idx = accounts.findIndex((a) => a.userId === account.userId);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  await setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function removeStoredAccount(userId: string): Promise<void> {
  const accounts = await getStoredAccounts();
  const filtered = accounts.filter((a) => a.userId !== userId);
  await setItem(ACCOUNTS_KEY, JSON.stringify(filtered));
}

export async function updateAccountTokens(userId: string, accessToken: string, refreshToken: string): Promise<void> {
  const accounts = await getStoredAccounts();
  const account = accounts.find((a) => a.userId === userId);
  if (account) {
    account.accessToken = accessToken;
    account.refreshToken = refreshToken;
    await setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }
}

export async function clearAllAccounts(): Promise<void> {
  await deleteItem(ACCOUNTS_KEY);
}
