// ─── Unified Permissions Manager ──────────────────────────────────────────────
// Single source of truth for all system permission requests.
//
// Why this exists:
//   • Permissions are requested ad-hoc across many screens; this centralises them.
//   • Statuses are cached in MMKV so we never make a redundant native call.
//   • "blocked" (permanently denied) is surfaced immediately without a native
//     round-trip, so callers can show a Settings prompt instead of re-requesting.
//   • All requires are lazy so the module is safe to import on web.
//
// Usage:
//   const status = await requestPermission("camera");
//   if (status !== "granted") { /* show guidance */ }
//
//   // Or check cached status synchronously (no native call):
import { Platform } from "react-native";
import { storage } from "./storage/mmkv";
import { isExpoGo } from "@/lib/expoEnvironment";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PermissionType =
  | "camera"
  | "microphone"
  | "mediaLibrary"
  | "contacts"
  | "location"
  | "bluetooth"
  | "wifi";

/** mirrors Expo's status strings */
export type PermissionStatus =
  | "granted"
  | "denied"      // soft-denied (can re-request)
  | "undetermined"
  | "blocked";    // permanently denied → must open Settings

// ─── Cache helpers ──────────────────────────────────────────────────────────────

const PERM_PREFIX = "perm_status_";

function _permKey(type: PermissionType): string {
  return PERM_PREFIX + type;
}

/** Synchronous — read from MMKV, no native call. */
export function getPermissionStatus(type: PermissionType): PermissionStatus {
  try {
    const cached = storage.getString(_permKey(type));
    if (cached) return cached as PermissionStatus;
  } catch {}
  return "undetermined";
}

/** Write status to MMKV. Called internally after every native query. */
export function setPermissionStatus(type: PermissionType, status: PermissionStatus): void {
  try { storage.setString(_permKey(type), status); } catch {}
}

/** Clear a cached status (e.g. user may have changed it in OS Settings). */
export function clearPermissionStatus(type: PermissionType): void {
  try { storage.delete(_permKey(type)); } catch {}
}

/** Synchronous — true only if cached status is "granted". */
export function isPermissionGranted(type: PermissionType): boolean {
  return getPermissionStatus(type) === "granted";
}

/**
 * Re-checks all permission statuses from the OS and refreshes the cache.
 * Call when the app returns to foreground so cached statuses stay accurate
 * (the user may have changed them in Settings while the app was backgrounded).
 */
