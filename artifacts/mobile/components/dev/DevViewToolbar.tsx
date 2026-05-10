import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useIsDesktop } from "@/hooks/useIsDesktop";

type ViewMode = "auto" | "mobile" | "desktop";

const STORAGE_KEY = "afuchat:view";

const OPTIONS: { value: ViewMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Follow window size" },
  { value: "mobile", label: "Mobile", hint: "390 × 844" },
  { value: "desktop", label: "Desktop", hint: "≥ 1024 px" },
];

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

function applyMode(next: ViewMode) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (next === "auto") {
      window.sessionStorage?.removeItem(STORAGE_KEY);
      url.searchParams.delete("view");
    } else {
      window.sessionStorage?.setItem(STORAGE_KEY, next);
      url.searchParams.set("view", next);
    }
    window.location.replace(url.toString());
  } catch {
    /* ignore */
  }
}

/**
 * Slim Vercel-style top toolbar that lets you flip the preview between the
 * Auto / Mobile / Desktop layouts. Shown only on web, only in dev, and only
 * inside the desktop shell — the mobile preview is left untouched.
 */
export function DevViewToolbar() {
  const { isDesktop } = useIsDesktop();
  const [mode, setMode] = useState<ViewMode>("auto");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setMode(readMode());
  }, []);

  // Click outside to close.
  useEffect(() => {
    if (Platform.OS !== "web" || !open || typeof document === "undefined") return;
    const onClick = (e: MouseEvent) => {
      const node = (containerRef.current as unknown as HTMLElement | null) ?? null;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (Platform.OS !== "web") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDev = typeof (globalThis as any).__DEV__ !== "undefined" ? (globalThis as any).__DEV__ : true;
  if (!isDev) return null;
  if (!isDesktop) return null;

  const current = OPTIONS.find((o) => o.value === mode) ?? OPTIONS[0];

  return (
    <View ref={containerRef} style={styles.bar}>
      <View style={styles.leftCluster}>
        <View style={styles.statusDot} />
        <Text style={styles.brandText}>AfuChat Preview</Text>
        <View style={styles.divider} />
        <Text style={styles.envText}>dev</Text>
      </View>

      <View style={styles.rightCluster}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={({ hovered, pressed }) => [
            styles.select,
            // @ts-expect-error -- hovered is web-only
            hovered && styles.selectHovered,
            pressed && styles.selectPressed,
          ]}
        >
          <Text style={styles.selectLabel}>Viewport</Text>
          <Text style={styles.selectValue}>{current.label}</Text>
          <Text style={styles.chevron}>{open ? "▴" : "▾"}</Text>
        </Pressable>

        {open && (
          <View style={styles.menu}>
            {OPTIONS.map((opt) => {
              const active = opt.value === mode;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    setOpen(false);
                    if (opt.value !== mode) applyMode(opt.value);
                  }}
                  style={({ hovered }) => [
                    styles.menuItem,
                    // @ts-expect-error -- hovered is web-only
                    hovered && styles.menuItemHovered,
                    active && styles.menuItemActive,
                  ]}
                >
                  <View style={styles.menuItemMain}>
                    <Text style={[styles.menuItemLabel, active && styles.menuItemLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.menuItemHint}>{opt.hint}</Text>
                  </View>
                  {active && <Text style={styles.menuCheck}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 34,
    paddingHorizontal: 14,
    backgroundColor: "rgba(10, 10, 10, 0.92)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 99999,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(20, 20, 24, 0.97)",
    // @ts-expect-error -- web-only
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui",
  },
  leftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
    // @ts-expect-error -- web-only
    boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.18)",
  },
  brandText: {
    color: "#f5f5f5",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  envText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  rightCluster: {
    position: "relative" as const,
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    // @ts-expect-error -- web-only
    cursor: "pointer",
  },
  selectHovered: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  selectPressed: {
    opacity: 0.85,
  },
  selectLabel: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "500",
  },
  selectValue: {
    color: "#fafafa",
    fontSize: 12,
    fontWeight: "600",
  },
  chevron: {
    color: "#a1a1aa",
    fontSize: 10,
    marginLeft: 2,
  },
  menu: {
    position: "absolute" as const,
    top: 32,
    right: 0,
    width: 220,
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingVertical: 4,
    // @ts-expect-error -- web-only
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    // @ts-expect-error -- web-only
    cursor: "pointer",
  },
  menuItemHovered: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  menuItemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  menuItemMain: {
    flexDirection: "column",
  },
  menuItemLabel: {
    color: "#fafafa",
    fontSize: 13,
    fontWeight: "600",
  },
  menuItemLabelActive: {
    color: "#ffffff",
  },
  menuItemHint: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "400",
    marginTop: 1,
  },
  menuCheck: {
    color: "#10b981",
    fontSize: 13,
    fontWeight: "700",
  },
});

export default DevViewToolbar;
