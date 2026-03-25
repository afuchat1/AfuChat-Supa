import { Platform } from "react-native";

const noop = () => {};

type ImpactStyle = "Light" | "Medium" | "Heavy";
type NotificationType = "Success" | "Warning" | "Error";

const ImpactFeedbackStyle: Record<ImpactStyle, string> = {
  Light: "Light",
  Medium: "Medium",
  Heavy: "Heavy",
};

const NotificationFeedbackType: Record<NotificationType, string> = {
  Success: "Success",
  Warning: "Warning",
  Error: "Error",
};

let _haptics: any = null;

function getHaptics() {
  if (Platform.OS === "web") return null;
  if (_haptics === undefined) return null;
  if (_haptics) return _haptics;
  try {
    _haptics = require("expo-haptics");
    return _haptics;
  } catch {
    _haptics = undefined;
    return null;
  }
}

function impactAsync(style?: string) {
  const h = getHaptics();
  if (h) h.impactAsync(style);
}

function notificationAsync(type?: string) {
  const h = getHaptics();
  if (h) h.notificationAsync(type);
}

function selectionAsync() {
  const h = getHaptics();
  if (h) h.selectionAsync();
}

export { impactAsync, notificationAsync, selectionAsync, ImpactFeedbackStyle, NotificationFeedbackType };
