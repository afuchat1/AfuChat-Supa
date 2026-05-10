import { Platform } from "react-native";
import { supabase } from "./supabase";
import * as Device from "expo-device";
import { sendPushNotification } from "./pushNotifications";

/**
 * Registers the current device in user_device_sessions.
 * If this is a NEW device (not previously seen), the realtime watcher on the
 * API server will detect the INSERT and send a security email to the user.
 */
export async function registerDeviceSession(userId: string): Promise<void> {
  try {
    const fingerprint = buildFingerprint();
    const deviceName = Device.deviceName || Device.modelName || "Unknown device";
    const deviceOs = `${Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"} ${Device.osVersion || ""}`.trim();
    const deviceModel = Device.modelName || "";

    const now = new Date().toISOString();

    // Upsert — if same fingerprint exists, just update last_seen_at
    const { data: existing } = await supabase
      .from("user_device_sessions")
      .select("id, is_trusted")
      .eq("user_id", userId)
      .eq("device_fingerprint", fingerprint)
      .maybeSingle();

    if (existing) {
      // Known device — update last seen
      await supabase
        .from("user_device_sessions")
        .update({ last_seen_at: now })
        .eq("id", existing.id);
    } else {
      // NEW device — insert triggers watcher → sends email
      await supabase.from("user_device_sessions").insert({
        user_id: userId,
        device_fingerprint: fingerprint,
        device_name: deviceName,
        device_os: deviceOs,
        device_model: deviceModel,
        is_trusted: false,
        created_at: now,
        last_seen_at: now,
      });

      // Also fire a push notification so the user knows immediately,
      // even if they're on a different device when this login happens.
      sendPushNotification({
        userId,
        title: "New device signed in",
        body: `${deviceName} (${deviceOs}) just signed into your AfuChat account. If this wasn't you, secure your account immediately.`,
        data: {
          type: "security",
          url: "/settings/devices",
        },
      }).catch(() => {});
    }
  } catch (err) {
    // Non-critical — don't throw
    console.warn("[deviceSession] Failed to register device:", err);
  }
}

function buildFingerprint(): string {
  const parts = [
    Platform.OS,
    Device.modelId || Device.modelName || "unknown",
    Device.osVersion || "0",
    Device.deviceType?.toString() || "0",
  ];
  return parts.join("::");
}

export async function getMyDeviceSessions(userId: string) {
  const { data } = await supabase
    .from("user_device_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false });
  return data || [];
}

export async function trustDevice(sessionId: string): Promise<void> {
  await supabase
    .from("user_device_sessions")
    .update({ is_trusted: true })
    .eq("id", sessionId);
}

export async function removeDevice(sessionId: string): Promise<void> {
  await supabase.from("user_device_sessions").delete().eq("id", sessionId);
}