export async function refreshAllPermissions(): Promise<void> {
  if (Platform.OS === "web" || isExpoGo()) return;
  const types: PermissionType[] = [
    "camera", "microphone", "mediaLibrary", "contacts",
  ];
  await Promise.all(types.map((t) => checkPermission(t).catch(() => {})));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Request a permission if needed.
 *
 * • "granted"       → already granted (cache hit, no native call)
 * • "blocked"       → permanently denied; caller should open Settings
 * • "denied"        → soft-denied; caller may re-request
 * • "undetermined"  → native call made and no permission system found
 *
 * Safe to call multiple times — uses cached state to skip redundant prompts.
 */
export async function requestPermission(type: PermissionType): Promise<PermissionStatus> {
  if (Platform.OS === "web") return _requestWeb(type);

  // Fast path: already granted or hard-blocked → no native call needed.
  const cached = getPermissionStatus(type);
  if (cached === "granted") return "granted";
  if (cached === "blocked") return "blocked";

  try {
    switch (type) {
      case "camera":        return await _requestCamera();
      case "microphone":    return await _requestMicrophone();
      case "mediaLibrary":  return await _requestMediaLibrary();
      case "contacts":      return await _requestContacts();
      case "location":      return await _requestLocation();
      case "bluetooth":     return await _requestBluetooth();
      case "wifi":          return await _requestWifi();
      default:              return "undetermined";
    }
  } catch {
    return "undetermined";
  }
}

/**
 * Check live permission status without prompting (silent OS query).
 * Updates the MMKV cache with the result.
 */
export async function checkPermission(type: PermissionType): Promise<PermissionStatus> {
  if (Platform.OS === "web") return getPermissionStatus(type);
  try {
    switch (type) {
      case "camera":        return await _checkCamera();
      case "microphone":    return await _checkMicrophone();
      case "mediaLibrary":  return await _checkMediaLibrary();
      case "contacts":      return await _checkContacts();
      case "location":      return await _checkLocation();
      case "bluetooth":     return await _checkBluetooth();
      case "wifi":          return await _checkWifi();
      default:              return "undetermined";
    }
  } catch {
    return getPermissionStatus(type);
  }
}

// ─── Internal: normalise + cache ───────────────────────────────────────────────

function _norm(raw: string, type: PermissionType): PermissionStatus {
  let s: PermissionStatus;
  if      (raw === "granted")                  s = "granted";
  else if (raw === "denied" || raw === "restricted") s = "blocked";
  else                                         s = "undetermined";
  setPermissionStatus(type, s);
  return s;
}

// ─── Internal: web ─────────────────────────────────────────────────────────────

async function _requestWeb(type: PermissionType): Promise<PermissionStatus> {
  // Camera/microphone use getUserMedia — we don't cache the result here
  // (the browser manages them); report as undetermined so callers fall through.
  return "undetermined";
}

// ─── Internal: camera ──────────────────────────────────────────────────────────

async function _requestCamera(): Promise<PermissionStatus> {
  try {
    // expo-camera v55: permission helpers are static methods on the Camera class
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.requestCameraPermissionsAsync
      ?? expoCamera.requestCameraPermissionsAsync;
    const { status } = await fn();
    return _norm(status, "camera");
  } catch { return "undetermined"; }
}

async function _checkCamera(): Promise<PermissionStatus> {
  try {
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.getCameraPermissionsAsync
      ?? expoCamera.getCameraPermissionsAsync;
    const { status } = await fn();
    return _norm(status, "camera");
  } catch { return getPermissionStatus("camera"); }
}

// ─── Internal: microphone ──────────────────────────────────────────────────────

async function _requestMicrophone(): Promise<PermissionStatus> {
  try {
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.requestMicrophonePermissionsAsync
      ?? expoCamera.requestMicrophonePermissionsAsync;
    const { status } = await fn();
    return _norm(status, "microphone");
  } catch { return "undetermined"; }
}

async function _checkMicrophone(): Promise<PermissionStatus> {
  try {
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.getMicrophonePermissionsAsync
      ?? expoCamera.getMicrophonePermissionsAsync;
    const { status } = await fn();
    return _norm(status, "microphone");
  } catch { return getPermissionStatus("microphone"); }
}

// ─── Internal: media library ───────────────────────────────────────────────────

async function _requestMediaLibrary(): Promise<PermissionStatus> {
  try {
    const { requestPermissionsAsync } = require("expo-media-library") as typeof import("expo-media-library");
    const { status } = await requestPermissionsAsync();
    return _norm(status, "mediaLibrary");
  } catch { return "undetermined"; }
}

async function _checkMediaLibrary(): Promise<PermissionStatus> {
  try {
    const { getPermissionsAsync } = require("expo-media-library") as typeof import("expo-media-library");
    const { status } = await getPermissionsAsync();
    return _norm(status, "mediaLibrary");
  } catch { return getPermissionStatus("mediaLibrary"); }
}

// ─── Internal: contacts ────────────────────────────────────────────────────────

async function _requestContacts(): Promise<PermissionStatus> {
  try {
    const { requestPermissionsAsync } = require("expo-contacts") as typeof import("expo-contacts");
    const { status } = await requestPermissionsAsync();
    return _norm(status, "contacts");
  } catch { return "undetermined"; }
}

async function _checkContacts(): Promise<PermissionStatus> {
  try {
    const { getPermissionsAsync } = require("expo-contacts") as typeof import("expo-contacts");
    const { status } = await getPermissionsAsync();
    return _norm(status, "contacts");
  } catch { return getPermissionStatus("contacts"); }
}

// ─── Internal: location ────────────────────────────────────────────────────────

async function _requestLocation(): Promise<PermissionStatus> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const { status } = await Location.requestForegroundPermissionsAsync();
    return _norm(status, "location");
  } catch { return "undetermined"; }
}

