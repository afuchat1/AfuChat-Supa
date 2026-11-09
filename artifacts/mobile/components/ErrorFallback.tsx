import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/hooks/useTheme";

export const CRASH_LOG_KEY = "afuchat_last_crash_log";
const PREV_CRASH_KEY = "afuchat_prev_crash_log";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

function buildDeviceInfo(): string {
  const appVer = Constants.expoConfig?.version ?? "?";
  const build = Platform.OS === "ios"
    ? (Constants.expoConfig?.ios?.buildNumber ?? "?")
    : String(Constants.expoConfig?.android?.versionCode ?? "?");
  const lines = [
    `App         : AfuChat ${appVer} (build ${build})`,
    `Platform    : ${Platform.OS} ${Platform.Version}`,
  ];
  if (Device.modelName) lines.push(`Device      : ${Device.modelName}`);
  if (Device.osName)    lines.push(`OS          : ${Device.osName} ${Device.osVersion ?? ""}`);
  lines.push(`Dev mode    : ${String(__DEV__)}`);
  return lines.join("\n");
}

export function buildCrashLog(error: Error, componentStack?: string): string {
  const ts = new Date().toISOString();
  const parts: string[] = [
    "════════════════════════════════════════════",
    "AfuChat Crash Report",
    `Time        : ${ts}`,
    "",
    buildDeviceInfo(),
    "",
    "────────────────  Error  ───────────────────",
    error.message ?? "Unknown error",
    "",
  ];
  if (error.stack) {
    parts.push("────────────  JS Stack Trace  ──────────────");
    parts.push(error.stack.trim());
    parts.push("");
  }
  if (componentStack) {
    parts.push("──────────  React Component Stack  ─────────");
    parts.push(componentStack.trim());
    parts.push("");
  }
  parts.push("════════════════════════════════════════════");
  return parts.join("\n");
}

export function saveCrashLog(log: string) {
  try {
    AsyncStorage.getItem(CRASH_LOG_KEY)
      .then((prev) => { if (prev) AsyncStorage.setItem(PREV_CRASH_KEY, prev).catch(() => {}); })
      .catch(() => {});
    AsyncStorage.setItem(CRASH_LOG_KEY, log).catch(() => {});
  } catch {}
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const bg      = colors.background;
  const surface = colors.surface;
  const text    = colors.text;
  const muted   = colors.textMuted;
  const border  = colors.border;
  const danger  = colors.error;
  const blue    = colors.accent;
  const green   = colors.success;
  const mono    = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

  const [crashLog, setCrashLog] = useState("");
  const [prevLog, setPrevLog]   = useState<string | null>(null);
  const [showPrev, setShowPrev] = useState(false);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    const log = buildCrashLog(error);
    setCrashLog(log);
    saveCrashLog(log);
    AsyncStorage.getItem(PREV_CRASH_KEY)
      .then((v) => { if (v) setPrevLog(v); })
      .catch(() => {});
  }, [error]);

  const handleRestart = useCallback(async () => {
    try { await reloadAppAsync(); } catch { resetError(); }
  }, [resetError]);

  const activeLog = showPrev && prevLog ? prevLog : crashLog;

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(activeLog);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  }, [activeLog]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: activeLog, title: "AfuChat Crash Report" });
    } catch {}
  }, [activeLog]);

  const appVer = Constants.expoConfig?.version ?? "";

  return (
    <View style={[s.root, { backgroundColor: bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>

      {/* ── Header ───────────────────────────────── */}
      <View style={[s.header, { backgroundColor: surface, borderBottomColor: border }]}>
        <View style={[s.headerIconWrap, { backgroundColor: danger + "20" }]}>
          <Feather name="alert-octagon" size={22} color={danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: text }]}>App crashed</Text>
          <Text style={[s.headerSub, { color: muted }]}>
            v{appVer} · {Platform.OS} {Platform.Version}
          </Text>
        </View>
        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [s.restartChip, { backgroundColor: blue, opacity: pressed ? 0.8 : 1 }]}
        >
          <Feather name="refresh-cw" size={13} color="#fff" />
          <Text style={s.restartChipText}>Restart</Text>
        </Pressable>
      </View>

      {/* ── Tab bar (only when a previous crash exists) ── */}
      {prevLog ? (
        <View style={[s.tabRow, { backgroundColor: surface, borderBottomColor: border }]}>
          <Pressable
            style={[s.tab, !showPrev && [s.tabActive, { borderBottomColor: blue }]]}
            onPress={() => setShowPrev(false)}
          >
            <Text style={[s.tabLabel, { color: !showPrev ? blue : muted }]}>Current crash</Text>
          </Pressable>
          <Pressable
            style={[s.tab, showPrev && [s.tabActive, { borderBottomColor: danger }]]}
            onPress={() => setShowPrev(true)}
          >
            <Text style={[s.tabLabel, { color: showPrev ? danger : muted }]}>Previous crash</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Error headline ── */}
      <View style={[s.errorBanner, { backgroundColor: danger + "15" }]}>
        <Feather name="zap" size={13} color={danger} style={{ marginTop: 1 }} />
        <Text
          style={[s.errorMsgText, { color: danger, fontFamily: mono }]}
          selectable
          numberOfLines={5}
        >
          {error.message}
        </Text>
      </View>

      {/* ── Full crash log (scrollable, always visible) ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
        showsVerticalScrollIndicator
      >
        <View style={[s.logBox, { backgroundColor: surface, borderColor: border }]}>
          <Text
            style={[s.logText, { color: text, fontFamily: mono }]}
            selectable
          >
            {activeLog || "Generating crash report…"}
          </Text>
        </View>
      </ScrollView>

      {/* ── Action bar ── */}
      <View style={[s.actionBar, { backgroundColor: surface, borderTopColor: border }]}>
        <Pressable
          onPress={handleCopy}
          style={({ pressed }) => [s.actionBtn, { borderColor: border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name={copied ? "check" : "copy"} size={15} color={copied ? green : text} />
          <Text style={[s.actionBtnLabel, { color: copied ? green : text }]}>
            {copied ? "Copied" : "Copy log"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [s.actionBtn, { borderColor: border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="share-2" size={15} color={text} />
          <Text style={[s.actionBtnLabel, { color: text }]}>Share</Text>
        </Pressable>

        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [s.actionBtn, s.actionBtnPrimary, { backgroundColor: blue, opacity: pressed ? 0.85 : 1 }]}
        >
          <Feather name="refresh-cw" size={15} color="#fff" />
          <Text style={[s.actionBtnLabel, { color: "#fff", fontWeight: "700" }]}>Restart app</Text>
        </Pressable>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    
  },
  headerIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 12, marginTop: 2 },
  restartChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  restartChipText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  tabRow: {
    flexDirection: "row",
    
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2 },
  tabLabel: { fontSize: 13, fontWeight: "600" },

  errorBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  errorMsgText: { flex: 1, fontSize: 12, lineHeight: 18 },

  logBox: {
    borderRadius: 8, borderWidth: 0.5,
    padding: 12, overflow: "hidden",
  },
  logText: { fontSize: 11, lineHeight: 17 },

  actionBar: {
    flexDirection: "row", gap: 8, padding: 12,
    
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 10, borderRadius: 8, borderWidth: 0.5,
  },
  actionBtnPrimary: { borderWidth: 0 },
  actionBtnLabel: { fontSize: 12, fontWeight: "600" },
});
