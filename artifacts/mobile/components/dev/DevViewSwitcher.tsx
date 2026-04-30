import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

type ViewMode = "mobile" | "desktop" | "auto";

const STORAGE_KEY = "afuchat:view";

function readMode(): ViewMode {
  if (Platform.OS !== "web" || typeof window === "undefined") return "auto";
  try {
    const param = new URL(window.location.href).searchParams.get("view");
    if (param === "mobile" || param === "desktop") return param;
    const stored = window.sessionStorage?.getItem(STORAGE_KEY);
    if (stored === "mobile" || stored === "desktop") return stored;
  } catch {
    /* sandboxed iframe */
  }
  return "auto";
}

function applyMode(next: Exclude<ViewMode, "auto">) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.location.replace(url.toString());
  } catch {
    /* ignore */
  }
}

function clearMode() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(STORAGE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.location.replace(url.toString());
  } catch {
    /* ignore */
  }
}

/**
 * Dev-only floating control to switch the preview between the mobile and
 * desktop layouts in place. Mounts only on web in development. Tapping the
 * pill cycles Mobile → Website → Auto and reloads so the responsive hook
 * picks up the new override from the URL.
 */
export function DevViewSwitcher() {
  const [mode, setMode] = useState<ViewMode>("auto");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setMode(readMode());
  }, []);

  if (Platform.OS !== "web") return null;
  // Only show in dev. __DEV__ is provided by the React Native bundler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== "undefined" ? (globalThis as any).__DEV__ : true;
  if (!isDev) return null;

  const label = mode === "mobile" ? "Mobile" : mode === "desktop" ? "Website" : "Auto";
  const next: Exclude<ViewMode, "auto"> = mode === "mobile" ? "desktop" : "mobile";
  const nextLabel = next === "mobile" ? "Mobile" : "Website";

  return (
    <View style={styles.wrapper}>
      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.labelText}>View: {label}</Text>
        <Pressable
          onPress={() => applyMode(next)}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Switch to {nextLabel}</Text>
        </Pressable>
        {mode !== "auto" && (
          <Pressable
            onPress={clearMode}
            style={({ pressed }) => [styles.resetButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.resetText}>Auto</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute" as const,
    right: 16,
    bottom: 16,
    zIndex: 99999,
    pointerEvents: "box-none" as const,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    gap: 8,
    // @ts-expect-error -- web-only
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22d3ee",
  },
  labelText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#0891b2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  resetButton: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  resetText: {
    color: "#cbd5f5",
    fontSize: 11,
    fontWeight: "600",
  },
});

export default DevViewSwitcher;