async function _checkLocation(): Promise<PermissionStatus> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const { status } = await Location.getForegroundPermissionsAsync();
    return _norm(status, "location");
  } catch { return getPermissionStatus("location"); }
}

// ─── Internal: nearby device access ───────────────────────────────────────────
//
// Android 12+ splits Bluetooth discovery into scan/connect/advertise runtime
// permissions. Android 13+ also exposes nearby Wi-Fi devices. These are kept
// here instead of being requested on app startup because they are only needed
// after the user explicitly opens the offline transfer flow.

function _androidPermission(name: string): string {
  const permissions = require("react-native").PermissionsAndroid.PERMISSIONS;
  return permissions[name] ?? `android.permission.${name}`;
}

async function _requestAndroidPermissions(
  type: "bluetooth" | "wifi",
  names: string[],
): Promise<PermissionStatus> {
  if (Platform.OS !== "android") return getPermissionStatus(type);
  try {
    const { PermissionsAndroid } = require("react-native") as typeof import("react-native");
    const requested = names.map(_androidPermission) as any[];
    const result = await PermissionsAndroid.requestMultiple(requested) as Record<string, string>;
    const allGranted = requested.every((permission: string) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
    const permanentlyDenied = requested.some((permission: string) =>
      result[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    );
    const status = allGranted ? "granted" : permanentlyDenied ? "blocked" : "denied";
    setPermissionStatus(type, status);
    return status;
  } catch {
    return getPermissionStatus(type);
  }
}

async function _requestBluetooth(): Promise<PermissionStatus> {
  if (Platform.OS !== "android") return getPermissionStatus("bluetooth");
  const names = Number(Platform.Version) >= 31
    ? ["BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "BLUETOOTH_ADVERTISE"]
    : ["ACCESS_FINE_LOCATION"];
  return _requestAndroidPermissions("bluetooth", names);
}

async function _checkBluetooth(): Promise<PermissionStatus> {
  if (Platform.OS !== "android") return getPermissionStatus("bluetooth");
  try {
    const { PermissionsAndroid } = require("react-native") as typeof import("react-native");
    const names = Number(Platform.Version) >= 31
      ? ["BLUETOOTH_SCAN", "BLUETOOTH_CONNECT"]
      : ["ACCESS_FINE_LOCATION"];
    const requested = names.map(_androidPermission) as any[];
    const checks = await Promise.all(requested.map((permission: any) => PermissionsAndroid.check(permission)));
    const status = checks.every(Boolean) ? "granted" : "denied";
    setPermissionStatus("bluetooth", status);
    return status;
  } catch {
    return getPermissionStatus("bluetooth");
  }
}

async function _requestWifi(): Promise<PermissionStatus> {
  if (Platform.OS !== "android") return getPermissionStatus("wifi");
  const names = Number(Platform.Version) >= 33
    ? ["NEARBY_WIFI_DEVICES"]
    : ["ACCESS_FINE_LOCATION"];
  return _requestAndroidPermissions("wifi", names);
}

async function _checkWifi(): Promise<PermissionStatus> {
  if (Platform.OS !== "android") return getPermissionStatus("wifi");
  try {
    const { PermissionsAndroid } = require("react-native") as typeof import("react-native");
    const names = Number(Platform.Version) >= 33
      ? ["NEARBY_WIFI_DEVICES"]
      : ["ACCESS_FINE_LOCATION"];
    const requested = names.map(_androidPermission) as any[];
    const checks = await Promise.all(requested.map((permission: any) => PermissionsAndroid.check(permission)));
    const status = checks.every(Boolean) ? "granted" : "denied";
    setPermissionStatus("wifi", status);
    return status;
  } catch {
    return getPermissionStatus("wifi");
  }
}
