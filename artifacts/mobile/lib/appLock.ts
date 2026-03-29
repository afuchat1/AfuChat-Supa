import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PIN_KEY = "afuchat_app_pin";
const BIOMETRIC_KEY = "afuchat_biometric_enabled";
const SCREENSHOT_KEY = "afuchat_screenshot_protection";

function simpleHash(pin: string): string {
  let hash = 5381;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) + hash) + pin.charCodeAt(i);
    hash = hash & hash;
  }
  return String(Math.abs(hash)) + "_" + pin.length;
}

export async function storePIN(pin: string): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(PIN_KEY, simpleHash(pin));
}

export async function verifyPIN(pin: string): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return false;
  return stored === simpleHash(pin);
}

export async function hasPIN(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return !!stored;
}

export async function clearPIN(): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? "1" : "0");
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const val = await SecureStore.getItemAsync(BIOMETRIC_KEY);
  return val === "1";
}

export async function setScreenshotProtectionEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(SCREENSHOT_KEY, enabled ? "1" : "0");
}

export async function isScreenshotProtectionEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const val = await SecureStore.getItemAsync(SCREENSHOT_KEY);
  return val === "1";
}
